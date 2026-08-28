const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..', '..');

// Audit 2026-08-23, 13.2.1: Schema-Initialisierung gehoert nicht in die deploybare
// Runtime (Default-Secret + Host-Header-Bypass). Migrationen laufen ausschliesslich
// ueber einen kontrollierten CLI-/CI-Pfad.
const FORBIDDEN_ROUTE_FILE = path.join(projectRoot, 'api', 'init-quiz-db.js');
// 'mautic.hl-support.biz': Der Browser-Direktcall an Mautic scheiterte in Produktion
// an CORS (E2E-Livedurchlauf 23.08.2026) und wurde entfernt; Mautic wird ausschliesslich
// serverseitig ueber den Contacts-Webhook bedient. Die URL darf im Runtime-Code nicht
// wieder auftauchen (das Attributions-Label source:'mautic' bleibt erlaubt).
const FORBIDDEN_MARKERS = [
  'init-quiz-db',
  'INIT_DB_TOKEN',
  'quiz_init_secret_change_me',
  'mautic.hl-support.biz',
];

function collectRuntimeFiles() {
  const roots = ['api', 'src', 'server'].map((dir) => path.join(projectRoot, dir));
  const singleFiles = ['build.js', 'ac-track.js', 'index.html', 'vercel.json', 'package.json'].map(
    (file) => path.join(projectRoot, file)
  );
  const files = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (/\.(js|jsx|json|html)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  for (const root of roots) {
    if (fs.existsSync(root)) walk(root);
  }
  for (const file of singleFiles) {
    if (fs.existsSync(file)) files.push(file);
  }
  return files;
}

test('api/init-quiz-db.js existiert nicht mehr in der deploybaren Runtime', () => {
  assert.equal(
    fs.existsSync(FORBIDDEN_ROUTE_FILE),
    false,
    'api/init-quiz-db.js darf nicht wieder eingefuehrt werden (Audit 13.2.1)'
  );
});

test('kein Runtime-Code referenziert die entfernte Init-Route oder ihr Secret', () => {
  const offenders = [];
  for (const file of collectRuntimeFiles()) {
    const content = fs.readFileSync(file, 'utf8');
    for (const marker of FORBIDDEN_MARKERS) {
      if (content.includes(marker)) {
        offenders.push(`${path.relative(projectRoot, file)} -> ${marker}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Runtime-Referenzen auf die entfernte DB-Init-Flaeche gefunden:\n${offenders.join('\n')}`
  );
});

// --- Vercel-Abkopplung (28.08.2026) ---------------------------------------------------------
//
// Das Projekt laeuft vollstaendig auf Coolify. Der Vercel-Deployweg ist entfernt, weil ein
// versehentliches `vercel deploy` aus einer Arbeitskopie die Produktion auf einen alten Stand
// zurueckwerfen koennte - genau die Gefahr, die eine .vercel-Projektbindung mit sich bringt.
//
// 🔴 vercel.json BLEIBT bewusst liegen: Es ist die Spezifikation, die server/http-adapter.js
// nachbildet (vier Security-Header, Rewrites in fester Reihenfolge), und scripts/verify.js
// prueft sie bei jedem CI-Lauf. Die Datei ist Sicherheitsnetz, kein Deploy-Artefakt.
test('die Vercel-Projektbindung ist entfernt und kommt nicht zurueck', () => {
  const reste = ['.vercel', '.vercelignore'].filter((p) =>
    fs.existsSync(path.join(projectRoot, p))
  );
  assert.deepEqual(
    reste,
    [],
    `Vercel-Bindung wieder im Repo: ${reste.join(', ')} - ein Deploy von hier wuerde die Produktion ueberschreiben`
  );
});

test('package.json kennt keinen Vercel-Deploybefehl mehr', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  const treffer = Object.entries(pkg.scripts || {})
    .filter(([, befehl]) => /vercel/i.test(String(befehl)))
    .map(([name]) => name);
  assert.deepEqual(
    treffer,
    [],
    `Vercel-Deploybefehle wieder in package.json: ${treffer.join(', ')}`
  );
});

test('vercel.json bleibt als Spezifikation erhalten', () => {
  // Gegenstueck zu den beiden Tests darueber: Die Datei DARF nicht mitentfernt werden,
  // sonst verliert scripts/verify.js seine Vergleichsgrundlage fuer Rewrites und Header.
  assert.ok(
    fs.existsSync(path.join(projectRoot, 'vercel.json')),
    'vercel.json fehlt - verify.js kann Rewrites und Security-Header nicht mehr pruefen'
  );
});
