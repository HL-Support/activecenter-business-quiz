const crypto = require('crypto');
const { Buffer } = require('buffer');

const {
  handleOptions,
  safeString,
  sendJson,
  supabaseJson,
  supabaseRequest,
} = require('../server/lead-system');

const WORKER_SECRET = process.env.LEAD_OUTBOX_WORKER_SECRET || process.env.BRIDGE_KEY;
const POSTMARK_SERVER_TOKEN = process.env.POSTMARK_SERVER_TOKEN;
const POSTMARK_FROM =
  process.env.POSTMARK_FROM || 'Activecenter-Support <mail@mail.hl-support.biz>';
const POSTMARK_MESSAGE_STREAM = process.env.POSTMARK_MESSAGE_STREAM || 'outbound';
const ALERT_EMAIL = process.env.IDENTITY_ALERT_EMAIL || 'markus@global-sce.com';
const HEALTH_READ_TIMEOUT_MS = 5000;
const HEALTH_METRIC_CONCURRENCY = 3;
const HEALTH_ALERT_REMINDER_MS = 4 * 60 * 60 * 1000;
const CRITICAL_AVAILABILITY_METRICS = new Set([
  'lead_state_available',
  'lead_video_progress_available',
  'lead_events_available',
]);
const FLAG_KEYS = [
  'new_lead_writer_enabled',
  'new_lead_writer_percent',
  'legacy_writer_enabled',
  'outbox_worker_enabled',
];

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

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function withRetry(operation, attempts = 3, timeoutMs = HEALTH_READ_TIMEOUT_MS) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await operation(controller.signal);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(250 * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

function parseBooleanFlag(value, key) {
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  if (value === false || value === 0 || value === '0' || value === 'false') return false;
  throw new Error(`invalid_app_config_value:${key}`);
}

function parsePercentFlag(value) {
  const percent = Number(value);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error('invalid_app_config_value:new_lead_writer_percent');
  }
  return Math.floor(percent);
}

async function getLeadFlagsStrict(readConfig = supabaseJson) {
  const rows = await withRetry((signal) =>
    readConfig(
      `app_config?key=in.(${FLAG_KEYS.join(',')})&select=key,value,updated_at,updated_by`,
      { signal }
    )
  );
  const values = new Map((Array.isArray(rows) ? rows : []).map((row) => [row.key, row.value]));
  const missing = FLAG_KEYS.filter((key) => !values.has(key));
  if (missing.length > 0) {
    throw new Error(`missing_app_config_keys:${missing.join(',')}`);
  }
  return {
    new_lead_writer_enabled: parseBooleanFlag(
      values.get('new_lead_writer_enabled'),
      'new_lead_writer_enabled'
    ),
    new_lead_writer_percent: parsePercentFlag(values.get('new_lead_writer_percent')),
    legacy_writer_enabled: parseBooleanFlag(
      values.get('legacy_writer_enabled'),
      'legacy_writer_enabled'
    ),
    outbox_worker_enabled: parseBooleanFlag(
      values.get('outbox_worker_enabled'),
      'outbox_worker_enabled'
    ),
  };
}

async function boundedCount(path, limit = 100, read = supabaseJson) {
  const separator = path.includes('?') ? '&' : '?';
  const rows = await withRetry(
    (signal) => read(`${path}${separator}limit=${limit + 1}`, { signal }),
    3
  );
  if (!Array.isArray(rows)) throw new Error('supabase_count_response_invalid');
  return {
    value: Math.min(rows.length, limit),
    capped: rows.length > limit,
  };
}

async function probe(path) {
  await withRetry(
    (signal) => supabaseRequest(path, { method: 'GET', signal }),
    3
  );
  return 1;
}

