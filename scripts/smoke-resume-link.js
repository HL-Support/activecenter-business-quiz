const assert = require('assert');

const baseUrl = (process.env.RESUME_SMOKE_BASE_URL || 'https://business.activecenter.info').replace(/\/$/, '');
const email = process.env.RESUME_SMOKE_EMAIL || 'preview-smoke@example.com';
const slug = process.env.RESUME_SMOKE_SLUG || 'markus';
const memberId = process.env.RESUME_SMOKE_MEMBER_ID || '24';
const organisationId = process.env.RESUME_SMOKE_ORGANISATION_ID || '2';
const TRANSIENT_HTTP_STATUSES = new Set([502, 503, 504]);
// P0-4: generate_resume_token laeuft im Auth-Beobachtungsmodus. Ohne konfigurierten Key
// aendert sich nichts (der Aufruf bleibt gruen, die Bridge protokolliert nur auth_state);
// sobald BRIDGE_SERVICE_AUTH_ENFORCE=1 gesetzt wird, braucht dieser Smoke den Key als
// GitHub-Secret. Der Header geht nur mit, wenn ein Wert existiert - ein leerer Header-Wert
// waere gegenueber Edge/WAF-Schichten unnoetiges Risiko und bedeutet ohnehin 'missing'.
const SERVICE_AUTH_KEY = process.env.BRIDGE_SERVICE_KEY || process.env.BRIDGE_KEY || '';

function bridgeHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(SERVICE_AUTH_KEY ? { 'x-bridge-service-key': SERVICE_AUTH_KEY } : {}),
  };
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function postBridge(payload, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/bridge`, {
        method: 'POST',
        headers: bridgeHeaders(),
        body: JSON.stringify(payload),
      });

      const text = await response.text();
      let data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }

      if (response.ok) return data;
      const error = new Error(`Bridge HTTP ${response.status}: ${JSON.stringify(data)}`);
      if (!TRANSIENT_HTTP_STATUSES.has(response.status) || attempt === attempts) throw error;
      lastError = error;
    } catch (error) {
      lastError = error;
      const statusMatch = String(error.message || '').match(/^Bridge HTTP (\d+):/);
      if (statusMatch && !TRANSIENT_HTTP_STATUSES.has(Number(statusMatch[1]))) throw error;
      if (attempt === attempts) throw error;
    }
    await wait(1000 * attempt);
  }
  throw lastError;
}

async function main() {
  const sessionHash = process.env.RESUME_SMOKE_SESSION_HASH || 'smoke_resume_contract';
  const leadHash = process.env.RESUME_SMOKE_LEAD_HASH || 'qz_smoke_resume_contract';

  const generated = await postBridge({
    action: 'generate_resume_token',
    payload: {
      sessionHash,
      email,
      leadHash,
      slug,
      context: 'quiz',
      resumeTarget: 'videos',
      contact: {
        leadHash,
        email,
        firstName: 'Smoke',
        lang: 'de',
        memberId,
        organisationId,
      },
    },
  });

  assert.strictEqual(generated.success, true, 'generate_resume_token must succeed');
  assert.strictEqual(generated.resumeTarget, 'videos', 'generated resumeTarget must be videos');
  assert.ok(Number(generated.lastVideoStep) >= 1, 'generated lastVideoStep must be >= 1');

  const resumeUrl = generated.shortUrl || generated.resumeUrl || '';
  assert.ok(resumeUrl.includes('target=videos'), 'resume URL must include target=videos');

  const parsedUrl = new URL(resumeUrl);
  const key = parsedUrl.searchParams.get('r');
  assert.ok(key, 'resume URL must include a short resume key');

  const resolved = await postBridge({
    action: 'resolve_resume_key',
    payload: {
      key,
      resumeTarget: 'videos',
    },
  });

  assert.strictEqual(resolved.success, true, 'resolve_resume_key must succeed');
  assert.strictEqual(resolved.resumeTarget, 'videos', 'resolved resumeTarget must be videos');
  assert.ok(Number(resolved.lastVideoStep) >= 1, 'resolved lastVideoStep must be >= 1');

  await postBridge({
    action: 'write_analytics',
    payload: {
      hash: leadHash,
      lead_hash: leadHash,
      session_hash: sessionHash,
      event_id: `smoke_test_lead_marked_${leadHash}`,
      event_name: 'test_lead_marked',
      event_at: new Date().toISOString(),
      member_id: memberId,
      ref_id: memberId,
      berater_slug: slug,
      source_app: 'business_leads_quiz_smoke',
      funnel_key: 'business',
      organisation_id: organisationId,
      reason: 'resume_smoke_test',
    },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        resumeTarget: resolved.resumeTarget,
        lastVideoStep: resolved.lastVideoStep,
        shortUrlHasTarget: resumeUrl.includes('target=videos'),
        testLeadMarked: true,
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
