/**
 * Abgleich des Videorangs zwischen PostgreSQL und der MySQL-Kontaktkartei.
 *
 * WARUM ES DIESES WERKZEUG GIBT
 * -----------------------------
 * Der Videorang ist das EINZIGE Feld, das beide Systeme schreiben. PostgreSQL fuehrt ihn
 * aus dem gemessenen Videofortschritt (`v_lead_state_full.completed_rank`); von dort geht
 * er ueber die Outbox und den n8n-Workflow "Update Result by hash" als Text nach
 * `typeform_surveys.points_result`. Alles andere ist Einbahnstrasse.
 *
 * Genau dieser Kanal kann LAUTLOS brechen: Am 20.08.2026 hat eine Kollations-Migration der
 * fremden Laravel-Anwendung die n8n-Abfrage zerstoert, und n8n antwortete trotzdem mit
 * HTTP 200 (die Ausfuehrung starb vor dem Respond-Node). Der Funnel lief weiter richtig,
 * das CRM zeigte veraltete Raenge - und niemand hat es gemerkt.
 *
 * Am 25.08.2026 fand der erste vollstaendige Abgleich 10 Abweichungen, ALLE in dieselbe
 * Richtung: Das CRM zeigte zu wenig. Fuenf davon hatten alle drei Videos gesehen. Ursache
 * war kein Versandfehler, sondern ein nie erzeugter Auftrag - Altlast der v1/v2-Migration
 * vom April/Mai (dort wurde Fortschritt nachgetragen, ohne den Sync auszuloesen).
 *
 * Dieses Werkzeug macht daraus eine wiederholbare Messung statt einer einmaligen Aktion.
 *
 * REIN LESEND. Beide Seiten werden nur abgefragt:
 *   - PostgreSQL ueber die Supabase-Management-API mit `read_only: true`
 *   - MySQL ueber SSH und den mysql-Client, ausschliesslich SELECT
 *
 *   node scripts/abgleich-videorang.js              # Bericht, Exitcode 1 bei Abweichung
 *   node scripts/abgleich-videorang.js --json datei # zusaetzlich als JSON
 *   node scripts/abgleich-videorang.js --still      # nur Exitcode, fuer Cron
 *
 * Exitcode 0 = deckungsgleich · 1 = Abweichung gefunden · 2 = Messung nicht durchfuehrbar.
 */
const fs = require('fs');
const { execFileSync } = require('child_process');
const { executeManagementQuery } = require('./stats-logs-baseline.js');

const SSH = process.env.SSH_BIN || 'C:/Windows/System32/OpenSSH/ssh.exe';
const DB_HOST = process.env.MYSQL_SSH_HOST || 'root@91.99.76.104';
const DB_KEY = process.env.MYSQL_SSH_KEY || 'C:/Users/Markus/.ssh/id_rsa';
const DB_SCHEMA = process.env.MYSQL_SCHEMA || 'prod_contacts_activesupport';

// 🔴 Der Rang steht in MySQL als uebersetzter FLIESSTEXT, nicht als Zahl - in sieben
// Sprachen und mehreren Schreibvarianten. Die Zuordnung ist deshalb der fehleranfaellige
// Teil dieses Werkzeugs, nicht der Vergleich.
//
// Reihenfolge ist bedeutsam: "3/3" und "Alle 3" muessen VOR der 1/3-Regel greifen, sonst
// findet `1/3` in "Alle 3 Infovideos" faelschlich den Teilstring nicht - aber "Video
// informativo 1" wuerde sonst als 0 durchgehen. Beim ersten Entwurf blieben 15 Zeilen
// undeutbar; wer hier etwas ergaenzt, prueft die Vollstaendigkeit mit --json und der
// Zeile "nicht_deutbar".
const RANG_MUSTER = [
  // Rang 4 = die Person hat nach den Videos die Interessensfrage beantwortet
  // („Ja interessiert" / „Aktuell nicht interessant"). Muss VOR der Alle-3-Regel stehen,
  // weil diese Texte mit „Alle 3 Videos angeschaut:" beginnen. Beim Vergleich mit
  // PostgreSQL zaehlt Rang 4 wie 3 - PG kennt nur den Videofortschritt.
  [/interessiert|interested|interessato|interessante|angeschaut:|watched:|guardati:/i, 4],
  [/alle 3|mind a 3|tutti e 3|all 3|3\/3|todos los 3|toutes les 3|les 3 /i, 3],
  [/(^|\s)2\/3/i, 2],
  [/(^|\s)1\/3|video informativo 1 |infovideo 1 |1 informationsvideo/i, 1],
  [/noch kein|nessun|ни одно|aucune|no info video|no information|kein video|még nincs/i, 0],
];

