'use strict';

/**
 * A/B-Test optin_phone_v1 — Vertragstests.
 *
 * Was diese Datei bewacht:
 *   1. Der Schalter wird AUS ausgeliefert. Solange er aus ist, gibt es keine
 *      Variante — auch nicht fuer Anzeigen-Traffic mit vorhandenem Lead-Run.
 *   2. Nur Anzeigen-Traffic nimmt teil: utm_medium paid_social/paid, die
 *      bekannten Meta-Quellen, und der fbclid-Rueckfall. Organik nie.
 *   3. Die Zuteilung ist deterministisch und teilt einen realistisch geformten
 *      Hash-Korpus in beide Varianten, nahe 50/50.
 *   4. Ohne Experiment-Extras ist der Submit weiterhin frei von jedem
 *      Experiment-Schluessel — im Adapter-Payload UND im form_submitted-Event.
 *      Das ist der Beweis, dass der schlafende Zweig nichts veraendert.
 *   5. Mit Variante B reiten phone/experiment_* auf den bestehenden Wegen mit,
 *      inklusive phone_provided '1'/'0' und getrimmter Nummer.
 *
 * Die Tests zu (1) sind bewusst zustandsabhaengig formuliert: nach dem
 * Aktivierungs-Commit (enabled: true) pruefen dieselben Tests automatisch die
 * Verdrahtung der eingeschalteten Zuteilung, statt rot zu werden.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const esbuild = require('esbuild');
const path = require('node:path');
const Module = require('node:module');

const CORE_PATH = path.resolve(__dirname, '../../src/lib/core.js');
const SLUG = 'markus';
const LEAD_HASH = 'qz_probehash1234567890abcdef';

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

// Jeder Aufruf baut eine frische Browser-Attrappe und ein frisches Modul:
// Attribution, Lead-Run und der In-Flight-Merker der Submission starten leer.
function loadCore({ search = '', fetchImpl = null } = {}) {
  const noop = () => {};
  const listeners = new Map();
  globalThis.localStorage = memoryStorage();
  globalThis.window = {
    location: {
      pathname: `/${SLUG}`,
      search,
      href: `https://business.activecenter.info/${SLUG}${search}`,
    },
    TRANSLATIONS: { de: {} },
    dispatchEvent: noop,
    // Handler merken: der Test spielt spaeter den online-Anstoss der Queue nach,
    // den im Browser der naechste Sichtbarkeits-/Online-Wechsel liefert.
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
  if (fetchImpl) globalThis.fetch = fetchImpl;

  const loaded = new Module(CORE_PATH, module);
  loaded.filename = CORE_PATH;
  loaded.paths = Module._nodeModulePaths(path.dirname(CORE_PATH));
  loaded._compile(bundleCore(), CORE_PATH);
  return loaded.exports;
}

// Fixiert Lead-Run und Lead-System-v2-Zustand, damit die Submission den
// form_submitted-Weg nimmt und der Hash bekannt ist.
function seedLeadState(core) {
  core.storage.setItem('acMemberId', '25851739');
  core.storage.setItem(
    `acLeadRun:${SLUG}`,
    JSON.stringify({
      lead_hash: LEAD_HASH,
      client_seed: '11111111-2222-3333-4444-555555555555',
      token: 'tfprobetoken123',
      event_id: 'EVTPROBE123',
      session_hash: 'ac_probesitzung123',
      tracking_hash: 'ac_probesitzung123',
      visitor_id: 'vis_probe123',
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

async function submitWithExtras(extras) {
  const calls = [];
  const core = loadCore({
    search: '?utm_medium=paid_social&utm_source=fb',
    fetchImpl: capturingFetch(calls),
  });
  seedLeadState(core);

  const answers = [
    { type: 'R' },
    { type: 'G' },
    { type: 'B' },
    { aspiration: 'freedom' },
    { aspiration: 'growth' },
    { barrier: 'confidence' },
  ];
  await core.forwardQuizSubmission(
    'anna',
    'anna@example.com',
    answers,
    { code: 'feuer', name: 'Der Macher' },
    'freedom',
    extras
  );
  // Die Queue sendet den allerersten Eintrag erst beim naechsten Anstoss
  // (weiteres Event, online- oder Sichtbarkeitswechsel). Im Browser folgt der
  // sofort — im Test spielen wir den online-Anstoss selbst nach.
  for (let i = 0; i < 10; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    for (const handler of globalThis.window.__testListeners.get('online') || []) handler();
    if (calls.some((c) => c.url === '/api/lead-track')) break;
  }

  const adapter = calls.find(
    (c) => c.url === '/api/bridge' && c.body?.action === 'forward_typeform_adapter'
  );
  const tracked = calls.find(
    (c) => c.url === '/api/lead-track' && c.body?.event_name === 'form_submitted'
  );
  assert.ok(adapter, 'der Adapter-Aufruf an /api/bridge muss stattfinden');
  assert.ok(tracked, 'das form_submitted-Event muss an /api/lead-track gehen');
  return { adapter, tracked };
}

// ---------------------------------------------------------------------------------------
// 1. Der Schalter
// ---------------------------------------------------------------------------------------

test('der Experiment-Zweig wird mit Schalter AUS ausgeliefert — oder bewusst aktiviert', () => {
  const core = loadCore({ search: '?utm_medium=paid_social' });
  assert.equal(core.OPTIN_PHONE_EXPERIMENT.name, 'optin_phone_v1');
  assert.equal(typeof core.OPTIN_PHONE_EXPERIMENT.enabled, 'boolean');
  assert.ok(
    Object.isFrozen(core.OPTIN_PHONE_EXPERIMENT),
    'der Schalter ist eine eingefrorene Konstante, kein Laufzeitzustand'
  );
});

test('Schalterstellung bestimmt die Variante: aus => null, an => deterministische Zuteilung', () => {
  const core = loadCore({ search: '?utm_medium=paid_social&utm_source=fb' });
  seedLeadState(core);
  const variant = core.getOptinExperimentVariant(SLUG);
  if (core.OPTIN_PHONE_EXPERIMENT.enabled) {
    assert.equal(variant, core.optinExperimentVariantFromHash(LEAD_HASH));
  } else {
    assert.equal(variant, null, 'mit Schalter aus gibt es keine Variante — auch nicht fuer Paid');
  }
});

// ---------------------------------------------------------------------------------------
// 2. Wer teilnimmt
// ---------------------------------------------------------------------------------------

test('Anzeigen-Traffic wird erkannt: medium, quelle und der fbclid-Rueckfall', () => {
  assert.equal(loadCore({ search: '?utm_medium=paid_social' }).isPaidLeadAttribution(), true);
  assert.equal(loadCore({ search: '?utm_medium=paid' }).isPaidLeadAttribution(), true);
  assert.equal(loadCore({ search: '?utm_source=ig' }).isPaidLeadAttribution(), true);
  assert.equal(loadCore({ search: '?utm_source=Facebook' }).isPaidLeadAttribution(), true);
  // fbclid ohne utm: getLeadAttribution ergaenzt paid_social/meta — auch das ist Paid.
  assert.equal(loadCore({ search: '?fbclid=abc123' }).isPaidLeadAttribution(), true);
});

test('Organik nimmt nicht teil — auch nicht andere Kanaele', () => {
  assert.equal(loadCore({ search: '' }).isPaidLeadAttribution(), false);
  assert.equal(loadCore({ search: '?utm_medium=email' }).isPaidLeadAttribution(), false);
  assert.equal(
    loadCore({ search: '?utm_source=newsletter&utm_medium=crm' }).isPaidLeadAttribution(),
    false
  );

  const organik = loadCore({ search: '' });
  seedLeadState(organik);
  assert.equal(
    organik.getOptinExperimentVariant(SLUG),
    null,
    'ohne Anzeigen-Attribution nie eine Variante — unabhaengig vom Schalter'
  );
});

// ---------------------------------------------------------------------------------------
// 3. Die Zuteilung
// ---------------------------------------------------------------------------------------

test('die Zuteilung ist deterministisch und leere Hashes bleiben draussen', () => {
  const core = loadCore();
  assert.equal(core.optinExperimentVariantFromHash(''), null);
  assert.equal(core.optinExperimentVariantFromHash(null), null);
  assert.equal(
    core.optinExperimentVariantFromHash(LEAD_HASH),
    core.optinExperimentVariantFromHash(LEAD_HASH),
    'derselbe Hash liefert immer dieselbe Variante'
  );
  assert.ok(['a', 'b'].includes(core.optinExperimentVariantFromHash(LEAD_HASH)));
});

test('ein realistisch geformter Hash-Korpus teilt sich nahe 50/50', () => {
  const core = loadCore();
  const proben = 2000;
  let b = 0;
  for (let i = 0; i < proben; i += 1) {
    // Deterministischer Korpus in der echten Form qz_<24 Hex-Zeichen>.
    const hash = `qz_${crypto.createHash('sha256').update(`optin-phone-probe-${i}`).digest('hex').slice(0, 24)}`;
    const variant = core.optinExperimentVariantFromHash(hash);
    assert.ok(variant === 'a' || variant === 'b');
    if (variant === 'b') b += 1;
  }
  const anteilB = b / proben;
  assert.ok(
    anteilB > 0.45 && anteilB < 0.55,
    `Aufteilung außerhalb 45–55 %: Variante B bekam ${(anteilB * 100).toFixed(1)} %`
  );
});

// ---------------------------------------------------------------------------------------
// 4. Payload-Reinheit ohne Experiment
// ---------------------------------------------------------------------------------------

test('ohne Extras traegt kein Submit-Weg einen Experiment- oder Telefonschluessel', async () => {
  const { adapter, tracked } = await submitWithExtras({});

  const meta = adapter.body.meta || {};
  assert.equal('phone' in meta, false, 'meta.phone darf ohne Eingabe nicht existieren');
  assert.equal('experiment' in meta, false, 'meta.experiment darf ohne Test nicht existieren');

  const payload = tracked.body.payload || {};
  for (const verboten of ['phone', 'experiment_name', 'experiment_variant', 'phone_provided']) {
    assert.equal(
      verboten in payload,
      false,
      `form_submitted darf ohne Test kein Feld "${verboten}" tragen`
    );
  }
});

// ---------------------------------------------------------------------------------------
// 5. Variante B traegt phone und Kennzeichnung auf den bestehenden Wegen
// ---------------------------------------------------------------------------------------

test('mit Variante B und Nummer reiten phone und Kennzeichnung im Payload mit', async () => {
  const { adapter, tracked } = await submitWithExtras({
    variant: 'b',
    phone: '  +49 151 2345678  ',
  });

  const meta = adapter.body.meta || {};
  assert.equal(meta.phone, '+49 151 2345678', 'die Nummer geht getrimmt in den meta-Block');
  assert.deepEqual(meta.experiment, { name: 'optin_phone_v1', variant: 'b' });

  const payload = tracked.body.payload || {};
  assert.equal(payload.phone, '+49 151 2345678');
  assert.equal(payload.experiment_name, 'optin_phone_v1');
  assert.equal(payload.experiment_variant, 'b');
  assert.equal(payload.phone_provided, '1');
});

test('Variante B ohne Nummer kennzeichnet phone_provided 0 und laesst phone weg', async () => {
  const { adapter, tracked } = await submitWithExtras({ variant: 'b' });

  const meta = adapter.body.meta || {};
  assert.equal('phone' in meta, false);
  assert.deepEqual(meta.experiment, { name: 'optin_phone_v1', variant: 'b' });

  const payload = tracked.body.payload || {};
  assert.equal('phone' in payload, false);
  assert.equal(payload.experiment_variant, 'b');
  assert.equal(payload.phone_provided, '0');
});
