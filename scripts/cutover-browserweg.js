#!/usr/bin/env node
'use strict';

// Browserweg: faehrt den ECHTEN Funnel auf der Produktionsseite in einem echten
// Browser durch - Intro, sechs Fragen, Auswertung, Formular mit echter E-Mail -
// und weist danach in der Datenbank nach, dass der Lead vollstaendig angekommen ist.
//
// Das ist der Nachweis fuer Schritt 5 der CUTOVER-CHECKLISTE ("ein echter
// Funnel-Durchlauf erzeugt eine Zeile in leads.lead_state"). Vor dem Cutover laeuft
// er gegen die Quelle, danach gegen die Plattform-DB - derselbe Browserweg, nur die
// befragte Datenbank wechselt.
//
//   node --env-file=.env.prod scripts/cutover-browserweg.js probe [--quelle=supabase|plattform]
//   node --env-file=.env.prod scripts/cutover-browserweg.js pruefen <lead_hash> [--quelle=...]
//   node --env-file=.env.prod scripts/cutover-browserweg.js aufraeumen <lead_hash> [--quelle=...] [--wirklich]
//
// 🔴 `aufraeumen` ist ohne --wirklich ein Trockenlauf und zeigt nur, was es loeschen
//    WUERDE. Es fasst ausschliesslich den einen lead_hash an, den derselbe Lauf
//    vorher selbst angelegt hat (R0).

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { createRequire } = require('module');
const { executeManagementQuery } = require('./stats-logs-baseline.js');

const SSH = 'C:/Windows/System32/OpenSSH/ssh.exe';
const KEY = 'C:/Users/Markus/.ssh/id_rsa';
const ZIEL_HOST = 'root@91.99.76.104';
const ZIEL_DB = process.env.ZIEL_DB || 'hl_support';

const SEITE = process.env.BROWSERWEG_SEITE || 'https://business.activecenter.info';
const SLUG = process.env.BROWSERWEG_SLUG || 'markus';
const VORNAME = 'Cutover';
const EMAIL = process.env.BROWSERWEG_EMAIL || 'markus+cutover@global-sce.com';

const BELEGE = path.join(
  __dirname,
  '..',
  'docs',
  'audits',
  'cutover-vorbereitung',
  'cutover-belege'
);

// Alle Tabellen, die einen lead_hash tragen. 🔴 Der CASCADE von lead_state deckt nur
// vier davon ab (lead_answers_current, lead_events, lead_sync_outbox,
// lead_video_progress) - der Rest haengt ohne Fremdschluessel dran und muss beim
// Aufraeumen einzeln angefasst werden, sonst bleiben Waisen zurueck.
const MIT_LEAD_HASH = [
  'lead_events',
  'lead_answers_current',
  'lead_sync_outbox',
  'lead_video_progress',
  'lead_profiles',
  'lead_contact_crm',
  'nurture_subject_states',
  'system_alerts',
  'tracking_events',
  'tracking_video_progress',
  'tracking_sessions',
  'lead_state',
];

// --- Datenbankzugang: zwei Quellen, eine Schnittstelle -----------------------

function quelleWaehlen(argumente) {
  const treffer = argumente.find((a) => a.startsWith('--quelle='));
  const wert = treffer ? treffer.split('=')[1] : 'supabase';
  if (wert !== 'supabase' && wert !== 'plattform') {
    throw new Error(`--quelle muss "supabase" oder "plattform" sein, nicht "${wert}"`);
  }
  return wert;
}

function zielSql(sql) {
  return execFileSync(
    SSH,
    [
      '-o',
      'BatchMode=yes',
      '-o',
      'StrictHostKeyChecking=no',
      '-i',
      KEY,
      ZIEL_HOST,
      `sudo -u postgres psql -d ${ZIEL_DB} -tAqF'\u0001'`,
    ],
    { encoding: 'utf8', input: sql + '\n', maxBuffer: 64 * 1024 * 1024, timeout: 120000 }
  ).trim();
}

/** Liest Zeilen als Objekte - aus Supabase (Management-API) oder aus der Plattform-DB (psql). */
async function abfrage(quelle, sql, spalten) {
  if (quelle === 'supabase') return executeManagementQuery(sql);
  const roh = zielSql(sql.replace(/\bpublic\./g, 'leads.'));
  if (!roh) return [];
  return roh.split('\n').map((zeile) => {
    const teile = zeile.split('\u0001');
    return Object.fromEntries(spalten.map((s, i) => [s, teile[i]]));
  });
}

