/**
 * Wächter über den Nurture-Versand — misst das ERGEBNIS, nicht den Vorgang.
 *
 * WARUM ES DIESES WERKZEUG GIBT
 * -----------------------------
 * Am 26.08.2026 kam heraus: Der Versand hatte drei Wochen lang keinen neuen Kontakt
 * angeschrieben. 186 Menschen gingen durch den Funnel und hörten nie etwas. In dieser Zeit
 * war jede vorhandene Anzeige grün:
 *
 *   - der Workflow meldete zwölfmal täglich `success` — er lief ja auch durch,
 *     nur mit unvollständiger Eingabe;
 *   - `nurture_runs.candidates_checked` zeigte ~4120 pro Tag — immer dieselben Alten;
 *   - `nurture_runs.sent_count` zeigte 0 — an JEDEM Tag, auch an Tagen mit
 *     nachweislichem Versand. Dieser Zähler ist strukturell kaputt.
 *
 * 🔴 Eine Überwachung, die im Normalbetrieb dieselbe Zahl zeigt wie im Totalausfall, kann
 * den Ausfall nicht anzeigen. Deshalb misst dieser Wächter ausschliesslich Zustände, die
 * sich im Fehlerfall zwangsläufig ändern.
 *
 * ZWEI PRÜFUNGEN
 * --------------
 * W1  Kappungsnähe. PostgREST begrenzt serverseitig (`db-max-rows`, hier 1000). Kommen
 *     genau so viele Zeilen zurück wie die Grenze, wurde GARANTIERT abgeschnitten — das
 *     ist die einzige verlässliche Erkennung, denn die Antwort ist einfach kürzer, ohne
 *     Fehler und ohne Warnung. Diese Prüfung gilt für jede inventarisierte Leseabfrage,
 *     nicht nur für die des Versands, und fängt damit die Fehlerklasse statt des Einzelfalls.
 *
 * W2  Ergebnis statt Vorgang. Gibt es fällige Empfänger, die seit Stunden keine Mail
 *     bekommen? Und liegt die letzte Sendung länger zurück, als bei fälligen Kandidaten
 *     erklärbar wäre?
 *
 * REIN LESEND. Supabase über die Management-API mit erzwungenem `read_only`.
 *
 *   node scripts/waechter-nurture.js            # Bericht, Exitcode 1 bei Befund
 *   node scripts/waechter-nurture.js --still    # nur Exitcode, für Zeitplan/Alarm
 *   node scripts/waechter-nurture.js --json d.json
 *
 * Exitcode 0 = unauffällig · 1 = Befund · 2 = Messung nicht durchführbar.
 */
const fs = require('fs');
const { frage, schliessen, istPlattform, MODUS } = require('./waechter-datenquelle.js');

// Serverseitige Zeilengrenze von PostgREST. Steht in der Projektkonfiguration unter
// `max_rows`. Wird sie dort geändert, muss dieser Wert mitgezogen werden - sonst prüft der
// Wächter gegen eine Grenze, die es nicht mehr gibt.
const ZEILENGRENZE = Number(process.env.POSTGREST_MAX_ROWS || 1000);

// Ab welchem Anteil der Grenze gewarnt wird. 90 % gibt Vorlauf, bevor abgeschnitten wird.
const WARNSCHWELLE = 0.9;