async function settleWithConcurrency(entries, concurrency, operation) {
  const results = new Array(entries.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < entries.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = { status: 'fulfilled', value: await operation(entries[index], index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, entries.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function getConfig(key) {
  const rows = await withRetry(
    (signal) =>
      supabaseJson(
        `app_config?key=eq.${encodeURIComponent(key)}&select=value,updated_at&limit=1`,
        { signal }
      ),
    1,
    3000
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function upsertConfig(key, value) {
  await withRetry(
    (signal) =>
      supabaseRequest(`app_config?on_conflict=key`, {
        method: 'POST',
        signal,
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
      }),
    1,
    3000
  );
}

function alertSignature(issues) {
  return crypto
    .createHash('sha256')
    .update(
      issues
        .map((issue) => {
          if (issue.code === 'config_read_failed' || issue.code === 'health_metrics_unavailable') {
            return issue.code;
          }
          return `${issue.code}:${issue.count ?? ''}`;
        })
        .join('|')
    )
    .digest('hex');
}

function shouldNotify(previous, signature, now = Date.now()) {
  if (!previous?.value) return true;
  if (previous.value.signature !== signature) return true;
  const lastSentAt = Date.parse(previous.value.sent_at || '');
  return !Number.isFinite(lastSentAt) || now - lastSentAt > HEALTH_ALERT_REMINDER_MS;
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
    ...Object.entries(health.counts).map(
      ([key, value]) => `- ${key}: ${value}${health.count_caps?.[key] ? '+' : ''}`
    ),
  ];

  const response = await withRetry(
    (signal) =>
      fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        signal,
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
      }),
    1,
    5000
  );

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
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const tenMinutesAgo = new Date(now - 10 * 60 * 1000).toISOString();
  const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  let flags = null;
  const issues = [];
  const warnings = [];
  try {
    flags = await getLeadFlagsStrict();
  } catch (error) {
    issues.push({
      code: 'config_read_failed',
      message: `live app_config could not be read after retries: ${safeString(error.message, 300)}`,
    });
  }

  const metrics = {
    lead_state_available: () => probe('lead_state?select=lead_hash&limit=1'),
    lead_video_progress_available: () =>
      probe('lead_video_progress?select=lead_hash&limit=1'),
    lead_events_available: () => probe('lead_events?select=event_uid&limit=1'),
    outbox_pending: () => boundedCount('lead_sync_outbox?status=eq.pending&select=id'),
    outbox_pending_ready: () =>
      boundedCount(
        `lead_sync_outbox?status=eq.pending&next_attempt_at=lte.${encodeURIComponent(nowIso)}&select=id`
      ),
    outbox_pending_overdue: () =>
      boundedCount(
        `lead_sync_outbox?status=eq.pending&next_attempt_at=lt.${encodeURIComponent(tenMinutesAgo)}&select=id`
      ),
    outbox_pending_deferred: () =>
      boundedCount(
        `lead_sync_outbox?status=eq.pending&next_attempt_at=gt.${encodeURIComponent(nowIso)}&select=id`
      ),
    outbox_failed_old: () =>
      boundedCount(
        `lead_sync_outbox?status=eq.failed&updated_at=lt.${encodeURIComponent(tenMinutesAgo)}&select=id`
      ),
    outbox_processing_stale: () =>
      boundedCount(
        `lead_sync_outbox?status=eq.processing&locked_at=lt.${encodeURIComponent(tenMinutesAgo)}&select=id`
      ),
    outbox_dead: () => boundedCount('lead_sync_outbox?status=eq.dead&select=id'),
    migration_unresolved_open: () =>
      boundedCount('lead_migration_unresolved?resolved_at=is.null&select=id'),
    recent_leads_1h: () =>
      boundedCount(
        `lead_state?created_at=gte.${encodeURIComponent(oneHourAgo)}&select=lead_hash`
      ),
    recent_events_1h: () =>
      boundedCount(
        `lead_events?created_at=gte.${encodeURIComponent(oneHourAgo)}&select=event_uid`
      ),
  };
  const metricEntries = Object.entries(metrics);
  const metricResults = await settleWithConcurrency(
    metricEntries,
    HEALTH_METRIC_CONCURRENCY,
    ([, read]) => read()
  );
  const counts = {};
  const countCaps = {};
  const metricErrors = [];
  metricResults.forEach((result, index) => {
    const key = metricEntries[index][0];
    if (result.status === 'fulfilled') {
      if (result.value && typeof result.value === 'object' && 'value' in result.value) {
        counts[key] = result.value.value;
        countCaps[key] = result.value.capped;
      } else {
        counts[key] = result.value;
      }
    } else {
      counts[key] = null;
      metricErrors.push({
        metric: key,
        message: safeString(result.reason?.message, 300) || 'unknown_read_error',
      });
    }
  });
  counts.recent_leads_1h_available =
    counts.recent_leads_1h === null ? null : counts.recent_leads_1h > 0 ? 1 : 0;
  counts.recent_events_1h_available =
    counts.recent_events_1h === null ? null : counts.recent_events_1h > 0 ? 1 : 0;

  const criticalMetricErrors = metricErrors.filter(({ metric }) =>
    CRITICAL_AVAILABILITY_METRICS.has(metric)
  );
  if (metricErrors.length >= 3 || criticalMetricErrors.length > 0) {
    issues.push({
      code: 'health_metrics_unavailable',
      count: metricErrors.length,
      message: `${metricErrors.length} health metrics could not be read after retries`,
    });
  } else if (metricErrors.length > 0) {
    warnings.push({
      code: 'health_metric_transiently_unavailable',
      count: metricErrors.length,
      message: `${metricErrors.length} non-critical health metric could not be read after retries`,
    });
  }
  if (flags && (!flags.new_lead_writer_enabled || flags.new_lead_writer_percent !== 100)) {
    issues.push({
      code: 'new_writer_not_full',
      message: `new writer flags are ${JSON.stringify(flags)}`,
    });
  }
  if (flags?.legacy_writer_enabled) {
    issues.push({ code: 'legacy_writer_enabled', message: 'legacy writer flag is enabled' });
  }
  if (flags && !flags.outbox_worker_enabled) {
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
  if (counts.outbox_pending_overdue > 0) {
    issues.push({
      code: 'outbox_pending_overdue',
      count: counts.outbox_pending_overdue,
      message: `${counts.outbox_pending_overdue} pending jobs are due for more than 10 minutes`,
    });
  }

  return {
    ok: issues.length === 0,
    checked_at: new Date().toISOString(),
    flags,
    counts,
    count_caps: countCaps,
    metric_errors: metricErrors,
    warnings,
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
      let previous = null;
      try {
        previous = await getConfig('lead_system_health_last_alert');
      } catch (error) {
        health.alert_state_read_error = safeString(error.message, 300);
      }
      if (shouldNotify(previous, signature)) {
        const alert = await sendAlertEmail(health);
        try {
          await upsertConfig('lead_system_health_last_alert', {
            signature,
            sent_at: new Date().toISOString(),
            ok: alert.ok,
            status: alert.status || null,
            skipped: alert.skipped || false,
            reason: alert.reason || null,
          });
        } catch (error) {
          alert.state_persisted = false;
          alert.state_persist_error = safeString(error.message, 300);
        }
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

module.exports._test = {
  alertSignature,
  boundedCount,
  getLeadFlagsStrict,
  settleWithConcurrency,
  shouldNotify,
  withRetry,
};
