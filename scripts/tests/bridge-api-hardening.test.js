const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

// Muss VOR dem require stehen: api/bridge.js liest die Supabase-Konfiguration beim Laden.
// Ohne gesetzte SUPABASE_URL wuerde supabaseRequest gar nicht erst fetchen.
process.env.SUPABASE_URL = 'https://bridge-hardening-test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'bridge-hardening-test-service-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'bridge-hardening-test-secret-bridge-test';
process.env.BRIDGE_SERVICE_KEY = process.env.BRIDGE_SERVICE_KEY || 'p0-4-observe-test';
// Der Beobachtungsmodus ist der Default; das Enforcement setzt jeder Test selbst und nimmt
// es im finally wieder zurueck.
delete process.env.BRIDGE_SERVICE_AUTH_ENFORCE;

const handler = require('../../api/bridge.js');

const KNOWN_LEAD_HASH = 'qz_bridgehardeningknown001';
const UNKNOWN_LEAD_HASH = 'qz_bridgehardeningfake0001';
const RESUME_LEAD_HASH = 'qz_bridgehardeningresume01';
const RESUME_SESSION_HASH = 'ac_bridgehardeningresume01';
const SERVICE_KEY_HEADER = { 'x-bridge-service-key': process.env.BRIDGE_SERVICE_KEY };

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

// Resume- und Metrik-Pfade brauchen einen bekannten Lead bzw. einen aufloesbaren
// Resume-Datensatz; alles andere antwortet leer. So laufen die Actions echt durch und der
// Test misst wirklich das Verhalten, nicht nur einen Fruehausstieg.
const RESUME_LEAD_ROW = {
  lead_hash: RESUME_LEAD_HASH,
  email: 'resume@example.com',
  email_normalized: 'resume@example.com',
  first_name: 'Smoke',
  lang: 'de',
  berater_slug: 'markus',
};
const RESUME_TRACKING_ROW = {
  id: 42,
  session_hash: RESUME_SESSION_HASH,
  lead_hash: RESUME_LEAD_HASH,
  form_email: 'resume@example.com',
  funnel: 'quiz',
};

async function withResumeMock(run) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url);
    calls.push({ path, method: options.method || 'GET' });
    const rows = path.includes('lead_state?lead_hash=eq.')
      ? [RESUME_LEAD_ROW]
      : path.includes('tracking_sessions?id=eq.')
        ? [RESUME_TRACKING_ROW]
        : [];
    return new globalThis.Response(JSON.stringify(rows), {
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

function generateResumeTokenBody() {
  return {
    action: 'generate_resume_token',
    payload: {
      sessionHash: RESUME_SESSION_HASH,
      leadHash: RESUME_LEAD_HASH,
      email: 'resume@example.com',
      slug: 'markus',
      context: 'quiz',
      resumeTarget: 'videos',
    },
  };
}

// Spiegelt createResumeKey aus api/bridge.js (base62-Id + 6 Zeichen HMAC): nur mit einem
// echten Schluessel beweist der Regressionstest, dass resolve_resume_key OHNE Header voll
// funktionsfaehig bleibt.
function resumeKeyFor(recordId, secret = process.env.JWT_SECRET) {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let number = BigInt(recordId);
  let encodedId = '';
  if (number === 0n) {
    encodedId = '0';
  } else {
    while (number > 0n) {
      encodedId = alphabet[Number(number % 62n)] + encodedId;
      number /= 62n;
    }
  }
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`resume:${encodedId}`)
    .digest('base64url')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 6);
  return `${encodedId}${signature}`;
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

test('generate_resume_token ohne Service-Key wird verarbeitet und als missing beobachtet', async () => {
  await withResumeMock(async (calls) => {
    const response = await invoke(generateResumeTokenBody());

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.auth_state, 'missing');
    assert.ok(response.body.token, 'das Resume-JWT muss weiterhin entstehen');
    assert.equal(response.body.leadHash, RESUME_LEAD_HASH);
    assert.ok(calls.length > 0, 'der Beobachtungsmodus darf nichts abschneiden');
  });
});

test('generate_resume_token mit korrektem Service-Key meldet auth_state ok', async () => {
  await withResumeMock(async () => {
    const primary = await invoke(generateResumeTokenBody(), { headers: SERVICE_KEY_HEADER });
    assert.equal(primary.statusCode, 200);
    assert.equal(primary.body.auth_state, 'ok');
    assert.ok(primary.body.token);

    // Kompatibilitaetsname: bestehende Server-zu-Server-Aufrufer kennen x-bridge-key.
    const compatibility = await invoke(generateResumeTokenBody(), {
      headers: { 'x-bridge-key': process.env.BRIDGE_SERVICE_KEY },
    });
    assert.equal(compatibility.body.auth_state, 'ok');
  });
});

