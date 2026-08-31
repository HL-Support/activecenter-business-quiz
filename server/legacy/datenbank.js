'use strict';

/**
 * server/legacy/ ist der EINZIGE Ort im Repo, der mit dem Altsystem spricht
 * (MySQL `prod_activesupport` ueber die Lese-View `prod_quiz.quiz_berater`).
 * Wird das Altsystem eines Tages ersetzt, aendert sich ausschliesslich dieser Ordner.
 * `scripts/lint-grenze.js` erzwingt die Grenze und laeuft in `pnpm run lint` mit.
 *
 * 🔴 Warum direkt und nicht mehr ueber `db-bridge.php`:
 * Den Umweg ueber die Bridge gab es nur, weil Vercel keinen Zugang zum privaten Netz
 * hatte. Auf der Coolify-Box liegt die Datenbank unter 10.0.1.3 im selben Netz.
 * Die Bridge selbst bleibt in Betrieb — sie bedient weitere Projekte.
 *
 * 🔴 Warum der Ordner unter `server/` liegt und nicht im Wurzelverzeichnis:
 * Das Dockerfile kopiert selektiv (`api/`, `server/`, `dist/`). Ein Wurzel-`legacy/`
 * waere im Container schlicht nicht vorhanden — der Fehler faellt erst in Produktion auf.
 *
 * Rechte des Benutzers: ausschliesslich SELECT auf die eine View. Kein Zugriff auf
 * `prod_activesupport.users` — dort liegen Passwort-Hashes und Bankdaten. Die View
 * laeuft SQL SECURITY DEFINER. Definition: `sql/legacy-views.sql`.
 */

const KONFIG_SCHLUESSEL = [
  'LEGACY_MYSQL_HOST',
  'LEGACY_MYSQL_PORT',
  'LEGACY_MYSQL_USER',
  'LEGACY_MYSQL_PASSWORD',
];

/**
 * Ohne vollstaendige Konfiguration ist das Modul inert: kein Pool, keine Verbindung.
 * Ein Deploy ohne diese Variablen verhaelt sich exakt wie vorher — und die Tests
 * brauchen keine erreichbare Legacy-Datenbank.
 */
function konfiguriert(env = process.env) {
  return KONFIG_SCHLUESSEL.every((k) => String(env[k] || '').trim() !== '');
}

let pool = null;
let poolQuelle = null;

function zugang(env = process.env) {
  if (!konfiguriert(env)) return null;
  return {
    host: String(env.LEGACY_MYSQL_HOST).trim(),
    port: Number(env.LEGACY_MYSQL_PORT) || 3306,
    user: String(env.LEGACY_MYSQL_USER).trim(),
    password: String(env.LEGACY_MYSQL_PASSWORD),
  };
}

/**
 * Bewusst OHNE Standard-Schema: die Abfragen nennen `prod_quiz.quiz_berater`
 * vollqualifiziert. Im Code ist damit sichtbar, welches Schema gemeint ist.
 */
function holePool(env = process.env) {
  const z = zugang(env);
  if (!z) return null;
  const kennung = `${z.host}:${z.port}:${z.user}`;
  if (pool && poolQuelle === kennung) return pool;
  if (pool) {
    const alt = pool;
    pool = null;
    Promise.resolve(alt.end()).catch(() => {});
  }
  // Absichtlich hier und nicht oben: ohne Konfiguration wird der Treiber nie geladen —
  // ein Deploy ohne die LEGACY_MYSQL_-Variablen zieht mysql2 gar nicht erst in den Speicher.
  const mysql = require('mysql2/promise');
  pool = mysql.createPool({
    host: z.host,
    port: z.port,
    user: z.user,
    password: z.password,
    waitForConnections: true,
    connectionLimit: 5,
    maxIdle: 2,
    idleTimeout: 60_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    connectTimeout: 8000,
    timezone: 'Z',
    charset: 'utf8mb4_general_ci',
    dateStrings: true,
  });
  poolQuelle = kennung;
  return pool;
}

/**
 * `query()` statt `execute()` — wie bei beiden Vorbildern. Es gibt wenige, feste
 * Abfrageformen; `execute()` legt zusaetzlich Prepared Statements je Verbindung an.
 */
async function abfragen(sql, parameter = [], env = process.env) {
  const p = holePool(env);
  if (!p) throw new Error('legacy_mysql_not_configured');
  const [zeilen] = await p.query(sql, parameter);
  return Array.isArray(zeilen) ? zeilen : [];
}

/**
 * Probe fuer den Diagnose-Endpunkt. Meldet, statt zu werfen — und bringt eine eigene
 * Frist mit, damit eine haengende Verbindung die Ueberwachung nicht mitreisst.
 *
 * 🔴 Gehoert NICHT in /health/ready: der ist fail-closed. Ein MySQL-Ausfall wuerde den
 * Container aus der Rotation nehmen und damit den ganzen Funnel abschalten, obwohl der
 * Aufloeser einen Rueckfall hat. MySQL ist Diagnose, nie Bereitschaft.
 */
async function probe(env = process.env) {
  if (!konfiguriert(env)) return { ok: false, grund: 'nicht_konfiguriert' };
  const start = Date.now();
  try {
    const zeilen = await Promise.race([
      abfragen('SELECT 1 AS eins', [], env),
      new Promise((_, ab) => setTimeout(() => ab(new Error('probe_timeout')), 5000)),
    ]);
    return { ok: zeilen.length === 1, dauer_ms: Date.now() - start };
  } catch (fehler) {
    return { ok: false, grund: fehler.message, dauer_ms: Date.now() - start };
  }
}

async function schliessen() {
  if (!pool) return;
  const alt = pool;
  pool = null;
  poolQuelle = null;
  await alt.end();
}

module.exports = { konfiguriert, abfragen, probe, schliessen, KONFIG_SCHLUESSEL };
