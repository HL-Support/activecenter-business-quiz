const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'contract-test-secret-contract-test-secret';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'contract-test-service-key';
process.env.BRIDGE_KEY = process.env.BRIDGE_KEY || 'contract-test-bridge-key';
process.env.HBA_READ_BRIDGE_URL = process.env.HBA_READ_BRIDGE_URL || 'https://bridge.test/read';

const contracts = require('../lib/bridge-contracts.js');
const handler = require('../../api/bridge.js');
const projectRoot = path.resolve(__dirname, '../..');

async function invoke(body = {}, method = 'POST') {
  const result = { statusCode: 200, body: null, ended: false };
  const req = {
    method,
    body,
    headers: {
      'x-forwarded-for': '127.0.0.1',
      'user-agent': 'business-quiz-contract-test',
    },
  };
  const res = {
    setHeader() {},
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

  await handler(req, res);
  return result;
}

test('every documented bridge action still has a handler branch', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'api/bridge.js'), 'utf8');
  for (const action of Object.keys(contracts)) {
    assert.match(source, new RegExp(`action === ['"]${action}['"]`), `${action} handler missing`);
  }
});

test('frontend bridge actions are documented', () => {
  const files = ['ac-track.js', 'src/ac-track.js', 'src/lib/core.js', 'src/app/bootstrap.js', 'src/app/App.jsx'];
  const discovered = new Set();
  const actionPattern = /action\s*:\s*['"]([a-z0-9_]+)['"]/g;

  for (const relativePath of files) {
    const source = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
    for (const match of source.matchAll(actionPattern)) discovered.add(match[1]);
  }

  for (const action of discovered) {
    assert.ok(contracts[action], `Undocumented frontend bridge action: ${action}`);
  }
});

test('bridge rejects missing action and unsupported methods', async () => {
  assert.equal((await invoke({})).statusCode, 400);
  assert.equal((await invoke({}, 'GET')).statusCode, 405);
  assert.equal((await invoke({}, 'OPTIONS')).statusCode, 204);
});

test('write contracts reject incomplete payloads before any external call', async () => {
  assert.equal((await invoke({ action: 'track_event' })).statusCode, 400);
  assert.equal((await invoke({ action: 'write_analytics', payload: {} })).statusCode, 400);
  assert.equal((await invoke({ action: 'write_analytics_batch', payload: { events: [] } })).statusCode, 400);
  assert.equal((await invoke({ action: 'update_points_result' })).statusCode, 400);
});

test('resume contracts reject incomplete requests deterministically', async () => {
  assert.equal((await invoke({ action: 'generate_resume_token', payload: {} })).statusCode, 400);
  assert.equal((await invoke({ action: 'resolve_resume_token', payload: {} })).statusCode, 400);
  assert.equal((await invoke({ action: 'resolve_resume_key', payload: {} })).statusCode, 400);
});

test('adapter and metric contracts reject invalid input without side effects', async () => {
  assert.equal(
    (await invoke({ action: 'forward_typeform_adapter', adapter_key: 'unknown', payload: {} })).statusCode,
    400
  );
  assert.equal((await invoke({ action: 'get_funnel_metrics', payload: {} })).statusCode, 400);
  assert.equal((await invoke({ action: 'get_resume_metrics', payload: {} })).statusCode, 400);
  assert.equal((await invoke({ action: 'get_completion_metrics', payload: {} })).statusCode, 400);
});

test('incomplete video completion is a safe no-send response', async () => {
  const response = await invoke({
    action: 'notify_all_videos_completed',
    payload: { completed_steps: [1, 2] },
  });
  assert.equal(response.statusCode, 202);
  assert.deepEqual(response.body, {
    success: true,
    email_sent: false,
    reason: 'not_all_videos_completed',
  });
});

test('complete canonical video completion reports honest queued semantics', async () => {
  // Audit 4.7: Der kanonische Zweig erzeugt nur den Outbox-Job. Die Antwort darf keine
  // Zustellung behaupten - email_sent kennt ausschliesslich der Worker/Provider.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new globalThis.Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    const response = await invoke({
      action: 'notify_all_videos_completed',
      payload: { lead_hash: 'qz_contracttestlead0001', completed_steps: [1, 2, 3], lang: 'de' },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.queued, true);
    assert.equal(response.body.email_sent, false);
    assert.equal(response.body.reason, 'canonical_outbox_handles_hot_lead');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('lookup_subdomain falls back from a contact id to its coach Herbalife id', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    if (body.action === 'lookup_subdomain') {
      return new globalThis.Response(JSON.stringify({ found: false }), { status: 200 });
    }
    if (body.action === 'read_table' && body.table === 'contacts') {
      return new globalThis.Response(JSON.stringify({ ok: true, data: [{ id: 4677, coach_id: 42 }] }), { status: 200 });
    }
    if (body.action === 'read_table' && body.table === 'users') {
      return new globalThis.Response(JSON.stringify({ ok: true, data: [{ id: 42, herbalife_id: '25851739', first_name: 'Markus' }] }), { status: 200 });
    }
    throw new Error(`Unexpected bridge request: ${JSON.stringify(body)}`);
  };

  try {
    const response = await invoke({ action: 'lookup_subdomain', subdomain: '4677' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, {
      found: true,
      source: 'contact',
      member_id: '25851739',
      herbalife_id: '25851739',
      ref_id: '4677',
      match: '0',
      id: 42,
      first_name: 'Markus',
      last_name: null,
      full_name: 'Markus',
    });
    assert.equal(calls.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
