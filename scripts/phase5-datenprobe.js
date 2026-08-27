#!/usr/bin/env node
'use strict';

// Phase-5-Datenprobe: pumpt die ECHTEN Daten der 18 Auswahl-Tabellen aus der Quelle
// (Supabase, rein lesend ueber PostgREST mit Blaetterung) in die Testdatenbank
// business_leads_testimport auf dem Flotten-PG18 - und beweist danach die Zaehlparitaet.
//
// Zweck: Der Schema-Testimport beweist Definitionen, diese Probe beweist DATEN -
// Typen, Unicode, Check-Constraints, FKs und Identity gegen 166k echte Zeilen.
// KEINE Generalprobe der Cutover-Dauer: dafuer braucht es pg_dump/COPY mit dem
// DB-Passwort (Supabase-Dashboard); der API-Weg ist eine Obergrenze, keine Messung.
//
// Die Quelle laeuft waehrend der Probe WEITER (kein Schreibstopp) - kleine Drift
// zwischen Export und Zaehlung ist erwartbar und wird ausgewiesen, nicht versteckt.
// Der echte Cutover arbeitet mit Schreibruhe (13.5.2).
//
//   node --env-file=.env.prod scripts/phase5-datenprobe.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const BASE = String(process.env.SUPABASE_URL || '').trim();
const KEY = String(process.env.SUPABASE_SERVICE_KEY || '').trim();
if (!BASE || !KEY) { console.error('SUPABASE_URL/SUPABASE_SERVICE_KEY fehlen.'); process.exit(2); }

const SSH = 'C:/Windows/System32/OpenSSH/ssh.exe';
const SCP = 'C:/Windows/System32/OpenSSH/scp.exe';
const HOST = 'root@91.99.76.104';
const SSHKEY = 'C:/Users/Markus/.ssh/id_rsa';
const DB = 'business_leads_testimport';
const TAG = '$dp27q9x$'; // Dollar-Quote-Tag; Kollision wird geprueft, nie angenommen.

// Reihenfolge respektiert die 7 FKs: Eltern zuerst.
const TABELLEN = [
  { t: 'lead_state', schema: 'public', pk: 'lead_hash', pkTyp: 'text' },
  // Composite-PK (project_key, sequence_key) - Keyset auf einer Spalte wuerde Zeilen
  // ueberspringen; die Tabelle ist winzig, Offset reicht.
  { t: 'nurture_sequences', schema: 'public', pk: 'project_key', pkTyp: 'offset' },
  { t: 'lead_events', schema: 'public', pk: 'event_id', pkTyp: 'zahl', identity: true },
  { t: 'lead_video_progress', schema: 'public', pk: 'lead_hash', pkTyp: 'offset' },
  { t: 'lead_answers_current', schema: 'public', pk: 'lead_hash', pkTyp: 'offset' },
  { t: 'lead_sync_outbox', schema: 'public', pk: 'id', pkTyp: 'zahl', identity: true },
  { t: 'lead_profiles', schema: 'public', pk: 'id', pkTyp: 'zahl', identity: true },
  { t: 'app_config', schema: 'public', pk: 'key', pkTyp: 'text' },
  { t: 'nurture_runs', schema: 'public', pk: 'id', pkTyp: 'zahl' },
  { t: 'nurture_subject_states', schema: 'public', pk: 'lead_hash', pkTyp: 'offset' },
  { t: 'tracking_sessions', schema: 'public', pk: 'id', pkTyp: 'zahl' },
  { t: 'tracking_events', schema: 'public', pk: 'id', pkTyp: 'zahl' },
  { t: 'tracking_video_progress', schema: 'public', pk: 'id', pkTyp: 'zahl' },
  { t: 'quiz_sessions', schema: 'public', pk: 'id', pkTyp: 'zahl' },
  { t: 'lead_migration_unresolved', schema: 'public', pk: 'id', pkTyp: 'zahl', identity: true },
  { t: 'lead_contact_crm', schema: 'public', pk: 'lead_hash', pkTyp: 'text' },
  { t: 'event_daily', schema: 'analytics_internal', pk: 'event_day', pkTyp: 'offset' },
  { t: 'refresh_runs', schema: 'analytics_internal', pk: 'run_id', pkTyp: 'zahl' },
];

