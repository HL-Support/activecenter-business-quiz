# Nurture Recovery Implementation Plan

**Goal:** Restore reliable Nurture send logging, reconstruct missing events without sending mail, and recover overdue second reminders under a strict cap.
**Architecture:** Patch only the current live n8n workflow through API PUT and restart. Keep Supabase as phase source, Mautic as sender/DNC source, and use idempotent `lead_events` backfill from Mautic `email_stats`.
**Tech Stack:** n8n, Supabase/PostgREST, Mautic 7/MySQL, PowerShell, Node.js, SSH/Docker
---

### Task 1: Live backup and invariant checks

**Affected Files:**
- Create: server backup `/root/n8n/backups/RqKSRTgFv8mv04H2-before-nurture-recovery-20260721.json`
- Test: read-only n8n API and database queries

**Step 1: Write the failing test**
Assert that the live logger is not a valid n8n expression and that second-phase sends are uncapped.

**Step 2: Run test to verify failure**
Expected: logger invariant fails; workflow identity, DNC, CTA, test and resume guards pass.

**Step 3: Write minimal implementation**
Create a byte-for-byte API export and checksum before changing anything.

**Step 4: Run test to verify success**
Expected: backup parses and checksum is recorded.

**Step 5: Commit**
No repository commit. This is a protected production backup.

### Task 2: Logger and recovery cap

**Affected Files:**
- Modify: live n8n workflow `RqKSRTgFv8mv04H2`
- Test: live workflow structural assertions

**Step 1: Write the failing test**
Assert correct expression wrapper, `payload`, stable `event_uid`, conflict-safe POST, alerting behavior and a maximum of five second reminders per phase per run.

**Step 2: Run test to verify failure**
Expected: logger and cap assertions fail before patch.

**Step 3: Write minimal implementation**
Patch only `Code - Determine Phase` and `Supabase - Log Sent`; deploy by API PUT and restart n8n.

**Step 4: Run test to verify success**
Expected: new versionId, active workflow, all structural assertions pass, next execution succeeds.

**Step 5: Commit**
No code commit until the exact live patch is exported and reviewed.

### Task 3: Safe logger verification

**Affected Files:**
- Test: Supabase `lead_events`, Mautic `email_stats`, n8n execution data

**Step 1: Write the failing test**
Compare new successful Mautic sends to new `nurture_sent` events.

**Step 2: Run test to verify failure**
Expected before a post-patch send: no new comparable pair yet.

**Step 3: Write minimal implementation**
Allow one scheduled run under the cap; do not alter real lead state.

**Step 4: Run test to verify success**
Expected: each post-patch send has exactly one correctly shaped event and no duplicates.

**Step 5: Commit**
Document verified live version and evidence.

### Task 4: Idempotent historical backfill

**Affected Files:**
- Create: `scripts/backfill-nurture-sent-events.py`
- Test: `scripts/tests/backfill-nurture-sent-events.test.py`

**Step 1: Write the failing test**
Test email-ID mapping, canonical lead resolution, stable UID, original timestamps, ambiguity rejection and dry-run behavior.

**Step 2: Run test to verify failure**
Expected: test fails because the backfill script does not exist.

**Step 3: Write minimal implementation**
Build a dry-run-first script. Require `APPLY_NURTURE_SENT_BACKFILL=1` for writes and use `on_conflict=event_uid`.

**Step 4: Run test to verify success**
Expected: PASS; dry run produces counts only and sends no mail.

**Step 5: Commit**
Commit only after dry-run and data reconciliation are reviewed.

### Task 5: Controlled recovery and monitoring

**Affected Files:**
- Modify: live n8n workflow `RqKSRTgFv8mv04H2`
- Modify: Nurture runbook after verification

**Step 1: Write the failing test**
Assert overdue-second selection respects current rank, CTA, DNC, test, language, dedupe, resume target and cap.

**Step 2: Run test to verify failure**
Expected: backlog exists with zero second sends in the audit window.

**Step 3: Write minimal implementation**
Apply the approved backfill, run capped recovery, and add Mautic-versus-Supabase reconciliation alerting.

**Step 4: Run test to verify success**
Expected: capped sends reconcile one-to-one; no protected contacts are mailed.

**Step 5: Commit**
Update documentation and save final project memory after production verification.

## Verified completion

- Logger recovery version: `065dbe91-24e1-4d5f-92e1-9fe8a25ecf9f`.
- Recovery-cap placement correction: `06643474-a8e3-49f6-9b65-e2107c81ea47`.
- Backup before cap correction: `/root/n8n/backups/RqKSRTgFv8mv04H2-before-cap-placement-fix-20260722T115808+0200.json`.
- Backup SHA-256: `b5347f94a42992fe8877d213fdfb2a187647d76e7f92a471b5cdb45df05dd8a9`.
- First corrected scheduled execution: `294634`, status `success`.
- Reconciliation: 21 Mautic sends, 21 unique Supabase events; A3/B2/C2/D2 exactly five each plus one D1.
- Backfill regression suite: five tests passed.
- Final production dry run: zero candidates.

## Approved catch-up acceleration

- User-approved scope: all still-eligible overdue contacts, without a freshness cutoff.
- Recovery cap raised from 5 to 20 validated second reminders per phase and execution.
- Active workflow version: `9c4ec7a1-2bc1-4cdb-911f-4ff8979c954b`.
- Pre-change backup: `/root/n8n/backups/RqKSRTgFv8mv04H2-before-cap-20-20260722T122304+0200.json`.
- Backup SHA-256: `29fccaa1b76cb271f85e857ce9653789a0aefeaa1a28219b3f30fe43513f2cdb`.
- Structural readback: workflow active, one cap node, threshold 20, cap connection and DNC/dedupe/language/resume guards present.

## DNS resilience follow-up

- Failed execution: `294884`, node `Supabase - Get Resume Session`, transient DNS resolution error.
- Partial result before failure: 20 A3 and 18 B2 Mautic sends, all failure flag `0`.
- Event-only recovery: 38 missing `nurture_sent` records inserted; repeat dry run returned zero candidates.
- Logger branch now executes before `Split In Batches`, preserving each successful send before the next contact starts.
- Resume-session request now retries three times with a 2,000 ms delay and still fails loudly after exhaustion.
- Active workflow version: `4190c93b-1730-4a84-b616-5b7f6ea4b959`.
- Pre-change backup: `/root/n8n/backups/RqKSRTgFv8mv04H2-before-dns-resilience-20260722T144516+0200.json`.
- Backup SHA-256: `61f32ce082a7e8d2b0b4e325b903d88149c262549673bc3591a01b873ebc2bd7`.
- Remaining pre-guard backlog after recovery: A3 130, B2 68, C2 14, D2 6.
