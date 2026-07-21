-- Rollback only the additive analytics v2 objects. Canonical raw data is untouched.
do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'stats-logs-analytics-v2-current-day';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
end;
$$;
drop function if exists public.analytics_dashboard_v2(timestamptz, timestamptz, text);
drop function if exists public.analytics_events_page_v2(timestamptz, text, timestamptz, bigint, integer);
drop function if exists analytics_internal.refresh_event_daily(date, date);
drop schema if exists analytics_internal cascade;
