const test = require('node:test');
const assert = require('node:assert/strict');

// Muss VOR dem require stehen: api/bridge.js liest die Supabase-Konfiguration beim Laden.
// Ohne gesetzte SUPABASE_URL wuerde supabaseRequest gar nicht erst fetchen.
process.env.SUPABASE_URL = 'https://bridge-hardening-test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'bridge-hardening-test-service-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'bridge-hardening-test-secret-bridge-test';

const handler = require('../../api/bridge.js');

const KNOWN_LEAD_HASH = 'qz_bridgehardeningknown001';
const UNKNOWN_LEAD_HASH = 'qz_bridgehardeningfake0001';

function invoke(body = {}, { method = 'POST', headers = {} } = {}) {
  const result = { statusCode: 200, body: null, headers: {}, ended: false };
  const req = {
    method,
    body,
    headers: { 'x-forwarded-for': '127.0.0.1', 'user-agent': 'bridge-hardening-test', ...headers },
  };
  const res = {
    setHeader(name, value) {
      result.headers[name] = value;
    },
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(payload) {
      result.body = payload;
      return result;
    },
    end() {
      result.ended = true;
      return result;
    },
  };
  return handler(req, res).then(() => result);
}

// Der Mock beantwortet die lead_state-Existenzpruefung und protokolliert jeden weiteren
// Aufruf - so beweist der Test, dass beim unbekannten Lead nichts geschrieben wird.
async function withLeadStateMock(rows, run) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url);
    calls.push({ path, method: options.method || 'GET' });
    if (path.includes('lead_state?lead_hash=eq.') && !options.method) {
      return new globalThis.Response(JSON.stringify(rows), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new globalThis.Response('[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('notify_all_videos_completed materialisiert keinen unbekannten Lead mehr', async () => {
  await withLeadStateMock([], async (calls) => {
    const response = await invoke({
      action: 'notify_all_videos_completed',
      payload: { lead_hash: UNKNOWN_LEAD_HASH, completed_steps: [1, 2, 3], lang: 'de' },
    });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.body, {
      success: false,
      queued: false,
      email_sent: false,
      error: 'unknown_lead',
    });

    assert.equal(calls.length, 1, 'nach der Existenzpruefung darf nichts mehr passieren');
    assert.ok(calls[0].path.includes('lead_state?lead_hash=eq.'));
    assert.equal(
      calls.some((call) => call.method === 'POST'),
      false,
      'kein lead_state-Insert, kein lead_events-Insert, kein enqueue_lead_sync'
    );
  });
});

test('notify_all_videos_completed bleibt fuer bekannte Leads unveraendert', async () => {
  await withLeadStateMock([{ lead_hash: KNOWN_LEAD_HASH }], async (calls) => {
    const response = await invoke({
      action: 'notify_all_videos_completed',
      payload: { lead_hash: KNOWN_LEAD_HASH, completed_steps: [1, 2, 3], lang: 'de' },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.queued, true);
    assert.equal(response.body.email_sent, false);
    assert.equal(response.body.reason, 'canonical_outbox_handles_hot_lead');
    assert.equal(response.body.lead_hash, KNOWN_LEAD_HASH);
    assert.ok(
      calls.some((call) => call.path.includes('rpc/enqueue_lead_sync')),
      'der Outbox-Job muss weiterhin entstehen'
    );
  });
});

test('unvollstaendige Videoliste wird weiterhin vor jeder Pruefung abgefangen', async () => {
  await withLeadStateMock([], async (calls) => {
    const response = await invoke({
      action: 'notify_all_videos_completed',
      payload: { lead_hash: UNKNOWN_LEAD_HASH, completed_steps: [1, 2] },
    });

    assert.equal(response.statusCode, 202);
    assert.equal(response.body.reason, 'not_all_videos_completed');
    assert.equal(calls.length, 0);
  });
});

test('CORS spiegelt nur erlaubte Origins - Preflight und POST', async () => {
  const preflight = await invoke({}, { method: 'OPTIONS', headers: { origin: 'https://business.activecenter.info' } });
  assert.equal(preflight.statusCode, 204);
  assert.equal(preflight.headers['Access-Control-Allow-Origin'], 'https://business.activecenter.info');
  assert.equal(preflight.headers.Vary, 'Origin');

  const post = await invoke({}, { headers: { origin: 'https://quiz.activecenter.info' } });
  assert.equal(post.statusCode, 400); // fehlende action - der Header zaehlt
  assert.equal(post.headers['Access-Control-Allow-Origin'], 'https://quiz.activecenter.info');

  const eaglesfit = await invoke({}, { headers: { origin: 'https://business.eaglesfit.ch' } });
  assert.equal(eaglesfit.headers['Access-Control-Allow-Origin'], 'https://business.eaglesfit.ch');

  const preview = await invoke(
    {},
    { headers: { origin: 'https://business-leads-quiz-abc123-markus-oberhofers-projects.vercel.app' } }
  );
  assert.equal(
    preview.headers['Access-Control-Allow-Origin'],
    'https://business-leads-quiz-abc123-markus-oberhofers-projects.vercel.app'
  );
});

test('fremde Origins bekommen keinen ACAO-Header', async () => {
  for (const origin of [
    'https://evil.example',
    'http://business.activecenter.info',
    'https://business.activecenter.info.evil.example',
    'https://fremdes-projekt.vercel.app',
    'https://evil.example/-markus-oberhofers-projects.vercel.app',
  ]) {
    const response = await invoke({}, { headers: { origin } });
    assert.equal(
      response.headers['Access-Control-Allow-Origin'],
      undefined,
      `${origin} darf nicht gespiegelt werden`
    );
    assert.equal(response.headers.Vary, 'Origin');
  }

  const preflight = await invoke({}, { method: 'OPTIONS', headers: { origin: 'https://evil.example' } });
  assert.equal(preflight.statusCode, 204);
  assert.equal(preflight.headers['Access-Control-Allow-Origin'], undefined);
});

test('Aufrufe ohne Origin bleiben unberuehrt (same-origin, Server-zu-Server)', async () => {
  const response = await invoke({});
  assert.equal(response.headers['Access-Control-Allow-Origin'], undefined);
  assert.equal(response.headers.Vary, 'Origin');
});