/** Schreibender Zugang - nur fuers Aufraeumen. */
async function aendern(quelle, sql) {
  if (quelle === 'plattform') return zielSql(sql.replace(/\bpublic\./g, 'leads.'));
  const geheim = require('C:/Users/Markus/.agent-secrets/agent-secrets.json').supabase;
  const postgres = createRequire(path.join(__dirname, '..', 'package.json'))('postgres');
  const sqlV = postgres({
    host: geheim.postgresHost,
    port: geheim.postgresPort,
    database: 'postgres',
    username: geheim.postgresUser,
    password: geheim.postgresPassword,
    ssl: 'require',
    max: 1,
    connect_timeout: 15,
    onnotice: () => {},
  });
  try {
    return await sqlV.unsafe(sql);
  } finally {
    await sqlV.end();
  }
}

// --- Browserweg --------------------------------------------------------------

async function browserDurchlauf() {
  const wurzel = path.join(__dirname, '..');
  const { chromium } = createRequire(path.join(wurzel, 'package.json'))('playwright');

  const browser = await chromium.launch({
    headless: process.env.BROWSERWEG_SICHTBAR !== '1',
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });
  const ctx = await browser.newContext({ viewport: { width: 480, height: 900 }, locale: 'de-DE' });
  const page = await ctx.newPage();

  const gesehen = { leadHash: null, sessionHash: null, ereignisse: [], aufrufe: [], fehler: [] };
  page.on('console', (m) => {
    if (m.type() === 'error') gesehen.fehler.push(m.text().slice(0, 200));
  });
  page.on('response', async (r) => {
    if (!r.url().includes('/api/')) return;
    const pfad = new URL(r.url()).pathname;
    gesehen.aufrufe.push({ pfad, status: r.status() });
    try {
      const anfrage = JSON.parse(r.request().postData() || '{}');
      if (anfrage.lead_hash && !gesehen.leadHash) gesehen.leadHash = anfrage.lead_hash;
      if (anfrage.event_name) gesehen.ereignisse.push(String(anfrage.event_name));
      // Der session_hash steckt in der Nutzlast der Tracking-Aufrufe und wird fuer
      // den Resume-Link gebraucht - genau wie ihn die Nurture-Mail benutzt.
      const s = anfrage.session_hash || (anfrage.payload && anfrage.payload.session_hash) || '';
      if (s && !gesehen.sessionHash) gesehen.sessionHash = String(s);
    } catch {
      /* nur Beweisaufnahme */
    }
  });

  const schritte = [];
  const merke = (t) => {
    schritte.push(t);
    console.log(`  ${t}`);
  };

  console.log(`\n== Browserweg gegen ${SEITE}/${SLUG} ==\n`);

  await page.goto(`${SEITE}/${SLUG}?test=1`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(4000);
  merke('Intro geladen');

  await page
    .getByText(/Meinen Code entdecken/)
    .first()
    .click();
  await page.waitForTimeout(1500);
  merke('Quiz gestartet');

  let formular = false;
  for (let i = 1; i <= 20 && !formular; i += 1) {
    formular = await page.evaluate(() => Boolean(document.querySelector('input[type="email"]')));
    if (formular) break;
    const frage = await page.evaluate(() => {
      const h = document.querySelector('h1,h2,h3');
      return h ? h.innerText.trim().slice(0, 60) : '';
    });
    const gewaehlt = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).filter((x) => {
        const r = x.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      const opt = b.find((c) => {
        const t = (c.innerText || '').trim();
        return t.length >= 12 && !/Weiter|Auswertung|zurück|nochmal|starten|entdecken/i.test(t);
      });
      if (opt) {
        opt.click();
        return opt.innerText.trim().split('\n')[0];
      }
      return null;
    });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button'));
      const w = b.find((c) => /Weiter\s*→|Auswertung starten/i.test((c.innerText || '').trim()));
      if (w && !w.disabled) w.click();
    });
    await page.waitForTimeout(1400);
    if (frage) merke(`Frage "${frage}" → ${gewaehlt || 'weiter'}`);
  }

  // Auswertung braucht einen Moment ("Dein Profil wird erstellt...").
  await page.waitForSelector('input[type="email"]', { timeout: 45000 });
  merke('Formular erreicht');

  await page.fill('input[placeholder="Dein Vorname"]', VORNAME);
  await page.fill('input[type="email"]', EMAIL);
  await page.waitForTimeout(2500); // E-Mail-Pruefung (ZeroBounce) abwarten
  merke(`Formular ausgefuellt: ${VORNAME} / ${EMAIL}`);

  const knopf = page.getByRole('button', { name: /Meine Auswertung anzeigen/ }).first();
  await knopf.waitFor({ state: 'visible', timeout: 15000 });
  for (let i = 0; i < 20 && (await knopf.isDisabled()); i += 1) await page.waitForTimeout(500);
  if (await knopf.isDisabled())
    throw new Error('Absendeknopf blieb deaktiviert - E-Mail-Pruefung?');
  await knopf.click();
  merke('Abgesendet');

  // Auf der Ergebnisseite stehen bleiben: dort laufen Nachverarbeitung und
  // Video-Einbindung an. Ein zu frueh geschlossener Browser misst weniger,
  // als ein echter Besucher ausloest.
  await page.waitForTimeout(20000);
  const nachher = await page.evaluate(() => ({
    ueberschrift: (document.querySelector('h1,h2,h3') || {}).innerText || '',
    speicher: Object.fromEntries(
      Object.keys(localStorage)
        .filter((k) => /LeadSystem|LeadRun/i.test(k))
        .map((k) => [k, localStorage.getItem(k).slice(0, 400)])
    ),
  }));
  merke(`Ergebnisseite: "${String(nachher.ueberschrift).replace(/\n/g, ' ').slice(0, 60)}"`);

  if (!gesehen.leadHash) {
    const treffer = JSON.stringify(nachher.speicher).match(/qz_[a-f0-9]{32}/);
    if (treffer) gesehen.leadHash = treffer[0];
  }

  // Der session_hash steht im Browserspeicher (acQuizTrackingSession_v1), nicht in
  // den /api/-Nutzlasten - dort wurde er vergeblich gesucht. Er wird fuer den
  // Resume-Link gebraucht, damit der Link auf DIESE Sitzung zeigt.
  if (!gesehen.sessionHash) {
    const alles = await page.evaluate(() =>
      JSON.stringify(Object.fromEntries(Object.entries(localStorage)))
    );
    const treffer = alles.match(/ac_[a-f0-9]{16,}/);
    if (treffer) gesehen.sessionHash = treffer[0];
  }
  merke(`session_hash: ${gesehen.sessionHash || '(nicht gefunden)'}`);

  // ---- Videoteil: "Teil 1 starten" ist der CTA der Ergebnisseite -------------
  // Erst hier entstehen result_cta_click, video_viewed, video_started und
  // video_progress - und damit die Zeilen in lead_video_progress. Ohne diesen
  // Abschnitt endet der Test vor der Haelfte der Kette.
  const cta = page.getByRole('button', { name: /Teil 1 starten/ }).first();
  await cta.waitFor({ state: 'visible', timeout: 30000 });
  await cta.click();
  merke('CTA "Teil 1 starten" geklickt');

  // Das Video laeuft in einem Bunny-iframe (player.mediadelivery.net). Stehen
  // bleiben, bis der Fortschritt gemeldet wurde - video_progress kommt in Schueben.
  await page.waitForTimeout(30000);
  const videoZustand = await page.evaluate(() => ({
    ueberschrift: (document.querySelector('h1,h2,h3') || {}).innerText || '',
    spieler: Array.from(document.querySelectorAll('iframe'))
      .map((f) => f.src || '')
      .filter((s) => /mediadelivery/.test(s)).length,
  }));
  merke(
    `Videoteil erreicht: "${String(videoZustand.ueberschrift).replace(/\n/g, ' ').slice(0, 50)}" ` +
      `(${videoZustand.spieler} Bunny-Spieler)`
  );

  const ereignisse = gesehen.ereignisse.slice();
  merke(`Ereignisse im Lauf: ${[...new Set(ereignisse)].join(', ')}`);

  await browser.close();
  return { ...gesehen, schritte, ergebnis: nachher, ereignisse };
}