// 🔴 Inventar der Leseabfragen, die eine LISTE holen und deshalb an die Grenze stossen
// können. Einzelabfragen (`limit=1`) stehen bewusst nicht drin - sie können nicht kappen.
// Wer eine neue Listenabfrage baut, trägt sie hier ein.
// `blaettert: true` heisst: Die Abfrage holt Seite für Seite und kann die Grenze deshalb
// nicht mehr verschlucken. Für sie gilt nur noch die Obergrenze der Blätterung
// (Seiten × Seitengröße). Ohne diese Unterscheidung würde der Wächter genau die Abfragen
// anschreien, die repariert sind — und wäre nach einer Woche Hintergrundrauschen.
const LISTENABFRAGEN = [
  {
    name: 'Nurture: versandfähige Leads',
    wo: 'n8n RqKSRTgFv8mv04H2 → Supabase - Get Eligible Leads',
    blaettert: true,
    seitenGrenze: 20 * 1000, // maxRequests × Seitengröße aus der Knotenkonfiguration
    sql: `select count(*) from public.v_lead_state_full
          where source_app = 'business_leads_quiz' and funnel_key = 'business'
            and email_normalized is not null and first_name is not null`,
  },
  {
    name: 'Nurture: Versand- und Testereignisse',
    wo: 'n8n RqKSRTgFv8mv04H2 → Supabase - Get Test Events',
    blaettert: true,
    seitenGrenze: 20 * 1000,
    sql: `select count(*) from public.lead_events
          where event_name in ('test_lead_marked','test_lead_unmarked','nurture_sent')`,
  },
];

async function zahl(sql) {
  const r = await frage(sql);
  const erste = r && r[0];
  return Number(erste && (erste.count ?? erste.n ?? Object.values(erste)[0]));
}

/**
 * Bewertet EINE Abfrage. Rückgabe null = unauffällig. Bewusst als reine Funktion, damit
 * die Regel im Selbsttest geprüft werden kann, ohne die Datenbank anzufassen — ein
 * Wächter, den man nie hat anschlagen sehen, ist kein Wächter.
 */
function kappungsUrteil(zeilen, abfrage, grenze = ZEILENGRENZE) {
  // Blätternde Abfragen: Die Serverobergrenze ist für sie bedeutungslos. Gemessen wird
  // stattdessen die Decke der Blätterung, die praktisch nie erreicht wird — aber wenn
  // doch, wäre der Fehler derselbe, nur zwanzigmal später.
  const decke = abfrage.blaettert ? abfrage.seitenGrenze || grenze * 20 : grenze;

  if (zeilen >= decke) {
    return {
      stufe: 'ALARM',
      text: abfrage.blaettert
        ? `${zeilen} Zeilen bei einer Blätter-Decke von ${decke} — auch die Blätterung `
          + 'schneidet jetzt ab. Seitenzahl erhöhen oder die Menge verkleinern.'
        : `${zeilen} Zeilen bei Grenze ${decke} — es wird GARANTIERT abgeschnitten. `
          + 'Die Abfrage muss blättern oder die Menge muss kleiner werden.',
    };
  }
  if (zeilen >= decke * WARNSCHWELLE) {
    return {
      stufe: 'WARNUNG',
      text: `${zeilen} von ${decke} Zeilen (${Math.round((zeilen / decke) * 100)} %). `
        + 'Vor dem Erreichen handeln, nicht danach.',
    };
  }
  return null;
}

async function w1Kappungsnaehe() {
  const befunde = [];
  for (const a of LISTENABFRAGEN) {
    const n = await zahl(a.sql);
    const u = kappungsUrteil(n, a);
    if (u) befunde.push({ ...a, zeilen: n, ...u });
  }
  return befunde;
}

