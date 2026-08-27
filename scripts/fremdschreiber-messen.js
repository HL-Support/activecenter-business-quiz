#!/usr/bin/env node
'use strict';

// Misst, wer AUSSER der Anwendung selbst in den Leadkern schreibt - Vorbereitung und
// Abnahme der Schreibbarriere (Audit 13.5.2, Schritt 0: "trennen und MESSEN").
//
// Zwei unabhaengige Messwege, bewusst getrennt (Falle: Redundanz verdeckt Fehler -
// ein Weg allein laesst einen offenen Pfad "bewiesen" aussehen):
//
//   A) DATENSEITE - Ereignisse mit der Signatur eines Fremdschreibers in lead_events.
//      🔴 NICHT ueber source_app messen: activecenter-analytics kopiert diesen Wert aus
//      lead_state und traegt im Regelfall 'business_leads_quiz' - genau wie die
//      Anwendung. Trennscharf sind nur payload->>'source' und das event_uid-Praefix.
//
//   B) TRANSPORTSEITE - schreibende HTTP-Zugriffe aus den Supabase-Edge-Logs, gruppiert
//      nach ZIELPFAD. Die Datenseite sieht nur, was ANKOMMT; die Transportseite sieht,
//      WER klopft - auch wenn der Schreibversuch nichts hinterlaesst.
//      🔴 Nicht nach Herkunfts-IP gruppieren: n8n-Cloud und Vercel rufen aus wechselnden
//      AWS-Bereichen (gemessen: 59 IPs in 24 h fuer eine Handvoll Dienste). Der Pfad ist
//      der stabile Schluessel, die IP-Anzahl nur ein Nebenhinweis.
//
// Beides ist rein lesend.
//
//   node --env-file=.env.prod scripts/fremdschreiber-messen.js [--stunden 24]

const { executeManagementQuery } = require('./stats-logs-baseline.js');

const PROJECT_REF = 'xlpiisbozpgmemxhtivj';

// Die 18 Tabellen der Migrieren-Liste - nur Schreibzugriffe HIER sind fuer die
// Schreibbarriere relevant. Alles andere (webhook_*, system_alerts, push_*) gehoert
// zu Verbuenden, die bewusst zurueckbleiben (Entscheidungen 3 und 8).
const MIGRIEREN = [
  'lead_state', 'lead_events', 'lead_video_progress', 'lead_answers_current',
  'lead_sync_outbox', 'lead_profiles', 'app_config', 'nurture_sequences',
  'nurture_runs', 'nurture_subject_states', 'tracking_sessions', 'tracking_events',
  'tracking_video_progress', 'quiz_sessions', 'lead_migration_unresolved',
  'lead_contact_crm', 'event_daily', 'refresh_runs',
];

// Bekannte Schreibpfade in die Migrieren-Liste, je mit ihrem Verbraucher.
// Ein Pfad, der hier FEHLT, ist der eigentliche Befund.
const BEKANNTE_PFADE = {
  'rpc/submit_lead_complete': 'business_leads_quiz (Stufe A)',
  'rpc/upsert_answer_current': 'business_leads_quiz / Backfill',
  'rpc/upsert_video_progress_monotonic': 'business_leads_quiz',
  'rpc/init_lead': 'business_leads_quiz',
  'rpc/enqueue_lead_sync': 'business_leads_quiz',
  'rpc/claim_outbox_jobs': 'n8n Outbox-Worker',
  'rpc/mark_outbox_done': 'n8n Outbox-Worker',
  'rpc/mark_outbox_failed': 'n8n Outbox-Worker',
  'rpc/record_nurture_run': 'n8n Nurture-Sender',
  'rpc/record_nurture_sent': 'n8n Nurture-Sender',
  'rpc/record_nurture_skip': 'n8n Nurture-Sender',
  'rpc/record_nurture_failure': 'n8n Nurture-Sender',
  lead_events: 'business_leads_quiz — 🔴 auch der Pfad von activecenter-analytics',
  lead_state: 'business_leads_quiz',
  lead_profiles: 'business_leads_quiz (api/bridge.js:1741, Upsert on_conflict=profile_key)',
  tracking_sessions: 'business_leads_quiz',
  tracking_events: 'business_leads_quiz',
  tracking_video_progress: 'business_leads_quiz',
  quiz_sessions: 'business_leads_quiz',
  lead_contact_crm: 'business_leads_quiz / Business_Kalkulator',
  lead_answers_current: 'business_leads_quiz (Antworten laufen sonst ueber upsert_answer_current)',
};

