const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const path = require('node:path');
const Module = require('node:module');

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  };
}

function loadCore() {
  globalThis.localStorage = memoryStorage();
  globalThis.window = {
    location: { pathname: '/markus', search: '', href: 'https://business.activecenter.info/markus' },
    TRANSLATIONS: { de: {} },
    dispatchEvent() {},
    sessionStorage: memoryStorage(),
  };
  globalThis.document = { cookie: '', referrer: '' };
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

  const filePath = path.resolve(__dirname, '../../src/lib/core.js');
  const build = esbuild.buildSync({
    entryPoints: [filePath],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
  });
  const loaded = new Module(filePath, module);
  loaded.filename = filePath;
  loaded.paths = Module._nodeModulePaths(path.dirname(filePath));
  loaded._compile(build.outputFiles[0].text, filePath);
  return loaded.exports;
}

test('barrier selection keeps the explicit answer and the sixth-answer fallback', () => {
  const core = loadCore();
  assert.equal(core.deriveQuizBarrier([{ type: 'R' }, { barrier: 'confidence' }]), 'confidence');
  assert.equal(
    core.deriveQuizBarrier([{}, {}, {}, {}, {}, { barrier: 'opportunity' }]),
    'opportunity'
  );
  assert.equal(core.deriveQuizBarrier(null), '');
});

test('coach slugs accept only the established public URL format', () => {
  const core = loadCore();
  assert.equal(core.validateSlug('markus'), true);
  assert.equal(core.validateSlug('coach_25-test'), true);
  assert.equal(core.validateSlug('Coach With Spaces'), false);
  assert.equal(core.validateSlug('../admin'), false);
  assert.equal(core.validateSlug('a'.repeat(26)), false);
});

test('video completion storage is isolated by coach and persists completed steps', () => {
  const core = loadCore();
  core.videoProgressStore.setVideoCompleted('markus', 1);
  assert.equal(core.videoProgressStore.isVideoCompleted('markus', 1), true);
  assert.equal(core.videoProgressStore.isVideoCompleted('markus', 2), false);
  assert.equal(core.videoProgressStore.isVideoCompleted('lisa', 1), false);
});

test('video unlock source keeps the 95 percent unique-watch threshold', () => {
  const source = require('node:fs').readFileSync(
    path.resolve(__dirname, '../../src/app/App.jsx'),
    'utf8'
  );
  assert.match(source, /percent >= 95\) unlock\('unique_watch_95'\)/);
  assert.match(source, /required_unique_watched_percent: 95/);
  assert.doesNotMatch(source, /percent >= 75\) unlock/);
});

test('opt-in submission acquires a synchronous lock before starting network work', () => {
  const source = require('node:fs').readFileSync(
    path.resolve(__dirname, '../../src/app/App.jsx'),
    'utf8'
  );
  const guardPosition = source.indexOf('if (submitLock.current || g) return;');
  const lockPosition = source.indexOf('submitLock.current = !0;', guardPosition);
  const mauticPosition = source.indexOf('await Hp({', guardPosition);
  const releasePosition = source.indexOf('submitLock.current = !1;', guardPosition);

  assert.ok(guardPosition >= 0);
  assert.ok(lockPosition > guardPosition);
  assert.ok(mauticPosition > lockPosition);
  assert.ok(releasePosition > mauticPosition);
});

test('canonical quiz submission reuses one in-flight promise', () => {
  const source = require('node:fs').readFileSync(
    path.resolve(__dirname, '../../src/lib/core.js'),
    'utf8'
  );

  assert.match(source, /let quizSubmissionInFlight = null;/);
  assert.match(source, /if \(quizSubmissionInFlight\) return quizSubmissionInFlight;/);
  assert.match(source, /if \(quizSubmissionInFlight === submission\) quizSubmissionInFlight = null;/);
});

test('parallel quiz submissions start only one adapter request', async () => {
  const core = loadCore();
  core.storage.setItem('acMemberId', '123456');
  let adapterRequests = 0;
  let resolveAdapter;
  const adapterResponse = new Promise((resolve) => {
    resolveAdapter = resolve;
  });
  globalThis.fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    if (url === '/api/bridge' && body.action === 'forward_typeform_adapter') {
      adapterRequests += 1;
      return adapterResponse;
    }
    return { ok: true, json: async () => ({ success: true }) };
  };

  const first = core.forwardQuizSubmission('Sandra', 'sandra@example.com', [], null);
  const second = core.forwardQuizSubmission('Sandra', 'sandra@example.com', [], null);

  assert.strictEqual(second, first);
  assert.equal(adapterRequests, 1);

  resolveAdapter({ ok: true, json: async () => ({ success: true }) });
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.deepEqual(secondResult, firstResult);
});