function selbsttest() {
  const ohne = { name: 'test', blaettert: false };
  const mit = { name: 'test', blaettert: true, seitenGrenze: 20000 };
  const faelle = [
    ['Nicht blätternd, genau an der Grenze -> ALARM',
      kappungsUrteil(1000, ohne, 1000)?.stufe === 'ALARM'],
    ['Nicht blätternd, darüber -> ALARM',
      kappungsUrteil(1606, ohne, 1000)?.stufe === 'ALARM'],
    ['Nicht blätternd, 90 % -> WARNUNG',
      kappungsUrteil(900, ohne, 1000)?.stufe === 'WARNUNG'],
    ['Nicht blätternd, 89 % -> kein Befund',
      kappungsUrteil(890, ohne, 1000) === null],
    ['Blätternd, weit über der Serverobergrenze -> kein Befund',
      kappungsUrteil(1606, mit, 1000) === null],
    ['Blätternd, an der Blätter-Decke -> ALARM',
      kappungsUrteil(20000, mit, 1000)?.stufe === 'ALARM'],
    ['Blätternd, 90 % der Decke -> WARNUNG',
      kappungsUrteil(18000, mit, 1000)?.stufe === 'WARNUNG'],
    // Der reale Fall vom 26.08.: 1207 Leads bei Grenze 1000, damals ohne Blätterung.
    ['Der echte Vorfall wäre erkannt worden',
      kappungsUrteil(1207, ohne, 1000)?.stufe === 'ALARM'],
  ];
  let fehler = 0;
  console.log('Selbsttest der Kappungsregel (fasst keine Datenbank an):\n');
  for (const [titel, ok] of faelle) {
    console.log(`  ${ok ? 'OK    ' : 'FEHLER'}  ${titel}`);
    if (!ok) fehler += 1;
  }
  console.log('');
  if (fehler) {
    console.log(`${fehler} von ${faelle.length} fehlgeschlagen — der Regel ist nicht zu trauen.`);
    process.exit(1);
  }
  console.log(`Alle ${faelle.length} bestanden.`);
  process.exit(0);
}

if (process.argv.includes('--selbsttest')) selbsttest();

async function w2ErgebnisStattVorgang() {
  const befunde = [];

  // (a) Fällige Erstempfänger, die nichts bekommen haben.
  //
  // 🔴 Gezählt wird je MENSCH (E-Mail-Gruppe über alle Sitzungen), nicht je Datensatz —
  // exakt wie der Versand-Workflow denkt. Die erste Fassung zählte je lead_hash und
  // meldete 81 Fällige, wo real 9 warteten: 21 hatten ihre Mail unter einem ANDEREN Hash
  // derselben Person bekommen, 28 waren über Zweitsitzungen in höheren Rängen, 10 hatten
  // den CTA geklickt, 8 waren markierte Testleads. Am 26.08. Fall für Fall nachverfolgt.
  // Ein Wächter, der eine andere Semantik misst als das System, das er bewacht, erzeugt
  // Dauerwarnungen — und die erziehen zum Wegsehen.
  const ueberfaellig = await frage(`
    with personen as (
      select v.email_normalized as email,
             max(coalesce(v.completed_rank, 0)) as rang,
             bool_or(v.cta_type is not null) as cta,
             bool_or(exists (select 1 from public.lead_events e
               where e.lead_hash = v.lead_hash and e.event_name = 'test_lead_marked')) as testlead,
             bool_or(exists (select 1 from public.lead_events e
               where e.lead_hash = v.lead_hash and e.event_name = 'nurture_sent')) as je_mail,
             min(v.form_submitted_at) as eingereicht
      from public.v_lead_state_full v
      where v.source_app = 'business_leads_quiz' and v.funnel_key = 'business'
        and v.email_normalized is not null and v.first_name is not null
      group by 1
    )
    select count(*) as n, min(eingereicht) as aeltester
    from personen
    where rang = 0 and not cta and not testlead and not je_mail
      and eingereicht < now() - interval '18 hours'`);
  const u = ueberfaellig[0];
  // 🔴 Bewusst nur WARNUNG, nie Alarm: Solange ein Rückstand abgearbeitet wird, ist diese
  // Zahl legitim hoch und sinkt von selbst. Ein Alarm darauf wäre tagelang rot und würde
  // zum Wegsehen erziehen. Gefährlich ist erst die KOMBINATION aus fälligen Empfängern und
  // stehendem Versand — und die prüft (b) darunter.
  if (Number(u.n) > 0) {
    befunde.push({
      stufe: 'WARNUNG',
      name: 'Fällige Erstempfänger ohne Mail',
      zeilen: Number(u.n),
      text: `${u.n} Kontakte sind seit über 18 Stunden fällig und haben nie eine Mail `
        + `bekommen. Ältester Formulareingang: ${String(u.aeltester).slice(0, 10)}.`,
    });
  }

  // (b) Stillstand: Die letzte Sendung liegt zu lange zurück, OBWOHL es fällige gibt.
  // Ohne die zweite Bedingung wäre das ein Fehlalarm an jedem ruhigen Wochenende.
  const letzte = await frage(
    `select max(event_at) as letzte from public.lead_events where event_name = 'nurture_sent'`
  );
  const stunden = letzte[0].letzte
    ? (Date.now() - new Date(letzte[0].letzte).getTime()) / 3600000
    : Infinity;
  if (stunden > 26 && Number(u.n) > 0) {
    befunde.push({
      stufe: 'ALARM',
      name: 'Versand steht still',
      zeilen: Number(u.n),
      text: `Letzte Sendung vor ${Math.round(stunden)} Stunden, obwohl ${u.n} fällige `
        + 'Kontakte warten. Genau dieser Zustand blieb im August drei Wochen unbemerkt.',
    });
  }

  return { befunde, stunden, faellige: Number(u.n) };
}

