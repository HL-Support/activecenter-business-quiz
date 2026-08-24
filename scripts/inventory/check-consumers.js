#!/usr/bin/env node
'use strict';

/**
 * Migrations-Gate: gleicht `supabase-consumers.json` gegen einen frischen ripgrep-Scan
 * des Workspaces ab.
 *
 * Warum das Skript existiert (Audit 2026-08-23, Kapitel 8 Phase 6/7 und 12 Punkt 3):
 * Supabase darf erst abgeschaltet werden, wenn ALLE Verbraucher inventarisiert, umgestellt
 * und nachgemessen sind. Eine Prosaliste veraltet still. Dieses Skript macht daraus einen
 * pruefbaren Zustand: Taucht im Workspace ein Supabase-Zugriff in einer Datei auf, die kein
 * inventarisierter Verbraucher beansprucht, faellt das Gate mit Exit 1 aus.
 *
 * Es ist bewusst rein lesend: kein Netzzugriff, keine Datenbankverbindung, keine Secrets.
 *
 * Aufruf:
 *   node scripts/inventory/check-consumers.js
 *   node scripts/inventory/check-consumers.js --root <pfad>   # anderer Workspace-Root
 *   node scripts/inventory/check-consumers.js --json          # maschinenlesbarer Bericht
 *
 * Exit-Codes:
 *   0  Inventar deckt den Scan ab (verwaiste Eintraege sind nur Warnungen).
 *   1  Mindestens ein nicht inventarisierter Supabase-Verbraucher gefunden.
 *   2  Aufruf-/Umgebungsfehler (fehlendes Inventar, ripgrep nicht verfuegbar).
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const INVENTORY_PATH = path.join(__dirname, 'supabase-consumers.json');

function fail(message) {
  console.error(`FEHLER: ${message}`);
  process.exit(2);
}

function parseArgs(argv) {
  const args = { root: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--root') {
      args.root = argv[i + 1];
      i += 1;
      if (!args.root) fail('--root braucht einen Pfad');
    } else if (arg === '--help' || arg === '-h') {
      console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]);
      process.exit(0);
    } else {
      fail(`Unbekanntes Argument: ${arg}`);
    }
  }
  return args;
}

function toPosix(value) {
  return String(value).replace(/\\/g, '/');
}

/**
 * Minimaler Glob-Matcher fuer die Muster im Inventar.
 * Unterstuetzt `**` (beliebig viele Segmente), `*` (innerhalb eines Segments) und `?`.
 * Bewusst ohne Fremdabhaengigkeit, damit das Gate auch in einem nackten CI-Schritt laeuft.
 */
function globToRegExp(pattern) {
  const chars = toPosix(pattern);
  let out = '';
  for (let i = 0; i < chars.length; i += 1) {
    const char = chars[i];
    if (char === '*' && chars[i + 1] === '*') {
      // Beide Sterne verbrauchen. Genau hier lag ein Fehler in der ersten Fassung: Blieb der
      // zweite Stern stehen, wurde `**/x/**` zu `.*[^/]*/x/...` — vor `x` war damit zwingend
      // ein `/` verlangt, und ein Verzeichnis auf oberster Ebene konnte nie greifen.
      // Wurzelnahe Ausschluesse liefen dadurch stillschweigend ins Leere.
      i += 1;
      if (chars[i + 1] === '/') {
        // `**/` heisst: beliebig viele Segmente ODER gar keines.
        out += '(?:.*/)?';
        i += 1;
      } else {
        out += '.*';
      }
      continue;
    }
    if (char === '*') out += '[^/]*';
    else if (char === '?') out += '[^/]';
    else if ('\\^$.|+()[]{}'.includes(char)) out += `\\${char}`;
    else out += char;
  }
  return new RegExp(`^${out}$`);
}

/**
 * Signalmuster. Bewusst breiter als der reine Projektname: Ein neuer Verbraucher, der die
 * URL erst zur Laufzeit aus einer Variable zieht, soll trotzdem auffallen.
 */
const SIGNAL_PATTERN = [
  'xlpiisbozpgmemxhtivj',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_PROJECT_REF',
  'supabase\\.co',
  'api\\.supabase\\.com',
  '/rest/v1',
  '@supabase/supabase-js',
].join('|');

/**
 * Verzeichnisse ohne eigenen Aussagewert: Fremdcode, Buildartefakte, Sicherungen,
 * Agenten-/Editorkonfiguration.
 *
 * `vendor/**` ist ausdruecklich dabei: Der Google-API-PHP-Client in
 * `customers-activecenter/vendor/` enthaelt hunderte Treffer auf `/rest/v1`, die nichts mit
 * Supabase zu tun haben. Ohne diesen Ausschluss ertraenkt der Fremdcode jeden echten Befund.
 */
