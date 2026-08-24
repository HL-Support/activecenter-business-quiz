const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const path = require('node:path');
const Module = require('node:module');

const QUEUE_KEY = 'acLeadEventQueue_v1';
const DEAD_KEY = 'acLeadEventDead_v1';
const OK_RESPONSE = { status: 200, body: { success: true, enabled: true } };
// Groesster Backoff-Schritt der Queue: reicht immer aus, um den naechsten Versuch faellig zu machen.
const MAX_BACKOFF_STEP = 300000;

let cachedModule = null;

function loadQueueModule() {
  if (cachedModule) return cachedModule;

  const filePath = path.resolve(__dirname, '../../src/lib/lead-event-queue.js');
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
  cachedModule = loaded.exports;
  return cachedModule;
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function toResponse(spec) {
  if (spec.pending) return new Promise(() => {});
  if (spec.throws) return Promise.reject(new Error(spec.throws));
  const status = Number(spec.status);
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => (spec.body === undefined ? {} : spec.body),
  });
}

function createEnv(options = {}) {
  const { createLeadEventQueue } = loadQueueModule();
  const state = {
    storage: options.storage || memoryStorage(),
    clock: options.startClock || 1735689600000,
    responses: options.responses || [OK_RESPONSE],
    fetchCalls: [],
    timers: [],
    diagnostics: [],
  };

  state.readQueueRaw = () => JSON.parse(state.storage.getItem(QUEUE_KEY) || '[]');
  state.readDeadRaw = () => JSON.parse(state.storage.getItem(DEAD_KEY) || '[]');

  state.queue = createLeadEventQueue({
    storage: state.storage,
    fetchFn: (url, init) => {
      state.fetchCalls.push({
        url,
        init,
        body: JSON.parse(init.body),
        queueSnapshot: state.storage.getItem(QUEUE_KEY),
      });
      const spec =
        state.responses.length > 1 ? state.responses.shift() : state.responses[0] || OK_RESPONSE;
      return toResponse(spec);
    },
    now: () => state.clock,
    random: () => 0.5,
    setTimeoutFn: (fn, ms) => state.timers.push({ fn, ms }),
    onDiagnostic: (code, detail) => state.diagnostics.push({ code, detail }),
  });

  return state;
}

function enqueueEvent(env, eventName, extra = {}) {
  return env.queue.enqueue({
    uid: extra.uid || `evtq_${eventName}_${env.fetchCalls.length}_${env.queue.size()}`,
    leadHash: extra.leadHash || 'qz_1234567890abcdef',
    eventName,
    payload: extra.payload || { video_step: 1 },
  });
}

function diagnosticCodes(env) {
  return env.diagnostics.map((entry) => entry.code);
}

test('enqueue persists the event before any network attempt starts', async () => {
  const env = createEnv({ responses: [OK_RESPONSE] });

  assert.equal(env.fetchCalls.length, 0);
  const entry = enqueueEvent(env, 'cta_clicked', { uid: 'evtq_cta_1' });

  assert.equal(env.fetchCalls.length, 1, 'drain starts inside enqueue');
  const persistedAtFetch = JSON.parse(env.fetchCalls[0].queueSnapshot);
  assert.equal(persistedAtFetch.length, 1);
  assert.equal(persistedAtFetch[0].uid, 'evtq_cta_1');
  assert.equal(persistedAtFetch[0].payload.event_uid, 'evtq_cta_1');
  assert.equal(entry.payload.queued_at, new Date(env.clock).toISOString());
  assert.equal(env.fetchCalls[0].url, '/api/lead-track');
  assert.equal(env.fetchCalls[0].init.keepalive, true);

  await env.queue.drain();
  assert.equal(env.queue.size(), 0);
});

test('a confirmed ack removes exactly that event and keeps FIFO order', async () => {
  const env = createEnv({ responses: [OK_RESPONSE] });

  enqueueEvent(env, 'quiz_answer', { uid: 'evtq_a' });
  enqueueEvent(env, 'video_progress', { uid: 'evtq_b' });
  enqueueEvent(env, 'cta_clicked', { uid: 'evtq_c' });

  await env.queue.drain();

  assert.deepEqual(
    env.fetchCalls.map((call) => call.body.payload.event_uid),
    ['evtq_a', 'evtq_b', 'evtq_c']
  );
  assert.deepEqual(
    env.fetchCalls.map((call) => call.body.event_name),
    ['quiz_answer', 'video_progress', 'cta_clicked']
  );
  assert.equal(env.queue.size(), 0);
  assert.equal(env.storage.getItem(QUEUE_KEY), null);
});

