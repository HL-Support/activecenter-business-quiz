'use strict';

/**
 * Vertragstests des Ereignis-Katalogs (E2, src/maschine/ereignisse.js).
 *
 * Der starke Teil: Jeder Bauer wird gegen das EINGEFRORENE Browser-Golden
 * (scripts/e2e/golden/ereignis-matrix.golden.json, E0b) gehalten — die
 * Payload-Schluessel eines gebauten Ereignisses muessen exakt den Golden-
 * Schluesseln minus der bekannten Queue-/Kontext-Anreicherung entsprechen.
 * Damit ist die Unit-Ebene an denselben Vertrag gebunden wie der Browser.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');
const Module = require('node:module');

const KATALOG_PATH = path.resolve(__dirname, '../../src/maschine/ereignisse.js');
const MATRIX_GOLDEN = require('../e2e/golden/ereignis-matrix.golden.json');

// Was sendLeadTrackEvent + Queue JEDEM Payload hinzufuegen (core.js) — der
// Bauer selbst darf und soll diese Felder nicht kennen.
const ANREICHERUNG = new Set([
  'lead_hash',
  'client_seed',
  'visitor_id',
  'member_id',
  'ref_id',
  'berater_slug',
  'source_app',
  'funnel_key',
  'lang',
  'event_at',
  'is_internal_traffic',
  'is_resume',
  'event_uid',
  'queued_at',
  'queue_attempts',
]);

function loadKatalog() {
  const noop = () => {};
  globalThis.localStorage = {
    getItem: () => null,
    setItem: noop,
    removeItem: noop,
  };
  globalThis.window = {
    location: { pathname: '/markus', search: '', href: 'https://x/markus' },
    TRANSLATIONS: { de: {} },
    dispatchEvent: noop,
    addEventListener: noop,
    sessionStorage: { getItem: () => null, setItem: noop },
  };
  globalThis.document = { cookie: '', referrer: '', addEventListener: noop };
  Object.defineProperty(globalThis, 'navigator', {
    value: { language: 'de-DE', userAgent: 'node-contract-test' },
    configurable: true,
  });
  globalThis.window.CustomEvent = class {};

  const build = esbuild.buildSync({
    entryPoints: [KATALOG_PATH],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
  });
  const loaded = new Module(KATALOG_PATH, module);
  loaded.filename = KATALOG_PATH;
  loaded.paths = Module._nodeModulePaths(path.dirname(KATALOG_PATH));
  loaded._compile(build.outputFiles[0].text, KATALOG_PATH);
  return loaded.exports;
}

const katalog = loadKatalog();

/** Golden-Schluessel eines Ereignisses, um die Anreicherung bereinigt. */
function goldenBauerSchluessel(ereignisName) {
  const eintrag = MATRIX_GOLDEN.find((e) => e.ereignis === ereignisName);
  assert.ok(eintrag, `Ereignis ${ereignisName} fehlt im Matrix-Golden`);
  return eintrag.felder.filter((feld) => !ANREICHERUNG.has(feld)).sort();
}

const frage = { id: 3, phase: 1 };
const option = { label: 'X', type: 'R', aspiration: '', barrier: '' };
const profil = { code: 'feuer', name: 'Der Macher' };

// Repraesentative Aufrufe — Eingaben wie im echten Fluss (Golden-Lauf: kein
// Experiment aktiv, darum messung=null).
const FAELLE = [
  ['quiz_started', () => katalog.baueQuizGestartet()],
  ['question_viewed', () => katalog.baueFrageGesehen(frage, 2)],
  // question_answered wird auf dem Sendeweg zu quiz_answer normalisiert.
  ['quiz_answer', () => katalog.baueFrageBeantwortet(frage, 2, option)],
  ['aspiration_confirmed', () => katalog.baueAspirationBestaetigt('freedom')],
  ['quiz_result', () => katalog.baueQuizErgebnis('R', 'Der Macher', 'freedom', [option])],
  ['optin_viewed', () => katalog.baueOptinGesehen(profil, 'freedom', null)],
  ['form_submit', () => katalog.baueFormularAbgeschickt('anna', 'a@b.c', null, false)],
  ['result_viewed', () => katalog.baueErgebnisGesehen(profil, 'freedom')],
  ['result_cta_click', () => katalog.baueErgebnisCta(profil, 'freedom')],
  ['video_viewed', () => katalog.baueVideoGesehen(1, 'vid-1')],
];

for (const [ereignisName, bauen] of FAELLE) {
  test(`Bauer fuer ${ereignisName} liefert exakt die Golden-Schluessel`, () => {
    const gebaut = bauen();
    assert.deepEqual(
      Object.keys(gebaut.payload).sort(),
      goldenBauerSchluessel(ereignisName),
      `Payload-Schluessel von ${ereignisName} weichen vom Browser-Golden ab`
    );
  });
}

test('die Ereignisnamen im Katalog entsprechen dem heutigen Vertrag', () => {
  assert.equal(katalog.baueQuizGestartet().name, 'quiz_started');
  assert.equal(katalog.baueFrageBeantwortet(frage, 0, option).name, 'question_answered');
  assert.equal(katalog.baueVideoErholung(1, 'reload').name, 'video_recovery');
  assert.equal(katalog.baueVideoWeiter(1, 'v', 3).name, 'video_continue_click');
  assert.equal(katalog.baueVideoWeiter(3, 'v', 3).payload.next_step, 'final');
  assert.equal(katalog.baueFinalGesehen(profil).name, 'final_viewed');
  assert.equal(katalog.baueCta('whatsapp').name, 'cta_click');
});

test('Experiment-Kennzeichnung: nur mit Messung, mit exakt den A/B-Feldern', () => {
  const ohne = katalog.baueOptinGesehen(profil, 'freedom', null).payload;
  assert.equal('experiment_name' in ohne, false);

  const mit = katalog.baueOptinGesehen(profil, 'freedom', 'b').payload;
  assert.equal(mit.experiment_name, 'optin_phone_v1');
  assert.equal(mit.experiment_variant, 'b');

  const submit = katalog.baueFormularAbgeschickt('a', 'a@b.c', 'b', true).payload;
  assert.equal(submit.phone_provided, '1');
  assert.equal(
    katalog.baueFormularAbgeschickt('a', 'a@b.c', 'b', false).payload.phone_provided,
    '0'
  );
});

test('die Video-Engine ist wortgleich umgezogen (Kernvertraege im Quelltext)', () => {
  const source = require('node:fs').readFileSync(
    path.resolve(__dirname, '../../src/maschine/video-engine.js'),
    'utf8'
  );
  for (const anker of [
    "unlock('unique_watch_95')",
    'percent >= 95',
    'seekBack(player',
    "track('video_unlocked'",
    "track('video_completed'",
    "trackHealth('playerjs_missing')",
  ]) {
    assert.ok(source.includes(anker), `video-engine.js muss "${anker}" enthalten`);
  }
});
