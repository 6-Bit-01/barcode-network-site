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

    def test_missing_db_is_not_created(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'absent.sqlite'
            start, end = capture.window('2026-09-25', datetime(2026, 9, 26, 9, tzinfo=timezone.utc))
            result = capture.db_capture(path, 1, start, end, '2026-09-25', 5)
            self.assertFalse(result['available'])
            self.assertFalse(path.exists())

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
