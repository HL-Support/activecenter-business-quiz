#!/usr/bin/env python3
"""Reconstruct missing nurture_sent events from Mautic email_stats.

Run this script on the production host. It is dry-run by default and never sends
email. Set APPLY_NURTURE_SENT_BACKFILL=1 only after reviewing the dry run.
"""

import collections
import datetime as dt
import json
import os
import subprocess
import sys
import urllib.parse
import urllib.request


WORKFLOW_ID = "RqKSRTgFv8mv04H2"
SUPABASE_BASE = "https://xlpiisbozpgmemxhtivj.supabase.co/rest/v1"
CUTOFF = "2026-06-23T08:05:23+00:00"
APPLY = os.environ.get("APPLY_NURTURE_SENT_BACKFILL") == "1"

PHASE_IDS = {
    "a2": [13, 14, 15, 16, 98, 99, 100, 101, 146, 147, 148, 149],
    "a3": [17, 18, 19, 20, 114, 115, 116, 117, 130, 131, 132, 133],
    "b1": [26, 27, 28, 29, 102, 103, 104, 105, 150, 151, 152, 153],
    "b2": [30, 31, 32, 33, 118, 119, 120, 121, 134, 135, 136, 137],
    "c1": [34, 95, 96, 97, 106, 107, 108, 109, 154, 155, 156, 157],
    "c2": [35, 36, 37, 38, 122, 123, 124, 125, 138, 139, 140, 141],
    "d1": [39, 40, 41, 42, 110, 111, 112, 113, 158, 159, 160, 161],
    "d2": [43, 44, 45, 46, 126, 127, 128, 129, 142, 143, 144, 145],
}
EMAIL_PHASE = {email_id: phase for phase, ids in PHASE_IDS.items() for email_id in ids}


def docker_exec(container, command, stdin=""):
    result = subprocess.run(
        ["docker", "exec", "-i", container, "sh", "-lc", command],
        input=stdin,
        text=True,
        capture_output=True,
        check=True,
    )
    return result.stdout


def load_supabase_key():
    sql = f"""
    select e->'parameters'->'headerParameters'->'parameters'->0->>'value'
    from workflow_entity w cross join lateral json_array_elements(w.nodes) e
    where w.id='{WORKFLOW_ID}' and e->>'name'='Supabase - Get Eligible Leads';
    """
    key = docker_exec(
        "n8n-postgres-1",
        "psql -X -A -q -t -U$POSTGRES_USER -d$POSTGRES_DB",
        sql,
    ).strip()
    if not key:
        raise RuntimeError("Supabase key not found in the active workflow")
    return key


