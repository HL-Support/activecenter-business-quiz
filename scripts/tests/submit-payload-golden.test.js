'use strict';

/**
 * E0a des Maschine/Template-Plans (docs/plans/2026-09-01-frontend-maschine-template.md):
 * Der Golden-Master der Submit-Payloads.
 *
 * Was diese Datei bewacht: Die exakten Request-Ruempfe, die ein Opt-in erzeugt —
 * `/api/bridge forward_typeform_adapter` (inkl. hidden-Block und meta-Block) und
 * das `form_submitted`-Ereignis an `/api/lead-track` — eingefroren als
 * Golden-Datei. Ab Etappe E1 beweist der Vergleich: Die Herausloesung hat die
 * Payloads BYTE-GLEICH gelassen (nach Normalisierung der von Natur aus
 * fluechtigen Felder: Zeitstempel, Queue-Kennungen).
 *
 * Zwei Szenarien:
 *   1. Standard-Optin (kein Experiment) — der Alltagsfall.
 *   2. Variante B mit Telefonnummer — haelt den (schlafenden) A/B-Vertrag fest.
 *
 * Golden aktualisieren (NUR bei bewusster Vertragsaenderung, im PR begruenden):
 *   GOLDEN_AKTUALISIEREN=1 node --test scripts/tests/submit-payload-golden.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const Module = require('node:module');

const CORE_PATH = path.resolve(__dirname, '../../src/lib/core.js');
const GOLDEN_PATH = path.resolve(__dirname, 'muster', 'submit-payloads.golden.json');
const AKTUALISIEREN = process.env.GOLDEN_AKTUALISIEREN === '1';

const SLUG = 'markus';
const LEAD_HASH = 'qz_goldenprobe1234567890abcd';
const SEARCH = '?utm_medium=paid_social&utm_source=fb&utm_campaign=golden';

let bundledSource = null;

function bundleCore() {
  if (bundledSource) return bundledSource;
  const build = esbuild.buildSync({
    entryPoints: [CORE_PATH],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
  });
  bundledSource = build.outputFiles[0].text;
  return bundledSource;
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  };
}

// Frische Browser-Attrappe + frisches Modul je Szenario (wie in
// optin-phone-experiment.test.js — Konsolidierung der Kopien ist E1-Arbeit).
function loadCore({ fetchImpl }) {
  const noop = () => {};
  const listeners = new Map();
  globalThis.localStorage = memoryStorage();
  globalThis.window = {
    location: {
      pathname: `/${SLUG}`,
      search: SEARCH,
      href: `https://business.activecenter.info/${SLUG}${SEARCH}`,
    },
    TRANSLATIONS: { de: {} },
    dispatchEvent: noop,
    addEventListener: (type, handler) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    __testListeners: listeners,
    sessionStorage: memoryStorage(),
  };
  globalThis.document = {
    cookie: '',
    referrer: '',
    addEventListener: noop,
    visibilityState: 'visible',
  };
  Object.defineProperty(globalThis, 'navigator', {
    value: { language: 'de-DE', userAgent: 'node-contract-test' },
    configurable: true,
  });
  globalThis.window.CustomEvent = class CustomEvent {
    constructor(type, options) {
      this.type = type;
      this.detail = options?.detail;
    }
  };
  globalThis.fetch = fetchImpl;

  const loaded = new Module(CORE_PATH, module);
  loaded.filename = CORE_PATH;
  loaded.paths = Module._nodeModulePaths(path.dirname(CORE_PATH));
  loaded._compile(bundleCore(), CORE_PATH);
  return loaded.exports;
}

// Alles Fluechtige deterministisch verankert: Hash, Seed, Token, Sitzung, Besucher.
function seedLeadState(core) {
  core.storage.setItem('acMemberId', '25851739');
  core.storage.setItem('acBeraterSlug', SLUG);
  core.storage.setItem('acVisitorId', 'av_goldenbesucher12345678');
  core.storage.setItem(
    `acLeadRun:${SLUG}`,
    JSON.stringify({
      lead_hash: LEAD_HASH,
      client_seed: '11111111-2222-3333-4444-555555555555',
      token: 'tfgoldentoken1234567890',
      event_id: 'EVTGOLDEN1234567890',
      session_hash: 'ac_goldensitzung1234567890',
      tracking_hash: 'ac_goldensitzung1234567890',
      visitor_id: 'av_goldenbesucher12345678',
      slug: SLUG,
      member_id: '25851739',
      state: 'active',
    })
  );
  core.storage.setItem(
    `acLeadSystemV2:${SLUG}`,
    JSON.stringify({ enabled: true, lead_hash: LEAD_HASH })
  );
}

function capturingFetch(calls) {
  return (url, options = {}) => {
    let body = null;
    try {
      if (options && options.body) body = JSON.parse(options.body);
    } catch {
      body = null;
    }
    calls.push({ url: String(url), body });
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
  };
}

const ISO_ZEIT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const FLUECHTIGE_SCHLUESSEL = new Set(['event_uid', 'queued_at', 'queue_attempts']);

// Ersetzt naturgemaess fluechtige Werte durch stabile Platzhalter; ALLES andere
// bleibt woertlich und wird verglichen.
function normalisiere(value) {
  if (Array.isArray(value)) return value.map((entry) => normalisiere(entry));
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = FLUECHTIGE_SCHLUESSEL.has(key) ? `<${key}>` : normalisiere(value[key]);
    }
    return out;
  }
  if (typeof value === 'string' && ISO_ZEIT.test(value)) return '<zeitstempel>';
  return value;
}

async function fahreSubmission(extras) {
  const calls = [];
  const core = loadCore({ fetchImpl: capturingFetch(calls) });
  seedLeadState(core);

  const answers = [
    { type: 'R', label: 'Antwort R' },
    { type: 'G', label: 'Antwort G' },
    { type: 'B', label: 'Antwort B' },
    { aspiration: 'freedom', label: 'Freiheit' },
    { aspiration: 'growth', label: 'Wachstum' },
    { barrier: 'confidence', label: 'Selbstvertrauen' },
  ];
  const result = await core.forwardQuizSubmission(
    'anna',
    'anna@example.com',
    answers,
    { code: 'feuer', name: 'Der Macher' },
    'freedom',
    extras
  );
  assert.equal(result.success, true, 'die Submission selbst muss durchgehen');

  // Die Queue sendet den allerersten Eintrag erst beim naechsten Anstoss —
  // im Test wird der online-Anstoss nachgespielt (wie im A/B-Vertragstest).
  for (let i = 0; i < 10; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    for (const handler of globalThis.window.__testListeners.get('online') || []) handler();
    if (calls.some((c) => c.url === '/api/lead-track')) break;
  }

  return calls.map((call) => ({ url: call.url, body: normalisiere(call.body) }));
}

// E0b-Ergaenzung: der dritte Submit-Weg — die Zwischenspeicherung bei
// E-Mail-Korrekturvorschlag (persistPendingEmailCorrection, seit dem
// Nurture-Merge auf main). Sie geht DIREKT an /api/lead-track, nicht durch
// die Queue, und traegt den vollstaendigen Quiz-Zustand.
async function fahreEmailKorrektur() {
  const calls = [];
  const core = loadCore({ fetchImpl: capturingFetch(calls) });
  seedLeadState(core);

  const persisted = await core.persistPendingEmailCorrection({
    firstName: 'anna',
    email: 'anna@gmial.com',
    selectedAnswers: [
      { type: 'R', label: 'Antwort R' },
      { type: 'G', label: 'Antwort G' },
      { type: 'B', label: 'Antwort B' },
      { aspiration: 'freedom', label: 'Freiheit' },
      { aspiration: 'growth', label: 'Wachstum' },
      { barrier: 'confidence', label: 'Selbstvertrauen' },
    ],
    profile: { code: 'feuer', name: 'Der Macher' },
    aspiration: 'freedom',
  });
  assert.equal(persisted, true, 'die Zwischenspeicherung muss durchgehen');
  return calls.map((call) => ({ url: call.url, body: normalisiere(call.body) }));
}

async function erzeugeIst() {
  return {
    hinweis:
      'Golden-Master der Submit-Payloads (E0a+E0b). Aktualisierung NUR bewusst: ' +
      'GOLDEN_AKTUALISIEREN=1, Begruendung in den PR.',
    standard_optin: await fahreSubmission({}),
    variante_b_mit_telefon: await fahreSubmission({
      variant: 'b',
      phone: '  +49 151 2345678  ',
    }),
    email_korrektur_zwischenspeicher: await fahreEmailKorrektur(),
  };
}

test('die Submit-Payloads entsprechen dem eingefrorenen Golden-Master', async () => {
  const ist = await erzeugeIst();

  if (AKTUALISIEREN || !fs.existsSync(GOLDEN_PATH)) {
    fs.mkdirSync(path.dirname(GOLDEN_PATH), { recursive: true });
    fs.writeFileSync(GOLDEN_PATH, `${JSON.stringify(ist, null, 2)}\n`, 'utf8');
    assert.ok(true, `Golden-Master geschrieben: ${path.relative(process.cwd(), GOLDEN_PATH)}`);
    return;
  }

  const soll = JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8'));
  assert.deepEqual(
    ist,
    soll,
    'Submit-Payload weicht vom Golden-Master ab — entweder ist die Herausloesung ' +
      'NICHT verhaltensgleich (Fehler beheben), oder es ist eine bewusste ' +
      'Vertragsaenderung (dann GOLDEN_AKTUALISIEREN=1 und im PR begruenden).'
  );
});

test('der Golden-Master haelt die tragenden Vertragsfelder wirklich fest', async () => {
  // Schutz gegen ein stilles Leer-Golden: die wichtigsten Felder muessen
  // im NORMALISIERTEN Ist nachweisbar vorhanden sein.
  const ist = await erzeugeIst();
  const adapter = ist.standard_optin.find(
    (c) => c.url === '/api/bridge' && c.body?.action === 'forward_typeform_adapter'
  );
  const tracked = ist.standard_optin.find(
    (c) => c.url === '/api/lead-track' && c.body?.event_name === 'form_submitted'
  );
  assert.ok(adapter, 'Adapter-Aufruf fehlt');
  assert.ok(tracked, 'form_submitted fehlt');

  const hidden = adapter.body.payload.hidden;
  for (const feld of [
    'lead_hash',
    'session_hash',
    'tracking_hash',
    'client_seed',
    'visitor_id',
    'main_aspiration',
    'berater_slug',
    'member_id',
    'survey_id',
  ]) {
    assert.ok(feld in hidden, `hidden.${feld} fehlt im Adapter-Payload`);
  }
  assert.equal(hidden.lead_hash, LEAD_HASH);
  assert.equal(adapter.body.meta.metaEventId, `capi_${LEAD_HASH}`);
  assert.equal(tracked.body.payload.initial_barrier, 'confidence');
  assert.equal(tracked.body.payload.is_internal_traffic, false);

  const varianteB = ist.variante_b_mit_telefon.find(
    (c) => c.url === '/api/lead-track' && c.body?.event_name === 'form_submitted'
  );
  assert.equal(varianteB.body.payload.phone, '+49 151 2345678');
  assert.equal(varianteB.body.payload.experiment_variant, 'b');
  assert.equal(varianteB.body.payload.phone_provided, '1');

  const korrektur = ist.email_korrektur_zwischenspeicher.find(
    (c) => c.url === '/api/lead-track' && c.body?.event_name === 'email_correction_pending'
  );
  assert.ok(korrektur, 'email_correction_pending fehlt');
  assert.equal(korrektur.body.payload.selected_answers.length, 6);
  assert.equal(korrektur.body.payload.profile_code, 'feuer');
});