function rangAusText(text) {
  if (text === null || text === undefined || text === '' || text === 'NULL') return null;
  for (const [muster, wert] of RANG_MUSTER) if (muster.test(text)) return wert;
  return undefined; // nicht deutbar - wird gemeldet, nie stillschweigend als 0 gewertet
}

function mysqlLesen() {
  // Seit dem 26.08. fuehrt MySQL BEIDE Formen: points_rank (Zahl, fuer Maschinen) und
  // points_result (uebersetzter Fliesstext, fuer Menschen im CRM). Der n8n-Workflow
  // schreibt beide im selben UPDATE. Die Zahl ist die Primaerquelle dieses Abgleichs;
  // der Text wird weiterhin gedeutet, um Drift ZWISCHEN den beiden Spalten zu erkennen -
  // laufen sie auseinander, schreibt jemand nur noch eine von beiden.
  const sql = `select hash, ifnull(points_rank,'NULL'), ifnull(points_result,'NULL')
               from typeform_surveys
               where hash like 'qz\\_%' and deleted_at is null;`;
  const out = execFileSync(
    SSH,
    ['-o', 'StrictHostKeyChecking=no', '-i', DB_KEY, DB_HOST,
     `mysql --defaults-file=/home/forge/.my.cnf -N -B ${DB_SCHEMA} -e "${sql.replace(/"/g, '\\"').replace(/\s+/g, ' ')}"`],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 120000 }
  );
  const map = new Map();
  for (const zeile of out.split('\n')) {
    if (!zeile.trim()) continue;
    const [hash, rangRoh, ...rest] = zeile.split('\t');
    map.set(hash, {
      rang: rangRoh === 'NULL' ? null : Number(rangRoh),
      text: rest.join('\t'),
    });
  }
  return map;
}

async function postgresLesen() {
  const rows = await executeManagementQuery(
    `select lead_hash, completed_rank from public.v_lead_state_full where lead_hash like 'qz\\_%'`
  );
  const map = new Map();
  for (const r of rows || []) map.set(r.lead_hash, r.completed_rank === null ? null : Number(r.completed_rank));
  return map;
}

// 🔴 Bekannte, gepruefte Ausnahmen. Ohne diese Liste waere die Pruefung dauerhaft rot -
// und eine dauerhaft rote Pruefung erzieht zum Wegsehen, sodass beim echten Fund niemand
// hinschaut. Dieselbe Bauart wie die Baseline des Coolify-Domain-Sweeps.
function baselineLaden() {
  const p = require('path').join(__dirname, 'abgleich-videorang-baseline.json');
  if (!fs.existsSync(p)) return { abweichend: {}, fehlt_in_postgres: {} };
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  return { abweichend: j.abweichend || {}, fehlt_in_postgres: j.fehlt_in_postgres || {} };
}

async function abgleichen() {
  const [mysql, pg] = await Promise.all([Promise.resolve(mysqlLesen()), postgresLesen()]);
  const bekannt = baselineLaden();

  const gleich = [];
  const gleichwertig = []; // MySQL nie beschrieben, PostgreSQL sagt 0 - inhaltlich dasselbe
  const abweichend = [];
  const fehltInPg = [];
  const nichtDeutbar = [];
  const inBaseline = [];

  const spaltenDrift = [];

  for (const [hash, zeile] of mysql) {
    const ausText = rangAusText(zeile.text);
    // Primaerquelle ist die Zahl; der gedeutete Text bleibt als Zweitmessung. Rang 4
    // („interessiert/nicht interessiert beantwortet") existiert nur in MySQL - fuer den
    // Vergleich mit PostgreSQL zaehlt er wie 3 (alle Videos gesehen).
    const mv = zeile.rang !== null ? zeile.rang : ausText;
    if (mv === undefined) {
      nichtDeutbar.push({ hash, text: zeile.text });
      continue;
    }
    // Drift ZWISCHEN den MySQL-Spalten: Zahl und Text muessen dieselbe Aussage tragen.
    // Laufen sie auseinander, schreibt ein Pfad nur noch eine der beiden Formen.
    if (zeile.rang !== null && ausText !== undefined && ausText !== null && zeile.rang !== ausText) {
      spaltenDrift.push({ hash, zahl: zeile.rang, text_gedeutet: ausText, text: zeile.text });
    }
    if (!pg.has(hash)) {
      if (bekannt.fehlt_in_postgres[hash]) inBaseline.push({ hash, art: 'fehlt_in_postgres' });
      else fehltInPg.push(hash);
      continue;
    }
    const pv = pg.get(hash);
    const mvVergleich = mv === 4 ? 3 : mv;
    if (pv === mvVergleich) gleich.push(hash);
    else if (mvVergleich === null && pv === 0) gleichwertig.push(hash);
    else if (bekannt.abweichend[hash]) inBaseline.push({ hash, art: 'abweichend', postgres: pv, mysql: mvVergleich });
    else abweichend.push({ hash, postgres: pv, mysql: mvVergleich, mysql_text: zeile.text });
  }

  // Eine Baseline, die auf behobene Faelle zeigt, verrottet still. Deshalb melden, was
  // eingetragen ist, aber gar nicht mehr auffaellt - das ist der Hinweis zum Aufraeumen.
  const gefundeneHashes = new Set([...abweichend.map((a) => a.hash), ...fehltInPg, ...inBaseline.map((b) => b.hash)]);
  const baselineVeraltet = [...Object.keys(bekannt.abweichend), ...Object.keys(bekannt.fehlt_in_postgres)].filter(
    (h) => !gefundeneHashes.has(h)
  );

  return {
    verglichen: mysql.size,
    gleich,
    gleichwertig,
    abweichend,
    fehltInPg,
    nichtDeutbar,
    inBaseline,
    baselineVeraltet,
    spaltenDrift,
  };
}

