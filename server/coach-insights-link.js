/**
 * Kanonischer Erzeuger fuer Coach-Insights-Links (Schulungsseite /berater-info).
 *
 * Vorher gab es dieselbe Logik zweimal: api/bridge.js und api/lead-outbox-worker.js.
 * Die beiden Kopien waren nicht deckungsgleich (Inventur 2026-08-24, Befund D-2) und
 * haben fuer denselben Lead unterschiedliche Ziele erzeugt. Diese Datei ist ab sofort
 * die einzige Quelle; beide Erzeuger requiren sie.
 *
 * Geheilte Befunde der Inventur:
 *  D-1  Die Mail-Sprache wird jetzt als ?lang= mitgegeben (beide Aufrufer kennen sie).
 *  D-2  Ein Mapping fuer beide Aufrufer, inklusive der englischen Profilnamen.
 *  D-4  Der ungarische Artikel "A " matcht nicht mehr als Profil-Code A.
 *  D-5  Russische und franzoesische Profilnamen sind aufgenommen.
 *  D-8  Basis-URL kommt aus process.env statt aus einem Literal in zwei Dateien.
 */

// Bis zum Domain-Cutover bleibt die heutige Zieladresse der Default. Die Env-Variable
// existiert noch nicht im Deployment; sie einzufuehren ist Teil des Cutovers und macht
// den Wechsel zu einer Konfigurationsaenderung statt zu einem Code-Deploy.
// Seit 24.08.2026 zeigt der Default auf die integrierte Seite unter der eigenen Domain
// (Phase-1-Cutover); COACH_INSIGHTS_BASE_URL bleibt als Notfall-Override.
const DEFAULT_COACH_INSIGHTS_BASE_URL = 'https://business.activecenter.info/berater-info';

// Die Schulungsseite fuehrt seit der Integration dieselben sechs Sprachen wie das Quiz.
const COACH_INSIGHTS_LANGS = ['de', 'it', 'en', 'fr', 'ru', 'hu'];
const COACH_INSIGHTS_LANG_SET = new Set(COACH_INSIGHTS_LANGS);

const PROFILE_SLUGS = ['feuer', 'wind', 'wasser', 'fels'];

const PROFILE_SLUG_BY_CODE = {
  A: 'feuer',
  B: 'wind',
  C: 'wasser',
  D: 'fels',
};

const PROFILE_CODE_BY_SLUG = {
  feuer: 'A',
  wind: 'B',
  wasser: 'C',
  fels: 'D',
};

// Exakte Schluessel: der GANZE Wert (nach normalizeLookupKey) muss so lauten.
// Hier stehen nur Werte, die als vollstaendiger Wert eindeutig sind - insbesondere
// die nackten Codes und die Typ-Formen aus translations.js (profiles.*.code):
// 'Typ A' (de), 'Tipo A' (it), 'Type A' (en/fr), 'Тип A' (ru), 'A típus' (hu).
const PROFILE_EXACT_KEYS = {
  a: 'feuer',
  'typ-a': 'feuer',
  'type-a': 'feuer',
  'tipo-a': 'feuer',
  'a-tipus': 'feuer',
  b: 'wind',
  'typ-b': 'wind',
  'type-b': 'wind',
  'tipo-b': 'wind',
  'b-tipus': 'wind',
  c: 'wasser',
  'typ-c': 'wasser',
  'type-c': 'wasser',
  'tipo-c': 'wasser',
  'c-tipus': 'wasser',
  d: 'fels',
  'typ-d': 'fels',
  'type-d': 'fels',
  'tipo-d': 'fels',
  'd-tipus': 'fels',
};

// Namens-Tabelle: Teilstring-Suche auf dem klein geschriebenen Rohwert. Deckt alle sechs
// Quiz-Sprachen ab (translations.js, profiles.*.name) plus die deutschen/italienischen
// Altformen, die schon vorher gemappt wurden. Die Reihenfolge ist bewusst pro Profil
// gruppiert; keine der Zeichenketten ist Teilstring einer Zeichenkette eines anderen Profils.
const PROFILE_NAME_FRAGMENTS = {
  feuer: [
    'feuer',
    'fire',
    'macher',
    'driver',
    'doer',
    'realizzatore',
    'faiseur',
    'cselekvő',
    'cselekvo',
    'деятель',
  ],
  wind: [
    'wind',
    'netzwerker',
    'connector',
    'connettore',
    'connecteur',
    'kapcsolatteremtő',
    'kapcsolatteremto',
    'соединитель',
  ],
  wasser: [
    'wasser',
    'water',
    'anker',
    'anchor',
    'supporter',
    'ancora',
    'ancre',
    'támasz',
    'tamasz',
    'якорь',
  ],
  fels: [
    'fels',
    'rock',
    'stone',
    'architekt',
    'architect',
    'architetto',
    'architecte',
    'építő',
    'epito',
    'архитектор',
  ],
};

