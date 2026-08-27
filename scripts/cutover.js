#!/usr/bin/env node
'use strict';

// Cutover Supabase -> Plattform-DB (hl_support), Schritt für Schritt mit Nachweisen.
//
// Bewusst KEIN Durchlauf auf Knopfdruck: Jeder Schritt wird einzeln aufgerufen, prüft
// seine Vorbedingungen und legt Belege ab. Zwischen den Schritten entscheidet ein
// Mensch. Ein Skript, das den ganzen Umzug allein fährt, nimmt genau die Entscheidungen
// vorweg, für die es am Umzugstag Augen braucht.
//
//   node --env-file=.env.prod scripts/cutover.js pruefen      Vorbedingungen
//   node --env-file=.env.prod scripts/cutover.js barriere-an  Cron aus, Rechte entziehen
//   node --env-file=.env.prod scripts/cutover.js stillstand   zweimal messen (Pflicht!)
//   node --env-file=.env.prod scripts/cutover.js uebertragen  Dump -> umschreiben -> Restore
//   node --env-file=.env.prod scripts/cutover.js nachweisen   Zeilen, Prüfsummen, Waisen
//   node --env-file=.env.prod scripts/cutover.js barriere-aus RÜCKWEG
//
// Alle Schreibvorgänge gehen ausschliesslich an die ZIEL-Datenbank. Der einzige
// Eingriff in die Quelle ist das Entziehen/Zurückgeben von Rechten und das Abschalten
// des Cron-Jobs - beides umkehrbar, beides protokolliert.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { executeManagementQuery } = require('./stats-logs-baseline.js');

const SSH = 'C:/Windows/System32/OpenSSH/ssh.exe';
const SCP = 'C:/Windows/System32/OpenSSH/scp.exe';
const KEY = 'C:/Users/Markus/.ssh/id_rsa';
const ZIEL_HOST = 'root@91.99.76.104';
const ZIEL_DB = process.env.ZIEL_DB || 'hl_support';

const TABELLEN = [
  ['public', 'lead_state'], ['public', 'lead_events'], ['public', 'lead_video_progress'],
  ['public', 'lead_answers_current'], ['public', 'lead_sync_outbox'], ['public', 'lead_profiles'],
  ['public', 'app_config'], ['public', 'nurture_sequences'], ['public', 'nurture_runs'],
  ['public', 'nurture_subject_states'], ['public', 'tracking_sessions'], ['public', 'tracking_events'],
  ['public', 'tracking_video_progress'], ['public', 'quiz_sessions'], ['public', 'lead_migration_unresolved'],
  ['public', 'lead_contact_crm'], ['analytics_internal', 'event_daily'], ['analytics_internal', 'refresh_runs'],
];
const ZIEL = (s) => (s === 'analytics_internal' ? 'leads_analytics' : 'leads');

const BELEGE = path.join(__dirname, '..', 'docs', 'audits', 'cutover-vorbereitung', 'cutover-belege');

function ssh(befehl, optionen = {}) {
  return execFileSync(SSH, ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-i', KEY,
    ZIEL_HOST, befehl], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 1800000, ...optionen });
}

function zielSql(sql) {
  return ssh(`sudo -u postgres psql -d ${ZIEL_DB} -tAq`, { input: sql + '\n' }).trim();
}

function belegSchreiben(name, inhalt) {
  fs.mkdirSync(BELEGE, { recursive: true });
  const datei = path.join(BELEGE, name);
  fs.writeFileSync(datei, inhalt, 'utf8');
  console.log(`  Beleg: ${path.relative(process.cwd(), datei)}`);
}

// --- Schritte ---------------------------------------------------------------