// Fremdschreiber und ihre trennscharfen Merkmale. Belege im Verbraucher-Inventar
// (docs/audits/verbraucher-inventar/INVENTAR.md) und in der Schreibbarriere.
const SIGNATUREN = [
  {
    name: 'activecenter-analytics (Dashboard-Testlead)',
    beleg: 'analytics/api/bridge.js:2148, Action set_test_contact',
    // payload.source ist konstant und wird NICHT vom Lead geerbt - im Gegensatz zu
    // source_app, das dieselbe Zeile mit 'business_leads_quiz' fuellt.
    bedingung: "payload->>'source' = 'analytics_dashboard_v2'",
  },
  {
    name: 'Testlead-Markierungen aller Herkuenfte (breiter Fangnetz-Blick)',
    beleg: 'event_name-Allowlist api/lead-track.js',
    bedingung: "event_name in ('test_lead_marked','test_lead_unmarked')",
  },
];

const stundenArg = process.argv.indexOf('--stunden');
const STUNDEN = stundenArg > -1 ? Number(process.argv[stundenArg + 1]) : 24;

async function frageLogs(sql, vonIso, bisIso) {
  const token = String(process.env.SUPABASE_ACCESS_TOKEN || '').trim();
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN fehlt (.env.prod)');
  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/analytics/endpoints/logs.all`
    + `?sql=${encodeURIComponent(sql)}`
    + `&iso_timestamp_start=${encodeURIComponent(vonIso)}`
    + `&iso_timestamp_end=${encodeURIComponent(bisIso)}`;
  // Cloudflare blockt python/node-artige User-Agents auf der Management-API.
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'curl/8.0.1' } });
  if (!r.ok) throw new Error(`Log-API HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  if (j.error) throw new Error(`Log-API: ${JSON.stringify(j.error).slice(0, 300)}`);
  return j.result || [];
}

async function datenseite() {
  console.log('== A) Datenseite: Ereignisse mit Fremdschreiber-Signatur in lead_events ==\n');
  let offen = 0;
  for (const sig of SIGNATUREN) {
    const r = await executeManagementQuery(`
      select count(*) as n, max(event_at)::text as letztes,
             (now() - max(event_at))::text as her
      from public.lead_events where ${sig.bedingung}`);
    const { n, letztes, her } = r[0];
    console.log(`  ${sig.name}`);
    console.log(`    Beleg:    ${sig.beleg}`);
    console.log(`    Bedingung: ${sig.bedingung}`);
    if (Number(n) === 0) {
      console.log('    Ergebnis: KEINE Zeile - dieser Schreiber hat nie geschrieben oder wurde bereinigt.\n');
      continue;
    }
    // Ein Ereignis der letzten 24 h ist ein AKTIVER Schreiber; alles aeltere ist ein
    // ruhender, aber weiterhin OFFENER Pfad.
    const aktiv = /^-?\d{1,2}:\d{2}:/.test(String(her)) || String(her).startsWith('0 ');
    console.log(`    Ergebnis: ${n} Zeilen, letzte am ${letztes} (vor ${her})`);
    console.log(`    Wertung:  ${aktiv ? '🔴 AKTIV - schreibt noch' : 'ruhend - seit dem letzten Eintrag still'}\n`);
    if (aktiv) offen += 1;
  }
  return offen;
}