test('a 500 schedules a backoff retry and reuses the identical event_uid', async () => {
  const env = createEnv({
    responses: [{ status: 500, body: { success: false, error: 'lead_track_failed' } }, OK_RESPONSE],
  });

  enqueueEvent(env, 'form_submitted', { uid: 'evtq_form' });
  await env.queue.drain();

  const pending = env.queue._peekForTests();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].attempts, 1);
  assert.equal(pending[0].next_attempt_at, env.clock + 4000, 'min(300000, 2000*2^1) ohne Jitterdrift');
  assert.equal(env.timers.length, 1);
  assert.equal(env.timers[0].ms, 4000);

  env.clock += 4000;
  await env.queue.drain();

  assert.equal(env.fetchCalls.length, 2);
  assert.equal(env.fetchCalls[0].body.payload.event_uid, env.fetchCalls[1].body.payload.event_uid);
  assert.equal(env.fetchCalls[0].body.payload.queue_attempts, 0);
  assert.equal(env.fetchCalls[1].body.payload.queue_attempts, 1);
  assert.equal(env.queue.size(), 0);
});

test('a network failure survives a reload and is delivered by the next instance', async () => {
  const offline = createEnv({ responses: [{ throws: 'network down' }] });
  enqueueEvent(offline, 'cta_clicked', { uid: 'evtq_reload' });
  await offline.queue.drain();

  assert.equal(offline.queue.size(), 1);
  assert.equal(offline.queue._peekForTests()[0].attempts, 1);
  assert.equal(offline.readDeadRaw().length, 0);

  const reloaded = createEnv({
    storage: offline.storage,
    startClock: offline.clock + 60000,
    responses: [OK_RESPONSE],
  });
  await reloaded.queue.drain();

  assert.equal(reloaded.fetchCalls.length, 1);
  assert.equal(reloaded.fetchCalls[0].body.payload.event_uid, 'evtq_reload');
  assert.equal(reloaded.fetchCalls[0].body.payload.queue_attempts, 1);
  assert.equal(reloaded.queue.size(), 0);
});

test('a 400 goes to the dead letter box and the queue continues with the next event', async () => {
  const env = createEnv({
    responses: [{ status: 400, body: { success: false, error: 'invalid_lead_hash' } }, OK_RESPONSE],
  });

  enqueueEvent(env, 'quiz_answer', { uid: 'evtq_bad' });
  enqueueEvent(env, 'cta_clicked', { uid: 'evtq_good' });
  await env.queue.drain();

  assert.equal(env.fetchCalls.length, 2, 'kein Retry des permanenten Fehlers');
  assert.deepEqual(
    env.fetchCalls.map((call) => call.body.payload.event_uid),
    ['evtq_bad', 'evtq_good']
  );
  const dead = env.readDeadRaw();
  assert.equal(dead.length, 1);
  assert.equal(dead[0].uid, 'evtq_bad');
  assert.equal(dead[0].error, 'http_400');
  assert.equal(dead[0].failed_at, new Date(env.clock).toISOString());
  assert.ok(diagnosticCodes(env).includes('queue_event_dead'));
  assert.equal(env.queue.size(), 0);
});

test('a 202 skipped response counts as an ack', async () => {
  const env = createEnv({
    responses: [{ status: 202, body: { success: true, enabled: false, skipped: true } }],
  });

  enqueueEvent(env, 'video_progress', { uid: 'evtq_skipped' });
  await env.queue.drain();

  assert.equal(env.fetchCalls.length, 1);
  assert.equal(env.queue.size(), 0);
  assert.equal(env.readDeadRaw().length, 0);
});

test('exhausted retries end in the dead letter box after twelve attempts', async () => {
  const env = createEnv({ responses: [{ status: 503, body: { success: false } }] });

  enqueueEvent(env, 'video_progress', { uid: 'evtq_exhausted' });
  for (let round = 0; round < 12; round += 1) {
    await env.queue.drain();
    env.clock += MAX_BACKOFF_STEP;
  }

  assert.equal(env.fetchCalls.length, 12);
  assert.equal(env.queue.size(), 0);
  const dead = env.readDeadRaw();
  assert.equal(dead.length, 1);
  assert.equal(dead[0].uid, 'evtq_exhausted');
  assert.equal(dead[0].error, 'http_503');
  assert.ok(diagnosticCodes(env).includes('queue_retry_exhausted'));
});

