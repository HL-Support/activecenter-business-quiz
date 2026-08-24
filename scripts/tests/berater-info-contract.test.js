/**
 * Vertragstests der Schulungsseite /berater-info.
 *
 * Geladen wird wie in business-rules.test.js: esbuild buendelt das ESM-Modul nach CJS,
 * damit der Vertrag ohne Browser und ohne Build-Artefakt geprueft werden kann.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');

const projectRoot = path.resolve(__dirname, '../..');
const localesDir = path.join(projectRoot, 'src', 'berater-info', 'locales');
const LANGS = ['de', 'it', 'en', 'fr', 'ru', 'hu'];

function loadModule(relativePath) {
  const filePath = path.resolve(projectRoot, relativePath);
  const build = esbuild.buildSync({
    entryPoints: [filePath],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    loader: { '.json': 'json' },
    write: false,
  });
  const loaded = new Module(filePath, module);
  loaded.filename = filePath;
  loaded.paths = Module._nodeModulePaths(path.dirname(filePath));
  loaded._compile(build.outputFiles[0].text, filePath);
  return loaded.exports;
}

function loadContract() {
  return loadModule('src/berater-info/query-contract.js');
}

function leafPaths(value, prefix = '', out = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => leafPaths(item, `${prefix}[${index}]`, out));
  } else if (value && typeof value === 'object') {
    for (const key of Object.keys(value).sort()) {
      leafPaths(value[key], prefix ? `${prefix}.${key}` : key, out);
    }
  } else {
    out.push(prefix);
  }
  return out;
}

// 5. Query-Vertrag: Aliasse, Prioritaeten, Fallbacks, D-7.
test('Profil-Parameter: type gewinnt, profil ist der Alias', () => {
  const { resolveBeraterInfoState } = loadContract();

  assert.equal(resolveBeraterInfoState('?type=wasser').profile, 'wasser');
  assert.equal(resolveBeraterInfoState('?profil=wasser').profile, 'wasser');
  assert.equal(resolveBeraterInfoState('?type=wind&profil=fels').profile, 'wind');
});

test('Ziel-Parameter: goal vor asp vor aspiration', () => {
  const { resolveBeraterInfoState } = loadContract();

  assert.equal(resolveBeraterInfoState('?goal=growth').aspiration, 'wachstum');
  assert.equal(resolveBeraterInfoState('?asp=growth').aspiration, 'wachstum');
  assert.equal(resolveBeraterInfoState('?aspiration=growth').aspiration, 'wachstum');
  assert.equal(
    resolveBeraterInfoState('?goal=impact&asp=growth&aspiration=security').aspiration,
    'wirkung'
  );
  assert.equal(resolveBeraterInfoState('?asp=impact&aspiration=security').aspiration, 'wirkung');
});

test('Sprach-Parameter: lang vor l, hu ist dabei', () => {
  const { resolveBeraterInfoState, SUPPORTED_LANGS } = loadContract();

  assert.deepEqual(SUPPORTED_LANGS, ['de', 'it', 'en', 'fr', 'ru', 'hu']);
  assert.equal(resolveBeraterInfoState('?lang=hu').lang, 'hu');
  assert.equal(resolveBeraterInfoState('?l=hu').lang, 'hu');
  assert.equal(resolveBeraterInfoState('?lang=ru&l=fr').lang, 'ru');
  assert.equal(resolveBeraterInfoState('?lang=HU').lang, 'hu');
  for (const lang of SUPPORTED_LANGS) {
    assert.equal(resolveBeraterInfoState(`?lang=${lang}`).lang, lang);
  }
});

test('alle 16 Kombinationen aus den Erzeuger-Slugs treffen Profil und Ziel', () => {
  const { resolveBeraterInfoState } = loadContract();
  const goalToId = {
    freedom: 'freiheit',
    impact: 'wirkung',
    security: 'sicherheit',
    growth: 'wachstum',
  };

  for (const type of ['feuer', 'wind', 'wasser', 'fels']) {
    for (const goal of Object.keys(goalToId)) {
      const state = resolveBeraterInfoState(`?type=${type}&goal=${goal}&lang=de`);
      assert.equal(state.profile, type);
      assert.equal(state.aspiration, goalToId[goal]);
      assert.equal(state.openSection, 'profile');
      assert.equal(state.aspirationByProfile[type], goalToId[goal]);
    }
  }
});

test('Bestands-Aliasse der Altseite bleiben gueltig', () => {
  const { resolveBeraterInfoState } = loadContract();

  assert.equal(resolveBeraterInfoState('?type=fire').profile, 'feuer');
  assert.equal(resolveBeraterInfoState('?type=architect').profile, 'fels');
  assert.equal(resolveBeraterInfoState('?type=supporter').profile, 'wasser');
  assert.equal(resolveBeraterInfoState('?type=Netzwerker').profile, 'wind');
  assert.equal(resolveBeraterInfoState('?goal=liberta').aspiration, 'freiheit');
  assert.equal(resolveBeraterInfoState('?goal=croissance').aspiration, 'wachstum');
});

test('D-6: lokalisierte Zielwerte mit Diakritika laufen nicht mehr ins Leere', () => {
  const { resolveBeraterInfoState } = loadContract();

  assert.equal(resolveBeraterInfoState('?goal=liberté').aspiration, 'freiheit');
  assert.equal(resolveBeraterInfoState('?goal=sécurité').aspiration, 'sicherheit');
  assert.equal(resolveBeraterInfoState('?goal=Növekedés').aspiration, 'wachstum');
  assert.equal(resolveBeraterInfoState('?type=Kapcsolatteremtő').profile, 'wind');
  assert.equal(resolveBeraterInfoState('?type=Támasz').profile, 'wasser');
});

test('D-7: goal ohne type oeffnet den Zielinhalt statt ihn zu verwerfen', () => {
  const { resolveBeraterInfoState, PROFILE_IDS, DEFAULT_PROFILE } = loadContract();
  const state = resolveBeraterInfoState('?goal=growth&lang=hu');

  assert.equal(state.profile, '');
  assert.equal(state.aspiration, 'wachstum');
  assert.equal(state.goalWithoutProfile, true);
  assert.equal(state.openSection, 'profile');
  assert.equal(state.activeProfile, DEFAULT_PROFILE);
  for (const id of PROFILE_IDS) {
    assert.equal(state.aspirationByProfile[id], 'wachstum', `Ziel fuer ${id} vorgemerkt`);
  }
});

test('unbekannte und leere Werte fallen sauber auf die Defaults zurueck', () => {
  const { resolveBeraterInfoState, DEFAULT_PROFILE, DEFAULT_SECTION } = loadContract();

  for (const search of ['', '?', '?type=&goal=&lang=', '?type=banane&goal=mond&lang=es']) {
    const state = resolveBeraterInfoState(search);
    assert.equal(state.profile, '', `profile fuer ${JSON.stringify(search)}`);
    assert.equal(state.aspiration, '', `aspiration fuer ${JSON.stringify(search)}`);
    assert.equal(state.lang, '', `lang fuer ${JSON.stringify(search)}`);
    assert.equal(state.openSection, DEFAULT_SECTION);
    assert.equal(state.activeProfile, DEFAULT_PROFILE);
    assert.deepEqual(state.aspirationByProfile, {});
    assert.equal(state.goalWithoutProfile, false);
  }

  // Kyrillische type-Werte reduziert die Normalisierung auf '' - wie in der Quelle.
  assert.equal(resolveBeraterInfoState('?type=Деятель').profile, '');
  // de-DE ist keine unterstuetzte Sprache und faellt in die Fallback-Kette.
  assert.equal(resolveBeraterInfoState('?lang=de-DE').lang, '');
});

// 6. Vollstaendigkeit: alle sechs Sprachpakete haben identische Key-Saetze.
test('alle sechs Sprachpakete tragen identische Key-Saetze', () => {
  const packs = {};
  for (const lang of LANGS) {
    packs[lang] = {
      common: JSON.parse(fs.readFileSync(path.join(localesDir, lang, 'common.json'), 'utf8')),
      profiles: JSON.parse(fs.readFileSync(path.join(localesDir, lang, 'profiles.json'), 'utf8')),
    };
  }

  for (const namespace of ['common', 'profiles']) {
    const baseKeys = leafPaths(packs.de[namespace]);
    assert.ok(baseKeys.length > 0, `${namespace}: deutsche Basis ist leer`);

    for (const lang of LANGS) {
      const keys = leafPaths(packs[lang][namespace]);
      const missing = baseKeys.filter((key) => !keys.includes(key));
      const extra = keys.filter((key) => !baseKeys.includes(key));
      assert.deepEqual(missing, [], `${lang}/${namespace}: fehlende Keys`);
      assert.deepEqual(extra, [], `${lang}/${namespace}: zusaetzliche Keys`);
    }
  }

  assert.equal(leafPaths(packs.de.common).length, 59);
  assert.equal(leafPaths(packs.de.profiles).length, 210);
});

test('kein Sprachpaket enthaelt leere Werte', () => {
  for (const lang of LANGS) {
    for (const namespace of ['common', 'profiles']) {
      const pack = JSON.parse(
        fs.readFileSync(path.join(localesDir, lang, `${namespace}.json`), 'utf8')
      );
      const walk = (value, keyPath) => {
        if (Array.isArray(value)) return value.forEach((v, i) => walk(v, `${keyPath}[${i}]`));
        if (value && typeof value === 'object') {
          return Object.keys(value).forEach((k) => walk(value[k], `${keyPath}.${k}`));
        }
        assert.ok(
          String(value).trim().length > 0,
          `${lang}/${namespace}: leerer Wert bei ${keyPath}`
        );
      };
      walk(pack, lang);
    }
  }
});

test('die Nicht-ASCII-Keys der Quelle sind UTF-8-intakt angekommen', () => {
  for (const lang of LANGS) {
    const profiles = JSON.parse(
      fs.readFileSync(path.join(localesDir, lang, 'profiles.json'), 'utf8')
    );
    for (const profile of ['feuer', 'wind', 'wasser', 'fels']) {
      assert.ok(Array.isArray(profiles[profile]['stärken']), `${lang}/${profile}: stärken`);
      for (const aspiration of ['freiheit', 'wirkung', 'sicherheit', 'wachstum']) {
        const node = profiles[profile].aspirations[aspiration];
        assert.equal(typeof node['gespräch'], 'string', `${lang}/${profile}/${aspiration}: gespräch`);
        assert.equal(
          typeof node['überzeugt'],
          'string',
          `${lang}/${profile}/${aspiration}: überzeugt`
        );
        assert.ok(Array.isArray(node['einwände']), `${lang}/${profile}/${aspiration}: einwände`);
      }
    }
  }
});

test('das ungarische Paket nutzt die Terminologie der ungarischen Quiz-Profile', () => {
  const profiles = JSON.parse(fs.readFileSync(path.join(localesDir, 'hu', 'profiles.json'), 'utf8'));
  const quizSource = fs.readFileSync(path.join(projectRoot, 'translations.js'), 'utf8');

  const names = {
    feuer: 'A Cselekvő',
    wind: 'A Kapcsolatteremtő',
    wasser: 'A Támasz',
    fels: 'Az Építő',
  };

  for (const [id, name] of Object.entries(names)) {
    assert.equal(profiles[id].name, name, `hu-Profilname ${id}`);
    assert.ok(quizSource.includes(`name: '${name}'`), `${name} muss aus translations.js stammen`);
  }

  const labels = { freiheit: 'Szabadság', wirkung: 'Hatás', sicherheit: 'Biztonság', wachstum: 'Növekedés' };
  for (const [id, label] of Object.entries(labels)) {
    assert.equal(profiles.feuer.aspirations[id].label, label, `hu-Ziellabel ${id}`);
  }
});

test('die fuenf Bestandssprachen sind byte-gleich zur Quelle uebernommen', () => {
  const sourceRoot = path.resolve(
    projectRoot,
    '..',
    'business-schulung',
    'public',
    'locales'
  );

  if (!fs.existsSync(sourceRoot)) {
    // Auf CI-Runnern liegt das Altrepo nicht daneben; dort greift der Key-Vergleich oben.
    return;
  }

  // Zeilenenden werden vor dem Vergleich normalisiert: Git materialisiert die Kopien auf
  // Windows-Checkouts mit CRLF (core.autocrlf), waehrend die Quelle LF traegt. Gemeint ist
  // Inhaltsgleichheit - kein Zeichen Text darf abweichen, Zeilenenden sind checkout-abhaengig.
  const normalized = (buffer) => buffer.toString('utf8').replace(/\r\n/g, '\n');
  for (const lang of ['de', 'it', 'en', 'fr', 'ru']) {
    for (const namespace of ['common', 'profiles']) {
      const source = fs.readFileSync(path.join(sourceRoot, lang, `${namespace}.json`));
      const copy = fs.readFileSync(path.join(localesDir, lang, `${namespace}.json`));
      assert.equal(
        normalized(copy),
        normalized(source),
        `${lang}/${namespace}.json weicht inhaltlich von der Quelle ab`
      );
    }
  }
});