/**
 * W3 — Menschen, die STRUKTURELL nie eine Mail bekommen können.
 *
 * Sie sind schlimmer als ein Ausfall: Ein Ausfall endet, dieser Zustand nicht. Der Lead
 * steht im System, sieht vollständig aus, wird bei jedem Lauf geprüft — und fällt jedes Mal
 * an derselben Stelle heraus. Ohne diese Prüfung merkt das niemand, weil nichts kaputtgeht.
 *
 * Zwei bekannte Ursachen, beide am 26.08.2026 gemessen:
 *
 *  - **Kein Ziel** (`main_aspiration` leer): Die Mail-Variante wird aus dem Ziel gewählt.
 *    Fehlt es, gibt es keine Vorlage — Übersprung `no_email_id:a2/de/`. Betroffen sind
 *    Leads, die ihre Kontaktdaten hinterlassen haben, ohne das Quiz abzuschliessen:
 *    kein Profil, kein Ziel, keine Variante. 13 von 1210.
 *  - **Keine Absendezeit** (`form_submitted_at` leer): Die Phasenlogik braucht sie als
 *    Bezugspunkt. Ohne sie wird die Person nie fällig und fällt still durch, ohne dass
 *    auch nur ein Übersprung protokolliert wird.
 *
 * Bewusst WARNUNG statt Alarm: Der Zustand ist stabil und nicht dringend, aber er darf
 * nicht unsichtbar bleiben. Wächst die Zahl, wird daraus eine Entscheidung — Rückfall-
 * variante bauen oder die Datenlücke schliessen.
 */
// Bekannte, geprüfte Ausnahmen: Altdaten und Legacy-Einsendungen, für die es nirgends
// Antworten gibt. Ohne die Baseline wäre die W3-Warnung DAUERHAFT an — und eine dauerhaft
// gelbe Anzeige erzieht genauso zum Wegsehen wie eine rote. Gewarnt wird nur bei NEUEN
// Fällen; verschwundene Baseline-Einträge werden zum Aufräumen gemeldet.
function w3BaselineLaden() {
  const p = require('path').join(__dirname, 'waechter-nurture-baseline.json');
  if (!fs.existsSync(p)) return { ohne_ziel: {}, ohne_absendezeit: {}, antworten_unvollstaendig: {} };
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  return {
    ohne_ziel: j.ohne_ziel || {},
    ohne_absendezeit: j.ohne_absendezeit || {},
    antworten_unvollstaendig: j.antworten_unvollstaendig || {},
  };
}

