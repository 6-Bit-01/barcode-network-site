import hashlib
import io
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from datetime import datetime, timezone
from unittest.mock import patch
import zipfile
import bnl_after_show_capture as capture


class CaptureTests(unittest.TestCase):
    def test_friday_pacific_window_and_midnight(self):
        start, end = capture.window('2026-09-25', datetime(2026, 9, 26, 9, tzinfo=timezone.utc))
        self.assertEqual(start.isoformat(), '2026-09-25T19:00:00+00:00')
        self.assertEqual(end.isoformat(), '2026-09-26T09:00:00+00:00')
        _, capped = capture.window('2026-09-25', datetime(2026, 9, 28, tzinfo=timezone.utc))
        self.assertEqual(capped.isoformat(), '2026-09-26T19:00:00+00:00')

    def test_no_future_window_and_dst_uses_zone(self):
        with self.assertRaises(ValueError):
            capture.window('2026-09-25', datetime(2026, 9, 24, tzinfo=timezone.utc))
        start, end = capture.window('2026-10-31', datetime(2026, 11, 2, tzinfo=timezone.utc))
        self.assertEqual((end-start).total_seconds(), 25*3600)

    def test_explicit_observation_recovers_earlier_test_and_is_always_bounded(self):
        now = datetime(2026, 9, 28, 20, tzinfo=timezone.utc)
        start, end = capture.observation_window(now, '2026-09-26T12:54:00-07:00')
        self.assertEqual(start.isoformat(), '2026-09-26T19:54:00+00:00')
        self.assertEqual(end.isoformat(), '2026-09-26T21:54:00+00:00')
        early_now = datetime(2026, 9, 26, 20, 1, tzinfo=timezone.utc)
        self.assertEqual(capture.observation_window(early_now, '2026-09-26T19:54:00Z')[1], early_now)
        for invalid in ('2026-09-26T19:54:00', '2026-09-29T00:00:00Z', 'invalid'):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                capture.observation_window(now, invalid)

    def test_missing_db_is_not_created(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'absent.sqlite'
            start, end = capture.window('2026-09-25', datetime(2026, 9, 26, 9, tzinfo=timezone.utc))
            result = capture.db_capture(path, 1, start, end, '2026-09-25', 5)
            self.assertFalse(result['available'])
            self.assertEqual(result['errorCategory'], 'cannot_open')
            self.assertEqual(result['errorStage'], 'open')
            self.assertFalse(path.exists())

    def test_test_observation_recovers_post_noon_public_replies_without_changing_show_window(self):
        observed = datetime(2026, 9, 26, 20, 1, tzinfo=timezone.utc)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / 'bnl01_conversations.db'
            with sqlite3.connect(path) as conn:
                conn.execute('CREATE TABLE conversations(id INTEGER, guild_id INTEGER, timestamp TEXT, role TEXT, channel_id INTEGER, user_id INTEGER, content TEXT, channel_policy TEXT)')
                conn.executemany('INSERT INTO conversations VALUES(?,?,?,?,?,?,?,?)', [
                    (1, 1, '2026-09-26T02:00:00Z', 'user', 123, 456, 'Original show comment', 'public_home'),
                    (2, 1, '2026-09-26T19:55:00Z', 'user', 123, 456, 'What stood out last night?', 'public_home'),
                    (3, 1, '2026-09-26T19:55:20Z', 'model', 123, 456, 'The audience supported each other.', 'public_home'),
                    (4, 1, '2026-09-26T19:56:00Z', 'user', 123, 456, 'PRIVATE_TEST_WORDS', 'sealed_test'),
                    (5, 2, '2026-09-26T19:56:00Z', 'user', 123, 456, 'OTHER_GUILD_WORDS', 'public_home'),
                    (6, 1, '2026-09-26T20:01:00Z', 'user', 123, 456, 'EXCLUDED_AT_END', 'public_home'),
                ])
            before = path.read_bytes()
            with patch.object(capture, 'datetime', wraps=datetime) as clock, \
                 patch.object(capture, 'runtime', return_value={}), \
                 patch.object(capture, 'existing_health', return_value={'available': True}), \
                 patch.object(capture, 'capture_journal', return_value={'available': True, 'records': []}) as journal:
                clock.now.return_value = observed
                ordinary = capture.collect(root, 1, '2026-09-25')
                test = capture.collect(root, 1, '2026-09-25', include_recent_observation=True)
                selected = capture.collect(root, 1, '2026-09-25', include_recent_observation=True, observation_start='2026-09-26T19:54:00Z')
            self.assertNotIn('operatorObservation', ordinary)
            self.assertEqual(test['endExclusive'], '2026-09-26T19:00:00+00:00')
            self.assertEqual(test['database'], ordinary['database'])
            self.assertEqual([r['id'] for r in test['database']['publicDiscord']['rows']], [1])
            recent = test['operatorObservation']
            self.assertEqual(recent['startInclusive'], '2026-09-26T18:01:00+00:00')
            self.assertEqual(recent['endExclusive'], observed.isoformat())
            self.assertEqual([r['id'] for r in recent['database']['publicDiscord']['rows']], [2, 3])
            self.assertIn(((datetime(2026, 9, 26, 18, 1, tzinfo=timezone.utc), observed),), journal.call_args_list)
            self.assertEqual(journal.call_args.args, (datetime(2026, 9, 26, 19, 54, tzinfo=timezone.utc), observed))
            self.assertEqual(selected['operatorObservation']['windowSelection'], 'explicit_start')
            self.assertEqual([r['id'] for r in selected['operatorObservation']['database']['publicDiscord']['rows']], [2, 3])
            self.assertEqual(recent['database']['publicDiscord']['rowLimit'], 1000)
            self.assertFalse(recent['database']['publicDiscord']['rows'][1]['deliveryVerified'])
            for private in ('PRIVATE_TEST_WORDS', 'OTHER_GUILD_WORDS', 'EXCLUDED_AT_END'):
                self.assertNotIn(private, json.dumps(test))
            self.assertEqual(path.read_bytes(), before)

    def test_locked_database_is_distinct_from_missing_database_and_does_not_export_error_text(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'fixture.sqlite'
            with sqlite3.connect(path) as writer:
                writer.execute('CREATE TABLE fixture(value TEXT)')
                writer.commit()
                writer.execute('BEGIN EXCLUSIVE')
                start, end = capture.window('2026-09-25', datetime(2026, 9, 26, 9, tzinfo=timezone.utc))
                result = capture.db_capture(path, 1, start, end, '2026-09-25', 5)
                self.assertFalse(result['available'])
                self.assertEqual(result['errorCategory'], 'busy')
                self.assertEqual(result['errorStage'], 'schema')
                self.assertNotIn(directory, json.dumps(result))
                writer.rollback()
        result = capture.sqlite_failure(sqlite3.OperationalError('no such table: PRIVATE_SQL_OR_PATH'), 'schema')
        self.assertEqual(result['errorCategory'], 'schema_unavailable')
        self.assertNotIn('PRIVATE_SQL_OR_PATH', json.dumps(result))

    def test_health_sqlite_failure_uses_the_same_safe_diagnostic(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); (root / 'scripts').mkdir()
            source = b'import sqlite3\ndef inspect(*args, **kwargs):\n    raise sqlite3.OperationalError("unable to open database file PRIVATE_PATH")\n'
            digest = hashlib.sha256(source).hexdigest()
            (root / 'scripts/journal_relay_health.py').write_bytes(source)
            with patch.object(capture, 'HEALTH_READERS', {digest: 'reviewed_fixture'}):
                result = capture.existing_health(root, root / 'missing.db', 1, datetime.now(timezone.utc))
            self.assertEqual(result['errorCategory'], 'cannot_open')
            self.assertEqual(result['errorStage'], 'existing_health')
            self.assertNotIn('PRIVATE_PATH', json.dumps(result))

    def test_public_window_filter_redaction_and_read_only_database(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'fixture.sqlite'
            with sqlite3.connect(path) as conn:
                conn.execute('CREATE TABLE conversations(id INTEGER, guild_id INTEGER, timestamp TEXT, role TEXT, channel_id INTEGER, user_id INTEGER, content TEXT, public_usable INTEGER, channel_policy TEXT, visibility TEXT)')
                base = [1, 1, '2026-09-26T02:00:00Z', 'user', 123, 456, 'public words', 1, 'public_home', 'public']
                rows = [base]
                for index, changes in enumerate(({1:2, 6:'other guild'}, {7:0, 6:'private flag'}, {8:'private', 6:'private channel'}, {9:'private', 6:'private visibility'}, {2:'2026-09-24T02:00:00Z', 6:'outside window'}, {3:'system', 6:'system prompt'}), 2):
                    row = base.copy(); row[0] = index
                    for k, value in changes.items(): row[k] = value
                    rows.append(row)
                conn.executemany('INSERT INTO conversations VALUES(?,?,?,?,?,?,?,?,?,?)', rows)
                conn.execute('CREATE TABLE bnl_journal_source_events(event_seq INTEGER, source_key TEXT, occurred_at_ms INTEGER, subject_ref TEXT, raw_text TEXT, guild_id INTEGER, source_kind TEXT, public_usable INTEGER)')
                stamp = int(datetime(2026, 9, 26, 2, tzinfo=timezone.utc).timestamp()*1000)
                conn.executemany('INSERT INTO bnl_journal_source_events VALUES(?,?,?,?,?,?,?,?)', [
                    (1,'a',stamp,'discord_user:456','public tiktok',1,'tiktok_live_chat',1),
                    (2,'b',stamp,'other','private tiktok',1,'tiktok_live_chat',0),
                    (3,'c',stamp,'other','private imported discord',1,'discord_message',1)])
            before = hashlib.sha256(path.read_bytes()).hexdigest()
            start, end = capture.window('2026-09-25', datetime(2026, 9, 26, 9, tzinfo=timezone.utc))
            result = capture.db_capture(path, 1, start, end, '2026-09-25', 5)
            self.assertTrue(result['available'])
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), before)
            discord = result['publicDiscord']['rows']; tiktok = result['publicTikTok']['rows']
            self.assertEqual([r['text'] for r in discord], ['public words'])
            self.assertEqual([r['text'] for r in tiktok], ['public tiktok'])
            self.assertEqual(discord[0]['speakerKey'], tiktok[0]['speakerKey'])
            self.assertNotIn('user_id', discord[0])
            self.assertFalse(result['journalRuns']['available'])

    def test_current_conversation_schema_public_policy_and_window(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'current.sqlite'
            with sqlite3.connect(path) as conn:
                # Current BNL schema: no public_usable or visibility columns.
                conn.execute('CREATE TABLE conversations(id INTEGER PRIMARY KEY, guild_id INTEGER, user_id INTEGER, user_name TEXT, role TEXT, content TEXT, channel_id INTEGER, channel_name TEXT, channel_policy TEXT, timestamp TEXT, message_id INTEGER)')
                base = [1, 1, 456, 'Fixture Artist', 'user', 'public words', 123, 'public-stage', 'public_home', '2026-09-26T02:00:00Z', 1001]
                rows = [base]
                changes = [
                    {8: 'public_context', 5: 'public context'},
                    {8: 'public_selective', 5: 'public selective'},
                    {8: 'sealed_test', 5: 'sealed words'},
                    {8: 'internal_controlled'}, {8: 'unknown'}, {8: None},
                    {1: 2, 5: 'other guild'}, {4: 'system'},
                    {9: '2026-09-25T18:59:59Z'}, {9: '2026-09-26T09:00:00Z'},
                ]
                for index, changeset in enumerate(changes, 2):
                    row = base.copy(); row[0] = index
                    for key, value in changeset.items(): row[key] = value
                    rows.append(row)
                conn.executemany('INSERT INTO conversations VALUES(?,?,?,?,?,?,?,?,?,?,?)', rows)
            before = hashlib.sha256(path.read_bytes()).hexdigest()
            start, end = capture.window('2026-09-25', datetime(2026, 9, 26, 9, tzinfo=timezone.utc))
            result = capture.db_capture(path, 1, start, end, '2026-09-25', 50)['publicDiscord']
            self.assertTrue(result['available'])
            self.assertEqual([row['text'] for row in result['rows']], ['public words', 'public context', 'public selective'])
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), before)
            self.assertNotIn('Fixture Artist', json.dumps(result))

    def test_limits_are_reported_and_missing_channel_policy_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'fixture.sqlite'
            with sqlite3.connect(path) as conn:
                conn.execute('CREATE TABLE conversations(id INTEGER, guild_id INTEGER, timestamp TEXT, role TEXT, channel_id INTEGER, user_id INTEGER, content TEXT, public_usable INTEGER)')
                conn.execute('CREATE TABLE bnl_journal_source_events(event_seq INTEGER, source_key TEXT, occurred_at_ms INTEGER, subject_ref TEXT, raw_text TEXT, guild_id INTEGER, source_kind TEXT, public_usable INTEGER)')
                stamp = int(datetime(2026, 9, 26, 2, tzinfo=timezone.utc).timestamp()*1000)
                conn.executemany('INSERT INTO bnl_journal_source_events VALUES(?,?,?,?,?,?,?,?)', [(i,str(i),stamp,'subject','x'*7000,1,'tiktok_live_chat',1) for i in range(3)])
            start, end = capture.window('2026-09-25', datetime(2026, 9, 26, 9, tzinfo=timezone.utc))
            result = capture.db_capture(path, 1, start, end, '2026-09-25', 2)
            self.assertFalse(result['publicDiscord']['available'])
            self.assertTrue(result['publicTikTok']['truncated'])
            self.assertEqual(len(result['publicTikTok']['rows']), 2)
            self.assertTrue(result['publicTikTok']['rows'][0]['textTruncated'])

    def test_actual_model_replies_preserve_attribution_and_receipt_correlation(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'current.sqlite'
            with sqlite3.connect(path) as conn:
                # save_model_message stores role=model and user_id=the recipient,
                # not the bot. Assistant is retained for older imported rows.
                conn.execute('CREATE TABLE conversations(id INTEGER, guild_id INTEGER, timestamp TEXT, role TEXT, channel_id INTEGER, user_id INTEGER, content TEXT, channel_policy TEXT, message_id INTEGER, route_mode TEXT)')
                rows = [
                    (1, 1, '2026-09-26T02:00:00Z', 'user', 123, 456, 'What happened?', 'public_home', 1001, 'normal_chat'),
                    (2, 1, '2026-09-26T02:00:02Z', 'model', 123, 456, 'The show opened.', 'public_home', 1002, 'normal_chat'),
                    (3, 1, '2026-09-26T02:00:03Z', 'assistant', 123, 789, 'A second reply.', 'public_context', 1003, 'normal_chat'),
                    (4, 1, '2026-09-26T02:00:04Z', 'model', 456, 456, 'PRIVATE_REPLY', 'sealed_test', 1004, 'normal_chat'),
                    (5, 2, '2026-09-26T02:00:04Z', 'model', 123, 456, 'OTHER_GUILD', 'public_home', 1005, 'normal_chat'),
                ]
                conn.executemany('INSERT INTO conversations VALUES(?,?,?,?,?,?,?,?,?,?)', rows)
            before = path.read_bytes()
            start, end = capture.window('2026-09-25', datetime(2026, 9, 26, 9, tzinfo=timezone.utc))
            result = capture.db_capture(path, 1, start, end, '2026-09-25', 50)['publicDiscord']
            self.assertEqual([row['role'] for row in result['rows']], ['user', 'model', 'assistant'])
            human, reply, legacy = result['rows']
            self.assertNotEqual(reply['speakerKey'], human['speakerKey'])
            self.assertEqual(reply['addressedSpeakerKey'], human['speakerKey'])
            self.assertEqual(reply['speakerKey'], legacy['speakerKey'])
            self.assertEqual(reply['message_id'], 1002)
            self.assertEqual(reply['route_mode'], 'normal_chat')
            # Existing synthesis._digest(final_response) contract: JSON array,
            # compact UTF-8, not a hash of the redacted attachment text.
            expected = hashlib.sha256(b'["The show opened."]').hexdigest()
            self.assertEqual(reply['responseReceiptHash'], expected)
            self.assertFalse(reply['deliveryVerified'])
            self.assertEqual(path.read_bytes(), before)
            self.assertNotIn('PRIVATE_REPLY', json.dumps(result))
            self.assertNotIn('OTHER_GUILD', json.dumps(result))

    def test_receipts_distinguish_selected_packet_from_repaired_sent_response(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'receipts.sqlite'
            with sqlite3.connect(path) as conn:
                conn.execute('CREATE TABLE memory_governance_shared_brain_synthesis_runs(guild_id INTEGER, created_at TEXT, run_id TEXT, packet_run_id TEXT, packet_id TEXT, route_family TEXT, authority_mode TEXT, channel_policy TEXT, prompt_applied INTEGER, response_sent INTEGER, candidate_selected INTEGER, live_applied INTEGER, source_revalidation_status TEXT, guard_status TEXT, fallback_reason TEXT, corrective_call_count INTEGER, final_response_hash TEXT, rendered_lane_counts_json TEXT, selected_lane_counts_json TEXT, private_prompt TEXT)')
                conn.execute('INSERT INTO memory_governance_shared_brain_synthesis_runs VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                    (1, '2026-09-26T04:02:06Z', 'run_fixture', 'packet_run_fixture', 'packet_fixture', 'ordinary_chat', 'single_packet', 'public_home', 1, 1, 0, 0,
                     'subject_ambiguous', 'single_packet_repaired_response_sent', 'single_packet_source_change_response_rewritten', 1, 'a'*64,
                     '{"canon":2,"show_episode":1}', '{"canon":2,"show_episode":1,"source_file":1}', 'PRIVATE_PROMPT'))
                conn.execute('CREATE TABLE memory_governance_intelligence_packet_runs(guild_id INTEGER, created_at TEXT, run_id TEXT, packet_id TEXT, selected_lane_counts_json TEXT, revalidation_status TEXT, invalid_invariant_count INTEGER, packet_digest TEXT, prompt_applied INTEGER, live_applied INTEGER)')
                conn.execute('INSERT INTO memory_governance_intelligence_packet_runs VALUES(?,?,?,?,?,?,?,?,?,?)',
                    (1, '2026-09-26T04:02:05Z', 'packet_run_fixture', 'packet_fixture', '{"canon":2,"show_episode":1}', 'passed', 0, 'b'*64, 1, 0))
                conn.execute("INSERT INTO memory_governance_intelligence_packet_runs VALUES(2,'2026-09-26T04:02:05Z','other','other','{}','passed',0,'',0,0)")
            before = path.read_bytes()
            start, end = capture.window('2026-09-25', datetime(2026, 9, 26, 9, tzinfo=timezone.utc))
            result = capture.db_capture(path, 1, start, end, '2026-09-25', 50)
            run = result['sharedBrainReceipts']['rows'][0]
            packet = result['intelligencePacketReceipts']['rows'][0]
            self.assertEqual(run['packet_run_id'], packet['run_id'])
            self.assertEqual(run['packet_id'], packet['packet_id'])
            self.assertEqual(run['source_revalidation_status'], 'subject_ambiguous')
            self.assertEqual(run['guard_status'], 'single_packet_repaired_response_sent')
            self.assertEqual(run['corrective_call_count'], 1)
            self.assertEqual((run['response_sent'], run['live_applied']), (1, 0))
            self.assertEqual(run['rendered_lane_counts']['counts'], {'canon': 2, 'show_episode': 1})
            self.assertEqual(run['selected_lane_counts']['counts']['source_file'], 1)
            self.assertTrue(run['rendered_lane_counts']['available'])
            self.assertEqual(len(result['intelligencePacketReceipts']['rows']), 1)
            self.assertIn('provider_call_count', result['sharedBrainReceipts']['fieldCoverage']['missingFields'])
            self.assertFalse(result['sharedBrainReceipts']['fieldCoverage']['available'])
            self.assertNotIn('PRIVATE_PROMPT', json.dumps(result))
            self.assertEqual(path.read_bytes(), before)

    def test_lane_counts_never_copy_unrecognized_keys_or_invalid_values(self):
        for raw in ('not json', '[]', '"private"', 'x'*9000):
            with self.subTest(raw=raw[:20]):
                self.assertFalse(capture.lane_counts(raw)['available'])
        result = capture.lane_counts('{"canon":2,"show_episode":-1,"source_file":true,"PRIVATE_WORDS":3}')
        self.assertFalse(result['available'])
        self.assertEqual(result['counts'], {'canon': 2})
        self.assertEqual(result['omittedEntries'], 3)
        self.assertNotIn('PRIVATE_WORDS', json.dumps(result))

    def test_reviewed_health_reader_is_allowed_and_identified_without_importing_bot(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); (root/'scripts').mkdir()
            source = b'def inspect(db_path, guild, *, now):\n    return {"fixture": True}\n'
            digest = hashlib.sha256(source).hexdigest()
            (root/'scripts/journal_relay_health.py').write_bytes(source)
            with patch.object(capture, 'HEALTH_READERS', {digest: 'reviewed_fixture'}):
                result = capture.existing_health(root, root/'absent.db', 1, datetime.now(timezone.utc))
            self.assertTrue(result['available'])
            self.assertEqual(result['readerSha256'], digest)
            self.assertEqual(result['readerVersion'], 'reviewed_fixture')
            self.assertFalse((root/'absent.db').exists())

    def test_sensitive_log_text_is_not_exported(self):
        row = capture.journal_metadata({'MESSAGE':'response_send_commit_complete elapsed_seconds=1.25 token=never-export me@example.test https://private.example/x', '__REALTIME_TIMESTAMP':'123'})
        self.assertEqual(row, {'event':'response_send_commit_complete','timestampUs':'123','elapsed_seconds':'1.25'})
        warning = capture.journal_metadata({'MESSAGE':'private exception text','PRIORITY':'3'})
        self.assertNotIn('private', json.dumps(warning))
        self.assertIsNone(capture.journal_metadata({'MESSAGE':'ordinary private text'}))
        sanitized = capture.safe_text('email me@example.test token=abc https://private.example/x')
        self.assertTrue(sanitized['textRedacted'])
        self.assertNotIn('abc', sanitized['text'])
        self.assertNotIn('example', sanitized['text'])

    def test_response_stage_timings_export_numbers_and_known_stages_only(self):
        result = capture.journal_metadata({'MESSAGE': 'response_stage_timing stage=message_capture source_row_id=123 original_ms=4 journal_ms=9 ledger_moment_ms=12 maintenance_ms=2 total_ms=27 token=PRIVATE_TOKEN user_text=PRIVATE_TEXT', '__REALTIME_TIMESTAMP': '999'})
        self.assertEqual(result, {'event': 'response_stage_timing', 'stage': 'message_capture', 'timestampUs': '999', 'source_row_id': '123', 'original_ms': '4', 'journal_ms': '9', 'ledger_moment_ms': '12', 'maintenance_ms': '2', 'total_ms': '27'})
        show = capture.journal_metadata({'MESSAGE': 'response_stage_timing stage=show_source_read elapsed_ms=3 context_chars=400'})
        self.assertEqual(show['stage'], 'show_source_read')
        self.assertEqual(show['elapsed_ms'], '3')
        self.assertEqual(show['context_chars'], '400')
        unknown = capture.journal_metadata({'MESSAGE': 'response_stage_timing stage=PRIVATE_STAGE'})
        self.assertNotIn('stage', unknown)
        self.assertNotIn('PRIVATE_STAGE', json.dumps(unknown))

    def test_journal_permission_failure_is_visible(self):
        with patch.object(capture, 'command', return_value={'available':False,'exitCode':1,'stdout':'','stderrPresent':True}):
            result = capture.capture_journal(datetime.now(timezone.utc), datetime.now(timezone.utc))
        self.assertFalse(result['available'])
        self.assertFalse(result['coverageVerified'])

    def test_zip_hashes_and_health_hash_guard(self):
        with zipfile.ZipFile(io.BytesIO(capture.pack({'status':'synthetic fixture'}))) as archive:
            self.assertIsNone(archive.testzip())
            for line in archive.read('SHA256SUMS.txt').decode().splitlines():
                digest, name = line.split('  ', 1)
                self.assertEqual(hashlib.sha256(archive.read(name)).hexdigest(), digest)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); (root/'scripts').mkdir()
            (root/'scripts/journal_relay_health.py').write_text('raise RuntimeError("must never import unverified source")')
            result = capture.existing_health(root, root/'missing.db', 1, datetime.now(timezone.utc))
            self.assertEqual(result['reason'], 'health_reader_changed; not imported')


if __name__ == '__main__':
    unittest.main()
