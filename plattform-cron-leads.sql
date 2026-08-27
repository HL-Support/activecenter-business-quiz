-- pg_cron-Job des Business-Leads-Quiz auf der Plattform-Datenbank.
--
-- Wird NACH dem Datenumzug angelegt (Cutover-Schritt 7). Vorher waere er sinnlos:
-- er wuerde ueber leere Tabellen laufen.
--
-- Vorlage ist der Job der Quelle (gemessen 27.08.2026):
--   */15 * * * *  select analytics_internal.refresh_event_daily(
--                   (now() at time zone 'UTC')::date, (now() at time zone 'UTC')::date);
-- Unterschied hier: Schema leads_analytics statt analytics_internal.
--
-- 🔴 Der Job der QUELLE wird beim Cutover abgeschaltet (cron.unschedule). Laeuft er
-- weiter, schreibt er alle 15 Minuten in die alte Datenbank - unsichtbar, weil dort
-- niemand mehr hinsieht.
--
-- RUECKWEG:
--   select cron.unschedule('leads-refresh-event-daily');

-- pg_cron laeuft in der Datenbank, in der die Extension installiert ist. Auf dem
-- Plattform-Server ist das hl_support selbst (geprueft: pg_extension enthaelt pg_cron).
SELECT cron.schedule(
  'leads-refresh-event-daily',
  '*/15 * * * *',
  $$select leads_analytics.refresh_event_daily(
      (now() at time zone 'UTC')::date,
      (now() at time zone 'UTC')::date)$$
);

-- Nachweis nach dem Anlegen:
--   select jobid, jobname, schedule, active from cron.job where jobname like 'leads-%';
-- Und nach 15 Minuten, dass er wirklich lief:
--   select * from cron.job_run_details order by start_time desc limit 3;
--   select count(*) from leads_analytics.refresh_runs where started_at > now() - interval '20 minutes';