async function w3StrukturellUnerreichbar() {
  // 🔴 Der Tabellenkurzname `v` ist hier nicht Kosmetik: Ohne ihn vergleicht
  // `e.lead_hash = lead_hash` die Spalte mit sich selbst, die Bedingung ist immer wahr,
  // und die Prüfung meldet stillschweigend null Treffer. Genau die Fehlerklasse, gegen die
  // dieser Wächter gebaut ist - beim ersten Entwurf am 26.08. selbst hineingetappt.
  const r = await frage(`
    select v.lead_hash,
      (v.main_aspiration is null or v.main_aspiration = '') as ohne_ziel,
      (v.form_submitted_at is null) as ohne_absendezeit
    from public.v_lead_state_full v
    where v.source_app = 'business_leads_quiz' and v.funnel_key = 'business'
      and v.email_normalized is not null and v.first_name is not null
      and v.cta_type is null
      and ((v.main_aspiration is null or v.main_aspiration = '') or v.form_submitted_at is null)
      and not exists (select 1 from public.lead_events e
        where e.lead_hash = v.lead_hash and e.event_name = 'nurture_sent')`);
  const bekannt = w3BaselineLaden();
  const befunde = [];

  const gefunden = { ohne_ziel: new Set(), ohne_absendezeit: new Set() };
  for (const zeile of r) {
    if (zeile.ohne_ziel) gefunden.ohne_ziel.add(zeile.lead_hash);
    if (zeile.ohne_absendezeit) gefunden.ohne_absendezeit.add(zeile.lead_hash);
  }

  const meldungen = [
    ['ohne_ziel', 'Ohne Ziel — keine Mail-Variante möglich',
      'haben kein `main_aspiration` und können keine Nurture-Mail bekommen.'],
    ['ohne_absendezeit', 'Ohne Absendezeit — wird nie fällig',
      'haben kein `form_submitted_at`; die Phasenlogik findet keinen Bezugspunkt.'],
  ];
  for (const [art, name, text] of meldungen) {
    const neue = [...gefunden[art]].filter((h) => !bekannt[art][h]);
    if (neue.length) {
      befunde.push({
        stufe: 'WARNUNG',
        name,
        zeilen: neue.length,
        text: `${neue.length} NEUE Kontakte ${text} Nicht in der Baseline: `
          + neue.slice(0, 5).join(', ') + (neue.length > 5 ? ' …' : ''),
      });
    }
    const veraltet = Object.keys(bekannt[art]).filter((h) => !gefunden[art].has(h));
    if (veraltet.length) {
      befunde.push({
        stufe: 'WARNUNG',
        name: `Baseline veraltet (${art})`,
        zeilen: veraltet.length,
        text: `${veraltet.length} Baseline-Einträge ohne Befund — vermutlich geheilt, `
          + 'bitte aus waechter-nurture-baseline.json austragen: '
          + veraltet.slice(0, 5).join(', '),
      });
    }
  }
  return befunde;
}

/**
 * W4 — Konvertieren die ANZEIGEN-Besucher noch?
 *
 * Anlass (27.08.2026): Nach dem Hosting-Cutover kamen die Werbe-Besucher (Instagram/
 * Facebook-In-App-Browser) weiter an, spielten das Quiz komplett — und ab dem Formular
 * erreichte kein einziger Klick mehr den Server. 0 von 49 an einem Tag, waehrend
 * Nicht-Werbe-Besucher normal konvertierten. Meta bekam daraufhin keine Lead-Signale mehr
 * und drosselte die Auslieferung von ~800 auf ~60 Impressionen. Mutmasslicher Ausloeser
 * war das HTTP/3-Angebot des neuen Proxys (Alt-Svc h3), das exakt WebKit-Clients nach der
 * Tipp-Pause im Formular traf; seit dem Abschalten laeuft der echte In-App-Submit wieder.
 *
 * Die Pruefung ist bewusst ein VERHAELTNIS, kein Absolutwert: Werbe-Besucher da, aber
 * keine Opt-ins daraus = Alarm. Ohne Werbe-Besucher (Kampagne aus) schweigt sie.
 */