/**
 * Erzeugt einen ECHTEN Resume-Link ueber dieselbe Bridge-Aktion, die auch die
 * Nurture-Mail benutzt, und klickt ihn in einem FRISCHEN Browser durch - ohne
 * localStorage, wie jemand, der die Mail auf einem anderen Geraet oeffnet.
 * 🔴 Der Link wird nicht selbst zusammengebaut, sondern 1:1 so genommen, wie der
 * Server ihn ausliefert.
 */
async function resumeLinkPruefen(leadHash, sessionHash, merke) {
  const antwort = await fetch(`${SEITE}/api/bridge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.BRIDGE_SERVICE_KEY
        ? { 'X-Bridge-Service-Key': process.env.BRIDGE_SERVICE_KEY }
        : {}),
    },
    // Nutzlast wie beim echten Aufruf (vgl. scripts/smoke-resume-link.js): ohne
    // `email` antwortet die Bridge mit 400 "Missing resume contact context".
    body: JSON.stringify({
      action: 'generate_resume_token',
      payload: {
        sessionHash,
        leadHash,
        email: EMAIL,
        slug: SLUG,
        context: 'quiz',
        resumeTarget: 'videos',
        contact: { leadHash, email: EMAIL, firstName: VORNAME, lang: 'de' },
      },
    }),
  });
  const daten = await antwort.json().catch(() => ({}));
  const url = daten.shortUrl || daten.resumeUrl || '';
  if (!antwort.ok || !url) {
    return {
      ok: false,
      grund: `generate_resume_token: HTTP ${antwort.status} ${JSON.stringify(daten).slice(0, 200)}`,
    };
  }
  merke(`Resume-Link vom Server: ${url.replace(/(\?|&)(r|resume)=[^&]{0,12}[^&]*/, '$1$2=…')}`);

  const wurzel = path.join(__dirname, '..');
  const { chromium } = createRequire(path.join(wurzel, 'package.json'))('playwright');
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
  const ctx = await browser.newContext({ viewport: { width: 480, height: 900 }, locale: 'de-DE' });
  const page = await ctx.newPage();
  const erkannt = { leadHash: null, ziel: '' };
  page.on('response', (r) => {
    if (!r.url().includes('/api/')) return;
    try {
      const a = JSON.parse(r.request().postData() || '{}');
      if (a.lead_hash && !erkannt.leadHash) erkannt.leadHash = a.lead_hash;
    } catch {
      /* nur Beweisaufnahme */
    }
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(12000);
    erkannt.ziel = await page.evaluate(
      () => (document.querySelector('h1,h2,h3') || {}).innerText || ''
    );
    const wiedererkannt = erkannt.leadHash === leadHash;
    merke(
      `Resume im frischen Browser: "${String(erkannt.ziel).replace(/\n/g, ' ').slice(0, 45)}" ` +
        `— Lead ${wiedererkannt ? 'wiedererkannt' : 'NICHT wiedererkannt (' + erkannt.leadHash + ')'}`
    );
    return { ok: wiedererkannt, url, ziel: erkannt.ziel, erkannterHash: erkannt.leadHash };
  } finally {
    await browser.close();
  }
}

// --- Nachweis ----------------------------------------------------------------

async function nachweis(quelle, leadHash) {
  console.log(`\n== Nachweis in der Datenbank (${quelle}) ==\n`);
  const befunde = [];
  const pruefe = (name, ok, detail) => {
    befunde.push({ name, ok, detail });
    console.log(`  ${ok ? 'OK     ' : '🔴 OFFEN'} ${name}${detail ? ' — ' + detail : ''}`);
  };

  const h = leadHash.replace(/'/g, "''");
  const spalten = [
    'lead_hash',
    'email',
    'first_name',
    'lifecycle_stage',
    'profile_code',
    'berater_slug',
    'source_app',
    'form_submitted_at',
    'created_at',
    'cta_clicked_at',
    'sync_status',
  ];
  const zeilen = await abfrage(
    quelle,
    `select ${spalten.join(', ')} from public.lead_state where lead_hash = '${h}'`,
    spalten
  );

  pruefe('lead_state traegt den Lead', zeilen.length === 1, `${zeilen.length} Zeile(n)`);
  if (zeilen.length !== 1) return { befunde, zeile: null };
  const z = zeilen[0];
  pruefe(
    'E-Mail gespeichert',
    String(z.email || '').toLowerCase() === EMAIL.toLowerCase(),
    String(z.email)
  );
  pruefe('Vorname gespeichert', z.first_name === VORNAME, String(z.first_name));
  pruefe(
    'Formular als abgesendet vermerkt',
    Boolean(z.form_submitted_at),
    String(z.form_submitted_at)
  );
  pruefe('Profil berechnet', Boolean(z.profile_code), `${z.profile_code} / ${z.lifecycle_stage}`);
  pruefe('Berater zugeordnet', z.berater_slug === SLUG, String(z.berater_slug));

  const zaehl = async (tabelle) => {
    const r = await abfrage(
      quelle,
      `select count(*)::int as n from public.${tabelle} where lead_hash = '${h}'`,
      ['n']
    );
    return Number(r[0] && r[0].n) || 0;
  };
  // Sechs Fragen, nicht sieben: Schritt 5 des Funnels ist eine Zwischenseite
  // ("Freiheit ist dein Kernantrieb"), keine Frage. Gegengemessen ueber alle
  // 1.922 Leads der Quelle: hoechster Wert ist 6.
  const antworten = await zaehl('lead_answers_current');
  pruefe('sechs Antworten gespeichert', antworten === 6, `${antworten}`);
  const ereignisse = await zaehl('lead_events');
  pruefe('Ereignisse geschrieben', ereignisse > 0, `${ereignisse}`);
  const outbox = await zaehl('lead_sync_outbox');
  pruefe('Outbox-Auftrag erzeugt', outbox > 0, `${outbox}`);

  // 🔴 Bewusst KEINE Bedingung: tracking_sessions entsteht VERZOEGERT, nicht sofort.
  // Am 27.08. gemessen: 15 s nach dem Absenden noch 0, rund 20 min spaeter 1. Wer
  // hier eine Bedingung setzt, erzeugt einen falschen Rot-Befund um halb vier.
  // Gemeldet, nicht gewertet - und beim Nachlauf (Schritt 8) noch einmal ansehen.
  const sitzungen = await zaehl('tracking_sessions');
  console.log(`  (Hinweis) tracking_sessions: ${sitzungen} — entsteht verzoegert, nicht gewertet`);

  const markiert = await abfrage(
    quelle,
    `select count(*)::int as n from public.lead_events where lead_hash = '${h}' ` +
      "and payload->>'is_internal_traffic' = 'true'",
    ['n']
  );
  pruefe(
    'als interner Verkehr markiert',
    Number(markiert[0].n) > 0,
    `${markiert[0].n} von ${ereignisse} Ereignissen`
  );

  // ---- Zweite Haelfte der Kette: Video und Ereignisnamen --------------------
  // 🔴 KEINE Bedingung auf cta_clicked_at: das Feld gehoert zum FINALEN CTA nach den
  // Videos (cta_type 'whatsapp' oder 'spaeter', Ereignis `cta_clicked`), nicht zum
  // "Teil 1 starten"-Klick. Gemessen am 28.08.2026: 1.121 Leads tragen
  // result_cta_click, aber nur 221 ein cta_clicked_at. Diese Stufe setzt drei
  // durchgesehene Videos voraus und wird vom Browserweg bewusst nicht erreicht.
  console.log(
    `  (Hinweis) cta_clicked_at: ${z.cta_clicked_at || 'nicht gesetzt'} — finaler CTA, ` +
      'nicht Teil dieses Wegs'
  );

  const fortschritt = await zaehl('lead_video_progress');
  pruefe('Video-Fortschritt gespeichert', fortschritt > 0, `${fortschritt} Zeile(n)`);

  // Die Kette ist nur vollstaendig, wenn ALLE diese Ereignisse in der Datenbank
  // liegen - nicht nur im Browser gefeuert wurden.
  const PFLICHT = [
    'page_view',
    'quiz_started',
    'question_viewed',
    'quiz_answer',
    'aspiration_confirmed',
    'quiz_result',
    'optin_viewed',
    'form_submit',
    'form_submitted',
    'result_cta_click',
    'video_viewed',
    'video_started',
    'video_progress',
  ];
  const vorhanden = await abfrage(
    quelle,
    `select event_name, count(*)::int as n from public.lead_events ` +
      `where lead_hash = '${h}' group by event_name`,
    ['event_name', 'n']
  );
  const da = new Map(vorhanden.map((r) => [String(r.event_name).trim(), Number(r.n)]));
  const fehlend = PFLICHT.filter((e) => !da.has(e));
  pruefe(
    `alle ${PFLICHT.length} Ereignisarten der Kette in der Datenbank`,
    fehlend.length === 0,
    fehlend.length ? `fehlt: ${fehlend.join(', ')}` : [...da.keys()].sort().join(', ')
  );

  // ---- Weitergabe an das MySQL-CRM -----------------------------------------
  const auftrag = await abfrage(
    quelle,
    `select sync_type, status, attempts, coalesce(last_error,'-') as last_error ` +
      `from public.lead_sync_outbox where lead_hash = '${h}' order by id desc limit 1`,
    ['sync_type', 'status', 'attempts', 'last_error']
  );
  const a0 = auftrag[0] || {};
  pruefe(
    'Outbox-Auftrag durchgelaufen',
    String(a0.status).trim() === 'done',
    `${a0.sync_type} → ${a0.status} (Versuche ${a0.attempts}${String(a0.last_error).trim() !== '-' ? ', ' + a0.last_error : ''})`
  );
  // 🔴 Das ist die Meldung der Anwendung, kein eigener Blick in die MySQL-Tabelle:
  // ein lesender Weg dorthin existiert von hier aus nicht.
  pruefe(
    'lead_state meldet CRM-Abgleich',
    /mysql/.test(String(z.sync_status || '')),
    `sync_status = ${z.sync_status}`
  );

  return { befunde, zeile: z };
}

// --- Aufraeumen ---------------------------------------------------------------

/**
 * Welche der Tabellen gibt es in der befragten Datenbank wirklich?
 * 🔴 Noetig, weil nicht alle mitumziehen: `system_alerts` steht bewusst nicht auf der
 * Migrationsliste und fehlt im Ziel. Ohne diesen Filter bricht die Loesch-Transaktion
 * an der fehlenden Tabelle ab - und dann wird gar nichts geloescht (28.08.2026).
 */
async function vorhandeneTabellen(quelle) {
  const schema = quelle === 'plattform' ? 'leads' : 'public';
  const namen = MIT_LEAD_HASH.map((t) => `'${t}'`).join(',');
  const roh = await abfrage(
    quelle,
    `select table_name from information_schema.tables ` +
      `where table_schema = '${schema}' and table_name in (${namen})`,
    ['table_name']
  );
  const da = new Set(roh.map((r) => String(r.table_name).trim()));
  const fehlend = MIT_LEAD_HASH.filter((t) => !da.has(t));
  if (fehlend.length) {
    console.log(`  (nicht in dieser Datenbank, uebersprungen: ${fehlend.join(', ')})\n`);
  }
  return MIT_LEAD_HASH.filter((t) => da.has(t));
}

async function aufraeumen(quelle, leadHash, wirklich) {
  console.log(`\n== ${wirklich ? 'Aufraeumen' : 'Trockenlauf'} fuer ${leadHash} (${quelle}) ==\n`);
  const h = leadHash.replace(/'/g, "''");
  const tabellen = await vorhandeneTabellen(quelle);

  const bestand = [];
  for (const t of tabellen) {
    const r = await abfrage(
      quelle,
      `select count(*)::int as n from public.${t} where lead_hash = '${h}'`,
      ['n']
    );
    const n = Number(r[0] && r[0].n) || 0;
    if (n) bestand.push([t, n]);
    console.log(`  ${String(n).padStart(4)}  ${t}`);
  }
  if (!bestand.length) {
    console.log('\n  Nichts zu tun.');
    return;
  }

  if (!wirklich) {
    console.log('\n  Trockenlauf - nichts geloescht. Mit --wirklich ausfuehren.');
    return;
  }

  // lead_state zuletzt: sein CASCADE raeumt vier der Tabellen ohnehin mit ab,
  // die uebrigen wurden davor einzeln geleert.
  const sql = tabellen.map((t) => `delete from public.${t} where lead_hash = '${h}';`).join('\n');
  await aendern(quelle, `begin;\n${sql}\ncommit;`);

  console.log('\n  Geloescht. Gegenprobe:');
  let rest = 0;
  for (const [t] of bestand) {
    const r = await abfrage(
      quelle,
      `select count(*)::int as n from public.${t} where lead_hash = '${h}'`,
      ['n']
    );
    const n = Number(r[0] && r[0].n) || 0;
    rest += n;
    console.log(`  ${String(n).padStart(4)}  ${t}`);
  }
  console.log(rest === 0 ? '\n  ✅ Restlos entfernt.' : `\n  🔴 ${rest} Zeilen blieben zurueck.`);
}

// --- Einstieg -----------------------------------------------------------------

async function main() {
  const [, , befehl, ...rest] = process.argv;
  const quelle = quelleWaehlen(rest);
  const stellung = rest.filter((a) => !a.startsWith('--'));

  if (befehl === 'probe') {
    const lauf = await browserDurchlauf();
    if (!lauf.leadHash) throw new Error('Kein lead_hash aus dem Durchlauf gewonnen.');
    console.log(`\n  lead_hash: ${lauf.leadHash}`);
    if (lauf.fehler.length) {
      console.log('\n  Browser-Fehlermeldungen:');
      lauf.fehler.slice(0, 5).forEach((f) => console.log('   ! ' + f));
    }
    // Outbox laeuft jede Minute; Nachverarbeitung und Video-Fortschritt brauchen
    // ebenfalls einen Moment. 75 s decken beides ab.
    console.log('\n  75 s warten, damit Outbox und Nachverarbeitung greifen ...');
    await new Promise((r) => setTimeout(r, 75000));

    // Resume-Link: der letzte Abschnitt der Kette. Wird vom Server erzeugt und in
    // einem frischen Browser geklickt - wie aus einer Mail auf einem anderen Geraet.
    let resume = { ok: false, grund: 'kein session_hash aus dem Lauf' };
    const merke = (t) => console.log(`  ${t}`);
    console.log('\n== Resume-Link ==\n');
    if (lauf.sessionHash) {
      resume = await resumeLinkPruefen(lauf.leadHash, lauf.sessionHash, merke);
    } else {
      console.log('  🔴 ' + resume.grund);
    }

    const { befunde } = await nachweis(quelle, lauf.leadHash);
    befunde.push({
      name: 'Resume-Link fuehrt zurueck in den Funnel',
      ok: Boolean(resume.ok),
      detail: resume.ok ? String(resume.ziel).replace(/\n/g, ' ').slice(0, 50) : resume.grund,
    });
    console.log(
      `  ${resume.ok ? 'OK     ' : '🔴 OFFEN'} Resume-Link fuehrt zurueck in den Funnel` +
        (resume.ok ? '' : ` — ${resume.grund}`)
    );

    const offen = befunde.filter((b) => !b.ok);

    fs.mkdirSync(BELEGE, { recursive: true });
    const beleg = path.join(BELEGE, `browserweg-${quelle}-${lauf.leadHash.slice(3, 15)}.json`);
    fs.writeFileSync(
      beleg,
      JSON.stringify(
        {
          seite: SEITE,
          slug: SLUG,
          quelle,
          leadHash: lauf.leadHash,
          sessionHash: lauf.sessionHash,
          email: EMAIL,
          schritte: lauf.schritte,
          ereignisseImBrowser: [...new Set(lauf.ereignisse || [])],
          resume: {
            ok: Boolean(resume.ok),
            ziel: resume.ziel || null,
            grund: resume.grund || null,
          },
          aufrufe: lauf.aufrufe,
          befunde,
        },
        null,
        2
      ),
      'utf8'
    );
    console.log(`\n  Beleg: ${path.relative(process.cwd(), beleg)}`);

    console.log(
      `\n${offen.length ? `🔴 ${offen.length} offen` : '✅ Browserweg vollstaendig gruen'} ` +
        `(${befunde.length - offen.length}/${befunde.length})`
    );
    console.log(
      `\n  Aufraeumen:\n  node --env-file=.env.prod scripts/cutover-browserweg.js ` +
        `aufraeumen ${lauf.leadHash} --quelle=${quelle} --wirklich\n`
    );
    process.exitCode = offen.length ? 1 : 0;
    return;
  }

  if (befehl === 'pruefen') {
    if (!stellung[0]) throw new Error('lead_hash fehlt');
    const { befunde } = await nachweis(quelle, stellung[0]);
    process.exitCode = befunde.some((b) => !b.ok) ? 1 : 0;
    return;
  }

  if (befehl === 'aufraeumen') {
    if (!stellung[0]) throw new Error('lead_hash fehlt');
    await aufraeumen(quelle, stellung[0], rest.includes('--wirklich'));
    return;
  }

  console.log('Befehle: probe | pruefen <lead_hash> | aufraeumen <lead_hash> [--wirklich]');
  console.log('Option:  --quelle=supabase (Standard) | --quelle=plattform');
  process.exitCode = 2;
}

main().catch((e) => {
  console.error('\nFEHLER:', e.message);
  process.exit(1);
});
