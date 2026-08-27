# Lead System v2 Runbook

Abhaengigkeitskarte: `docs/DEPENDENCY_MAP.md` · Bridge-Vertraege: `docs/BRIDGE_CONTRACTS.md`
· Hosting/Deploy: `DEPLOYMENT_WORKFLOW.md` (seit 25.08.2026 Coolify, Deploy ueber die CI (Job `deploy`, seit 27.08.); Handweg nur als Fallback).

## Production Source Of Truth

Supabase v2 is the source of truth:

- `lead_state`: one row per canonical `qz_...` lead hash
- `lead_answers_current`: current quiz answer state
- `lead_video_progress`: monotonic video progress, one row per lead and video step
- `lead_events`: event stream for resolved leads
- `lead_migration_unresolved`: legacy raw events that could not be mapped to a lead
- `lead_sync_outbox`: async MySQL sync jobs

MySQL `typeform_surveys.points_result` is a downstream copy written by the Outbox worker.
Labels are written as UTF-8 text with accents/umlauts, for example `Alle 3 Infovideos vollständig angeschaut`.
It is only synced for real contact leads. Visitors or resume-only rows without contact data are skipped as `not_a_contact_lead`.

## Live Flags

The live state is stored in `app_config`:

- `new_lead_writer_enabled=true`
- `new_lead_writer_percent=100`
- `legacy_writer_enabled=false`
- `outbox_worker_enabled=true`

Rollback without deploy:

```sql
update public.app_config set value = 'false'::jsonb, updated_at = now()
where key = 'new_lead_writer_enabled';
```

## n8n Workflows

- Outbox worker: `AC - Lead Sync Outbox Worker - Business Leads Quiz`
- Health monitor: `AC - Lead System Health Monitor - Business Leads Quiz`
- MySQL result writer: `Update "Result" by hash`

The MySQL result writer requires `X-Update-Secret`; public unauthenticated writes must fail before MySQL.

Hot-lead coach emails are also v2 Outbox jobs:

- `coach_hot_lead_email`
- created when video progress raises `completed_rank` to 3
- sent by `api/lead-outbox-worker.js` through Postmark
- deduped by `lead_events.event_uid = hot_lead_email_<lead_hash>`
- success event: `hot_lead_coach_email_sent`

## Health Check

Production endpoint:

```text
POST https://quiz.activecenter.info/api/lead-system-health
Header: X-Bridge-Key: <worker secret>
Body: {"notify":true}
```

Healthy means:

- new writer is enabled at 100%
- legacy writer is disabled
- outbox worker is enabled
- no pending jobs that have been due for more than 10 minutes
- no dead, old failed, or stale processing Outbox jobs
- deferred/quarantined pending jobs are reported separately and do not block health
- `outbox_parked` (seit 23.08.2026) zaehlt bewusst geparkte Jobs (`next_attempt_at` mehr als
  30 Tage in der Zukunft, z. B. Job 117 mit 2099) separat: `outbox_pending` minus
  `outbox_parked` ist die real wartende Menge; echte Staus zeigen sich an
  `outbox_pending_ready`/`outbox_pending_overdue`
- unresolved migration count is exact up to the safety cap and explicitly marked as capped above it
- configuration and metric read failures are reported as availability failures, never as fallback flag values
- every dependency read has a bounded timeout so the endpoint responds before the 30-second n8n timeout

The n8n Health Monitor runs every 15 minutes (reduced from 5 on 2026-07-23 — each run fires ~13 Supabase reads; 5-minute cadence was the top steady load on the shared Nano instance) and sends a deduped Postmark alert on unhealthy status.

## Dead Job Handling

Check:

```sql
select *
from public.lead_sync_outbox
where status in ('failed', 'processing', 'dead')
order by updated_at desc;
```

If a job is `dead`, inspect `last_error` and `context_data`. After fixing the cause, reset:

```sql
update public.lead_sync_outbox
set status = 'pending',
    attempts = 0,
    last_error = null,
    next_attempt_at = now(),
    locked_at = null,
    locked_by = null,
    dead_at = null
where id = <job_id>;
```

Then call the Outbox worker or wait for n8n.

## Reconciliation

Minimum checks:

- every MySQL `qz_...` hash exists in `lead_state`
- every old `quiz_sessions.hash` exists in `lead_state`
- every old `tracking_sessions.lead_hash` exists in `lead_state`
- every resolvable old `tracking_video_progress` row has equal-or-higher progress in `lead_video_progress`
- every MySQL rank is less than or equal to `v_lead_state_full.completed_rank`
- one-time backfill script: `node scripts/backfill-antworten.js   # (backfill-points-result-v2.js existiert nicht mehr)`; use `APPLY_POINTS_RESULT_BACKFILL=1` only after the dry-run report is checked.
- every resolvable old tracking event exists in `lead_events`
- unresolvable old events are stored in `lead_migration_unresolved`

Contact completeness check from 2026-05-14:

- MySQL `qz_...` contacts: 161 checked, 0 missing in `lead_state`
- `quiz_sessions` contacts with email: 194 checked, 0 missing in `lead_state`
- `tracking_sessions` contacts with email: 142 checked, 0 missing in `lead_state`
- Contact hydration gaps across these sets: 0

If any future contact exists in legacy but not in v2, treat it as a migration defect.

## Resume Links

Resume links must resolve to a contact `lead_hash`.

Expected behavior:

1. `generate_resume_token` refuses to generate a resume link if no contact lead can be resolved.
2. `resolve_resume_token` and `resolve_resume_key` return `leadHash`, `memberId`, `refId`, `beraterSlug`, name and email.
3. The frontend adopts that `leadHash` before `/api/lead/init`.
4. A resume visit must not create a new anonymous `qz_...` row.
5. If a resume link cannot be mapped to `lead_state`, the API returns `409 Resume contact not found`.

Video nurture resume links have an additional fixed contract:

1. The caller must use `/api/bridge` action `generate_resume_token`.
2. The payload must include `resumeTarget: "videos"`.
3. The returned `shortUrl` or `resumeUrl` must contain `target=videos`.
4. `resolve_resume_key` and `resolve_resume_token` must return `resumeTarget: "videos"`.
5. Rank-0 leads must resume at `lastVideoStep >= 1`, not on the result page.
6. Mailers and n8n workflows must not build `/access/{leadHash}` links or hand-build resume URLs.

Regression command before deploys or mailer rollouts:

```bash
npm run smoke:resume
```

Mautic resume-link audit on 2026-06-02:

- 214/214 Business-Quiz contacts have `ac_last_video_access_url`.
- 214/214 links contain `target=videos`.
- 214/214 links use a valid short `?r=` resume key.
- 0 old `/access/{leadHash}` links remain.
- 0 invalid resume-key resolves remain.
- 136 links resolve to `videos`.
- 78 links resolve to `final`; every one is excluded from Video-Nurture by `completed_rank >= 3` or `cta_type`.
- 0 `final` links remain for leads that are still Video-Nurture eligible.

Latest reconciliation report path used during cutover:

```text
d:/tmp/lead_system_v2_reconciliation_latest.json
```

## E2E Test Shape

The production E2E must verify:

1. `/api/lead/init` returns one canonical `qz_...`.
2. `/api/bridge` creates the Typeform/MySQL row with `lead_system_v2_enabled=1`.
3. `/api/lead-track` writes quiz answer, result, form submission, and video progress.
4. `lead_video_progress` only moves upward.
5. `lead_sync_outbox` writes MySQL rank 0 through rank 3.
6. For a contact lead with rank 3, `coach_hot_lead_email` is processed once and `hot_lead_coach_email_sent` exists.
7. `v_lead_state_full.completed_rank` and MySQL `points_result` agree for contact leads.
8. no open Outbox jobs remain.

## Collation Incident 2026-08-20 (points_result Updates fehlgeschlagen)

Am 20.08.2026 um 05:18 UTC hat die Laravel-Migration
`2026_08_20_050000_convert_typeform_tables_to_utf8mb4` (Contact-Manager-App,
DB `prod_contacts_activesupport` auf dem Forge-DB-Server 10.0.1.3) die Tabellen
`typeform_surveys` und `typeform_survey_correcteds` auf `utf8mb4_unicode_ci`
konvertiert. Der n8n-Workflow `Update "Result" by hash` (7Xg6NsE5H3UWgSNc)
nutzt `CONVERT(0x... USING utf8mb4)`-Ausdruecke; deren Collation folgt der
Server-Default `utf8mb4_0900_ai_ci`. Jeder Vergleich (`LIKE`, `=`) gegen die
Spalte brach danach mit `ERROR 1267 Illegal mix of collations` ab — der Fehler
ist parse-time und trifft damit jede Query, auch bei NULL-Rows.