(async () => {
  const still = process.argv.includes('--still');
  const jsonIndex = process.argv.indexOf('--json');
  const e = await abgleichen();

  if (jsonIndex >= 0 && process.argv[jsonIndex + 1]) {
    fs.writeFileSync(
      process.argv[jsonIndex + 1],
      JSON.stringify({ gemessen_am: new Date().toISOString(), ...e }, null, 2)
    );
  }

  if (!still) {
    const q = (n) => `${((n / e.verglichen) * 100).toFixed(2)} %`;
    console.log('');
    console.log('Abgleich Videorang  PostgreSQL <-> MySQL-Kontaktkartei');
    console.log('');
    console.log(`  Verglichen                      : ${e.verglichen}`);
    console.log(`  Deckungsgleich                  : ${e.gleich.length} (${q(e.gleich.length)})`);
    console.log(`  MySQL leer / PostgreSQL 0       : ${e.gleichwertig.length}  (inhaltlich gleich)`);
    console.log(`  ABWEICHEND (neu)                : ${e.abweichend.length}`);
    console.log(`  In PostgreSQL nicht vorhanden   : ${e.fehltInPg.length}`);
    console.log(`  Rangtext nicht deutbar          : ${e.nichtDeutbar.length}`);
    console.log(`  Bekannt und akzeptiert          : ${e.inBaseline.length}  (siehe Baseline-Datei)`);
    console.log(`  Drift Zahl/Text in MySQL        : ${e.spaltenDrift.length}`);
    if (e.spaltenDrift.length) {
      console.log('');
      console.log('  🔴 points_rank und points_result tragen verschiedene Aussagen —');
      console.log('     ein Schreibpfad aktualisiert nur noch eine der beiden Spalten:');
      for (const s of e.spaltenDrift.slice(0, 6)) {
        console.log(`     ${s.hash}  Zahl=${s.zahl}  Text→${s.text_gedeutet} (${String(s.text).slice(0, 40)})`);
      }
    }
    if (e.baselineVeraltet.length) {
      console.log('');
      console.log('  ⚠️  Baseline-Eintraege ohne Befund - vermutlich behoben, bitte austragen:');
      for (const h of e.baselineVeraltet) console.log(`     ${h}`);
    }
    if (e.nichtDeutbar.length) {
      console.log('');
      console.log('  🔴 Nicht deutbare Rangtexte - die Zuordnung oben ergaenzen:');
      for (const n of [...new Set(e.nichtDeutbar.map((x) => x.text))].slice(0, 10)) {
        console.log(`     ${n}`);
      }
    }
    if (e.abweichend.length) {
      const zuWenig = e.abweichend.filter((x) => x.postgres > (x.mysql ?? -1)).length;
      console.log('');
      console.log(`  Davon zeigt das CRM zu wenig    : ${zuWenig} von ${e.abweichend.length}`);
      console.log(`  Davon sahen alle drei Videos    : ${e.abweichend.filter((x) => x.postgres === 3).length}`);
      console.log('');
      for (const a of e.abweichend) {
        console.log(`     ${a.hash}  PostgreSQL=${a.postgres}  MySQL=${a.mysql === null ? 'leer' : a.mysql}`);
      }
      console.log('');
      console.log('  Nachziehen ueber den NORMALEN Weg, nicht per Direktschreibung:');
      console.log('  enqueue_lead_sync(p_lead_hash, \'mysql_rank_update\', {rank, lang, reason}).');
      console.log('  Der n8n-Workflow hebt den Rang nur an, senkt ihn nie, und ueberschreibt');
      console.log('  keine bereits gegebene Interessentenantwort.');
    }
    console.log('');
  }

  process.exit(e.abweichend.length || e.nichtDeutbar.length ? 1 : 0);
})().catch((err) => {
  process.stderr.write(`Abgleich nicht durchfuehrbar: ${err.message}\n`);
  process.exit(2);
});
