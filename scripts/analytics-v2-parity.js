const { executeManagementQuery } = require('./stats-logs-baseline.js');

function countMap(rows) {
  const result = new Map();
  for (const row of rows || []) {
    const key = String(row.key);
    result.set(key, Number(row.count || 0));
  }
  return result;
}

function compareBuckets(legacyRows, v2Rows) {
  const legacy = countMap(legacyRows);
  const v2 = countMap(v2Rows);
  const keys = [...new Set([...legacy.keys(), ...v2.keys()])].sort();
  const mismatches = keys
    .filter((key) => (legacy.get(key) || 0) !== (v2.get(key) || 0))
    .map((key) => ({ key, legacy: legacy.get(key) || 0, v2: v2.get(key) || 0 }));
  return { ok: mismatches.length === 0, mismatches };
}

function parseUtcDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw new Error(`Invalid UTC date: ${value}`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid UTC date: ${value}`);
  }
  return date;
}

function buildDailyBatches(from, to) {
  const cursor = parseUtcDay(from);
  const end = parseUtcDay(to);
  if (cursor > end) throw new Error('Backfill start must not be after end');
  const batches = [];
  while (cursor <= end) {
    const day = cursor.toISOString().slice(0, 10);
    batches.push({ from: day, to: day });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return batches;
}

function bucketQuery(table, from, to) {
  const source = table === 'legacy' ? 'public.lead_events' : 'analytics_internal.event_daily';
  const dayExpression = table === 'legacy' ? `(event_at at time zone 'UTC')::date` : 'event_day';
  const countExpression = table === 'legacy' ? 'count(*)' : 'sum(event_count)';
  const timePredicate =
    table === 'legacy'
      ? `event_at >= '${from}'::date and event_at < ('${to}'::date + 1)`
      : `event_day between '${from}'::date and '${to}'::date`;
  return `select concat_ws('|', ${dayExpression}::text, coalesce(event_name,''), coalesce(source_app,''), coalesce(funnel_key,''), coalesce(member_id,'')) key, ${countExpression}::bigint count from ${source} where ${timePredicate} group by 1 order by 1`;
}

async function compareRange(from, to, options = {}) {
  const [legacy, v2] = await Promise.all([
    executeManagementQuery(bucketQuery('legacy', from, to), options),
    executeManagementQuery(bucketQuery('v2', from, to), options),
  ]);
  return compareBuckets(legacy, v2);
}

module.exports = { buildDailyBatches, compareBuckets, compareRange };

