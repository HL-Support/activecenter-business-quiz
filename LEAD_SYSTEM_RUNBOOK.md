# Lead System v2 Runbook

## Production Source Of Truth

Supabase v2 is the source of truth:

- `lead_state`: one row per canonical `qz_...` lead hash
- `lead_answers_current`: current quiz answer state
- `lead_video_progress`: monotonic video progress, one row per lead and video step
- `lead_events`: event stream for resolved leads
- `lead_migration_unresolved`: legacy raw events that could not be mapped to a lead
- `lead_sync_outbox`: async MySQL sync jobs

MySQL `typeform_surveys.points_result` is a downstream copy written by the Outbox worker.

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

## Health Check

Production endpoint:

```text
POST https://quiz.activecenter.info/api/lead-system-health
Header: X-Bridge-Key: <worker secret>
Body: {"notify":true}
```

Healthy means:

- new writer is enabled at 100%
- outbox worker is enabled
- no pending/dead/stale outbox jobs
- unresolved migration count is visible

The n8n Health Monitor runs every 5 minutes and sends a deduped Postmark alert on unhealthy status.

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
- every resolvable old tracking event exists in `lead_events`
- unresolvable old events are stored in `lead_migration_unresolved`

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
6. `v_lead_state_full.completed_rank` and MySQL `points_result` agree.
7. no open Outbox jobs remain.