async function w4AnzeigenKonversion() {
  const r = await frage(`
    select
      count(*) filter (where fbclid is not null) as werbebesucher,
      count(*) filter (where fbclid is not null and form_submitted_at is not null) as werbe_optins
    from public.lead_state
    where created_at > now() - interval '24 hours'`);
  const x = r[0];
  const besucher = Number(x.werbebesucher);
  const optins = Number(x.werbe_optins);
  if (besucher >= 15 && optins === 0) {
    return [{
      stufe: 'ALARM',
      name: 'Werbe-Besucher konvertieren nicht',
      zeilen: besucher,
      text: `${besucher} Besucher mit Werbe-Attribution in 24 h, aber KEIN einziges `
        + 'Opt-in daraus. Genau dieses Bild hatte der Vorfall vom 25.-27.08.: Funnel '
        + 'gesund, Anzeigen liefern, Formular-Klicks erreichen den Server nie. Zuerst '
        + 'pruefen: Antwort-Kopfzeilen (Alt-Svc/Protokolle) gegen den letzten guten Stand.',
    }];
  }
  return [];
}

/**
 * W5 — Antwortsätze unvollständig: Opt-in da, aber weniger als 6 Antwortzeilen.
 *
 * Anlass (27.08.2026): Ein leerer void-RPC-Body riss die Antwort-Schleife des Opt-in-Pfads
 * nach der ERSTEN Antwort ab — der Lead sah vollständig aus (Kontakt, Profil, Ziel), aber
 * die Zeilen 2-6 fehlten. Weder der Backfill (füllte nur bei 0 Zeilen) noch W3 (misst nur
 * Ziel/Absendezeit) konnten das sehen. Die Messung am 27.08. fand fünf weitere Teilverluste
 * aus Mai-August, die der Ereignisstrom hinterlassen hatte und die drei Monate unsichtbar
 * waren. Seit dem 27.08. schreibt der Opt-in-Pfad alle sechs Antworten selbst — ein neuer
 * Fall bedeutet deshalb: Der kritische Pfad verliert WIEDER Daten.
 *
 * Stufenlogik: Einzelfälle sind WARNUNG (Sonderwege wie der alte Landing-Page-Eingang
 * liefern legitime Ausreisser, die einzeln in die Baseline wandern). Ab drei NEUEN Fällen
 * ist es systematisch — der Abriss vom 26./27.08. traf deterministisch JEDEN Opt-in — und
 * damit ALARM. Heilweg: `node scripts/backfill-antworten.js` (Trockenlauf zeigt den Plan).
 */
async function w5AntwortsaetzeUnvollstaendig() {
  const r = await frage(`
    select v.lead_hash, count(a.lead_hash) as zeilen
    from public.v_lead_state_full v
    left join public.lead_answers_current a on a.lead_hash = v.lead_hash
    where v.source_app = 'business_leads_quiz' and v.funnel_key = 'business'
      and v.form_submitted_at is not null and v.email_normalized is not null
      and coalesce(v.lifecycle_stage, '') not in ('merged_duplicate', 'migrated')
    group by v.lead_hash
    having count(a.lead_hash) < 6`);
  const bekannt = w3BaselineLaden().antworten_unvollstaendig;
  const gefunden = new Map(r.map((z) => [z.lead_hash, Number(z.zeilen)]));
  const befunde = [];

  const neue = [...gefunden.keys()].filter((h) => !bekannt[h]);
  if (neue.length) {
    befunde.push({
      stufe: neue.length >= 3 ? 'ALARM' : 'WARNUNG',
      name: 'Antwortsätze unvollständig',
      zeilen: neue.length,
      text: `${neue.length} NEUE Opt-ins mit weniger als 6 Antwortzeilen — der Opt-in-Pfad `
        + 'schreibt seit dem 27.08. alle Antworten selbst, das darf nicht mehr vorkommen. '
        + 'Heilweg: backfill-antworten.js (Trockenlauf). Nicht in der Baseline: '
        + neue.slice(0, 5).map((h) => `${h} (${gefunden.get(h)})`).join(', ')
        + (neue.length > 5 ? ' …' : ''),
    });
  }
  // Schluessel mit Unterstrich sind Kommentare der Baseline-Datei, keine Hashes.
  const veraltet = Object.keys(bekannt).filter((h) => !h.startsWith('_') && !gefunden.has(h));
  if (veraltet.length) {
    befunde.push({
      stufe: 'WARNUNG',
      name: 'Baseline veraltet (antworten_unvollstaendig)',
      zeilen: veraltet.length,
      text: `${veraltet.length} Baseline-Einträge ohne Befund — vermutlich geheilt, `
        + 'bitte aus waechter-nurture-baseline.json austragen: '
        + veraltet.slice(0, 5).join(', '),
    });
  }
  return befunde;
}