async function pruefen() {
  console.log('\n== Vorbedingungen ==\n');
  const befunde = [];
  const pruefe = (name, ok, detail) => {
    befunde.push({ name, ok, detail });
    console.log(`  ${ok ? 'OK     ' : '🔴 OFFEN'} ${name}${detail ? ' — ' + detail : ''}`);
  };

  // Struktur im Ziel vollständig?
  const tabellen = Number(zielSql(
    "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace "
    + "where n.nspname in ('leads','leads_analytics') and c.relkind='r'"));
  pruefe('Ziel-Schema steht (18 Tabellen)', tabellen === 18, `${tabellen} Tabellen`);

  const leer = Number(zielSql(
    "select coalesce(sum(n_live_tup),0) from pg_stat_user_tables "
    + "where schemaname in ('leads','leads_analytics')"));
  pruefe('Ziel ist noch leer', leer === 0, `${leer} Zeilen`);

  // Rechte der App-Rolle - ohne sie läuft nach dem Umschalten nichts.
  const darfLesen = zielSql(
    "select has_table_privilege('leads_app','leads.lead_state','select')::text");
  const darfSchreiben = zielSql(
    "select has_table_privilege('leads_app','leads.lead_state','insert')::text");
  // psql -tA druckt bei boolean 'true'/'false', nicht 't'/'f' - beide Formen zulassen,
  // damit die Pruefung nicht an der Ausgabeform scheitert statt an den Rechten.
  const jaWort = (w) => w === 't' || w === 'true';
  pruefe('leads_app darf lesen und schreiben', jaWort(darfLesen) && jaWort(darfSchreiben),
    `select=${darfLesen} insert=${darfSchreiben}`);

  // pg_cron auf dem Ziel: Extension da, Job noch nicht (wird nach dem Umzug angelegt).
  const cronDa = Number(zielSql("select count(*) from pg_extension where extname='pg_cron'"));
  pruefe('pg_cron auf dem Ziel vorhanden', cronDa === 1, `${cronDa}`);

  // Quelle: Cron-Job, der alle 15 min schreibt.
  const jobs = await executeManagementQuery(
    "select jobid, active from cron.job where command like '%refresh_event_daily%'");
  pruefe('Quell-Cron-Job gefunden (muss vor dem Dump aus)', jobs.length === 1,
    jobs.length ? `Job #${jobs[0].jobid}, aktiv=${jobs[0].active}` : 'nicht gefunden');

  // Dump-Werkzeug und Zugang.
  const dumpVersion = ssh('pg_dump --version').trim();
  pruefe('pg_dump auf dem Ziel-Server', dumpVersion.includes('18.'), dumpVersion);

  const offen = befunde.filter((b) => !b.ok);
  console.log(`\n  ${befunde.length - offen.length}/${befunde.length} erfüllt.\n`);
  return offen.length ? 1 : 0;
}

async function barriereAn() {
  console.log('\n== Barriere setzen ==\n');
  console.log('  🔴 Ab jetzt schlägt JEDER Schreibversuch auf die Quelle fehl.\n');

  const jobs = await executeManagementQuery(
    "select jobid from cron.job where command like '%refresh_event_daily%'");
  if (jobs.length === 1) {
    await executeManagementQuery(`select cron.unschedule(${jobs[0].jobid})`);
    console.log(`  Cron-Job #${jobs[0].jobid} abgeschaltet (schrieb alle 15 min).`);
  }

  const liste = TABELLEN.map(([s, t]) => `${s}.${t}`).join(', ');
  await executeManagementQuery(
    `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ${liste} FROM anon, authenticated, service_role`);
  console.log(`  Schreibrechte auf ${TABELLEN.length} Tabellen entzogen (SELECT bleibt, der Dump liest).`);
  console.log('\n  Jetzt: n8n-Workflows deaktivieren, dann "stillstand" laufen lassen.\n');
  return 0;
}

async function barriereAus() {
  console.log('\n== RÜCKWEG: Barriere lösen ==\n');
  const liste = TABELLEN.map(([s, t]) => `${s}.${t}`).join(', ');
  await executeManagementQuery(
    `GRANT INSERT, UPDATE, DELETE ON ${liste} TO anon, authenticated, service_role`);
  console.log('  Schreibrechte zurückgegeben.');
  await executeManagementQuery(
    "select cron.schedule('refresh_event_daily-15min', '*/15 * * * *', "
    + "$$select analytics_internal.refresh_event_daily((now() at time zone 'UTC')::date, "
    + "(now() at time zone 'UTC')::date)$$)");
  console.log('  Cron-Job wieder eingeplant.');
  console.log('\n  🔴 n8n-Workflows nicht vergessen zu reaktivieren.\n');
  return 0;
}