test('generate_resume_token mit falschem Service-Key ist invalid, laeuft aber weiter', async () => {
  await withResumeMock(async () => {
    const response = await invoke(generateResumeTokenBody(), {
      headers: { 'x-bridge-service-key': 'falscher-key' },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.auth_state, 'invalid');
    assert.ok(response.body.token, 'Beobachtung heisst: nichts wird abgewiesen');
  });
});

test('BRIDGE_SERVICE_AUTH_ENFORCE=1 weist generate_resume_token ohne Key mit 401 ab', async () => {
  process.env.BRIDGE_SERVICE_AUTH_ENFORCE = '1';
  try {
    await withResumeMock(async (calls) => {
      const blocked = await invoke(generateResumeTokenBody());
      assert.equal(blocked.statusCode, 401);
      assert.deepEqual(blocked.body, {
        success: false,
        error: 'service_auth_required',
        auth_state: 'missing',
      });
      assert.equal(calls.length, 0, 'abgewiesene Aufrufe duerfen Supabase nicht beruehren');

      const allowed = await invoke(generateResumeTokenBody(), { headers: SERVICE_KEY_HEADER });
      assert.equal(allowed.statusCode, 200);
      assert.equal(allowed.body.auth_state, 'ok');
      assert.ok(allowed.body.token);
    });
  } finally {
    delete process.env.BRIDGE_SERVICE_AUTH_ENFORCE;
  }
});

test('get_funnel_metrics wird beobachtet und erst mit Enforcement abgewiesen', async () => {
  await withResumeMock(async (calls) => {
    const observed = await invoke({
      action: 'get_funnel_metrics',
      payload: { berater_slug: 'markus' },
    });
    assert.equal(observed.statusCode, 200);
    assert.equal(observed.body.success, true);
    assert.equal(observed.body.auth_state, 'missing');
    assert.equal(observed.body.data.berater_slug, 'markus');
    assert.ok(
      calls.some((call) => call.path.includes('v_funnel_analysis')),
      'die Metrikabfrage muss im Beobachtungsmodus stattfinden'
    );
  });

  process.env.BRIDGE_SERVICE_AUTH_ENFORCE = '1';
  try {
    await withResumeMock(async (calls) => {
      const blocked = await invoke({
        action: 'get_funnel_metrics',
        payload: { berater_slug: 'markus' },
      });
      assert.equal(blocked.statusCode, 401);
      assert.equal(blocked.body.error, 'service_auth_required');
      assert.equal(calls.length, 0);

      const allowed = await invoke(
        { action: 'get_resume_metrics', payload: { berater_slug: 'markus' } },
        { headers: SERVICE_KEY_HEADER }
      );
      assert.equal(allowed.statusCode, 200);
      assert.equal(allowed.body.auth_state, 'ok');
    });
  } finally {
    delete process.env.BRIDGE_SERVICE_AUTH_ENFORCE;
  }
});

test('resolve_resume_key bleibt ohne Header voll funktional - auch mit Enforcement', async () => {
  const key = resumeKeyFor(RESUME_TRACKING_ROW.id);

  await withResumeMock(async () => {
    const response = await invoke({
      action: 'resolve_resume_key',
      payload: { key, resumeTarget: 'videos' },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.leadHash, RESUME_LEAD_HASH);
    assert.equal(response.body.resumeTarget, 'videos');
    assert.equal(
      Object.prototype.hasOwnProperty.call(response.body, 'auth_state'),
      false,
      'oeffentliche Resume-Aufloesung darf kein auth_state-Feld bekommen'
    );
  });

  process.env.BRIDGE_SERVICE_AUTH_ENFORCE = '1';
  try {
    await withResumeMock(async () => {
      const response = await invoke({
        action: 'resolve_resume_key',
        payload: { key, resumeTarget: 'videos' },
      });
      assert.equal(response.statusCode, 200, 'der Einstieg aus der Nurture-Mail darf nie 401 sein');
      assert.equal(response.body.success, true);

      const token = await invoke({ action: 'resolve_resume_token', payload: {} });
      assert.equal(token.statusCode, 400, 'resolve_resume_token bleibt unveraendert oeffentlich');
    });
  } finally {
    delete process.env.BRIDGE_SERVICE_AUTH_ENFORCE;
  }
});
