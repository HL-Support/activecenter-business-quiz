-- 1. Cron-Job abschalten (schreibt sonst alle 15 Minuten weiter):
SELECT cron.unschedule('stats-logs-analytics-v2-current-day');

-- 2. Schreibrechte entziehen (SELECT bleibt - der Dump muss lesen):
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON
  public.lead_state,
  public.lead_events,
  public.lead_video_progress,
  public.lead_answers_current,
  public.lead_sync_outbox,
  public.lead_profiles,
  public.app_config,
  public.nurture_sequences,
  public.nurture_runs,
  public.nurture_subject_states,
  public.tracking_sessions,
  public.tracking_events,
  public.tracking_video_progress,
  public.quiz_sessions,
  public.lead_migration_unresolved,
  public.lead_contact_crm,
  analytics_internal.event_daily,
  analytics_internal.refresh_runs
FROM anon, authenticated, service_role;
