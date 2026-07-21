-- Stats_Logs analytics v2: additive, private and rebuildable from public.lead_events.
-- This script never updates or deletes canonical raw events.

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create schema if not exists analytics_internal;
revoke all on schema analytics_internal from public, anon, authenticated;
grant usage on schema analytics_internal to service_role;

create table if not exists analytics_internal.event_daily (
  event_day date not null,
  event_name text not null,
  source_app text not null,
  funnel_key text not null,
  member_id text not null,
  event_count bigint not null check (event_count >= 0),
  distinct_leads bigint not null check (distinct_leads >= 0),
  first_event_at timestamptz,
  last_event_at timestamptz,
  refreshed_at timestamptz not null default now(),
  primary key (event_day, event_name, source_app, funnel_key, member_id)
);

create index if not exists event_daily_member_day_idx
  on analytics_internal.event_daily (member_id, event_day desc);
create index if not exists event_daily_name_day_idx
  on analytics_internal.event_daily (event_name, event_day desc);

create table if not exists analytics_internal.refresh_runs (
  run_id bigint generated always as identity primary key,
  range_start date not null,
  range_end date not null,
  source_event_count bigint not null,
  aggregate_event_count bigint not null,
  aggregate_row_count bigint not null,
  status text not null check (status in ('complete', 'failed')),
  source_min_event_at timestamptz,
  source_max_event_at timestamptz,
  completed_at timestamptz not null default now(),
  error_message text
);

revoke all on all tables in schema analytics_internal from public, anon, authenticated;
grant select, insert, update, delete on analytics_internal.event_daily to service_role;
grant select, insert on analytics_internal.refresh_runs to service_role;
grant usage, select on all sequences in schema analytics_internal to service_role;

create or replace function analytics_internal.refresh_event_daily(
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source_count bigint;
  v_aggregate_count bigint;
  v_row_count bigint;
  v_min_at timestamptz;
  v_max_at timestamptz;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'invalid analytics refresh range';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('analytics_internal.refresh_event_daily'));

  select count(*), min(event_at), max(event_at)
    into v_source_count, v_min_at, v_max_at
    from public.lead_events
   where event_at >= (p_from::timestamp at time zone 'UTC')
     and event_at < ((p_to + 1)::timestamp at time zone 'UTC');

  delete from analytics_internal.event_daily
   where event_day between p_from and p_to;

  insert into analytics_internal.event_daily (
    event_day, event_name, source_app, funnel_key, member_id,
    event_count, distinct_leads, first_event_at, last_event_at, refreshed_at
  )
  select
    (event_at at time zone 'UTC')::date,
    coalesce(event_name, ''),
    coalesce(source_app, ''),
    coalesce(funnel_key, ''),
    coalesce(member_id, ''),
    count(*)::bigint,
    count(distinct lead_hash)::bigint,
    min(event_at),
    max(event_at),
    pg_catalog.clock_timestamp()
  from public.lead_events
  where event_at >= (p_from::timestamp at time zone 'UTC')
    and event_at < ((p_to + 1)::timestamp at time zone 'UTC')
  group by 1,2,3,4,5;

  select coalesce(sum(event_count), 0), count(*)
    into v_aggregate_count, v_row_count
    from analytics_internal.event_daily
   where event_day between p_from and p_to;

  if v_aggregate_count <> v_source_count then
    raise exception 'analytics parity failure: source %, aggregate %', v_source_count, v_aggregate_count;
  end if;

  insert into analytics_internal.refresh_runs (
    range_start, range_end, source_event_count, aggregate_event_count,
    aggregate_row_count, status, source_min_event_at, source_max_event_at
  ) values (
    p_from, p_to, v_source_count, v_aggregate_count,
    v_row_count, 'complete', v_min_at, v_max_at
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'range_start', p_from,
    'range_end', p_to,
    'source_event_count', v_source_count,
    'aggregate_event_count', v_aggregate_count,
    'aggregate_row_count', v_row_count
  );
end;
$$;

revoke all on function analytics_internal.refresh_event_daily(date, date) from public, anon, authenticated;
grant execute on function analytics_internal.refresh_event_daily(date, date) to service_role;

create or replace function public.analytics_dashboard_v2(
  p_from timestamptz,
  p_to timestamptz,
  p_member_id text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'version', 2,
    'from', p_from,
    'to', p_to,
    'member_id', p_member_id,
    'event_count', coalesce(sum(d.event_count), 0),
    'buckets', coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'day', d.event_day,
          'event_name', d.event_name,
          'source_app', d.source_app,
          'funnel_key', d.funnel_key,
          'member_id', d.member_id,
          'event_count', d.event_count,
          'distinct_leads', d.distinct_leads
        ) order by d.event_day, d.event_name, d.source_app, d.funnel_key, d.member_id
      ),
      '[]'::jsonb
    )
  )
  from analytics_internal.event_daily d
  where d.event_day >= (p_from at time zone 'UTC')::date
    and d.event_day <= (p_to at time zone 'UTC')::date
    and (p_member_id is null or d.member_id = p_member_id);
$$;

revoke all on function public.analytics_dashboard_v2(timestamptz, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.analytics_dashboard_v2(timestamptz, timestamptz, text)
  to service_role;

-- Lossless cursor page for consumers that still need event-level semantics.
-- This replaces deep OFFSET scans while returning the original rows unchanged.
create or replace function public.analytics_events_page_v2(
  p_from timestamptz,
  p_berater_slug text default null,
  p_cursor_event_at timestamptz default null,
  p_cursor_event_id bigint default null,
  p_page_size integer default 1000
)
returns setof public.lead_events
language sql
stable
security invoker
set search_path = ''
as $$
  select e.*
  from public.lead_events e
  where e.event_at >= p_from
    and (p_berater_slug is null or e.berater_slug = p_berater_slug)
    and (
      p_cursor_event_at is null
      or e.event_at < p_cursor_event_at
      or (e.event_at = p_cursor_event_at and e.event_id < p_cursor_event_id)
    )
  order by e.event_at desc, e.event_id desc
  limit least(greatest(coalesce(p_page_size, 1000), 1), 1000);
$$;

revoke all on function public.analytics_events_page_v2(timestamptz, text, timestamptz, bigint, integer)
  from public, anon, authenticated;
grant execute on function public.analytics_events_page_v2(timestamptz, text, timestamptz, bigint, integer)
  to service_role;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'stats-logs-analytics-v2-current-day';
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
  perform cron.schedule(
    'stats-logs-analytics-v2-current-day',
    '*/15 * * * *',
    $cron$select analytics_internal.refresh_event_daily((now() at time zone 'UTC')::date, (now() at time zone 'UTC')::date);$cron$
  );
end;
$$;
