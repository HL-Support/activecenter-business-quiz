const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'contract-test-secret-contract-test-secret';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'contract-test-service-key';

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
