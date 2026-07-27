-- Drei-Wege-Abgleich: Supabase ↔ MySQL ↔ Mautic (Markus, 27.07.2026)
--
-- Ein Kontakt soll überall liegen. Bisher prüfte `lead-system-health.js` ausschliesslich
-- Supabase-interne Zustände (Tabellenverfügbarkeit, Outbox-Stände, Migrationsreste). Ein Lead,
-- für den NIE ein Outbox-Eintrag entstand, war dort per Konstruktion unsichtbar — es gibt keine
-- Zeile, die hängen könnte. Genau so sind 17 Einsendungen zwischen 18.05. und 24.07.2026 nie in
-- `typeform_surveys` angekommen, ohne dass es irgendwo aufgefallen wäre.
--
-- Die Sicht macht daraus eine zählbare Kennzahl. Bewusst konservativ:
--   * `mysql_survey_id` allein taugt NICHT als Merkmal — sie wird nicht immer zurückgeschrieben
--     (54 Leads mit erfolgreichem Sync haben keine). Deshalb zusätzlich die Outbox befragen.
--   * Migrationsaltbestand (`migration_source`) bleibt aussen vor, den gab es in MySQL nie.
--   * Als Test markierte Leads bleiben aussen vor.
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
  'Leads mit abgeschicktem Formular, die in MySQL (typeform_surveys) fehlen. Die Spalte fehlt_in_mautic ist NUR informativ: das Zurueckschreiben der Mautic-ID wurde ab Juni 2026 eingestellt, sie taugt derzeit nicht als Lueckenmerkmal. Grundlage der Health-Kennzahl sync_gap_mysql. Migrationsaltbestand und Testleads sind ausgenommen.';

revoke all on public.v_lead_sync_gaps from anon, authenticated;
grant select on public.v_lead_sync_gaps to service_role;
