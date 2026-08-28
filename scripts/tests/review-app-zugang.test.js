const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Buffer } = require('node:buffer');

const { pruefeZugang, BENUTZER_STANDARD } = require('../../nurture/review-app/lib/zugang.js');

const PASS = 'ein-langes-geheimes-passwort';
const kopf = (benutzer, passwort) =>
  `Basic ${Buffer.from(`${benutzer}:${passwort}`, 'utf8').toString('base64')}`;

// Anlass (28.08.2026): Die Review-App bot GET UND PATCH auf die Mautic-Vorlagen mit dem
// Mautic-admin-Konto, ohne jede Zugangspruefung, oeffentlich erreichbar. Nachgemessen am
// Live-Stand: GET /api/email/48 -> HTTP 200 mit Inhalt, kein Login.

test('ohne konfiguriertes Passwort ist ALLES zu - fail-closed', () => {
  for (const umgebung of [{}, { REVIEW_PASS: '' }, { REVIEW_PASS: '   ' }]) {
    const ergebnis = pruefeZugang(kopf(BENUTZER_STANDARD, 'egal'), umgebung);
    assert.equal(ergebnis.ok, false);
    assert.equal(ergebnis.grund, 'kein_passwort_konfiguriert');
  }
});

test('richtige Zugangsdaten kommen durch', () => {
  const ergebnis = pruefeZugang(kopf(BENUTZER_STANDARD, PASS), { REVIEW_PASS: PASS });
  assert.deepEqual(ergebnis, { ok: true, grund: 'ok' });
});

test('eigener Benutzername wird beachtet', () => {
  const umgebung = { REVIEW_PASS: PASS, REVIEW_USER: 'markus' };
  assert.equal(pruefeZugang(kopf('markus', PASS), umgebung).ok, true);
  assert.equal(pruefeZugang(kopf(BENUTZER_STANDARD, PASS), umgebung).ok, false);
});

test('falsches Passwort, falscher Benutzer und fehlender Kopf werden abgewiesen', () => {
  const umgebung = { REVIEW_PASS: PASS };
  const faelle = [
    [null, 'kein_authorization_kopf'],
    ['', 'kein_authorization_kopf'],
    [kopf(BENUTZER_STANDARD, 'falsch'), 'zugangsdaten_falsch'],
    [kopf('fremder', PASS), 'zugangsdaten_falsch'],
    [kopf(BENUTZER_STANDARD, `${PASS} `), 'zugangsdaten_falsch'],
    [kopf(BENUTZER_STANDARD, PASS.slice(0, -1)), 'zugangsdaten_falsch'],
    [`Bearer ${PASS}`, 'falsches_schema'],
    ['Basic !!!kein-base64!!!', 'kein_gueltiges_base64'],
    [`Basic ${Buffer.from('ohnetrenner', 'utf8').toString('base64')}`, 'kein_doppelpunkt'],
  ];
  for (const [eingabe, erwarteterGrund] of faelle) {
    const ergebnis = pruefeZugang(eingabe, umgebung);
    assert.equal(ergebnis.ok, false, `haette abgewiesen werden muessen: ${eingabe}`);
    assert.equal(ergebnis.grund, erwarteterGrund, `anderer Grund bei: ${eingabe}`);
  }
});

test('ein leeres Passwort im Kopf oeffnet nichts', () => {
  assert.equal(pruefeZugang(kopf(BENUTZER_STANDARD, ''), { REVIEW_PASS: PASS }).ok, false);
});

// 🔴 Der eigentliche Schaden lag in der API, nicht auf der Seite: dort sitzt der PATCH,
// der die Mautic-Vorlagen ueberschreibt. Ein Matcher, der /api/ auslaesst, waere Zierde.
test('die Middleware schuetzt auch die API-Routen', () => {
  const quelle = fs.readFileSync(
    path.join(__dirname, '..', '..', 'nurture', 'review-app', 'middleware.js'),
    'utf8'
  );
  const treffer = quelle.match(/matcher:\s*\[([^\]]*)\]/);
  assert.ok(treffer, 'kein matcher in der Middleware gefunden');
  const matcher = treffer[1];
  assert.ok(
    !/\bapi\b/.test(matcher),
    `der Matcher schliesst /api aus - genau dort liegt der schreibende PATCH: ${matcher}`
  );
});

test('die API-Route hat weiterhin einen schreibenden PATCH - der Schutz darf nicht wegfallen', () => {
  const route = fs.readFileSync(
    path.join(__dirname, '..', '..', 'nurture', 'review-app', 'app', 'api', 'email', '[id]', 'route.js'),
    'utf8'
  );
  assert.ok(
    /export async function PATCH/.test(route),
    'kein PATCH mehr in der Route - dann kann dieser Test samt Middleware ueberprueft werden'
  );
  assert.ok(
    fs.existsSync(path.join(__dirname, '..', '..', 'nurture', 'review-app', 'middleware.js')),
    'middleware.js fehlt - die schreibende Route waere wieder ungeschuetzt'
  );
});
