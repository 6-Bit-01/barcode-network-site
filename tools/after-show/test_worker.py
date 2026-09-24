import copy
from datetime import datetime, timedelta, timezone
from email import policy
from email.parser import BytesParser
import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

import after_show as worker
import bnl_after_show_capture as capture

NOW = datetime(2026, 9, 26, 8, 30, tzinfo=timezone.utc)
SHOW = {"sessionId": "fixture-show", "showDate": "2026-09-25", "startedAt": "2026-09-26T02:00:00Z", "endedAt": "2026-09-26T08:00:00Z", "endSource": "session_archived_event"}


def website(show=SHOW):
    session = {"sessionId": show["sessionId"], "showDate": show["showDate"], "status": "archived", "revision": 42}
    return {"schemaVersion": worker.SCHEMA, "kind": "show", "show": copy.deepcopy(show), "sourceRevision": 42,
            "showLog": {"schemaVersion": "barcode_queue_show_log_v2", "revision": 42, "session": session, "events": []},
            "playback": {"schemaVersion": "barcode_queue_playback_diagnostics_v1", "session": session}, "coverage": {}}


def bnl(show=SHOW):
    return {"sessionId": show["sessionId"], "showDatePacific": show["showDate"], "startInclusive": "2026-09-25T19:00:00Z", "endExclusive": NOW.isoformat(),
            "database": {"available": True, "showLedgers": {"available": True, "rows": [{"sessionId": show["sessionId"], "schema_version": "tiktok_show_evidence_ledger_v2", "lifecycle_status": "finalized"}]}},
            "journal": {"available": True, "events": []}}


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.cfg = {"state_dir": self.temp.name, "not_before": "2026-09-24T00:00:00Z", "sender": "sender@example.test", "recipient": "owner@example.test"}
        self.sent = []
        self.shows = [copy.deepcopy(SHOW)]

    def fetch(self, cfg, session_id=None):
        if session_id is None:
            return {"schemaVersion": worker.SCHEMA, "kind": "index", "shows": copy.deepcopy(self.shows), "truncated": False}
        return website(next(show for show in self.shows if show["sessionId"] == session_id))

    def run_worker(self, **kwargs):
        return worker.run(self.cfg, now=kwargs.pop("now", NOW), fetcher=kwargs.pop("fetcher", self.fetch), collector=kwargs.pop("collector", lambda cfg, show: bnl(show)), sender=kwargs.pop("sender", lambda cfg, raw: self.sent.append(raw)), **kwargs)

    def test_cross_midnight_packet_readable_hashes_and_dedup(self):
        result = self.run_worker()
        self.assertEqual(result["results"][0]["status"], "smtp_accepted")
        message = BytesParser(policy=policy.default).parsebytes(self.sent[0])
        attachments = list(message.iter_attachments())
        for part in attachments:
            self.assertEqual(part.get_content_type(), "text/plain")
            self.assertEqual(part.get_content_charset(), "utf-8")
        parts = {part.get_filename(): part.get_payload(decode=True) for part in attachments}
        self.assertEqual(len(parts), 3)
        manifest = json.loads(parts["manifest.txt"])
        for name, details in manifest["files"].items():
            self.assertEqual(len(parts[name]), details["bytes"])
            self.assertEqual(hashlib.sha256(parts[name]).hexdigest(), details["sha256"])
        self.assertEqual(manifest["show"]["showDate"], "2026-09-25")
        self.assertFalse(manifest["acceptancePassed"])
        self.run_worker()
        self.assertEqual(len(self.sent), 1)
        state = json.loads((Path(self.temp.name)/"state.json").read_text())
        self.assertFalse(state["shows"][SHOW["sessionId"]]["inboxReceiptVerified"])

    def test_waits_twenty_minutes_skips_preinstall_and_no_show(self):
        self.assertEqual(self.run_worker(now=NOW-timedelta(minutes=15))["results"], [])
        self.cfg["not_before"] = NOW.isoformat()
        self.assertEqual(self.run_worker()["results"], [])
        self.shows = []
        self.assertEqual(self.run_worker()["results"], [])
        self.assertEqual(self.sent, [])

    def test_other_session_finalization_cannot_release_packet_then_partial_after_timeout(self):
        wrong = bnl(); wrong["database"]["showLedgers"]["rows"][0]["sessionId"] = "other"
        result = self.run_worker(collector=lambda cfg, show: wrong)
        self.assertEqual(result["results"][0]["status"], "waiting_for_bnl_finalization")
        self.assertFalse(self.sent)
        self.run_worker(now=NOW+timedelta(hours=2), collector=lambda cfg, show: wrong)
        self.assertIn(b"partial", self.sent[0])

    def test_failed_send_retries_identical_packet_after_backoff_without_marking_sent(self):
        attempts = []
        def fail(cfg, raw):
            attempts.append(raw)
            raise RuntimeError("password=never-log-this")
        result = self.run_worker(sender=fail)
        self.assertEqual(result["results"][0]["status"], "retry_pending")
        self.assertNotIn("never-log-this", (Path(self.temp.name)/"state.json").read_text())
        self.run_worker(now=NOW+timedelta(minutes=1))
        self.assertFalse(self.sent)
        self.run_worker(now=NOW+timedelta(minutes=6), collector=lambda *_: self.fail("must reuse staged packet"))
        self.assertEqual(self.sent, attempts)

    def test_retry_rechecks_website_public_eligibility(self):
        self.run_worker(sender=lambda *_: (_ for _ in ()).throw(RuntimeError()))
        def revoked(cfg, session_id=None):
            if session_id: raise RuntimeError("not available")
            return self.fetch(cfg)
        result = self.run_worker(now=NOW+timedelta(minutes=6), fetcher=revoked)
        self.assertEqual(result["results"][0]["status"], "retry_pending")
        self.assertFalse(self.sent)

    def test_bad_session_or_revision_never_sends(self):
        def wrong(cfg, session_id=None):
            value = self.fetch(cfg, session_id)
            if session_id:
                value["showLog"]["revision"] = 1
            return value
        result = self.run_worker(fetcher=wrong)
        self.assertEqual(result["results"][0]["status"], "retry_pending")
        self.assertFalse(self.sent)

    def test_missing_collector_after_finalization_timeout_is_explicit_partial(self):
        self.run_worker(now=NOW+timedelta(hours=2), collector=lambda *_: (_ for _ in ()).throw(PermissionError()))
        self.assertIn(b"partial", self.sent[0])

    def test_test_delivery_does_not_consume_real_show(self):
        self.run_worker(is_test=True)
        self.assertIn(b"TEST", self.sent[0])
        self.assertFalse((Path(self.temp.name)/"state.json").exists())
        self.run_worker()
        self.assertEqual(len(self.sent), 2)

    def test_delivery_bound_is_marked_not_silently_complete(self):
        source = bnl()
        source["database"]["publicDiscord"] = {"rows": [{"text": "x"*1000} for _ in range(30)]}
        with patch.object(worker, "MAX_ATTACHMENTS", 8000):
            manifest, files = worker.bundle(website(), source, NOW)
        self.assertTrue(manifest["deliveryRowsOmitted"])
        self.assertEqual(manifest["status"], "partial")
        self.assertLess(sum(len(data) for name, data in files.items() if name != "manifest.txt"), 8000)

    def test_credentials_require_private_config_and_https(self):
        path = Path(self.temp.name)/"config.json"
        cfg = {**self.cfg, "endpoint": "https://example.test/api/ops/after-show", "export_token": "x"*40, "root": self.temp.name, "smtp_user": "sender@example.test", "smtp_host": "smtp.example.test", "smtp_port": 465, "smtp_password": "fixture"}
        path.write_text(json.dumps(cfg));path.chmod(0o600)
        self.assertEqual(worker.config(path)["smtp_port"], 465)
        path.chmod(0o644)
        with self.assertRaises(ValueError):worker.config(path)
        path.chmod(0o600);cfg["endpoint"]="http://example.test/api/ops/after-show";path.write_text(json.dumps(cfg))
        with self.assertRaises(ValueError):worker.config(path)

    def test_exact_session_ledger_and_active_public_projections_only(self):
        path=Path(self.temp.name)/"fixture.db"
        with sqlite3.connect(path) as conn:
            conn.execute("CREATE TABLE tiktok_show_evidence_ledgers(guild_id INTEGER, show_key TEXT, schema_version TEXT, show_date TEXT, lifecycle_status TEXT, ended_at_ms INTEGER, ledger_json TEXT)")
            for sid in (SHOW["sessionId"], "private-other"):
                doc={"schemaVersion":"tiktok_show_evidence_ledger_v2","showKey":sid,"operationalEvents":[1,2],"trackRoster":[1],"messages":["not exported raw"]}
                conn.execute("INSERT INTO tiktok_show_evidence_ledgers VALUES(1,?,?,?,?,?,?)",(sid,"tiktok_show_evidence_ledger_v2",SHOW["showDate"],"finalized",int(NOW.timestamp()*1000),json.dumps(doc)))
            conn.execute("CREATE TABLE memory_ledger_entries(guild_id INTEGER,source_event_key TEXT,predicate_key TEXT,public_usable INTEGER,visibility TEXT,lifecycle_status TEXT)")
            conn.executemany("INSERT INTO memory_ledger_entries VALUES(1,?,?,?,?,?)",[(SHOW["sessionId"],"barcode_radio.show_episode",1,"public_safe","active"),(SHOW["sessionId"],"barcode_radio.show_participation",0,"private","active"),("private-other","barcode_radio.show_episode",1,"public_safe","active")])
        before=path.read_bytes()
        start,end=capture.window(SHOW["showDate"],NOW+timedelta(hours=1))
        result=capture.db_capture(path,1,start,end,SHOW["showDate"],50,SHOW["sessionId"])
        self.assertEqual(len(result["showLedgers"]["rows"]),1)
        self.assertEqual(result["showLedgers"]["rows"][0]["operationalEventsCount"],2)
        self.assertNotIn("not exported raw",json.dumps(result))
        self.assertEqual(result["episodeProjections"]["counts"],{"barcode_radio.show_episode":1,"barcode_radio.show_participation":0})
        self.assertEqual(path.read_bytes(),before)


if __name__ == "__main__":
    unittest.main()