async function transportseite() {
  const bis = new Date();
  const von = new Date(bis.getTime() - STUNDEN * 3600 * 1000);
  console.log(`== B) Transportseite: Schreibzugriffe der letzten ${STUNDEN} h auf die Migrieren-Liste ==\n`);

  const sql = `
    select req.method as methode, req.path as pfad,
           count(*) as n, count(distinct h.cf_connecting_ip) as ips
    from edge_logs as t
    cross join unnest(t.metadata) as m
    cross join unnest(m.request) as req
    cross join unnest(req.headers) as h
    where req.method in ('POST','PATCH','PUT','DELETE')
    group by methode, pfad
    order by n desc
    limit 200`;

  let zeilen;
  try {
    zeilen = await frageLogs(sql, von.toISOString(), bis.toISOString());
  } catch (e) {
    // Das Log-Aufbewahrungsfenster ist tarifabhaengig; ein Fehlschlag hier darf die
    // Datenseite nicht entwerten, muss aber SICHTBAR sein statt still zu verschwinden.
    console.log(`  🔴 Nicht messbar: ${e.message}`);
    console.log('     Die Transportseite fehlt damit - die Datenseite allein ist kein Vollbeweis.\n');
    return null;
  }

  // Auf die Migrieren-Liste eingrenzen: /rest/v1/<ziel> bzw. /rest/v1/rpc/<funktion>.
  // Ein RPC zaehlt mit, wenn er in BEKANNTE_PFADE steht - er schreibt dann per
  // Definition in die Auswahl (die Zuordnung stammt aus dem Verbraucher-Inventar).
  const treffer = [];
  const draussen = new Map();
  for (const z of zeilen) {
    const m = /\/rest\/v1\/(rpc\/[a-z0-9_]+|[a-z0-9_]+)/i.exec(String(z.pfad));
    if (!m) continue;
    const ziel = m[1];
    const istMigrieren = MIGRIEREN.includes(ziel) || Object.hasOwn(BEKANNTE_PFADE, ziel);
    if (istMigrieren) treffer.push({ ...z, ziel });
    else draussen.set(ziel, (draussen.get(ziel) || 0) + Number(z.n));
  }

  const unbekannt = [];
  if (!treffer.length) {
    console.log('  Keine Schreibzugriffe auf die Migrieren-Liste im Fenster.\n');
  }
  for (const z of treffer.sort((a, b) => Number(b.n) - Number(a.n))) {
    const wer = BEKANNTE_PFADE[z.ziel];
    console.log(`  ${String(z.methode).padEnd(6)} ${z.ziel.padEnd(38)} n=${String(z.n).padStart(5)} aus ${String(z.ips).padStart(3)} IP(s)  ${wer || '🔴 UNBEKANNTER SCHREIBER'}`);
    if (!wer) unbekannt.push(z.ziel);
  }

  // DELETE gesondert: Loeschungen im Leadkern sind selten und stammen erfahrungsgemaess
  // von HAND (Testlead-Aufraeumen von einem Arbeitsplatz, nicht aus dem Repo). Am
  // Cutover-Tag ist genau das der Weg, den man vergisst - die Barriere faengt ihn nur,
  // weil das REVOKE auch service_role trifft, also auch lokale Skripte mit dem Key.
  const loeschungen = treffer.filter((z) => z.methode === 'DELETE');
  if (loeschungen.length) {
    console.log('\n  🔴 Loeschungen im Fenster (Urheber pruefen - oft Handarbeit, nicht Code):');
    for (const z of loeschungen) console.log(`     DELETE ${z.ziel} n=${z.n}`);
  }

  // Was ausserhalb der Auswahl geschrieben wird, gehoert zu zurueckbleibenden
  // Verbuenden - einmal genannt, damit die Zahl nicht als "uebersehen" wirkt.
  if (draussen.size) {
    const summe = [...draussen.values()].reduce((a, b) => a + b, 0);
    console.log(`\n  Ausserhalb der Migrieren-Liste (bleibt zurueck, Entscheidungen 3 und 8): `
      + `${summe} Zugriffe auf ${draussen.size} Ziele`);
    console.log(`     ${[...draussen.keys()].sort().join(', ')}`);
  }
  console.log('');
  return unbekannt;
}

(async () => {
  console.log(`\nFremdschreiber-Messung, erzeugt ${new Date().toISOString()}\n`);
  const aktiveSignaturen = await datenseite();
  const unbekanntePfade = await transportseite();

  console.log('== Fazit ==\n');
  if (aktiveSignaturen === 0) {
    console.log('  Datenseite:      kein Fremdschreiber hat in den letzten 24 h geschrieben.');
  } else {
    console.log(`  Datenseite:      🔴 ${aktiveSignaturen} Fremdschreiber schreibt/schreiben AKTIV.`);
  }
  if (unbekanntePfade === null) {
    console.log('  Transportseite:  nicht messbar (siehe oben) - kein Vollbeweis.');
  } else if (!unbekanntePfade.length) {
    console.log('  Transportseite:  nur zugeordnete Schreibpfade.');
  } else {
    console.log(`  Transportseite:  🔴 nicht zugeordnet: ${unbekanntePfade.join(', ')}`);
  }
  console.log('\n  🔴 Ruhend ist NICHT geschlossen: ein ungenutzter Schreibpfad schreibt beim');
  console.log('     naechsten Klick wieder - moeglicherweise mitten im Cutover-Fenster.');
  console.log('     Diese Messung ersetzt das Schliessen des Pfads nicht, sie belegt es.\n');

  const befund = aktiveSignaturen > 0 || (unbekanntePfade && unbekanntePfade.length > 0);
  process.exit(befund ? 1 : 0);
})().catch((e) => { console.error('Messung gescheitert:', e.message); process.exit(2); });
