import importlib.util
from pathlib import Path
import unittest


SCRIPT = Path(__file__).parents[1] / "backfill-nurture-sent-events.py"
SPEC = importlib.util.spec_from_file_location("nurture_backfill", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class NurtureBackfillTest(unittest.TestCase):
    def test_email_ids_are_unique(self):
        ids = [email_id for values in MODULE.PHASE_IDS.values() for email_id in values]
        self.assertEqual(len(ids), 96)
        self.assertEqual(len(set(ids)), 96)

    def test_builds_stable_record_and_preserves_timestamp(self):
        leads = [{
            "lead_hash": "qz_test",
            "email_normalized": "test@example.com",
            "mautic_contact_id": 10,
            "completed_rank": 0,
            "last_seen_at": "2026-07-01T00:00:00Z",
        }]
        stats = [{
            "stat_id": 77,
            "contact_id": 10,
            "email": "test@example.com",
            "email_id": 13,
            "sent_at": "2026-07-01T10:00:00+02:00",
            "failed": False,
        }]
        records, skipped = MODULE.build_records(leads, stats, [])
        self.assertFalse(skipped)
        self.assertEqual(records[0]["event_uid"], "nurture_sent_mautic_stat_77")
        self.assertEqual(records[0]["event_at"], stats[0]["sent_at"])
        self.assertEqual(records[0]["payload"]["phase"], "a2")
        self.assertTrue(records[0]["payload"]["backfill"])

    def test_skips_existing_lead_phase(self):
        leads = [{
            "lead_hash": "qz_test",
            "email_normalized": "test@example.com",
            "mautic_contact_id": 10,
            "completed_rank": 0,
            "last_seen_at": "2026-07-01T00:00:00Z",
        }]
        stats = [{
            "stat_id": 78,
            "contact_id": 10,
            "email": "test@example.com",
            "email_id": 13,
            "sent_at": "2026-07-01T10:00:00+02:00",
            "failed": False,
        }]
        existing = [{
            "event_uid": "old",
            "lead_hash": "qz_test",
            "payload": {"phase": "A2"},
        }]
        records, skipped = MODULE.build_records(leads, stats, existing)
        self.assertEqual(records, [])
        self.assertEqual(skipped["lead_phase_already_present"], 1)

    def test_prefers_exact_mautic_contact_match(self):
        rows = [
            {"lead_hash": "qz_new", "mautic_contact_id": 11, "completed_rank": 3, "last_seen_at": "2026-07-02"},
            {"lead_hash": "qz_exact", "mautic_contact_id": 10, "completed_rank": 1, "last_seen_at": "2026-07-01"},
        ]
        self.assertEqual(MODULE.winner(rows, 10)["lead_hash"], "qz_exact")

    def test_skips_existing_contact_phase_after_canonical_hash_changes(self):
        leads = [{
            "lead_hash": "qz_new",
            "email_normalized": "test@example.com",
            "mautic_contact_id": 10,
            "completed_rank": 2,
            "last_seen_at": "2026-07-22T00:00:00Z",
        }]
        stats = [{
            "stat_id": 79,
            "contact_id": 10,
            "email": "test@example.com",
            "email_id": 37,
            "sent_at": "2026-07-22T04:00:36+02:00",
            "failed": False,
        }]
        existing = [{
            "event_uid": "nurture_sent_contact_10_c2",
            "lead_hash": "qz_old",
            "payload": {"phase": "c2", "mautic_contact_id": 10},
        }]

        records, skipped = MODULE.build_records(leads, stats, existing)

        self.assertEqual(records, [])
        self.assertEqual(skipped["contact_phase_already_present"], 1)


if __name__ == "__main__":
    unittest.main()
