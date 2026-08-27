-- Leserechte fuer den Phase-5/6-Export des Business-Leads-Verbunds (27.08.2026).
--
-- WARUM DIESE ROLLE: Das `postgres`-Passwort des Supabase-Projekts wurde nie beschafft
-- (Secrets-Notiz marathon_supabase_app). Stattdessen existiert die App-Rolle
-- `marathon_app` mit LOGIN und - entscheidend - BYPASSRLS. Ohne BYPASSRLS wuerde
-- pg_dump bei aktiver RLS (26 Policies im Verbund) entweder abbrechen oder mit
-- --enable-row-security STILL WENIGER ZEILEN liefern: genau die Fehlerklasse
-- "stille Kappung", gegen die dieses Projekt seine Waechter gebaut hat.
--
-- WAS DAS HIER TUT: ausschliesslich LESERECHTE auf die 18 Tabellen der
-- Phase-5-Objektauswahl plus deren Sequenzen. Keine Schreibrechte, keine
-- Rollenaenderung, keine fremden Objekte (hba_*, webhook_*, marathon, auth bleiben
-- unberuehrt - marathon_app kann sie danach so wenig lesen wie vorher).
--
-- RUECKWEG (nach abgeschlossenem Umzug ausfuehren):
--   REVOKE SELECT ON ALL TABLES IN SCHEMA analytics_internal FROM marathon_app;
--   REVOKE USAGE ON SCHEMA analytics_internal FROM marathon_app;
--   REVOKE SELECT ON public.lead_state, public.lead_events, ... FROM marathon_app;
--   -- oder radikal: DROP ROLE marathon_app; (dann auch den Marathon-Umbau pruefen)

BEGIN;

GRANT USAGE ON SCHEMA analytics_internal TO marathon_app;

GRANT SELECT ON
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
TO marathon_app;

-- Sequenzen: pg_dump liest die Zaehlerstaende. Nur die der Auswahl-Tabellen.
GRANT SELECT ON
  public.quiz_sessions_id_seq,
  public.tracking_sessions_id_seq,
  public.tracking_events_id_seq,
  public.tracking_video_progress_id_seq,
  public.lead_profiles_id_seq,
  public.lead_events_event_id_seq,
  public.lead_sync_outbox_id_seq,
  public.lead_migration_unresolved_id_seq,
  analytics_internal.refresh_runs_run_id_seq
TO marathon_app;

COMMIT;