test('overflow drops the oldest video progress and never a cta or submission', () => {
  const env = createEnv({ responses: [{ pending: true }] });

  enqueueEvent(env, 'cta_clicked', { uid: 'evtq_cta_first' });
  for (let index = 0; index < 148; index += 1) {
    enqueueEvent(env, 'video_progress', { uid: `evtq_video_${index}` });
  }
  enqueueEvent(env, 'form_submitted', { uid: 'evtq_form' });
  assert.equal(env.queue.size(), 150);

  enqueueEvent(env, 'cta_clicked', { uid: 'evtq_cta_last' });

  const entries = env.queue._peekForTests();
  const uids = entries.map((entry) => entry.uid);
  assert.equal(entries.length, 150);
  assert.ok(uids.includes('evtq_cta_first'));
  assert.ok(uids.includes('evtq_cta_last'));
  assert.ok(uids.includes('evtq_form'));
  assert.ok(!uids.includes('evtq_video_0'), 'aeltester video_progress wird zuerst geopfert');
  assert.equal(entries.filter((entry) => entry.event_name === 'video_progress').length, 147);

  const overflow = env.diagnostics.filter((entry) => entry.code === 'queue_overflow_drop');
  assert.equal(overflow.length, 1);
  assert.equal(overflow[0].detail.event_name, 'video_progress');
  assert.equal(env.fetchCalls.length, 1, 'nur ein Request in flight');
});

test('corrupt storage content resets the queue instead of throwing', async () => {
  const storage = memoryStorage();
  storage.setItem(QUEUE_KEY, '{"broken": ');
  const env = createEnv({ storage, responses: [OK_RESPONSE] });

  assert.equal(env.queue.size(), 0);
  assert.ok(diagnosticCodes(env).includes('queue_corrupt_reset'));

  enqueueEvent(env, 'cta_clicked', { uid: 'evtq_after_reset' });
  await env.queue.drain();

  assert.equal(env.fetchCalls.length, 1);
  assert.equal(env.fetchCalls[0].body.payload.event_uid, 'evtq_after_reset');
  assert.equal(env.queue.size(), 0);
});

test('a parallel drain call never opens a second in-flight request', () => {
  const env = createEnv({ responses: [{ pending: true }] });

  enqueueEvent(env, 'cta_clicked', { uid: 'evtq_inflight' });
  const first = env.queue.drain();
  const second = env.queue.drain();

  assert.strictEqual(second, first);
  assert.equal(env.fetchCalls.length, 1);
  assert.equal(env.queue.size(), 1);
});

test('a storage that stops accepting writes cannot turn the drain into an endless loop', async () => {
  const backing = memoryStorage();
  const state = { frozen: false };
  const frozenStorage = {
    getItem: (key) => backing.getItem(key),
    setItem: (key, value) => {
      if (!state.frozen) backing.setItem(key, value);
    },
    removeItem: (key) => {
      if (!state.frozen) backing.removeItem(key);
    },
  };
  const env = createEnv({ storage: frozenStorage, responses: [OK_RESPONSE] });

  enqueueEvent(env, 'cta_clicked', { uid: 'evtq_stalled' });
  state.frozen = true;
  await env.queue.drain();

  assert.equal(env.fetchCalls.length, 1, 'kein Dauerfeuer trotz nicht wirksamer Loeschung');
  assert.ok(diagnosticCodes(env).includes('queue_write_stalled'));
  assert.equal(env.timers[env.timers.length - 1].ms, 20000, 'naechster Versuch erst nach 20 s');
});

test('a 200 without success:true is treated as transient, not as an ack', async () => {
  const env = createEnv({ responses: [{ status: 200, body: { success: false } }] });

  enqueueEvent(env, 'cta_clicked', { uid: 'evtq_no_ack' });
  await env.queue.drain();

  const pending = env.queue._peekForTests();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].uid, 'evtq_no_ack');
  assert.equal(pending[0].attempts, 1);
  assert.equal(env.readDeadRaw().length, 0);
});