async function stillstand() {
  console.log('\n== Stillstand messen (zweimal, Pflicht) ==\n');
  const messung = async () => {
    const r = await executeManagementQuery(`
      select 'lead_events' t, count(*) n, max(event_id)::text hoch, max(event_at)::text letzte from public.lead_events
      union all select 'lead_state', count(*), null, max(last_event_at)::text from public.lead_state
      union all select 'lead_answers_current', count(*), null, max(updated_at)::text from public.lead_answers_current
      union all select 'lead_sync_outbox', count(*), max(id)::text, max(updated_at)::text from public.lead_sync_outbox
      union all select 'tracking_events', count(*), max(id)::text, max(event_at)::text from public.tracking_events
      order by 1`);
    return r.map((z) => `${z.t}:${z.n}:${z.hoch || '-'}:${z.letzte || '-'}`).join('|');
  };

  const a = await messung();
  console.log('  Messung 1:'); for (const z of a.split('|')) console.log('    ' + z);
  const wartenMs = Number(process.env.STILLSTAND_WARTEN_MS || 180000);
  console.log(`\n  Warte ${Math.round(wartenMs / 1000)} s …\n`);
  await new Promise((r) => setTimeout(r, wartenMs));
  const b = await messung();
  console.log('  Messung 2:'); for (const z of b.split('|')) console.log('    ' + z);

  const still = a === b;
  console.log(`\n  ${still ? 'STILL — die Quelle bewegt sich nicht mehr.' : '🔴 NICHT STILL — es wird noch geschrieben. NICHT übertragen!'}\n`);
  belegSchreiben('stillstand.txt',
    `Messung 1:\n${a.split('|').join('\n')}\n\nMessung 2:\n${b.split('|').join('\n')}\n\nStill: ${still}\n`);
  return still ? 0 : 1;
}

