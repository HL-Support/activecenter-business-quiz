const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

// Muss VOR dem require der Handler stehen: server/lead-system.js liest SUPABASE_URL/-KEY
// beim Laden des Moduls. Die Flag-Fallbacks kommen ebenfalls aus process.env, damit der
// neue Writer im Test aktiv ist (app_config liefert im Mock nichts).
process.env.SUPABASE_URL = 'https://lead-hardening-test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'lead-hardening-test-service-key';
process.env.NEW_LEAD_WRITER_ENABLED = 'true';
process.env.NEW_LEAD_WRITER_PERCENT = '100';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'lead-hardening-test-secret-lead-hardening-test-secret';
delete process.env.LEAD_SESSION_ENFORCE;

const trackHandler = require('../../api/lead-track.js');
const initHandler = require('../../api/lead-init.js');

const LEAD_HASH = 'qz_hardeningtestlead000001';
const OTHER_LEAD_HASH = 'qz_hardeningtestlead000002';

function sessionCookie(leadHash, secret = process.env.JWT_SECRET) {
  return `ac_lead_session=${jwt.sign({ lh: leadHash, v: 1 }, secret, {
    algorithm: 'HS256',
    expiresIn: '90d',
  })}`;
}

function createResponse() {
  const result = { statusCode: 200, body: null, headers: {} };
  const res = {
    setHeader(name, value) {
      result.headers[name] = value;
    },
    getHeader(name) {
      return result.headers[name];
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
      return result;
    },
  };
  return { res, result };
}

