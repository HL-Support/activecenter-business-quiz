-- Hash-Verknuepfung Supabase <-> MySQL (Markus, 27.07.2026)
--
-- 🔴 WAS DIESE SICHT NICHT IST: eine Verlustmeldung. Am 27.07. gegen MySQL nachgeprueft — alle
-- 16 Faelle HABEN dort einen Kontakt, eine Zeile in typeform_surveys (oft samt points_result),
-- einen Verarbeitungsauftrag in lead_processing_jobs und sind damit durch den Post Processor
-- gelaufen: Mautic, Lead-Mail, Coach-Mail. Verloren ging nichts.
--
-- Was fehlt, ist die VERKNUEPFUNG: beide Systeme fuehren dieselbe Einsendung unter
-- unterschiedlichen qz_-Hashes. Dadurch greift  nicht (matchedRows 0),
-- und lead_state.mysql_survey_id bleibt leer. Fachlich harmlos, technisch unsauber — und es macht
-- jede spaetere Zuordnung ueber den Hash unzuverlaessig.
--
-- Ein echter Drei-Wege-Abgleich (existiert der Lead in MySQL und in Mautic?) ist von Supabase aus
-- NICHT moeglich — er braucht die Bridge und gehoert deshalb in lead-system-health.js, nicht in
-- eine Sicht. Diese hier beantwortet nur: fehlt die Hash-Verknuepfung?
create or replace view public.v_lead_sync_gaps
with (security_invoker = true) as
select
  s.lead_hash,
  s.email,
  s.first_name,
  s.berater_slug,
  s.form_submitted_at,
  s.lifecycle_stage,
  s.sync_status,
  (s.mysql_survey_id is null
     and not exists (
       select 1 from public.lead_sync_outbox o
        where o.lead_hash = s.lead_hash
          and o.sync_type = 'mysql_initial_rank'
          and o.status = 'done')) as fehlt_in_mysql,
  (s.mautic_contact_id is null) as fehlt_in_mautic
from public.lead_state s
where s.form_submitted_at is not null
  and s.migration_source is null
  and not exists (
    select 1 from public.lead_events e
     where e.lead_hash = s.lead_hash and e.event_name = 'test_lead_marked')
  and s.mysql_survey_id is null
  and not exists (
    select 1 from public.lead_sync_outbox o
     where o.lead_hash = s.lead_hash
       and o.sync_type = 'mysql_initial_rank'
       and o.status = 'done');

comment on view public.v_lead_sync_gaps is
  'Leads, deren Supabase-Hash in MySQL nicht wiederzufinden ist (keine mysql_survey_id, kein erfolgreicher mysql_initial_rank). KEIN Datenverlust — am 27.07.2026 gegen MySQL geprueft: Kontakt, Umfragezeile und Verarbeitungsauftrag sind vorhanden, nur unter einem anderen qz_-Hash. Migrationsaltbestand und Testleads sind ausgenommen.';

revoke all on public.v_lead_sync_gaps from anon, authenticated;
grant select on public.v_lead_sync_gaps to service_role;
