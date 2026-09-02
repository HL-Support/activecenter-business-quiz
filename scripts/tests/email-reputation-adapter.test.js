const test = require('node:test');
const assert = require('node:assert/strict');

async function loadHandler() {
  return (await import(`../../api/validate-email.js?test=${Date.now()}-${Math.random()}`)).default;
}

async function loadConfirmationHandler() {
  return (await import(`../../api/confirm-email-correction.js?test=${Date.now()}-${Math.random()}`)).default;
}

function responseRecorder() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

async function invoke(handler, body) {
  const response = responseRecorder();
  await handler({ method: 'POST', body }, response);
  return response;
}

test('Feature-Flag nutzt zentralen Vertrag und bewahrt Legacy-Felder', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  t.after(() => {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  });
  process.env.EMAIL_REPUTATION_ENABLED = 'true';
  process.env.EMAIL_REPUTATION_URL = 'https://reputation.internal';
  process.env.EMAIL_REPUTATION_CONSUMER = 'business_leads_quiz';
  process.env.EMAIL_REPUTATION_SECRET = 'central-secret';
  let call;
  globalThis.fetch = async (url, init) => {
    call = { url, init };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        decision_id: 'decision-1',
        action: 'request_correction',
        public_reason: 'check_email',
        policy_version: 'v1',
        suggested_email: 'christineschuster14@gmail.com',
        internal_reason_codes: ['known_endpoint'],
      }),
    };
  };

  const response = await invoke(await loadHandler(), {
    email: 'christineschuster14@gmail.com.com',
    consumer_ref: 'qz_123',
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.payload, {
    valid: true,
    reason: 'check_email',
    status: 'request_correction',
    sub_status: '',
    action: 'request_correction',
    suggested_email: 'christineschuster14@gmail.com',
    decision_id: 'decision-1',
    policy_version: 'v1',
  });
  assert.equal(call.url, 'https://reputation.internal/v1/intake-decisions');
  assert.equal(call.init.headers.authorization, 'Bearer central-secret');
  assert.equal(call.init.headers['x-consumer-id'], 'business_leads_quiz');
  assert.match(call.init.headers['idempotency-key'], /^quiz-email-/);
  assert.deepEqual(JSON.parse(call.init.body), {
    consumer: 'business_leads_quiz',
    consumer_ref: 'qz_123',
    email: 'christineschuster14@gmail.com.com',
  });
  assert.doesNotMatch(JSON.stringify(response.payload), /known_endpoint/);
});

test('zentraler Ausfall bleibt legacy-kompatibel accept_pending', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  t.after(() => {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  });
  process.env.EMAIL_REPUTATION_ENABLED = 'true';
  process.env.EMAIL_REPUTATION_URL = 'https://reputation.internal';
  process.env.EMAIL_REPUTATION_CONSUMER = 'business_leads_quiz';
  process.env.EMAIL_REPUTATION_SECRET = 'central-secret';
  globalThis.fetch = async () => { throw new Error('offline'); };

  const response = await invoke(await loadHandler(), {
    email: 'lead@example.com',
    consumer_ref: 'qz_123',
  });

  assert.deepEqual(response.payload, {
    valid: true,
    reason: 'accepted_pending',
    status: 'unknown',
    sub_status: '',
    action: 'accept_pending',
    policy_version: 'v1',
  });
});

test('klar kaputte Syntax wird auch bei Provider-Ausfall nicht zugelassen', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  t.after(() => {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  });
  process.env.EMAIL_REPUTATION_ENABLED = 'true';
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error('must not be called'); };

  const response = await invoke(await loadHandler(), {
    email: 'lead@@example.com',
    consumer_ref: 'qz_123',
  });

  assert.equal(calls, 0);
  assert.deepEqual(response.payload, {
    valid: false,
    reason: 'invalid_format',
    status: 'invalid',
    sub_status: '',
    action: 'reject_invalid',
    policy_version: 'v1',
  });
});

test('explizite Korrekturbestaetigung wird serverseitig authentifiziert weitergereicht', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  t.after(() => { globalThis.fetch = originalFetch; process.env = originalEnv; });
  process.env.EMAIL_REPUTATION_ENABLED = 'true';
  process.env.EMAIL_REPUTATION_URL = 'https://reputation.internal';
  process.env.EMAIL_REPUTATION_CONSUMER = 'business_leads_quiz';
  process.env.EMAIL_REPUTATION_SECRET = 'central-secret';
  let call;
  globalThis.fetch = async (url, init) => {
    call = { url, init };
    return { ok: true, status: 200, json: async () => ({
      confirmation: 'suggestion', endpoint_id: 'endpoint-1', policy_version: 'v1',
      internal_event: 'must_not_escape',
    }) };
  };

  const response = await invoke(await loadConfirmationHandler(), {
    consumer_ref: 'qz_123', confirmation: 'suggestion',
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.payload, { success: true, confirmation: 'suggestion', policy_version: 'v1' });
  assert.equal(call.url, 'https://reputation.internal/v1/corrections/confirm');
  assert.equal(call.init.headers.authorization, 'Bearer central-secret');
  assert.match(call.init.headers['idempotency-key'], /^quiz-confirm-/);
  assert.deepEqual(JSON.parse(call.init.body), {
    consumer: 'business_leads_quiz', consumer_ref: 'qz_123', confirmation: 'suggestion',
  });
  assert.doesNotMatch(JSON.stringify(response.payload), /endpoint|internal/);
});

test('Bestaetigungsausfall bleibt retrybar und gibt den Versand nicht frei', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  t.after(() => { globalThis.fetch = originalFetch; process.env = originalEnv; });
  process.env.EMAIL_REPUTATION_ENABLED = 'true';
  process.env.EMAIL_REPUTATION_URL = 'https://reputation.internal';
  process.env.EMAIL_REPUTATION_SECRET = 'central-secret';
  globalThis.fetch = async () => { throw new Error('offline'); };

  const response = await invoke(await loadConfirmationHandler(), {
    consumer_ref: 'qz_123', confirmation: 'original',
  });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.payload, { success: false, error: 'confirmation_pending' });
});