const EXCLUDE_GLOBS = [
  '!**/node_modules/**',
  '!**/vendor/**',
  '!**/dist/**',
  '!**/build/**',
  '!**/.next/**',
  '!**/.git/**',
  '!**/.vercel/**',
  '!**/.turbo/**',
  '!**/.cache/**',
  '!**/.agent/**',
  '!**/.claude/**',
  '!**/.generated-build-cache/**',
  '!**/coverage/**',
  '!**/_runtime-backups/**',
  '!**/backups/**',
  '!**/test-results/**',
  '!**/e2e-artifacts/**',
  '!**/*.min.js',
  '!**/*.map',
  '!**/*.tsbuildinfo',
  '!**/pnpm-lock.yaml',
  '!**/package-lock.json',
];

function runRipgrep(root) {
  // `--no-ignore-vcs` und `--hidden` sind nicht optional: ripgrep respektiert sonst
  // `.gitignore` und uebersieht damit ausgerechnet `.env.local`/`.env.prod` — also die
  // Dateien, in denen die Servicezugaenge tatsaechlich stehen. Ohne diese Flags meldet das
  // Gate faelschlich "sauber", waehrend der Schluessel weiter im Workspace liegt.
  const args = [
    '--files-with-matches',
    '--no-messages',
    '--no-ignore-vcs',
    '--hidden',
    '-i',
    '-e',
    SIGNAL_PATTERN,
  ];
  for (const glob of EXCLUDE_GLOBS) args.push('--glob', glob);
  args.push('.');

  const result = spawnSync('rg', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.error) return null; // ripgrep nicht vorhanden -> Aufrufer nimmt den Node-Scanner
  // rg: 0 = Treffer, 1 = keine Treffer, >1 = echter Fehler.
  if (result.status !== 0 && result.status !== 1) {
    fail(`ripgrep endete mit Status ${result.status}: ${(result.stderr || '').trim()}`);
  }
  return String(result.stdout || '')
    .split(/\r?\n/)
    .map((line) => toPosix(line).replace(/^\.\//, '').trim())
    .filter(Boolean)
    .sort();
}

/**
 * Ersatzscanner ohne Fremdwerkzeug.
 *
 * Warum es ihn gibt: Auf der Arbeitsstation steht `rg` nur als Shell-Funktion zur Verfuegung,
 * nicht als Binary — ein Gate, das ausgerechnet dort nicht laeuft, wo der vollstaendige
 * Workspace liegt, waere wertlos. Beide Wege wurden am 24.08.2026 gegeneinander gemessen und
 * lieferten dieselbe Dateimenge.
 */
function runNodeScan(root) {
  const regexp = new RegExp(SIGNAL_PATTERN, 'i');
  // Ausschluesse aus EXCLUDE_GLOBS ableiten, damit beide Wege dieselbe Menge sehen.
  const excluded = EXCLUDE_GLOBS.map((glob) => globToRegExp(glob.replace(/^!/, '')));
  const MAX_BYTES = 8 * 1024 * 1024;
  const hits = [];

  function walk(absoluteDir, relativeDir) {
    let entries;
    try {
      entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
    } catch {
      return; // unlesbare Verzeichnisse still ueberspringen, wie ripgrep --no-messages
    }
    for (const entry of entries) {
      const relative = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(absoluteDir, entry.name);
      if (entry.isDirectory()) {
        // Verzeichnisse muessen beschnitten werden, nicht erst ihre Dateien: Ein Muster wie
        // `**/node_modules/**` trifft `.../node_modules/x.js`, aber nicht `.../node_modules`
        // selbst. Ohne die Sondenpruefung liefe der Scanner in genau die Baeume hinein,
        // die er ueberspringen soll.
        const probe = `${relative}/__probe__`;
        if (excluded.some((pattern) => pattern.test(relative) || pattern.test(probe))) continue;
        walk(absolute, relative);
        continue;
      }
      if (excluded.some((pattern) => pattern.test(relative))) continue;
      if (!entry.isFile()) continue;
      let stat;
      try {
        stat = fs.statSync(absolute);
      } catch {
        continue;
      }
      if (stat.size > MAX_BYTES) continue;
      let content;
      try {
        content = fs.readFileSync(absolute);
      } catch {
        continue;
      }
      if (content.includes(0)) continue; // Binaerdateien, wie ripgrep sie ueberspringt
      if (regexp.test(content.toString('utf8'))) hits.push(relative);
    }
  }

  walk(root, '');
  return hits.sort();
}

function scanWorkspace(root) {
  const viaRipgrep = runRipgrep(root);
  if (viaRipgrep) return { files: viaRipgrep, scanner: 'ripgrep' };
  return { files: runNodeScan(root), scanner: 'node-fallback' };
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(INVENTORY_PATH)) fail(`Inventar fehlt: ${INVENTORY_PATH}`);

  let inventory;
  try {
    inventory = JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8'));
  } catch (error) {
    fail(`Inventar ist kein gueltiges JSON: ${error.message}`);
  }

  const repoRoot = path.resolve(__dirname, '..', '..');
  const configuredRoot = inventory.workspace_root_relative_to_repo || '..';
  const root = path.resolve(args.root ? args.root : path.join(repoRoot, configuredRoot));
  if (!fs.existsSync(root)) fail(`Workspace-Root existiert nicht: ${root}`);

  const consumers = Array.isArray(inventory.consumers) ? inventory.consumers : [];
  if (!consumers.length) fail('Inventar enthaelt keine consumers[].');

  const REQUIRED_FIELDS = ['id', 'kind', 'evidence', 'objects', 'access', 'writes'];
  const schemaProblems = [];
  const seenIds = new Set();
  for (const consumer of consumers) {
    const id = consumer && consumer.id ? String(consumer.id) : '<ohne id>';
    for (const field of REQUIRED_FIELDS) {
      if (!(field in (consumer || {}))) schemaProblems.push(`${id}: Feld "${field}" fehlt`);
    }
    if (consumer && typeof consumer.writes !== 'boolean') {
      schemaProblems.push(`${id}: "writes" muss ein Boolean sein`);
    }
    if (seenIds.has(id)) schemaProblems.push(`${id}: doppelte id`);
    seenIds.add(id);
  }
  if (schemaProblems.length) {
    console.error('Inventar verletzt das Schema:');
    for (const problem of schemaProblems) console.error(`  - ${problem}`);
    process.exit(2);
  }

  // Muster, die ein Verbraucher fuer sich beansprucht.
  const claims = [];
  for (const consumer of consumers) {
    for (const pattern of consumer.paths || []) {
      claims.push({ id: consumer.id, pattern, regexp: globToRegExp(pattern), hits: 0 });
    }
  }
  const ignores = (inventory.ignore_paths || []).map((pattern) => ({
    pattern,
    regexp: globToRegExp(pattern),
    hits: 0,
  }));

  const { files, scanner } = scanWorkspace(root);
  const uncovered = [];

  for (const file of files) {
    const ignore = ignores.find((entry) => entry.regexp.test(file));
    if (ignore) {
      ignore.hits += 1;
      continue;
    }
    const claim = claims.find((entry) => entry.regexp.test(file));
    if (claim) {
      claim.hits += 1;
      continue;
    }
    uncovered.push(file);
  }

  const stalePatterns = claims.filter((entry) => entry.hits === 0);
  const staleIgnores = ignores.filter((entry) => entry.hits === 0);

  const report = {
    ok: uncovered.length === 0,
    scanner,
    workspace_root: toPosix(root),
    inventory_version: inventory.version || null,
    inventory_generated_at: inventory.generated_at || null,
    consumers_inventoried: consumers.length,
    files_scanned_with_hits: files.length,
    uncovered_files: uncovered,
    stale_patterns: stalePatterns.map((entry) => ({ id: entry.id, pattern: entry.pattern })),
    stale_ignore_patterns: staleIgnores.map((entry) => entry.pattern),
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Supabase-Verbraucher-Gate`);
    console.log(`  Workspace-Root : ${report.workspace_root}`);
    console.log(`  Inventar       : ${consumers.length} Verbraucher (Stand ${report.inventory_generated_at || 'unbekannt'})`);
    console.log(`  Scanner        : ${scanner}`);
    console.log(`  Scantreffer    : ${files.length} Dateien mit Supabase-Signal`);
    if (files.length === 0) {
      console.log('  Hinweis        : 0 Treffer. Entweder ist Supabase raus (Inventar leeren)');
      console.log('                   oder der Scan lief gegen den falschen Root.');
    }
    if (stalePatterns.length) {
      console.log(`  Warnung        : ${stalePatterns.length} Inventarmuster ohne Treffer (moeglicherweise bereits abgeloest):`);
      for (const entry of stalePatterns) console.log(`                   - ${entry.id}: ${entry.pattern}`);
    }
    if (staleIgnores.length) {
      console.log(`  Warnung        : ${staleIgnores.length} ignore_paths ohne Treffer:`);
      for (const pattern of staleIgnores) console.log(`                   - ${pattern}`);
    }
    if (uncovered.length) {
      console.log('');
      console.log(`  FEHLGESCHLAGEN : ${uncovered.length} Datei(en) greifen auf Supabase zu, gehoeren aber`);
      console.log('                   zu keinem inventarisierten Verbraucher:');
      for (const file of uncovered) console.log(`                   - ${file}`);
      console.log('');
      console.log('  Naechster Schritt: Verbraucher in scripts/inventory/supabase-consumers.json');
      console.log('  aufnehmen (mit Objekten, Zugriffsweg, R/W und Abschalt-Gate) und die');
      console.log('  Tabelle in docs/audits/verbraucher-inventar/INVENTAR.md nachziehen.');
    } else {
      console.log('  Ergebnis       : OK — kein nicht inventarisierter Verbraucher gefunden.');
    }
  }

  process.exit(uncovered.length ? 1 : 0);
}

if (require.main === module) main();

module.exports = { globToRegExp, runNodeScan, runRipgrep, SIGNAL_PATTERN, EXCLUDE_GLOBS };
