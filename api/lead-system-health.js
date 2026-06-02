const crypto = require('crypto');
const { Buffer } = require('buffer');

const {
  getLeadFlags,
  handleOptions,
  safeString,
  sendJson,
  supabaseJson,
  supabaseRequest,
} = require('../server/lead-system');

const WORKER_SECRET = process.env.LEAD_OUTBOX_WORKER_SECRET || process.env.BRIDGE_KEY;
const POSTMARK_SERVER_TOKEN = process.env.POSTMARK_SERVER_TOKEN;
const POSTMARK_FROM = process.env.POSTMARK_FROM || 'Activecenter-Support <mail@mail.hl-support.biz>';
const POSTMARK_MESSAGE_STREAM = process.env.POSTMARK_MESSAGE_STREAM || 'outbound';
const ALERT_EMAIL = process.env.IDENTITY_ALERT_EMAIL || 'markus@global-sce.com';

function getHeader(req, name) {
  const wanted = name.toLowerCase();
  const entry = Object.entries(req.headers || {}).find(([key]) => key.toLowerCase() === wanted);
  return entry ? String(entry[1] || '') : '';
}

function timingSafeEqualText(a, b) {
  const left = Buffer.from(String(a || '').trim());
  const right = Buffer.from(String(b || '').trim());
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function authorize(req) {
  if (!WORKER_SECRET) {
    const error = new Error('worker_secret_not_configured');
    error.status = 500;
    throw error;
  }

  const provided =
    getHeader(req, 'x-lead-worker-secret') ||
    getHeader(req, 'x-bridge-key') ||
    safeString(req.query?.secret, 512);

  if (!provided || !timingSafeEqualText(provided, WORKER_SECRET)) {
    const error = new Error('unauthorized');
    error.status = 401;
    throw error;
  }
}

async function countRows(path) {
  const response = await supabaseRequest(path, {
    headers: {
      Prefer: 'count=exact',
      Range: '0-0',
    },
  });
  const contentRange = response.headers.get('content-range') || '';
  const match = contentRange.match(/\/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

async function getConfig(key) {
  const rows = await supabaseJson(
    `app_config?key=eq.${encodeURIComponent(key)}&select=value,updated_at&limit=1`
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function upsertConfig(key, value) {
  await supabaseRequest(`app_config?on_conflict=key`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      key,
      value,
      updated_at: new Date().toISOString(),
      updated_by: 'lead-system-health',
    }),
  });
}

function alertSignature(issues) {
  return crypto
    .createHash('sha256')
    .update(issues.map((issue) => `${issue.code}:${issue.count ?? ''}`).join('|'))
    .digest('hex');
}

function shouldNotify(previous, signature, now = Date.now()) {
  if (!previous?.value) return true;
  if (previous.value.signature !== signature) return true;
  const lastSentAt = Date.parse(previous.value.sent_at || '');
  return !Number.isFinite(lastSentAt) || now - lastSentAt > 30 * 60 * 1000;
}

async function sendAlertEmail(health) {
  if (!POSTMARK_SERVER_TOKEN || !ALERT_EMAIL) {
    return { ok: false, skipped: true, reason: 'postmark_or_alert_email_missing' };
  }

  const lines = [
    'Business Leads Quiz: Lead-System-Health ist nicht sauber',
    '',
    `Zeitpunkt: ${health.checked_at}`,
    `Status: ${health.ok ? 'ok' : 'unhealthy'}`,
    '',
    'Issues:',
    ...health.issues.map((issue) => `- ${issue.code}: ${issue.message}`),
    '',
    'Counts:',
    ...Object.entries(health.counts).map(([key, value]) => `- ${key}: ${value}`),
  ];

  const response = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': POSTMARK_SERVER_TOKEN,
    },
    body: JSON.stringify({
      From: POSTMARK_FROM,
      To: ALERT_EMAIL,
      Subject: `Lead-System-Health Problem (${health.issues.map((issue) => issue.code).join(', ')})`,
      TextBody: lines.join('\n'),
      HtmlBody: `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap;">${lines
        .join('\n')
        .replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char])}</pre>`,
      MessageStream: POSTMARK_MESSAGE_STREAM,
      Metadata: {
        alert_type: 'lead_system_health',
        issue_count: String(health.issues.length),
      },
    }),
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  return { ok: response.ok, status: response.status, data };
}

async function collectHealth() {
  const flags = await getLeadFlags();
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const counts = {
    lead_state: await countRows('lead_state?select=lead_hash'),
    lead_video_progress: await countRows('lead_video_progress?select=lead_hash'),
    lead_events: await countRows('lead_events?select=event_uid'),
    outbox_pending: await countRows('lead_sync_outbox?status=eq.pending&select=id'),
    outbox_failed_old: await countRows(
      `lead_sync_outbox?status=eq.failed&updated_at=lt.${encodeURIComponent(tenMinutesAgo)}&select=id`
    ),
    outbox_processing_stale: await countRows(
      `lead_sync_outbox?status=eq.processing&locked_at=lt.${encodeURIComponent(tenMinutesAgo)}&select=id`
    ),
    outbox_dead: await countRows('lead_sync_outbox?status=eq.dead&select=id'),
    migration_unresolved_open: await countRows(
      'lead_migration_unresolved?resolved_at=is.null&select=id'
    ),
    recent_leads_1h: await countRows(
      `lead_state?created_at=gte.${encodeURIComponent(oneHourAgo)}&select=lead_hash`
    ),
    recent_events_1h: await countRows(
      `lead_events?created_at=gte.${encodeURIComponent(oneHourAgo)}&select=event_uid`
    ),
  };

  const issues = [];
  if (!flags.new_lead_writer_enabled || flags.new_lead_writer_percent !== 100) {
    issues.push({
      code: 'new_writer_not_full',
      message: `new writer flags are ${JSON.stringify(flags)}`,
    });
  }
  if (!flags.outbox_worker_enabled) {
    issues.push({ code: 'outbox_worker_disabled', message: 'outbox worker flag is disabled' });
  }
  if (counts.outbox_dead > 0) {
    issues.push({
      code: 'outbox_dead_jobs',
      count: counts.outbox_dead,
      message: `${counts.outbox_dead} dead outbox jobs need manual attention`,
    });
  }
  if (counts.outbox_processing_stale > 0) {
    issues.push({
      code: 'outbox_stale_processing',
      count: counts.outbox_processing_stale,
      message: `${counts.outbox_processing_stale} processing jobs are older than 10 minutes`,
    });
  }
  if (counts.outbox_failed_old > 0) {
    issues.push({
      code: 'outbox_old_failed',
      count: counts.outbox_failed_old,
      message: `${counts.outbox_failed_old} failed jobs are older than 10 minutes`,
    });
  }

  return {
    ok: issues.length === 0,
    checked_at: new Date().toISOString(),
    flags,
    counts,
    issues,
  };
}

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  if (!['GET', 'POST'].includes(req.method)) {
    return sendJson(res, 405, { success: false, error: 'method_not_allowed' });
  }

  try {
    authorize(req);
    const health = await collectHealth();
    const wantsNotify =
      req.method === 'POST' &&
      String(req.body?.notify ?? req.query?.notify ?? '').toLowerCase() === 'true';

    if (!health.ok && wantsNotify) {
      const signature = alertSignature(health.issues);
      const previous = await getConfig('lead_system_health_last_alert');
      if (shouldNotify(previous, signature)) {
        const alert = await sendAlertEmail(health);
        await upsertConfig('lead_system_health_last_alert', {
          signature,
          sent_at: new Date().toISOString(),
          ok: alert.ok,
          status: alert.status || null,
          skipped: alert.skipped || false,
          reason: alert.reason || null,
        });
        health.alert = alert;
      } else {
        health.alert = { ok: true, skipped: true, reason: 'deduped_recent_alert' };
      }
    }

    return sendJson(res, health.ok ? 200 : 503, {
      success: health.ok,
      ...health,
    });
  } catch (error) {
    return sendJson(res, error.status || 500, {
      success: false,
      error: 'lead_system_health_failed',
      message: error.message,
    });
  }
};