// Jeder Supabase-Aufruf wird protokolliert und mit einer leeren Liste beantwortet; nur
// init_lead braucht eine echte Zeile. Damit beweisen die Tests auch, was NICHT passiert.
async function withSupabaseMock(run, { initLeadHash = LEAD_HASH } = {}) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url);
    calls.push({ path, method: options.method || 'GET', body: options.body || null });
    if (path.includes('rpc/init_lead')) {
      return new globalThis.Response(JSON.stringify([{ lead_hash: initLeadHash }]), {
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

async function track(body, headers = {}) {
  const { res, result } = createResponse();
  await trackHandler({ method: 'POST', body, headers }, res);
  return result;
}

function insertedEvents(calls) {
  return calls
    .filter((call) => call.path.includes('lead_events') && call.method === 'POST')
    .map((call) => JSON.parse(call.body));
}

test('erlaubtes Event wird unveraendert verarbeitet', async () => {
  await withSupabaseMock(async (calls) => {
    const response = await track({
      lead_hash: LEAD_HASH,
      event_name: 'page_view',
      payload: { lead_hash: LEAD_HASH, lang: 'de' },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.enabled, true);
    assert.equal(response.body.lead_hash, LEAD_HASH);
    assert.equal(insertedEvents(calls).length, 1);
    assert.equal(insertedEvents(calls)[0].event_name, 'page_view');
  });
});

test('cta_click bleibt erlaubt - normalisiert wird vor der Allowlist', async () => {
  await withSupabaseMock(async (calls) => {
    const response = await track({
      lead_hash: LEAD_HASH,
      event_name: 'cta_click',
      payload: { lead_hash: LEAD_HASH },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(insertedEvents(calls)[0].event_name, 'cta_clicked');
  });
});

test('unbekanntes Event wird mit 400 event_not_allowed abgewiesen - ohne jeden Supabase-Call', async () => {
  await withSupabaseMock(async (calls) => {
    const response = await track({
      lead_hash: LEAD_HASH,
      event_name: 'drop_table_users',
      payload: { lead_hash: LEAD_HASH },
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, {
      success: false,
      error: 'event_not_allowed',
      event_name: 'drop_table_users',
    });
    assert.equal(calls.length, 0);
  });
});

test('video_step wird nur geprueft, wenn er gesetzt ist', async () => {
  await withSupabaseMock(async (calls) => {
    const textStep = await track({
      lead_hash: LEAD_HASH,
      event_name: 'video_progress',
      payload: { lead_hash: LEAD_HASH, video_step: 'abc' },
    });
    assert.equal(textStep.statusCode, 400);
    assert.deepEqual(textStep.body, { success: false, error: 'invalid_video_step' });

    const outOfRange = await track({
      lead_hash: LEAD_HASH,
      event_name: 'video_progress',
      payload: { lead_hash: LEAD_HASH, video_step: 99 },
    });
    assert.equal(outOfRange.statusCode, 400);
    assert.deepEqual(outOfRange.body, { success: false, error: 'invalid_video_step' });

    assert.equal(calls.length, 0, 'ungueltige video_step-Werte duerfen nichts ausloesen');

    const missingStep = await track({
      lead_hash: LEAD_HASH,
      event_name: 'video_viewed',
      payload: { lead_hash: LEAD_HASH },
    });
    assert.equal(missingStep.statusCode, 200);

    const validStep = await track({
      lead_hash: LEAD_HASH,
      event_name: 'video_viewed',
      payload: { lead_hash: LEAD_HASH, video_step: '2' },
    });
    assert.equal(validStep.statusCode, 200);
  });
});

test('ohne Cookie bleibt der session_state none und das Event wird verarbeitet', async () => {
  await withSupabaseMock(async (calls) => {
    const response = await track({
      lead_hash: LEAD_HASH,
      event_name: 'page_view',
      payload: { lead_hash: LEAD_HASH },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.session_state, 'none');
    assert.equal(insertedEvents(calls)[0].payload._session_state, 'none');
  });
});

test('passendes Session-Cookie ergibt match', async () => {
  await withSupabaseMock(async (calls) => {
    const response = await track(
      { lead_hash: LEAD_HASH, event_name: 'page_view', payload: { lead_hash: LEAD_HASH } },
      { cookie: `lead_hash=${LEAD_HASH}; ${sessionCookie(LEAD_HASH)}` }
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.session_state, 'match');
    assert.equal(insertedEvents(calls)[0].payload._session_state, 'match');
  });
});

test('fremdes Session-Cookie ergibt mismatch, wird im Beobachtungsmodus aber verarbeitet', async () => {
  await withSupabaseMock(async (calls) => {
    const response = await track(
      { lead_hash: LEAD_HASH, event_name: 'page_view', payload: { lead_hash: LEAD_HASH } },
      { cookie: sessionCookie(OTHER_LEAD_HASH) }
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.session_state, 'mismatch');
    assert.equal(insertedEvents(calls).length, 1);
    assert.equal(insertedEvents(calls)[0].payload._session_state, 'mismatch');
  });
});

test('fremd signiertes Cookie ist none, kein Fehler - alte Tabs duerfen nicht brechen', async () => {
  await withSupabaseMock(async () => {
    const response = await track(
      { lead_hash: LEAD_HASH, event_name: 'page_view', payload: { lead_hash: LEAD_HASH } },
      { cookie: sessionCookie(LEAD_HASH, 'ein-voellig-anderes-secret-ein-anderes-secret') }
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.session_state, 'none');
  });
});

test('LEAD_SESSION_ENFORCE=1 blockt mismatch mit 401, none bleibt erlaubt', async () => {
  process.env.LEAD_SESSION_ENFORCE = '1';
  try {
    await withSupabaseMock(async (calls) => {
      const mismatch = await track(
        { lead_hash: LEAD_HASH, event_name: 'page_view', payload: { lead_hash: LEAD_HASH } },
        { cookie: sessionCookie(OTHER_LEAD_HASH) }
      );
      assert.equal(mismatch.statusCode, 401);
      assert.deepEqual(mismatch.body, { success: false, error: 'lead_session_mismatch' });
      assert.equal(calls.length, 0);

      const withoutCookie = await track({
        lead_hash: LEAD_HASH,
        event_name: 'page_view',
        payload: { lead_hash: LEAD_HASH },
      });
      assert.equal(withoutCookie.statusCode, 200);
      assert.equal(withoutCookie.body.session_state, 'none');
    });
  } finally {
    delete process.env.LEAD_SESSION_ENFORCE;
  }
});

test('lead-init setzt zusaetzlich ein signiertes Session-Cookie, ohne lead_hash zu verdraengen', async () => {
  await withSupabaseMock(async () => {
    const { res, result } = createResponse();
    await initHandler(
      {
        method: 'POST',
        headers: {},
        body: { client_seed: '2f1e3d4c-5b6a-4789-8abc-1122334455aa' },
      },
      res
    );

    assert.equal(result.statusCode, 200);
    assert.equal(result.body.lead_hash, LEAD_HASH);

    const cookies = result.headers['Set-Cookie'];
    assert.ok(Array.isArray(cookies), 'Set-Cookie muss eine Liste sein');
    assert.equal(cookies.length, 2);
    assert.ok(cookies.some((cookie) => cookie.startsWith(`lead_hash=${LEAD_HASH}`)));

    const sessionEntry = cookies.find((cookie) => cookie.startsWith('ac_lead_session='));
    assert.ok(sessionEntry, 'ac_lead_session fehlt');
    assert.match(sessionEntry, /HttpOnly/);
    assert.match(sessionEntry, /Secure/);
    assert.match(sessionEntry, /SameSite=Lax/);
    assert.match(sessionEntry, /Path=\//);
    assert.match(sessionEntry, /Max-Age=7776000/);

    const token = sessionEntry.slice('ac_lead_session='.length).split(';')[0];
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    assert.equal(decoded.lh, LEAD_HASH);
    assert.equal(decoded.v, 1);
    assert.ok(decoded.exp > decoded.iat);
  });
});

// P0-4: handleOptions setzte fuer alle lead-Routen ein pauschales '*'. Jetzt gilt dieselbe
// Allowlist wie in der Bridge - der Handler wird direkt mit Fake-req/res geprueft.
async function options(headers = {}) {
  const { res, result } = createResponse();
  await trackHandler({ method: 'OPTIONS', body: {}, headers }, res);
  return result;
}

test('OPTIONS auf lead-track spiegelt nur erlaubte Origins und setzt immer Vary', async () => {
  for (const origin of [
    'https://business.activecenter.info',
    'https://quiz.activecenter.info',
    'https://business.eaglesfit.ch',
    'https://businessleadsquiz.vercel.app',
    'https://business-leads-quiz-abc123-markus-oberhofers-projects.vercel.app',
    // Legacy-Resume-Landeseite: loest Resume-Links per Browser-fetch auf. Ohne diese beiden
    // Origins waeren Links aus aelteren Mails dorthin still unerreichbar (Regression 24.08.).
    'https://global-sce.com',
    'https://www.global-sce.com',
  ]) {
    const response = await options({ origin });
    assert.equal(response.statusCode, 204);
    assert.equal(response.headers['Access-Control-Allow-Origin'], origin);
    assert.equal(response.headers.Vary, 'Origin');
  }
});

test('OPTIONS auf lead-track spiegelt fremde Origins nicht mehr', async () => {
  for (const origin of [
    'https://evil.example',
    'http://business.activecenter.info',
    'https://business.activecenter.info.evil.example',
    'https://fremdes-projekt.vercel.app',
    'https://global-sce.com.evil.example',
    'http://global-sce.com',
    'https://evil.example/-markus-oberhofers-projects.vercel.app',
  ]) {
    const response = await options({ origin });
    assert.equal(response.statusCode, 204);
    assert.equal(
      response.headers['Access-Control-Allow-Origin'],
      undefined,
      `${origin} darf nicht gespiegelt werden`
    );
    assert.equal(response.headers.Vary, 'Origin');
  }
});

test('OPTIONS ohne Origin bekommt keinen ACAO-Header, der POST-Pfad bleibt unberuehrt', async () => {
  const preflight = await options();
  assert.equal(preflight.statusCode, 204);
  assert.equal(preflight.headers['Access-Control-Allow-Origin'], undefined);
  assert.equal(preflight.headers.Vary, 'Origin');
  assert.equal(preflight.headers['Access-Control-Allow-Methods'], 'GET, POST, OPTIONS');

  await withSupabaseMock(async () => {
    const response = await track({
      lead_hash: LEAD_HASH,
      event_name: 'page_view',
      payload: { lead_hash: LEAD_HASH },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['Access-Control-Allow-Origin'], undefined);
    assert.equal(response.headers.Vary, 'Origin');
  });
});

test('ohne JWT_SECRET faellt nur das Session-Cookie weg, der Funnel laeuft weiter', async () => {
  const secret = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  try {
    await withSupabaseMock(async () => {
      const { res, result } = createResponse();
      await initHandler(
        {
          method: 'POST',
          headers: {},
          body: { client_seed: '2f1e3d4c-5b6a-4789-8abc-1122334455bb' },
        },
        res
      );

      assert.equal(result.statusCode, 200);
      const cookies = result.headers['Set-Cookie'];
      assert.equal(typeof cookies, 'string');
      assert.ok(cookies.startsWith(`lead_hash=${LEAD_HASH}`));
    });
  } finally {
    process.env.JWT_SECRET = secret;
  }
});
