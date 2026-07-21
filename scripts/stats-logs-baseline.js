const fs = require('node:fs');

const PROJECT_REF = 'xlpiisbozpgmemxhtivj';
const SECRET_KEY_PATTERN = /(authorization|api[_-]?key|service[_-]?key|secret|password|token)/i;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

function asNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function normalizeBaseline(input = {}) {
  return {
    total: asNumber(input.total),
    distinctUids: asNumber(input.distinct_uids),
    missingUids: asNumber(input.missing_uids),
    daily: Array.isArray(input.daily)
      ? input.daily.map((row) => ({ day: String(row.day), count: asNumber(row.count) }))
      : [],
  };
}

function redactSecrets(value, key = '') {
  if (SECRET_KEY_PATTERN.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        redactSecrets(childValue, childKey),
      ])
    );
  }
  if (typeof value === 'string') return value.replace(JWT_PATTERN, '[REDACTED]');
  return value;
}

const QUERIES = {
  event_integrity: `
    select count(*)::bigint total,
           count(distinct event_uid)::bigint distinct_uids,
           count(*) filter (where event_uid is null or event_uid = '')::bigint missing_uids
    from public.lead_events`,
  event_daily: `
    select (event_at at time zone 'UTC')::date::text day, count(*)::bigint count
    from public.lead_events
    group by 1 order by 1`,
  event_dimensions: `
    select (event_at at time zone 'UTC')::date::text day,
           coalesce(event_name, '') event_name,
           coalesce(source_app, '') source_app,
           coalesce(funnel_key, '') funnel_key,
           coalesce(member_id, '') member_id,
           count(*)::bigint count
    from public.lead_events
    group by 1,2,3,4,5 order by 1,2,3,4,5`,
  relation_health: `
    select schemaname, relname, pg_total_relation_size(relid)::bigint bytes,
           n_live_tup, n_dead_tup, seq_scan, seq_tup_read, idx_scan,
           n_tup_ins, n_tup_upd, n_tup_del
    from pg_stat_user_tables
    order by pg_total_relation_size(relid) desc`,
  query_io: `
    select queryid, calls, total_exec_time, mean_exec_time,
           shared_blks_read, shared_blks_dirtied, shared_blks_written,
           temp_blks_read, temp_blks_written,
           left(regexp_replace(query, '\\s+', ' ', 'g'), 500) query
    from pg_stat_statements
    order by temp_blks_written + temp_blks_read + shared_blks_dirtied desc
    limit 100`,
};

async function executeManagementQuery(query, options = {}) {
  const accessToken = options.accessToken || process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = options.projectRef || process.env.SUPABASE_PROJECT_REF || PROJECT_REF;
  if (!accessToken) throw new Error('SUPABASE_ACCESS_TOKEN is required for the read-only baseline');

  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, read_only: true }),
  });
  if (!response.ok) throw new Error(`Baseline query failed (${response.status}): ${await response.text()}`);
  return response.json();
}

async function collectBaseline(options = {}) {
  const collectedAt = new Date().toISOString();
  const entries = await Promise.all(
    Object.entries(QUERIES).map(async ([name, query]) => [name, await executeManagementQuery(query, options)])
  );
  return redactSecrets({ projectRef: options.projectRef || PROJECT_REF, collectedAt, results: Object.fromEntries(entries) });
}

async function main() {
  const outputIndex = process.argv.indexOf('--output');
  const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : '';
  const baseline = await collectBaseline();
  const json = `${JSON.stringify(baseline, null, 2)}\n`;
  if (outputPath) fs.writeFileSync(outputPath, json, { encoding: 'utf8', flag: 'wx' });
  else process.stdout.write(json);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  QUERIES,
  collectBaseline,
  executeManagementQuery,
  normalizeBaseline,
  redactSecrets,
};