// Ausgabe englisch (freedom|impact|security|growth) - das ist der Wert, den die
// Schulungsseite als ?goal= erwartet. Die Tabelle ist die Vereinigung der beiden
// bisherigen Kopien und deckt de/en/it/fr/ru/hu mit und ohne Diakritika ab.
const ASPIRATION_KEYS = {
  freedom: 'freedom',
  freiheit: 'freedom',
  libertà: 'freedom',
  liberta: 'freedom',
  liberté: 'freedom',
  liberte: 'freedom',
  liberty: 'freedom',
  свобода: 'freedom',
  szabadság: 'freedom',
  szabadsag: 'freedom',
  impact: 'impact',
  wirkung: 'impact',
  impatto: 'impact',
  влияние: 'impact',
  hatás: 'impact',
  hatas: 'impact',
  security: 'security',
  sicherheit: 'security',
  sicurezza: 'security',
  sécurité: 'security',
  securite: 'security',
  безопасность: 'security',
  biztonság: 'security',
  biztonsag: 'security',
  growth: 'growth',
  wachstum: 'growth',
  crescita: 'growth',
  croissance: 'growth',
  рост: 'growth',
  növekedés: 'growth',
  novekedes: 'growth',
};

function getCoachInsightsBaseUrl() {
  const configured = String(process.env.COACH_INSIGHTS_BASE_URL || '').trim();
  return configured || DEFAULT_COACH_INSIGHTS_BASE_URL;
}

function lowerValue(value) {
  return String(value === null || value === undefined ? '' : value)
    .trim()
    .toLowerCase();
}

// Gleiche Normalisierung wie normalizeBusinessProfile in api/lead-track.js, damit
// derselbe Rohwert hier und dort denselben Schluessel ergibt.
function normalizeLookupKey(value) {
  return lowerValue(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function matchProfileByName(value) {
  const haystack = lowerValue(value);
  if (!haystack) return '';

  for (const slug of PROFILE_SLUGS) {
    for (const fragment of PROFILE_NAME_FRAGMENTS[slug]) {
      if (haystack.includes(fragment)) return slug;
    }
  }

  return '';
}

/**
 * Aufloesung eines beliebigen Profil-Rohwerts auf feuer|wind|wasser|fels.
 *
 * Reihenfolge (D-4): Die Namens-Tabelle laeuft ZUERST. Die alte Regex /\b([ABCD])\b/i
 * hat im ungarischen Artikel von "A Kapcsolatteremtő" den Code A gefunden und das
 * Profil auf feuer gezogen, obwohl wind richtig ist. Ein Einzelbuchstabe zaehlt jetzt
 * nur noch, wenn er der GANZE Wert ist ('a', 'B') oder in einer Typ-Form steht
 * ('Typ A', 'Type B', 'A típus'). Freitextnamen gehen ausschliesslich ueber die Tabelle.
 */
function normalizeProfileSlug(value) {
  const named = matchProfileByName(value);
  if (named) return named;

  const key = normalizeLookupKey(value);
  if (key && PROFILE_EXACT_KEYS[key]) return PROFILE_EXACT_KEYS[key];

  return '';
}

/** Derselbe Resolver, nur als Buchstaben-Code A|B|C|D (Mail-Labels, Hot-Lead-Gate). */
function normalizeProfileCode(value) {
  const slug = normalizeProfileSlug(value);
  return slug ? PROFILE_CODE_BY_SLUG[slug] : '';
}

function normalizeAspirationKey(value) {
  return ASPIRATION_KEYS[lowerValue(value)] || '';
}

function normalizeInsightsLang(value) {
  const lang = lowerValue(value);
  return COACH_INSIGHTS_LANG_SET.has(lang) ? lang : '';
}

/**
 * @param {object} input
 * @param {string} [input.profileCode]  Roher Code oder Typ-Form ('B', 'Typ B', 'A típus')
 * @param {string} [input.profileLabel] Roher Profilname in irgendeiner der sechs Sprachen
 * @param {string} [input.aspiration]   Rohe Aspiration in irgendeiner der sechs Sprachen
 * @param {string} [input.lang]         Mail-Sprache; unbekannte Werte entfallen ersatzlos
 * @returns {string} vollstaendige URL auf die Schulungsseite
 */
function buildCoachInsightsUrl({ profileCode, profileLabel, aspiration, lang } = {}) {
  const baseUrl = getCoachInsightsBaseUrl();
  const params = [];

  // Der Code steht zuerst, weil er der praezisere Wert ist; der Name traegt aber die
  // Sprachvarianten. Beide Wege enden im selben Resolver.
  const profileSlug = normalizeProfileSlug(profileCode) || normalizeProfileSlug(profileLabel);
  const aspirationSlug = normalizeAspirationKey(aspiration);
  const insightsLang = normalizeInsightsLang(lang);

  if (profileSlug) params.push(`type=${encodeURIComponent(profileSlug)}`);
  if (aspirationSlug) params.push(`goal=${encodeURIComponent(aspirationSlug)}`);
  if (insightsLang) params.push(`lang=${encodeURIComponent(insightsLang)}`);

  if (!params.length) return baseUrl;

  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}${params.join('&')}`;
}

module.exports = {
  COACH_INSIGHTS_LANGS,
  DEFAULT_COACH_INSIGHTS_BASE_URL,
  PROFILE_SLUGS,
  PROFILE_SLUG_BY_CODE,
  buildCoachInsightsUrl,
  getCoachInsightsBaseUrl,
  normalizeAspirationKey,
  normalizeInsightsLang,
  normalizeProfileCode,
  normalizeProfileSlug,
};
