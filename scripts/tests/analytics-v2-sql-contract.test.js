const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

test('analytics v2 is additive, private and reversible', () => {
  const sql = fs.readFileSync(path.join(root, 'supabase-analytics-v2.sql'), 'utf8');
  const rollback = fs.readFileSync(path.join(root, 'supabase-analytics-v2-rollback.sql'), 'utf8');

  assert.match(sql, /create schema if not exists analytics_internal/i);
  assert.match(sql, /create extension if not exists pg_cron with schema pg_catalog/i);
  assert.match(sql, /revoke all on schema analytics_internal from public, anon, authenticated/i);
  assert.match(sql, /create table if not exists analytics_internal\.event_daily/i);
  assert.match(sql, /create or replace function public\.analytics_dashboard_v2/i);
  assert.match(sql, /revoke all on function public\.analytics_dashboard_v2/i);
  assert.match(sql, /grant execute on function public\.analytics_dashboard_v2[\s\S]*to service_role/i);
  assert.match(sql, /create or replace function public\.analytics_events_page_v2/i);
  assert.match(sql, /order by e\.event_at desc, e\.event_id desc/i);
  assert.match(sql, /grant execute on function public\.analytics_events_page_v2[\s\S]*to service_role/i);
  assert.match(sql, /stats-logs-analytics-v2-current-day/i);
  assert.match(sql, /\*\/15 \* \* \* \*/i);
  assert.doesNotMatch(sql, /create materialized view/i);
  assert.doesNotMatch(sql, /(?:drop table|truncate|delete from)\s+public\.lead_events/i);

  assert.match(rollback, /drop function if exists public\.analytics_dashboard_v2/i);
  assert.match(rollback, /drop function if exists public\.analytics_events_page_v2/i);
  assert.match(rollback, /cron\.unschedule/i);
  assert.match(rollback, /drop schema if exists analytics_internal cascade/i);
  assert.doesNotMatch(rollback, /(?:drop table|truncate|delete from)\s+public\.lead_events/i);
});
