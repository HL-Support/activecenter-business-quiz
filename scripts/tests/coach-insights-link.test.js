/**
 * Vertragstests fuer den einzigen Erzeuger von Coach-Insights-Links.
 *
 * Bezug: docs/audits/p1-schulung-grundlagen/inventur-2026-08-24.md, Befunde D-1..D-8.
 * Die Tests halten genau die Faelle fest, die vorher zwischen api/bridge.js und
 * api/lead-outbox-worker.js auseinandergelaufen sind.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const linkModulePath = path.resolve(__dirname, '../../server/coach-insights-link.js');
const {
  COACH_INSIGHTS_LANGS,
  DEFAULT_COACH_INSIGHTS_BASE_URL,
  buildCoachInsightsUrl,
  getCoachInsightsBaseUrl,
  normalizeAspirationKey,
  normalizeProfileCode,
  normalizeProfileSlug,
} = require(linkModulePath);

const PROFILE_SLUGS = ['feuer', 'wind', 'wasser', 'fels'];
const GOAL_SLUGS = ['freedom', 'impact', 'security', 'growth'];

function parse(url) {
  const parsed = new URL(url);
  return {
    origin: `${parsed.origin}${parsed.pathname}`,
    type: parsed.searchParams.get('type'),
    goal: parsed.searchParams.get('goal'),
    lang: parsed.searchParams.get('lang'),
  };
}

// 1. Alle 4 Profile x alle 4 Ziele x 6 Sprachen ergeben gueltige URLs mit lang-Parameter.
test('96 Kombinationen aus Profil, Ziel und Sprache erzeugen vollstaendige Links', () => {
  assert.deepEqual(COACH_INSIGHTS_LANGS, ['de', 'it', 'en', 'fr', 'ru', 'hu']);

  let built = 0;
  for (const profile of PROFILE_SLUGS) {
    for (const goal of GOAL_SLUGS) {
      for (const lang of COACH_INSIGHTS_LANGS) {
        const url = buildCoachInsightsUrl({ profileLabel: profile, aspiration: goal, lang });
        const parsed = parse(url);
        assert.equal(parsed.type, profile, `type fuer ${profile}/${goal}/${lang}`);
        assert.equal(parsed.goal, goal, `goal fuer ${profile}/${goal}/${lang}`);
        assert.equal(parsed.lang, lang, `lang fuer ${profile}/${goal}/${lang}`);
        built += 1;
      }
    }
  }

  assert.equal(built, 96);
});

test('unbekannte Sprachen werden weggelassen statt geraten', () => {
  assert.equal(parse(buildCoachInsightsUrl({ profileLabel: 'wind', lang: 'es' })).lang, null);
  assert.equal(parse(buildCoachInsightsUrl({ profileLabel: 'wind', lang: 'de-DE' })).lang, null);
  assert.equal(parse(buildCoachInsightsUrl({ profileLabel: 'wind' })).lang, null);
});

test('die Basis-URL kommt aus der Umgebung, mit dem heutigen Ziel als Default', () => {
  const previous = process.env.COACH_INSIGHTS_BASE_URL;
  try {
    delete process.env.COACH_INSIGHTS_BASE_URL;
    assert.equal(getCoachInsightsBaseUrl(), DEFAULT_COACH_INSIGHTS_BASE_URL);
    assert.ok(buildCoachInsightsUrl({}).startsWith(DEFAULT_COACH_INSIGHTS_BASE_URL));

    process.env.COACH_INSIGHTS_BASE_URL = 'https://business.activecenter.info/berater-info';
    const url = buildCoachInsightsUrl({ profileLabel: 'fels', aspiration: 'growth', lang: 'de' });
    assert.equal(
      url,
      'https://business.activecenter.info/berater-info?type=fels&goal=growth&lang=de'
    );
  } finally {
    if (previous === undefined) delete process.env.COACH_INSIGHTS_BASE_URL;
    else process.env.COACH_INSIGHTS_BASE_URL = previous;
  }
});

// 2. D-2: Bridge und Outbox-Worker mappen identisch - inklusive der englischen Namen,
//    die frueher nur der Worker kannte, und der ru/fr-Namen, die keiner von beiden kannte.
test('D-2: englische, russische und franzoesische Profilnamen mappen fuer jeden Aufrufer gleich', () => {
  const expectations = [
    // englisch (translations.js en-Block) - die Bridge kannte diese vier nicht
    ['The doer', 'feuer'],
    ['The connector', 'wind'],
    ['The anchor', 'wasser'],
    ['The architect', 'fels'],
    // russisch (D-5) - kein Erzeuger kannte diese
    ['Деятель', 'feuer'],
    ['Соединитель', 'wind'],
    ['Якорь', 'wasser'],
    ['Архитектор', 'fels'],
    // franzoesisch (D-5, symmetrisch)
    ['Le faiseur', 'feuer'],
    ['Le connecteur', 'wind'],
    ["L'ancre", 'wasser'],
    ["L'architecte", 'fels'],
    // deutsch und italienisch - Bestand, muss unveraendert weiter greifen
    ['Der Macher', 'feuer'],
    ['Der Netzwerker', 'wind'],
    ['Der Anker', 'wasser'],
    ['Der Architekt', 'fels'],
    ['Il realizzatore', 'feuer'],
    ['Il connettore', 'wind'],
    ["L'ancora", 'wasser'],
    ["L'architetto", 'fels'],
  ];

  for (const [label, slug] of expectations) {
    assert.equal(normalizeProfileSlug(label), slug, `Name ${label}`);

    // Aufrufer 1 (bridge): Code + Name getrennt, Code kann fehlen.
    const fromBridge = parse(buildCoachInsightsUrl({ profileCode: '', profileLabel: label }));
    // Aufrufer 2 (worker): identische Felder aus lead_state.
    const fromWorker = parse(
      buildCoachInsightsUrl({ profileCode: undefined, profileLabel: label })
    );

    assert.equal(fromBridge.type, slug, `bridge ${label}`);
    assert.equal(fromWorker.type, slug, `worker ${label}`);
    assert.equal(fromBridge.type, fromWorker.type);
  }
});

// 3. D-4: Der ungarische Artikel "A " darf nicht mehr als Profil-Code A durchschlagen.
test('D-4: ungarische Profilnamen mit Artikel mappen auf ihr echtes Profil, nie auf feuer', () => {
  assert.equal(normalizeProfileSlug('A Kapcsolatteremtő'), 'wind');
  assert.equal(normalizeProfileSlug('A Támasz'), 'wasser');
  assert.equal(normalizeProfileSlug('A Cselekvő'), 'feuer');
  assert.equal(normalizeProfileSlug('Az Építő'), 'fels');

  assert.notEqual(normalizeProfileSlug('A Kapcsolatteremtő'), 'feuer');
  assert.notEqual(normalizeProfileSlug('A Támasz'), 'feuer');

  // Auch ohne Diakritika (Altdaten aus Systemen, die sie verlieren).
  assert.equal(normalizeProfileSlug('A Kapcsolatteremto'), 'wind');
  assert.equal(normalizeProfileSlug('A Tamasz'), 'wasser');

  // Und der komplette Weg bis zur URL.
  assert.equal(
    parse(buildCoachInsightsUrl({ profileLabel: 'A Kapcsolatteremtő', lang: 'hu' })).type,
    'wind'
  );
});

test('D-4: nackte Codes und Typ-Formen mappen weiter korrekt', () => {
  assert.equal(normalizeProfileSlug('a'), 'feuer');
  assert.equal(normalizeProfileSlug('B'), 'wind');
  assert.equal(normalizeProfileSlug(' c '), 'wasser');
  assert.equal(normalizeProfileSlug('D'), 'fels');

  // profiles.*.code aus translations.js, in allen sechs Sprachen.
  assert.equal(normalizeProfileSlug('Typ A'), 'feuer');
  assert.equal(normalizeProfileSlug('Tipo B'), 'wind');
  assert.equal(normalizeProfileSlug('Type C'), 'wasser');
  assert.equal(normalizeProfileSlug('Тип D'), 'fels');
  assert.equal(normalizeProfileSlug('A típus'), 'feuer');
  assert.equal(normalizeProfileSlug('B típus'), 'wind');

  assert.equal(normalizeProfileCode('A típus'), 'A');
  assert.equal(normalizeProfileCode('A Kapcsolatteremtő'), 'B');
  assert.equal(normalizeProfileCode('A Támasz'), 'C');
  assert.equal(normalizeProfileCode('Az Építő'), 'D');
});

test('die realen Rohwerte beider Aufrufer ergeben dasselbe Profil', () => {
  // bridge: [quiz_profile, quiz_profile_name].join(' - ')
  assert.equal(normalizeProfileSlug('B típus - A Kapcsolatteremtő'), 'wind');
  // worker: [profile_code, profile_label].join(' ') aus lead_state (normalisiert)
  assert.equal(normalizeProfileSlug('wind Der Netzwerker'), 'wind');
  assert.equal(normalizeProfileSlug('C típus A Támasz'), 'wasser');
});

test('Aspirationen aus allen sechs Sprachen landen auf den englischen Ziel-Slugs', () => {
  const expectations = [
    ['Freiheit', 'freedom'],
    ['Libertà', 'freedom'],
    ['Liberté', 'freedom'],
    ['liberte', 'freedom'],
    ['Свобода', 'freedom'],
    ['Szabadság', 'freedom'],
    ['Wirkung', 'impact'],
    ['Impatto', 'impact'],
    ['Влияние', 'impact'],
    ['Hatás', 'impact'],
    ['Sicherheit', 'security'],
    ['Sécurité', 'security'],
    ['Безопасность', 'security'],
    ['Biztonság', 'security'],
    ['Wachstum', 'growth'],
    ['Croissance', 'growth'],
    ['Рост', 'growth'],
    ['Növekedés', 'growth'],
  ];

  for (const [value, expected] of expectations) {
    assert.equal(normalizeAspirationKey(value), expected, `Aspiration ${value}`);
  }

  assert.equal(normalizeAspirationKey('irgendwas'), '');
  assert.equal(normalizeAspirationKey(''), '');
});

// 4. D-7-Erzeugerseite: Fehlt das Profil, bleibt der Link trotzdem nutzbar.
test('D-7: ohne erkennbares Profil entsteht ein Link ohne type, aber mit goal und lang', () => {
  const url = buildCoachInsightsUrl({
    profileCode: '',
    profileLabel: 'Unbekanntes Profil',
    aspiration: 'Növekedés',
    lang: 'hu',
  });
  const parsed = parse(url);

  assert.equal(parsed.type, null);
  assert.equal(parsed.goal, 'growth');
  assert.equal(parsed.lang, 'hu');
  assert.ok(!url.includes('type='));
});

test('ganz ohne Daten bleibt die nackte Basis-URL uebrig', () => {
  const url = buildCoachInsightsUrl({});
  assert.equal(url, getCoachInsightsBaseUrl());
  assert.ok(!url.includes('?'));
});

test('Profil ohne Ziel erzeugt type und lang, aber kein leeres goal', () => {
  const parsed = parse(buildCoachInsightsUrl({ profileLabel: 'Der Anker', lang: 'de' }));
  assert.equal(parsed.type, 'wasser');
  assert.equal(parsed.goal, null);
  assert.equal(parsed.lang, 'de');
});