Symptom: Bridge-Alert `n8n_update_failed` mit `n8n Status: 200` und leerer
Response `{}` — die n8n-Execution stirbt vor dem Respond-Node, n8n antwortet
200 ohne Body. Outbox-Jobs (`lead_sync_outbox`) liefen in denselben Fehler.

Fix (deployed 20.08.2026, versionId 60ce0f41): Alle CONVERT-Ausdruecke tragen
jetzt explizit `COLLATE utf8mb4_unicode_ci` (8 Stellen im UPDATE-Query, 1x in
`Code - Normalize Points Result` / `sqlUtf8Expr`). Explizite Collation gewinnt
gegen jede implizite Spalten-Collation — der Workflow ist damit unabhaengig
davon, welche utf8mb4-Collation die Tabelle hat.
Pre-Fix-Backup: `n8n/backups/7Xg6NsE5H3UWgSNc-before-collate-fix-2026-08-20.json`.

Lehren:

1. Collation-Migrationen der Contact-Manager-App treffen auch n8n-Workflows,
   die dieselben Tabellen lesen/schreiben — nach jeder DB-Migration die
   n8n-Executions der Quiz-Workflows pruefen.
2. Manuelle Webhook-Replays mit Umlauten nie direkt aus der Windows-Shell
   senden (`curl -d '...ä...'` zerstoert UTF-8) — Payload per Node als
   UTF-8-Datei schreiben und mit `--data-binary @file` senden, danach Bytes
   per `HEX(points_result)` verifizieren.

Systemcheck nach dem Incident (20.08.2026, alle 84 n8n-Workflows + DB):

- Nur `Update "Result" by hash` nutzte CONVERT-Hex; alle anderen MySQL-Nodes
  arbeiten mit String-Literalen (collation-sicher, Coercibility COERCIBLE).
- Alle Cross-Table-JOINs der Quiz-/Typebot-Workflows (typeform_surveys,
  contacts, users, funnel_tracking) wurden read-only gegen die Live-DB
  validiert — die Migration machte sie konsistenter (beidseitig
  utf8mb4_unicode_ci statt utf8mb3/utf8mb4-Autokonversion).
- Laravel-App gesund: failed_jobs=0, Inserts/Updates laufen normal weiter,
  Post Processor und Nightly Sync fehlerfrei nach der Migration.
- `prod_analytics.landing_page_events` war als einzige Tabelle
  `utf8mb4_0900_ai_ci` (ohne explizite Collation angelegt, Server-Default
  geerbt). Am 20.08.2026 auf `utf8mb4_unicode_ci` konvertiert (Backup:
  `/home/forge/backups/2026-08-20/landing_page_events_before_collate_fix.sql`).
  Die Tabelle wird nur von der Landingpage activecenter.info via
  `ac-reconnect.com/db-bridge.php` (Action `track_event`, Prepared
  Statements) beschrieben — nicht vom Business Leads Quiz, dessen
  `track_event` geht ueber die eigene Vercel-API nach Supabase. Damit sind
  alle utf8mb4-Tabellen im System einheitlich `unicode_ci`.

# Name Normalization Incident 2026-05-14

The active n8n workflow `AC - Lead Post Processor - Business Leads Quiz`
contained a bad regex after an API/JSON patch: `\s` had become plain `s` in
three Code nodes. This caused names like `Annelies` -> `Annelie` and
`Lukas Pramstaller` -> `Luka Pram taller` in generated emails.

Fixed live nodes:

- `Code - Normalize Candidate Rows`
- `Code - Build Lead Model`
- `Code - Apply Resume Link`

Correct pattern:

```js
.replace(/\s+/g, ' ')
.split(/([\s'-]+)/)
```

Pre-fix backup:

```text
n8n/backups/9RZdrLxfA8IRhd55-before-name-regex-fix-2026-05-14T11-48-39-046Z.json
```

Verification after the fix:

- live workflow stayed active
- `badRegexCount=0`
- `Lukas Pramstaller`, `Annelies`, `Anne-Lies`, `Hans Peter`, and `Patrizia Schenk` normalize correctly

Future n8n regex patches must be verified live after API/JSON upload because
escaping mistakes can silently turn `\s` into `s`.
