const assert = require('node:assert/strict');

const baseUrl = (process.env.READONLY_SMOKE_BASE_URL || 'https://business.activecenter.info').replace(/\/$/, '');
const slug = process.env.READONLY_SMOKE_SLUG || 'markus';

async function request(path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  return { response, text };
}

async function main() {
  const page = await request(`/${encodeURIComponent(slug)}`);
  assert.equal(page.response.status, 200, 'public quiz page must load');
  assert.match(page.text, /\/assets\/app\.js/, 'public quiz page must reference the production bundle');

  const options = await request('/api/bridge', { method: 'OPTIONS' });
  assert.equal(options.response.status, 204, 'bridge preflight must remain available');

  const unknown = await request('/api/bridge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: '__readonly_contract_probe__' }),
  });
  assert.equal(unknown.response.status, 400, 'unknown bridge actions must be rejected');
  assert.match(unknown.text, /Unknown action/, 'unknown action response must stay explicit');

  const incompleteCompletion = await request('/api/bridge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'notify_all_videos_completed',
      payload: { completed_steps: [1, 2], smoke_test: true },
    }),
  });
  assert.equal(incompleteCompletion.response.status, 202, 'incomplete video state must not send mail');
  const completionData = JSON.parse(incompleteCompletion.text);
  assert.equal(completionData.email_sent, false, 'read-only smoke must never send email');

  // Audit 2026-08-23, 13.2.1/13.4: Die DB-Init-Route darf niemals erfolgreich antworten.
  // Uebergangsphase (Route noch deployt): 403 ist zulaessig. Nach dem Deploy der Entfernung
  // erzwingt READONLY_SMOKE_STRICT_INIT_ROUTE=1 strikt 404 als Abnahmekriterium.
  const strictInitRouteRemoved = process.env.READONLY_SMOKE_STRICT_INIT_ROUTE === '1';
  const removedInitRoute = await request('/api/init-quiz-db');
  if (strictInitRouteRemoved) {
    assert.equal(
      removedInitRoute.response.status,
      404,
      'removed init-quiz-db route must return 404 in production'
    );
  } else {
    assert.ok(
      [403, 404].includes(removedInitRoute.response.status),
      `init-quiz-db must never answer successfully (got ${removedInitRoute.response.status})`
    );
  }
  assert.doesNotMatch(
    removedInitRoute.text,
    /\/assets\/app\.js/,
    'init-quiz-db must not fall back to the SPA shell'
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        slug,
        emailSent: false,
        initRouteStatus: removedInitRoute.response.status,
        initRouteStrict: strictInitRouteRemoved,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