async function seite(pfad) {
  const r = await fetch(`${BASE}/rest/v1/${pfad}`, {
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`,
      'Accept-Profile': pfad.startsWith('event_daily') || pfad.startsWith('refresh_runs')
        ? 'analytics_internal' : 'public',
    },
  });
  if (!r.ok) throw new Error(`${pfad}: HTTP ${r.status} ${await r.text()}`);
  return r.json();
}

async function exportiere(tab) {
  const zeilen = [];
  // PostgREST liefert nur public/graphql_public/marathon aus (PGRST106, gemessen) -
  // analytics_internal geht ueber die Management-API (read-only SQL).
  if (tab.schema === 'analytics_internal') {
    const { executeManagementQuery } = require('./stats-logs-baseline.js');
    for (let o = 0; ; o += 1000) {
      const s = await executeManagementQuery(
        `select * from ${tab.schema}.${tab.t} order by ${tab.pk} limit 1000 offset ${o}`);
      zeilen.push(...s);
      if (s.length < 1000) break;
    }
    return zeilen;
  }
  if (tab.pkTyp === 'zahl' || tab.pkTyp === 'text') {
    // Keyset-Blaetterung ueber den PK - stabil auch bei laufenden Schreibvorgaengen.
    let letzter = null;
    for (;;) {
      const filter = letzter === null ? '' :
        `&${tab.pk}=gt.${tab.pkTyp === 'text' ? encodeURIComponent(letzter) : letzter}`;
      const s = await seite(`${tab.t}?select=*&order=${tab.pk}.asc&limit=1000${filter}`);
      zeilen.push(...s);
      if (s.length < 1000) break;
      letzter = s[s.length - 1][tab.pk];
    }
  } else {
    // Kleine Tabellen ohne einspaltigen Schluessel: Offset-Blaetterung mit fester Ordnung.
    for (let o = 0; ; o += 1000) {
      const s = await seite(`${tab.t}?select=*&order=${tab.pk}.asc&limit=1000&offset=${o}`);
      zeilen.push(...s);
      if (s.length < 1000) break;
    }
  }
  return zeilen;
}

// Identity-Tabellen aus dem Paritaets-Schnappschuss ableiten - Handflags drifteten
// (refresh_runs.run_id ist GENERATED ALWAYS und fehlte in der ersten Liste).
const paritaetPfad = path.join(__dirname, '..', 'docs', 'audits', 'cutover-vorbereitung',
  'phase5-testimport', `paritaet-live-${new Date().toISOString().slice(0, 10)}.json`);
const IDENTITY_TABELLEN = new Set(
  JSON.parse(fs.readFileSync(paritaetPfad, 'utf8')).spalten
    .filter((z) => z.identity === 'a' || z.identity === 'd')
    .map((z) => `${z.schema}.${z.tabelle}`)
);

function sqlFuer(tab, zeilen) {
  const teile = [`\\set ON_ERROR_STOP on`, `BEGIN;`];
  const voll = `${tab.schema}.${tab.t}`;
  const override = IDENTITY_TABELLEN.has(voll) ? ' OVERRIDING SYSTEM VALUE' : '';
  for (let i = 0; i < zeilen.length; i += 1000) {
    const chunk = JSON.stringify(zeilen.slice(i, i + 1000));
    if (chunk.includes(TAG)) throw new Error(`Dollar-Quote-Kollision in ${voll} - Tag wechseln.`);
    teile.push(`INSERT INTO ${voll}${override} SELECT * FROM jsonb_populate_recordset(NULL::${voll}, ${TAG}${chunk}${TAG}::jsonb);`);
  }
  teile.push('COMMIT;');
  return teile.join('\n');
}

(async () => {
  const start = Date.now();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'phase5-datenprobe-'));
  const bericht = [];

  for (const tab of TABELLEN) {
    const t0 = Date.now();
    const zeilen = await exportiere(tab);
    const datei = path.join(tmp, `${tab.schema}.${tab.t}.sql`);
    fs.writeFileSync(datei, sqlFuer(tab, zeilen), 'utf8');
    bericht.push({ tabelle: `${tab.schema}.${tab.t}`, exportiert: zeilen.length, sekunden: ((Date.now() - t0) / 1000).toFixed(1) });
    console.log(`export ${tab.schema}.${tab.t}: ${zeilen.length} Zeilen (${bericht[bericht.length - 1].sekunden}s)`);
  }

  console.log('Uebertrage nach ' + HOST + ' ...');
  execFileSync(SSH, ['-o', 'StrictHostKeyChecking=no', '-i', SSHKEY, HOST, 'rm -rf /tmp/phase5-daten && mkdir -p /tmp/phase5-daten'], { stdio: 'inherit' });
  execFileSync(SCP, ['-o', 'StrictHostKeyChecking=no', '-i', SSHKEY, '-q', ...fs.readdirSync(tmp).map((f) => path.join(tmp, f)), `${HOST}:/tmp/phase5-daten/`], { stdio: 'inherit', timeout: 1800000 });

  // EINE SSH-Sitzung fuer den ganzen Import: die erste Fassung oeffnete je Tabelle eine
  // Verbindung (~20 in schneller Folge) und lief in eine Rate-Sperre des Servers.
  console.log('Leere Zieltabellen und importiere in FK-Reihenfolge (eine SSH-Sitzung) ...');
  const leeren = 'TRUNCATE ' + TABELLEN.map((x) => `${x.schema}.${x.t}`).join(', ') + ' CASCADE;';
  const importKette = TABELLEN.map((tab) =>
    `sudo -u postgres psql -d ${DB} -q -v ON_ERROR_STOP=1 -f /tmp/phase5-daten/${tab.schema}.${tab.t}.sql && echo "import ${tab.schema}.${tab.t} ok"`
  ).join(' && ');
  execFileSync(SSH, ['-o', 'StrictHostKeyChecking=no', '-i', SSHKEY, HOST,
    `chown -R postgres /tmp/phase5-daten && sudo -u postgres psql -d ${DB} -c "${leeren}" && ${importKette}`],
    { stdio: 'inherit', timeout: 3000000 });

  console.log('Setze Identity-/Sequenz-Staende auf max+1000 (Generalprobe des Cutover-Schritts) ...');
  const setval = `
    do $fix$ declare r record; begin
      for r in select seq.relname as seq, tab.relnamespace::regnamespace::text as schema_name,
                      tab.relname as tabelle, a.attname as spalte
               from pg_class seq
               join pg_depend d on d.objid = seq.oid and d.deptype in ('a','i')
               join pg_class tab on tab.oid = d.refobjid
               join pg_attribute a on a.attrelid = tab.oid and a.attnum = d.refobjsubid
               where seq.relkind = 'S'
      loop
        execute format('select setval(%L, coalesce((select max(%I) from %I.%I), 0) + 1000)',
          r.schema_name || '.' || r.seq, r.spalte, r.schema_name, r.tabelle);
      end loop;
    end $fix$;`;
  execFileSync(SSH, ['-o', 'StrictHostKeyChecking=no', '-i', SSHKEY, HOST,
    `sudo -u postgres psql -d ${DB} -q -v ON_ERROR_STOP=1`], { input: setval, encoding: 'utf8' });

  console.log('\nZaehlparitaet (Quelle zaehlt JETZT - Drift durch Live-Betrieb wird ausgewiesen):');
  let befunde = 0;
  // Alle Testimport-Zaehlungen in EINER SSH-Sitzung.
  const zaehlSql = TABELLEN.map((tab) =>
    `select '${tab.schema}.${tab.t}' as tabelle, count(*) as n from ${tab.schema}.${tab.t}`
  ).join(' union all ');
  const testZeilen = execFileSync(SSH, ['-o', 'StrictHostKeyChecking=no', '-i', SSHKEY, HOST,
    `sudo -u postgres psql -d ${DB} -tA -c "${zaehlSql}"`], { encoding: 'utf8' })
    .trim().split('\n').map((z) => z.split('|'));
  const testMap = new Map(testZeilen.map(([t, n]) => [t, Number(n)]));
  for (const tab of TABELLEN) {
    let quelle;
    if (tab.schema === 'analytics_internal') {
      const { executeManagementQuery } = require('./stats-logs-baseline.js');
      quelle = Number((await executeManagementQuery(`select count(*) as n from ${tab.schema}.${tab.t}`))[0].n);
    } else {
      const kopf = await fetch(`${BASE}/rest/v1/${tab.t}?select=${tab.pk}&limit=1`, {
        method: 'HEAD',
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'count=exact' },
      });
      quelle = Number((kopf.headers.get('content-range') || '/-1').split('/')[1]);
    }
    const test = testMap.get(`${tab.schema}.${tab.t}`);
    const exportiert = bericht.find((b) => b.tabelle === `${tab.schema}.${tab.t}`).exportiert;
    const status = test === exportiert ? (quelle === test ? 'OK      ' : 'DRIFT   ') : 'FEHLER  ';
    if (status === 'FEHLER  ') befunde += 1;
    console.log(`  ${status} ${tab.schema}.${tab.t}: Quelle jetzt ${quelle} | exportiert ${exportiert} | importiert ${test}`);
  }

  console.log(`\nGesamtdauer ${((Date.now() - start) / 60000).toFixed(1)} min (API-Weg, Obergrenze).`);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(befunde ? 1 : 0);
})().catch((e) => { console.error('Datenprobe gescheitert:', e.message); process.exit(1); });