(async () => {
  const w1 = await w1Kappungsnaehe();
  const w2 = await w2ErgebnisStattVorgang();
  const w3 = await w3StrukturellUnerreichbar();
  const w4 = await w4AnzeigenKonversion();
  const w5 = await w5AntwortsaetzeUnvollstaendig();
  const alle = [...w1, ...w2.befunde, ...w3, ...w4, ...w5];
  const still = process.argv.includes('--still');

  const jsonIndex = process.argv.indexOf('--json');
  if (jsonIndex >= 0 && process.argv[jsonIndex + 1]) {
    fs.writeFileSync(
      process.argv[jsonIndex + 1],
      JSON.stringify({
        gemessen_am: new Date().toISOString(), quelle: MODUS,
        zeilengrenze: ZEILENGRENZE, befunde: alle,
      }, null, 2)
    );
  }

  if (!still) {
    console.log('');
    console.log('Wächter Nurture-Versand');
    console.log('');
    // 🔴 Die Quelle steht ganz oben, weil genau hier der teuerste Irrtum lauert: Ein
    // Wächter auf der ALTEN Datenbank meldet nach dem Cutover zufrieden "alles ruhig",
    // während die neue unbeobachtet läuft. Wer das Protokoll liest, muss sofort sehen,
    // welche Datenbank gemeint ist.
    console.log(`  Quelle                 : ${MODUS}${istPlattform() ? ' (leads/leads_analytics)' : ' (Supabase, public)'}`);
    console.log(`  Zeilengrenze PostgREST : ${ZEILENGRENZE}`);
    console.log(`  Letzte Sendung vor     : ${Number.isFinite(w2.stunden) ? Math.round(w2.stunden) + ' Stunden' : 'nie'}`);
    console.log(`  Fällige ohne Mail      : ${w2.faellige}`);
    console.log('');
    if (!alle.length) {
      console.log('  Keine Auffälligkeiten.');
    } else {
      for (const b of alle) {
        console.log(`  [${b.stufe}] ${b.name}`);
        if (b.wo) console.log(`           ${b.wo}`);
        console.log(`           ${b.text}`);
        console.log('');
      }
    }
    console.log('');
  }

  // Verbindung schliessen, bevor der Exitcode faellt: Ein offener Pool haelt den Prozess
  // sonst am Leben, der Container laeuft in den Cron-Ueberlauf und der Herzschlag bleibt
  // aus - was wie eine Stoerung aussieht, obwohl der Lauf sauber war.
  await schliessen();
  process.exit(alle.some((b) => b.stufe === 'ALARM') ? 1 : 0);
})().catch(async (e) => {
  await schliessen().catch(() => {});
  process.stderr.write(`Wächter nicht durchführbar (Quelle ${MODUS}): ${e.message}\n`);
  process.exit(2);
});