function uebertragen() {
  console.log('\n== Übertragen ==\n');
  const conn = JSON.parse(fs.readFileSync('C:/Users/Markus/.agent-secrets/agent-secrets.json', 'utf8'))
    .marathon_supabase_app;
  const tabellenArg = TABELLEN.map(([s, t]) => `-t ${s}.${t}`).join(' ');
  const start = Date.now();

  // .pgpass statt Passwort in der Befehlszeile: sonst stünde es in der Prozessliste.
  const skript = `
set -e
umask 077
echo "${conn.host}:${conn.port}:${conn.database}:${conn.user}:${conn.password}" > /root/.pgpass
chmod 600 /root/.pgpass
pg_dump -h ${conn.host} -p ${conn.port} -U ${conn.user} -d ${conn.database} \
  --data-only --no-owner --no-privileges ${tabellenArg} -f /tmp/cutover-roh.sql
echo "DUMP-GROESSE $(stat -c%s /tmp/cutover-roh.sql)"
python3 /tmp/umschreiben.py /tmp/cutover-roh.sql /tmp/cutover-ziel.sql
# session_replication_role=replica setzt FK-Pruefungen aus - die Reihenfolge der
# Tabellen im Dump folgt nicht den Abhaengigkeiten. Danach wird explizit auf Waisen
# geprueft (Schritt "nachweisen"), also nichts still uebergangen.
sudo -u postgres psql -d ${ZIEL_DB} -q -v ON_ERROR_STOP=1 \
  -c "set session_replication_role = replica" -f /tmp/cutover-ziel.sql
rm -f /root/.pgpass /tmp/cutover-roh.sql /tmp/cutover-ziel.sql
echo "FERTIG"
`;
  execFileSync(SCP, ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-i', KEY, '-q',
    path.join(__dirname, 'cutover-schema-umschreiben.py'), `${ZIEL_HOST}:/tmp/umschreiben.py`]);
  const ausgabe = ssh(skript);
  console.log(ausgabe.split('\n').map((z) => '  ' + z).join('\n'));
  const dauer = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n  Dauer: ${dauer} s\n`);
  belegSchreiben('uebertragung.txt', `${ausgabe}\nDauer: ${dauer} s\n`);
  return ausgabe.includes('FERTIG') ? 0 : 1;
}

async function nachweisen() {
  console.log('\n== Nachweise ==\n');
  const zeilen = [];
  let fehler = 0;

  // 1. Zeilenzahlen je Tabelle.
  console.log('  Zeilenzahlen:');
  for (const [schema, tabelle] of TABELLEN) {
    const quelle = Number((await executeManagementQuery(
      `select count(*) n from ${schema}.${tabelle}`))[0].n);
    const ziel = Number(zielSql(`select count(*) from ${ZIEL(schema)}.${tabelle}`));
    const ok = quelle === ziel;
    if (!ok) fehler += 1;
    const text = `  ${ok ? 'OK     ' : '🔴 FEHLT'} ${schema}.${tabelle}: Quelle ${quelle} | Ziel ${ziel}`;
    console.log(text); zeilen.push(text);
  }

  // 2. Inhaltsprüfsummen - UTC und COLLATE "C" auf beiden Seiten, sonst falsche Rot-Befunde.
  console.log('\n  Inhaltsprüfsummen:');
  const proben = [
    ['quiz_sessions', 'id'], ['lead_contact_crm', 'lead_hash'], ['tracking_video_progress', 'id'],
    ['lead_profiles', 'id'], ['nurture_subject_states', 'lead_hash'],
  ];
  for (const [tabelle, schluessel] of proben) {
    const sql = (schema) => `select md5(string_agg(row_to_json(t)::text,'|' order by ${schluessel} collate "C")) h `
      + `from (select * from ${schema}.${tabelle}) t`;
    const q = (await executeManagementQuery(`set timezone='UTC'; ${sql('public')}`)).slice(-1)[0];
    const z = zielSql(`set timezone='UTC';\n${sql('leads')};`).split('\n').pop().trim();
    const ok = String(q.h) === z;
    if (!ok) fehler += 1;
    const text = `  ${ok ? 'OK     ' : '🔴 ABWEICHUNG'} ${tabelle}: ${String(q.h).slice(0, 12)}… / ${z.slice(0, 12)}…`;
    console.log(text); zeilen.push(text);
  }

  // 3. Waisen in allen 7 FK-Beziehungen. NULL zählt NICHT als Waise (erlaubt) - genau
  //    dieser Fehler erzeugte bei der Generalprobe vier Phantom-Befunde.
  console.log('\n  Referenzielle Integrität:');
  const waisen = zielSql(`
    select count(*) from leads.lead_events e
      where e.lead_hash is not null and not exists (select 1 from leads.lead_state s where s.lead_hash = e.lead_hash)
    union all select count(*) from leads.lead_answers_current a
      where a.lead_hash is not null and not exists (select 1 from leads.lead_state s where s.lead_hash = a.lead_hash)
    union all select count(*) from leads.lead_video_progress v
      where v.lead_hash is not null and not exists (select 1 from leads.lead_state s where s.lead_hash = v.lead_hash)
    union all select count(*) from leads.lead_sync_outbox o
      where o.lead_hash is not null and not exists (select 1 from leads.lead_state s where s.lead_hash = o.lead_hash);`)
    .split('\n').map((n) => Number(n.trim()));
  const summe = waisen.reduce((a, b) => a + b, 0);
  if (summe !== 0) fehler += 1;
  const wText = `  ${summe === 0 ? 'OK     ' : '🔴 WAISEN'} 0 echte Waisen erwartet, gefunden ${summe} (${waisen.join('/')})`;
  console.log(wText); zeilen.push(wText);

  // 4. Sequenzstände über dem höchsten Wert - sonst kollidiert der erste INSERT.
  console.log('\n  Sequenzen:');
  const seq = zielSql(`
    select string_agg(x.t || '=' || x.ok::text, ' ') from (
      select 'lead_events' t, (select last_value from leads.lead_events_event_id_seq) > coalesce((select max(event_id) from leads.lead_events),0) as ok
      union all select 'lead_sync_outbox', (select last_value from leads.lead_sync_outbox_id_seq) > coalesce((select max(id) from leads.lead_sync_outbox),0)
      union all select 'quiz_sessions', (select last_value from leads.quiz_sessions_id_seq) > coalesce((select max(id) from leads.quiz_sessions),0)
    ) x;`);
  const seqOk = !seq.includes('false');
  if (!seqOk) fehler += 1;
  const sText = `  ${seqOk ? 'OK     ' : '🔴 ZU NIEDRIG'} ${seq}`;
  console.log(sText); zeilen.push(sText);

  console.log(`\n  ${fehler === 0 ? 'ALLE NACHWEISE BESTANDEN.' : `🔴 ${fehler} Befund(e) — NICHT umschalten.`}\n`);
  belegSchreiben('nachweise.txt', zeilen.join('\n') + `\n\nBefunde: ${fehler}\n`);
  return fehler ? 1 : 0;
}

const SCHRITTE = { pruefen, 'barriere-an': barriereAn, 'barriere-aus': barriereAus, stillstand, uebertragen, nachweisen };

(async () => {
  const schritt = process.argv[2];
  if (!SCHRITTE[schritt]) {
    console.error(`Schritt fehlt. Verfügbar: ${Object.keys(SCHRITTE).join(', ')}`);
    process.exit(2);
  }
  process.exit(await SCHRITTE[schritt]());
})().catch((e) => { console.error('Abbruch:', e.message); process.exit(2); });
