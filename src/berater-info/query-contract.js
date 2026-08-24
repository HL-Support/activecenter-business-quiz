/**
 * Query-Vertrag der Schulungsseite /berater-info.
 *
 * Bewusst frei von React und DOM: Der Vertrag ist damit direkt testbar
 * (scripts/tests/berater-info-contract.test.js) und die Komponente enthaelt keine
 * zweite, abweichende Parser-Kopie.
 *
 * Der Vertrag stammt 1:1 aus business-schulung/pages/index.jsx (Inventur 2026-08-24,
 * Abschnitt 2). Zwei Stellen sind bewusst ERWEITERT, nie verengt:
 *  - D-6: Die Alias-Tabellen fuehren jetzt alle sechs Quiz-Sprachen (liberte, securite,
 *         die hu/fr/ru-Profilnamen). Kein bisher gueltiger Wert faellt weg.
 *  - D-7: Ein 'goal' ohne 'type' wird nicht mehr verworfen, sondern fuer alle vier
 *         Profile vorgemerkt. Die Seite oeffnet den Profil-Tab mit dem Default-Profil
 *         'feuer' und dem gewaehlten Ziel.
 */

export const PROFILE_IDS = ['feuer', 'wind', 'wasser', 'fels'];
export const ASPIRATION_IDS = ['freiheit', 'wirkung', 'sicherheit', 'wachstum'];
export const SUPPORTED_LANGS = ['de', 'it', 'en', 'fr', 'ru', 'hu'];

export const DEFAULT_PROFILE = 'feuer';
export const DEFAULT_ASPIRATION = 'freiheit';
export const DEFAULT_SECTION = 'grundlage';
export const DEFAULT_LANG = 'de';

// Parameternamen. 'type' behaelt die Prioritaet; 'profil' ist ein additiver Alias.
const PROFILE_PARAM_NAMES = ['type', 'profil'];
const ASPIRATION_PARAM_NAMES = ['goal', 'asp', 'aspiration'];
const LANG_PARAM_NAMES = ['lang', 'l'];

export const PROFILE_QUERY_ALIASES = {
  // Bestand aus pages/index.jsx
  feuer: 'feuer',
  fire: 'feuer',
  macher: 'feuer',
  driver: 'feuer',
  wind: 'wind',
  netzwerker: 'wind',
  connector: 'wind',
  wasser: 'wasser',
  water: 'wasser',
  anker: 'wasser',
  anchor: 'wasser',
  supporter: 'wasser',
  fels: 'fels',
  rock: 'fels',
  stone: 'fels',
  architekt: 'fels',
  architect: 'fels',
  // D-6/D-5: die restlichen Quiz-Sprachen. Kyrillisch entfaellt hier bewusst, weil
  // normalizeQueryKey nicht-lateinische Zeichen ohnehin auf '' reduziert.
  doer: 'feuer',
  realizzatore: 'feuer',
  faiseur: 'feuer',
  cselekvo: 'feuer',
  connettore: 'wind',
  connecteur: 'wind',
  kapcsolatteremto: 'wind',
  ancora: 'wasser',
  ancre: 'wasser',
  tamasz: 'wasser',
  architetto: 'fels',
  architecte: 'fels',
  epito: 'fels',
};

export const ASPIRATION_QUERY_ALIASES = {
  // Bestand aus pages/index.jsx
  freiheit: 'freiheit',
  freedom: 'freiheit',
  liberta: 'freiheit',
  liberty: 'freiheit',
  wirkung: 'wirkung',
  impact: 'wirkung',
  impatto: 'wirkung',
  sicherheit: 'sicherheit',
  security: 'sicherheit',
  sicurezza: 'sicherheit',
  croissance: 'wachstum',
  growth: 'wachstum',
  wachstum: 'wachstum',
  crescita: 'wachstum',
  // D-6: die Formen, die der NFD-Strip erzeugt, und die ungarischen Ziele.
  liberte: 'freiheit',
  szabadsag: 'freiheit',
  hatas: 'wirkung',
  securite: 'sicherheit',
  biztonsag: 'sicherheit',
  novekedes: 'wachstum',
};

export function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

export function normalizeQueryKey(value) {
  return String(firstQueryValue(value) || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]/g, '');
}

export function normalizeProfileParam(value) {
  return PROFILE_QUERY_ALIASES[normalizeQueryKey(value)] || '';
}

export function normalizeAspirationParam(value) {
  return ASPIRATION_QUERY_ALIASES[normalizeQueryKey(value)] || '';
}

// Die Sprache wird - wie im Original - NUR klein geschrieben, ohne NFD-Strip und ohne
// Region-Kuerzung. 'de-DE' faellt damit weiterhin in die Fallback-Kette.
export function normalizeLangParam(value) {
  const lang = String(firstQueryValue(value) || '')
    .trim()
    .toLowerCase();
  return SUPPORTED_LANGS.includes(lang) ? lang : '';
}

function readFirst(params, names) {
  for (const name of names) {
    const value = params.get(name);
    if (value !== null && value !== undefined && String(value).length > 0) return value;
  }
  return '';
}

/**
 * @param {string|URLSearchParams} search  z. B. '?type=wind&goal=growth&lang=hu'
 * @returns {{
 *   profile: string, aspiration: string, lang: string,
 *   activeProfile: string, aspirationByProfile: Record<string,string>,
 *   openSection: string, goalWithoutProfile: boolean
 * }}
 */
export function resolveBeraterInfoState(search) {
  const params =
    search instanceof URLSearchParams ? search : new URLSearchParams(String(search || ''));

  const profile = normalizeProfileParam(readFirst(params, PROFILE_PARAM_NAMES));
  const aspiration = normalizeAspirationParam(readFirst(params, ASPIRATION_PARAM_NAMES));
  const lang = normalizeLangParam(readFirst(params, LANG_PARAM_NAMES));

  const aspirationByProfile = {};
  if (aspiration) {
    if (profile) {
      aspirationByProfile[profile] = aspiration;
    } else {
      // D-7: Ohne Profil gilt das Ziel fuer jedes Profil. Der Coach landet damit auf
      // einem Gespraechsleitfaden statt auf dem Grundlagen-Tab.
      for (const id of PROFILE_IDS) aspirationByProfile[id] = aspiration;
    }
  }

  return {
    profile,
    aspiration,
    lang,
    activeProfile: profile || DEFAULT_PROFILE,
    aspirationByProfile,
    openSection: profile || aspiration ? 'profile' : DEFAULT_SECTION,
    goalWithoutProfile: Boolean(aspiration) && !profile,
  };
}