def request_json(key, path, method="GET", body=None, prefer=None):
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if prefer:
        headers["Prefer"] = prefer
    request = urllib.request.Request(
        SUPABASE_BASE + path,
        data=None if body is None else json.dumps(body).encode("utf-8"),
        headers=headers,
        method=method,
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        raw = response.read()
    return json.loads(raw) if raw else None


def paged_get(key, path):
    rows = []
    offset = 0
    separator = "&" if "?" in path else "?"
    while True:
        page = request_json(key, f"{path}{separator}limit=1000&offset={offset}")
        rows.extend(page)
        if len(page) < 1000:
            return rows
        offset += 1000


def load_mautic_rows():
    ids = ",".join(str(value) for value in sorted(EMAIL_PHASE))
    sql = f"""
    select es.id,es.lead_id,lower(l.email),es.email_id,
           date_format(es.date_sent,'%Y-%m-%dT%H:%i:%s'),es.is_failed
    from email_stats es join leads l on l.id=es.lead_id
    where es.email_id in ({ids})
      and es.date_sent >= '2026-06-23 10:05:23'
    order by es.id;
    """
    raw = docker_exec("mautic_db", "mysql -N -uroot -p$MYSQL_ROOT_PASSWORD mautic", sql)
    rows = []
    for line in raw.splitlines():
        stat_id, contact_id, email, email_id, sent_at, failed = line.split("\t")
        rows.append(
            {
                "stat_id": int(stat_id),
                "contact_id": int(contact_id),
                "email": email.strip().lower(),
                "email_id": int(email_id),
                "sent_at": sent_at + "+02:00",
                "failed": failed == "1",
            }
        )
    return rows


def winner(rows, contact_id):
    exact = [row for row in rows if str(row.get("mautic_contact_id") or "") == str(contact_id)]
    pool = exact or rows
    return max(
        pool,
        key=lambda row: (int(row.get("completed_rank") or 0), row.get("last_seen_at") or ""),
    )


def build_records(leads, stats, existing):
    by_email = collections.defaultdict(list)
    for lead in leads:
        email = (lead.get("email_normalized") or "").strip().lower()
        if email:
            by_email[email].append(lead)

    existing_uids = {row.get("event_uid") for row in existing}
    existing_pairs = {
        (row.get("lead_hash"), str((row.get("payload") or {}).get("phase", "")).lower())
        for row in existing
    }
    existing_contact_phases = {
        (
            str((row.get("payload") or {}).get("mautic_contact_id") or ""),
            str((row.get("payload") or {}).get("phase", "")).lower(),
        )
        for row in existing
        if (row.get("payload") or {}).get("mautic_contact_id")
    }
    records = []
    skipped = collections.Counter()
    for stat in stats:
        if stat["failed"]:
            skipped["mautic_failed"] += 1
            continue
        candidates = by_email.get(stat["email"], [])
        if not candidates:
            skipped["no_canonical_lead"] += 1
            continue
        lead = winner(candidates, stat["contact_id"])
        phase = EMAIL_PHASE[stat["email_id"]]
        event_uid = f"nurture_sent_mautic_stat_{stat['stat_id']}"
        if event_uid in existing_uids:
            skipped["uid_already_present"] += 1
            continue
        if (str(stat["contact_id"]), phase) in existing_contact_phases:
            skipped["contact_phase_already_present"] += 1
            continue
        if (lead["lead_hash"], phase) in existing_pairs:
            skipped["lead_phase_already_present"] += 1
            continue
        records.append(
            {
                "event_uid": event_uid,
                "lead_hash": lead["lead_hash"],
                "event_name": "nurture_sent",
                "event_at": stat["sent_at"],
                "source_app": "business_leads_quiz",
                "funnel_key": "business",
                "payload": {
                    "phase": phase,
                    "email_id": stat["email_id"],
                    "source": "mautic",
                    "mautic_contact_id": stat["contact_id"],
                    "mautic_email_stat_id": stat["stat_id"],
                    "backfill": True,
                    "backfill_source": "mautic.email_stats",
                },
            }
        )
        existing_pairs.add((lead["lead_hash"], phase))
        existing_contact_phases.add((str(stat["contact_id"]), phase))
    return records, skipped


def main():
    key = load_supabase_key()
    leads = paged_get(
        key,
        "/v_lead_state_full?source_app=eq.business_leads_quiz"
        "&funnel_key=eq.business&email_normalized=not.is.null"
        "&select=lead_hash,email_normalized,mautic_contact_id,completed_rank,last_seen_at",
    )
    existing = paged_get(
        key,
        "/lead_events?event_name=eq.nurture_sent"
        "&select=event_uid,lead_hash,event_at,payload&order=event_at.asc",
    )
    stats = load_mautic_rows()
    records, skipped = build_records(leads, stats, existing)
    phases = collections.Counter(record["payload"]["phase"] for record in records)
    print(json.dumps({
        "apply": APPLY,
        "cutoff": CUTOFF,
        "mautic_rows": len(stats),
        "existing_events": len(existing),
        "candidate_records": len(records),
        "by_phase": dict(sorted(phases.items())),
        "skipped": dict(sorted(skipped.items())),
    }, indent=2, sort_keys=True))
    if not APPLY:
        return 0
    for start in range(0, len(records), 100):
        request_json(
            key,
            "/lead_events?on_conflict=event_uid",
            method="POST",
            body=records[start : start + 100],
            prefer="resolution=ignore-duplicates,return=minimal",
        )
    print(f"APPLIED={len(records)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
