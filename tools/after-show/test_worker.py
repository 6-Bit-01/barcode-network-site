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

    def ledger_bnl(self, raw, lifecycle='finalized'):
        path = Path(self.temp.name)/'source-ledger.sqlite'
        with sqlite3.connect(path) as conn:
            conn.execute('CREATE TABLE tiktok_show_evidence_ledgers(guild_id INTEGER, show_key TEXT, schema_version TEXT, show_date TEXT, lifecycle_status TEXT, ended_at_ms INTEGER, source_digest TEXT, ledger_json TEXT)')
            conn.execute('INSERT INTO tiktok_show_evidence_ledgers VALUES(?,?,?,?,?,?,?,?)',
                         (1, SHOW['sessionId'], 'tiktok_show_evidence_ledger_v2', SHOW['showDate'], lifecycle,
                          int(worker.utc(SHOW['endedAt']).timestamp()*1000), 'e'*64, raw))
        before = hashlib.sha256(path.read_bytes()).hexdigest()
        start, end = capture.window(SHOW['showDate'], NOW)
        captured = capture.db_capture(path, 1, start, end, SHOW['showDate'], 5, SHOW['sessionId'])
        self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), before)
        result = bnl()
        result['database']['showLedgers'] = captured['showLedgers']
        return result

    def test_large_finalized_sql_projection_releases_normal_packet_and_deduplicates(self):
        doc = {'schemaVersion': 'tiktok_show_evidence_ledger_v2', 'showKey': SHOW['sessionId'],
               'operationalEvents': [1], 'trackRoster': [1, 2], 'discordInteractions': [],
               'messages': ['PRIVATE_SOURCE_TEXT'], 'padding': ''}
        doc['padding'] = 'x'*(5_214_732-len(json.dumps(doc)))
        raw = json.dumps(doc)
        self.assertEqual(len(raw), 5_214_732)
        source = self.ledger_bnl(raw)
        self.assertTrue(worker.finalized(source, SHOW))
        result = self.run_worker(collector=lambda *_: source)
        self.assertEqual(result['results'][0]['status'], 'smtp_accepted')
        message = BytesParser(policy=policy.default).parsebytes(self.sent[0])
        parts = {part.get_filename(): part.get_payload(decode=True) for part in message.iter_attachments()}
        manifest = json.loads(parts['manifest.txt'])
        evidence = json.loads(parts['bnl-evidence.txt'])
        self.assertEqual(manifest['status'], 'collected')
        self.assertFalse(manifest['isTest'])
        self.assertFalse(manifest['acceptancePassed'])
        self.assertNotIn('PRIVATE_SOURCE_TEXT', parts['bnl-evidence.txt'].decode())
        row = evidence['database']['showLedgers']['rows'][0]
        self.assertEqual(row['source_digest'], 'e'*64)
        self.assertEqual(row['messagesCount'], 1)
        for name, details in manifest['files'].items():
            self.assertEqual(details['bytes'], len(parts[name]))
            self.assertEqual(details['sha256'], hashlib.sha256(parts[name]).hexdigest())
        self.run_worker(collector=lambda *_: self.fail('accepted packet must not recapture'))
        self.assertEqual(len(self.sent), 1)

    def test_rejected_projection_waits_for_evidence_then_partial_at_unchanged_deadline(self):
        raw = json.dumps({'schemaVersion': 'tiktok_show_evidence_ledger_v2', 'showKey': SHOW['sessionId'],
                          'messages': ['PRIVATE_SOURCE_TEXT'*30]})
        with patch.object(capture, 'LEDGER_STORAGE_BYTE_LIMIT', 256):
            source = self.ledger_bnl(raw)
        self.assertFalse(worker.finalized(source, SHOW))
        deadline = worker.utc(SHOW['endedAt'])+timedelta(hours=2)
        result = self.run_worker(now=deadline-timedelta(seconds=1), collector=lambda *_: source)
        self.assertEqual(result['results'][0]['status'], 'waiting_for_bnl_evidence')
        self.assertEqual(result['results'][0]['reason'], 'ledger_projection_unavailable')
        self.assertEqual(result['results'][0]['ledgerProjectionReasons'], ['ledger_storage_byte_limit'])
        self.assertFalse(self.sent)
        result = self.run_worker(now=deadline, collector=lambda *_: source)
        self.assertEqual(result['results'][0]['status'], 'smtp_accepted')
        message = BytesParser(policy=policy.default).parsebytes(self.sent[0])
        parts = {part.get_filename(): part.get_payload(decode=True) for part in message.iter_attachments()}
        manifest = json.loads(parts['manifest.txt'])
        self.assertEqual(manifest['status'], 'partial')
        self.assertIn('exact_session_finalized_ledger_missing', manifest['coverageIssues'])
        self.assertIn('bnl.database.showLedgers.rows[].ledgerProjection:unavailable', manifest['coverageIssues'])
        self.assertIn('ledger_storage_byte_limit', parts['bnl-evidence.txt'].decode())
        self.assertNotIn('PRIVATE_SOURCE_TEXT', parts['bnl-evidence.txt'].decode())
        self.run_worker(now=deadline+timedelta(minutes=5), collector=lambda *_: self.fail('accepted partial packet must not recapture'))
        self.assertEqual(len(self.sent), 1)

    def test_readable_active_missing_and_unavailable_evidence_wait_distinctly(self):
        source = bnl()
        source['database']['showLedgers']['rows'][0]['lifecycle_status'] = 'active'
        self.assertFalse(worker.finalized(source, SHOW))
        self.assertEqual(worker.finalization_wait(source, SHOW), {'status': 'waiting_for_bnl_finalization'})
        source['database']['showLedgers']['rows'] = []
        self.assertEqual(worker.finalization_wait(source, SHOW), {'status': 'waiting_for_bnl_finalization'})
        source['database']['showLedgers']['available'] = False
        result = self.run_worker(collector=lambda *_: source)
        self.assertEqual(result['results'][0], {'sessionId': SHOW['sessionId'], 'status': 'waiting_for_bnl_evidence',
                                              'reason': 'bnl_evidence_unavailable'})
        self.assertFalse(self.sent)
        rejected = bnl()
        row = rejected['database']['showLedgers']['rows'][0]
        row['show_key'] = SHOW['sessionId']
        row['ledgerProjection'] = {'available': False, 'reason': 'PRIVATE_UNKNOWN_REASON'}
        self.assertFalse(worker.finalized(rejected, SHOW))
        status = worker.finalization_wait(rejected, SHOW)
        self.assertEqual(status['status'], 'waiting_for_bnl_evidence')
        self.assertEqual(status['ledgerProjectionReasons'], [])
        self.assertNotIn('PRIVATE', json.dumps(status))

    def test_escaped_nul_binding_alias_cannot_release_finalized_packet(self):
        raw = json.dumps({'schemaVersion': 'tiktok_show_evidence_ledger_v2',
                          'showKey\x00PRIVATE_SUFFIX': SHOW['sessionId'], 'showKey': 'other',
                          'messages': ['PRIVATE_SOURCE_TEXT']})
        source = self.ledger_bnl(raw)
        row = source['database']['showLedgers']['rows'][0]
        self.assertEqual(row['lifecycle_status'], 'finalized')
        self.assertEqual(row['sessionId'], '')
        self.assertFalse(worker.finalized(source, SHOW))
        result = self.run_worker(collector=lambda *_: source)
        self.assertEqual(result['results'][0]['status'], 'waiting_for_bnl_evidence')
        self.assertEqual(result['results'][0]['ledgerProjectionReasons'], ['invalid_ledger_metadata_keys'])
        self.assertFalse(self.sent)
        self.assertNotIn('PRIVATE', json.dumps(source))
        self.assertNotIn('PRIVATE', json.dumps(result))

    def test_escaped_nul_binding_value_cannot_release_finalized_packet(self):
        raw = json.dumps({'schemaVersion': 'tiktok_show_evidence_ledger_v2',
                          'showKey': SHOW['sessionId']+'\x00PRIVATE_SUFFIX',
                          'messages': ['PRIVATE_SOURCE_TEXT']})
        source = self.ledger_bnl(raw)
        self.assertEqual(source['database']['showLedgers']['rows'][0]['lifecycle_status'], 'finalized')
        self.assertFalse(worker.finalized(source, SHOW))
        result = self.run_worker(collector=lambda *_: source)
        self.assertEqual(result['results'][0]['status'], 'waiting_for_bnl_evidence')
        self.assertEqual(result['results'][0]['ledgerProjectionReasons'], ['invalid_ledger_metadata_values'])
        self.assertFalse(self.sent)
        self.assertNotIn('PRIVATE', json.dumps(source))
        self.assertNotIn('PRIVATE', json.dumps(result))

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

    def test_recent_observation_is_selected_by_test_mode_without_changing_saved_config(self):
        flags = []
        def collector(cfg, show):
            flags.append(cfg['include_recent_observation'])
            return bnl(show)
        self.run_worker(is_test=True, collector=collector)
        self.run_worker(collector=collector)
        self.assertEqual(flags, [True, False])
        self.assertNotIn('include_recent_observation', self.cfg)

    def test_test_flag_reaches_the_capture_subprocess(self):
        with patch.object(worker.subprocess, 'run') as run:
            run.return_value.returncode = 0
            run.return_value.stdout = json.dumps(bnl()).encode()
            cfg = {**self.cfg, 'root': self.temp.name, 'guild_id': 1, 'include_recent_observation': True, 'observation_start': '2026-09-26T06:00:00Z'}
            worker.collect_bnl(cfg, SHOW)
            self.assertIn('--include-recent-observation', run.call_args.args[0])
            self.assertEqual(run.call_args.args[0][-2:], ['--observation-start', '2026-09-26T06:00:00Z'])
            worker.collect_bnl({**cfg, 'include_recent_observation': False}, SHOW)
            self.assertNotIn('--include-recent-observation', run.call_args.args[0])
            self.assertNotIn('--observation-start', run.call_args.args[0])

    def test_invalid_observation_window_does_not_fetch_or_send(self):
        for is_test, start in ((False, '2026-09-26T06:00:00Z'), (True, '2026-09-26T06:00:00'), (True, '2026-09-27T00:00:00Z')):
            with self.subTest(is_test=is_test, start=start), self.assertRaises(ValueError):
                self.run_worker(is_test=is_test, observation_start=start)
        self.assertFalse(self.sent)
        captured = []
        def collector(cfg, show):
            captured.append(cfg['observation_start'])
            return bnl(show)
        self.run_worker(is_test=True, observation_start='2026-09-26T06:00:00Z', collector=collector)
        self.assertEqual(captured, ['2026-09-26T06:00:00Z'])

    def test_delivery_bound_is_marked_not_silently_complete(self):
        source = bnl()
        source["database"]["publicDiscord"] = {"rows": [{"text": "x"*1000} for _ in range(30)]}
        with patch.object(worker, "MAX_ATTACHMENTS", 8000):
            manifest, files = worker.bundle(website(), source, NOW)
        self.assertTrue(manifest["deliveryRowsOmitted"])
        self.assertEqual(manifest["status"], "partial")
        self.assertLess(sum(len(data) for name, data in files.items() if name != "manifest.txt"), 8000)

    def test_recent_observation_has_separate_manifest_window_and_delivery_truncation(self):
        source = bnl()
        source['operatorObservation'] = {
            'startInclusive': '2026-09-26T18:01:00Z', 'endExclusive': '2026-09-26T20:01:00Z',
            'database': {'available': True, 'publicDiscord': {'rows': [{'text': 'x'*1000} for _ in range(30)]}},
            'journal': {'available': True, 'records': [{'event': 'response_stage_timing', 'elapsed_ms': '3'} for _ in range(100)]},
        }
        with patch.object(worker, 'MAX_ATTACHMENTS', 5000):
            manifest, files = worker.bundle(website(), source, NOW, is_test=True)
        self.assertEqual(manifest['captureWindow']['end'], source['endExclusive'])
        self.assertEqual(manifest['operatorObservationWindow'], {'start': '2026-09-26T18:01:00Z', 'end': '2026-09-26T20:01:00Z'})
        self.assertIn('operatorObservation.publicDiscord', manifest['deliveryRowsOmitted'])
        self.assertIn('operatorObservation.journal', manifest['deliveryRowsOmitted'])
        self.assertTrue(manifest['isTest'])
        self.assertFalse(manifest['acceptancePassed'])
        self.assertEqual(manifest['status'], 'partial')
        self.assertLess(sum(len(data) for name, data in files.items() if name != 'manifest.txt'), 5000)
        for name, expected in manifest['files'].items():
            self.assertEqual(expected['bytes'], len(files[name]))
            self.assertEqual(expected['sha256'], hashlib.sha256(files[name]).hexdigest())

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
            digest = "a"*64
            participant_key = SHOW["sessionId"]+":participant:tiktok:"+hashlib.sha256(b"private-participant").hexdigest()[:32]
            conn.execute("CREATE TABLE tiktok_show_evidence_ledgers(guild_id INTEGER, show_key TEXT, schema_version TEXT, show_date TEXT, lifecycle_status TEXT, ended_at_ms INTEGER, source_digest TEXT, ledger_json TEXT)")
            for sid in (SHOW["sessionId"], "private-other"):
                doc={"schemaVersion":"tiktok_show_evidence_ledger_v2","showKey":sid,"sourceDigest":digest,"participants":[{"subjectRef":"private-participant"}],"discordParticipants":[],"operationalEvents":[1,2],"trackRoster":[1],"messages":["not exported raw"]}
                conn.execute("INSERT INTO tiktok_show_evidence_ledgers VALUES(1,?,?,?,?,?,?,?)",(sid,"tiktok_show_evidence_ledger_v2",SHOW["showDate"],"finalized",int(NOW.timestamp()*1000),digest,json.dumps(doc)))
            conn.execute("CREATE TABLE memory_ledger_entries(guild_id INTEGER,source_table TEXT,source_row_id TEXT,source_revision TEXT,source_event_key TEXT,predicate_key TEXT,public_usable INTEGER,visibility TEXT,lifecycle_status TEXT)")
            conn.execute("CREATE INDEX idx_mle_source ON memory_ledger_entries(guild_id,source_table,source_row_id,source_revision)")
            conn.executemany("INSERT INTO memory_ledger_entries VALUES(1,'tiktok_show_evidence',?,?,?,?,?,?,?)",[(SHOW["sessionId"],digest,SHOW["sessionId"],"barcode_radio.show_episode",1,"public_safe","active"),(participant_key,digest,SHOW["sessionId"],"barcode_radio.show_participation",0,"private","active"),("private-other",digest,"private-other","barcode_radio.show_episode",1,"public_safe","active")])
        before=path.read_bytes()
        start,end=capture.window(SHOW["showDate"],NOW+timedelta(hours=1))
        result=capture.db_capture(path,1,start,end,SHOW["showDate"],50,SHOW["sessionId"])
        self.assertEqual(len(result["showLedgers"]["rows"]),1)
        self.assertEqual(result["showLedgers"]["rows"][0]["operationalEventsCount"],2)
        self.assertNotIn("not exported raw",json.dumps(result))
        self.assertNotIn("private-participant",json.dumps(result))
        self.assertNotIn(participant_key,json.dumps(result))
        self.assertIn("Current canonical native projection rows",result["episodeProjections"]["scope"])
        self.assertEqual(result["episodeProjections"]["counts"],{"barcode_radio.show_episode":1,"barcode_radio.show_participation":0})
        self.assertEqual(path.read_bytes(),before)


if __name__ == "__main__":
    unittest.main()
