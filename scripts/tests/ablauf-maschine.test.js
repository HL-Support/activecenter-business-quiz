'use strict';

/**
 * Vertragstests der Ablauf-Maschine (E1, src/maschine/ablauf.js).
 *
 * Diese Tabelle IST der Verhaltensvertrag der Schrittfolge — jede Zeile
 * bildet Verhalten ab, das bis E1 inline in App.jsx stand. Wer hier etwas
 * aendert, aendert den Funnel, nicht "nur Code".
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');
const Module = require('node:module');

const ABLAUF_PATH = path.resolve(__dirname, '../../src/maschine/ablauf.js');

function loadAblauf() {
  const build = esbuild.buildSync({
    entryPoints: [ABLAUF_PATH],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
  });
  const loaded = new Module(ABLAUF_PATH, module);
  loaded.filename = ABLAUF_PATH;
  loaded.paths = Module._nodeModulePaths(path.dirname(ABLAUF_PATH));
  loaded._compile(build.outputFiles[0].text, ABLAUF_PATH);
  return loaded.exports;
}

const ablauf = loadAblauf();

// ---------------------------------------------------------------------------------------
// 1. Antwort-Uebergaenge: 6 Fragen, Bestaetigung nach Frage 4 (Index 3)
// ---------------------------------------------------------------------------------------

test('die Schrittfolge nach jeder Antwort entspricht dem heutigen Funnel', () => {
  const faelle = [
    [0, { ziel: 'quiz', naechsterIndex: 1 }],
    [1, { ziel: 'quiz', naechsterIndex: 2 }],
    [2, { ziel: 'quiz', naechsterIndex: 3 }],
    [3, { ziel: 'aspiration-confirm', naechsterIndex: 4 }],
    [4, { ziel: 'quiz', naechsterIndex: 5 }],
    [5, { ziel: 'analyzing', naechsterIndex: 5 }],
  ];
  for (const [index, erwartet] of faelle) {
    assert.deepEqual(
      ablauf.uebergangNachAntwort(index, 6),
      erwartet,
      `Uebergang nach Frage ${index + 1}`
    );
  }
});

// ---------------------------------------------------------------------------------------
// 2. Profilcode: Zaehlung der ersten drei Antworten inkl. Gleichstand-Ordnung
// ---------------------------------------------------------------------------------------

test('der Profilcode zaehlt nur die ersten drei Antworten', () => {
  assert.equal(
    ablauf.profilCodeAusAntworten([{ type: 'G' }, { type: 'G' }, { type: 'B' }, { type: 'B' }]),
    'G',
    'die vierte Antwort (Aspiration-Frage) darf nie mitzaehlen'
  );
  assert.equal(ablauf.profilCodeAusAntworten([{ type: 'B' }, { type: 'B' }, { type: 'R' }]), 'B');
});

test('bei Gleichstand gewinnt die feste Ordnung R vor Y vor G vor B', () => {
  // Exakt das bisherige Verhalten der stabilen Sortierung ueber Object.entries.
  assert.equal(ablauf.profilCodeAusAntworten([{ type: 'Y' }, { type: 'G' }, { type: 'B' }]), 'Y');
  assert.equal(ablauf.profilCodeAusAntworten([{ type: 'G' }, { type: 'B' }, {}]), 'G');
  assert.equal(ablauf.profilCodeAusAntworten([]), 'R', 'ohne Antworten bleibt R (alles 0)');
  assert.equal(ablauf.profilCodeAusAntworten(null), 'R', 'kaputte Eingabe faellt auf R');
});

// ---------------------------------------------------------------------------------------
// 3. Aspiration aus den Antworten
// ---------------------------------------------------------------------------------------

test('die Aspiration kommt aus Frage 4, ersatzweise Frage 5, sonst freedom', () => {
  const mit4 = [{}, {}, {}, { aspiration: 'growth' }, { aspiration: 'impact' }];
  const nur5 = [{}, {}, {}, {}, { aspiration: 'impact' }];
  assert.equal(ablauf.aspirationAusAntworten(mit4), 'growth');
  assert.equal(ablauf.aspirationAusAntworten(nur5), 'impact');
  assert.equal(ablauf.aspirationAusAntworten([]), 'freedom');
  assert.equal(ablauf.aspirationAusAntworten(undefined), 'freedom');
});

// ---------------------------------------------------------------------------------------
// 4. Resume-Abbildung inkl. des Guards gegen den toten Quiz-Rueckfall
// ---------------------------------------------------------------------------------------

test('Resume auf videos normalisiert den Schritt und klemmt den Fortschritt', () => {
  assert.deepEqual(
    ablauf.resumeZiel({
      resumeTarget: 'videos',
      videoStep: 2,
      resumeStartPercent: 47,
      profilBekannt: true,
      anzahlVideos: 3,
    }),
    { schritt: 'videos', videoStep: 2, resumeVideoStep: 2, resumeStartPercent: 47 }
  );
  // Schritt ausserhalb des Bandes -> Video 1; Prozent wird auf 0..90 geklemmt.
  assert.deepEqual(
    ablauf.resumeZiel({
      resumeTarget: 'videos',
      videoStep: 9,
      resumeStartPercent: 97,
      profilBekannt: false,
      anzahlVideos: 3,
    }),
    { schritt: 'videos', videoStep: 1, resumeVideoStep: 1, resumeStartPercent: 90 }
  );
  assert.deepEqual(
    ablauf.resumeZiel({
      resumeTarget: 'videos',
      videoStep: 1,
      resumeStartPercent: 'unsinn',
      profilBekannt: true,
      anzahlVideos: 3,
    }),
    { schritt: 'videos', videoStep: 1, resumeVideoStep: 1, resumeStartPercent: 0 }
  );
});

test('Resume auf final und result verhalten sich wie bisher', () => {
  assert.equal(
    ablauf.resumeZiel({ resumeTarget: 'final', videoStep: 3, resumeStartPercent: 50, profilBekannt: true, anzahlVideos: 3 }).schritt,
    'final'
  );
  assert.equal(
    ablauf.resumeZiel({ resumeTarget: 'result', videoStep: 1, resumeStartPercent: 0, profilBekannt: true, anzahlVideos: 3 }).schritt,
    'result'
  );
});

test('🔴 Guard: result OHNE aufloesbares Profil landet auf Video 1, nie im Quiz', () => {
  const ziel = ablauf.resumeZiel({
    resumeTarget: 'result',
    videoStep: 1,
    resumeStartPercent: 0,
    profilBekannt: false,
    anzahlVideos: 3,
  });
  assert.deepEqual(ziel, {
    schritt: 'videos',
    videoStep: 1,
    resumeVideoStep: 1,
    resumeStartPercent: 0,
  });
});

test('die Prozentklemme allein: 0..90, Unsinn wird 0', () => {
  assert.equal(ablauf.klemmeResumeProzent(-5), 0);
  assert.equal(ablauf.klemmeResumeProzent(90), 90);
  assert.equal(ablauf.klemmeResumeProzent(91), 90);
  assert.equal(ablauf.klemmeResumeProzent(NaN), 0);
});

// ---------------------------------------------------------------------------------------
// 5. Neustart und Grenz-Eigenschaften
// ---------------------------------------------------------------------------------------

test('der Neustart-Zustand entspricht dem bisherigen Restart-Handler', () => {
  assert.deepEqual(ablauf.neustartZustand(), {
    schritt: 'intro',
    frageIndex: 0,
    antworten: [],
    gewaehlt: null,
    profil: null,
    analyzingSchritt: 0,
    videoStep: 1,
    aspiration: 'freedom',
  });
});

test('die Maschine traegt keine Optik und spricht kein Netz (Grenzvertrag E1)', () => {
  const source = require('node:fs').readFileSync(ABLAUF_PATH, 'utf8');
  for (const verboten of ['#', 'rgba(', 'fetch(', 'localStorage', 'window.', 'style', 'React']) {
    assert.ok(
      !source.includes(verboten),
      `src/maschine/ablauf.js darf "${verboten}" nicht enthalten (Grenze Maschine/Template)`
    );
  }
});
