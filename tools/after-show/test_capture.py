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
    def ledger_capture(self, raw, *, encoding='UTF-8', schema='tiktok_show_evidence_ledger_v2',
                       lifecycle='finalized', show_key='session_fixture', extra_rows=(), limit=5):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'ledger.sqlite'
            stamp = int(datetime(2026, 9, 26, 8, tzinfo=timezone.utc).timestamp()*1000)
            with sqlite3.connect(path) as conn:
                conn.execute('PRAGMA encoding="' + encoding + '"')
                conn.execute('CREATE TABLE tiktok_show_evidence_ledgers(guild_id INTEGER, show_key TEXT, schema_version TEXT, show_date TEXT, lifecycle_status TEXT, ended_at_ms INTEGER, source_digest TEXT, ledger_json TEXT)')
                conn.execute('INSERT INTO tiktok_show_evidence_ledgers VALUES(?,?,?,?,?,?,?,?)',
                             (1, show_key, schema, '2026-09-25', lifecycle, stamp, 'a'*64, raw))
                conn.executemany('INSERT INTO tiktok_show_evidence_ledgers VALUES(?,?,?,?,?,?,?,?)', extra_rows)
                conn.execute('CREATE TABLE memory_ledger_entries(guild_id INTEGER, source_event_key TEXT, predicate_key TEXT, public_usable INTEGER, visibility TEXT, lifecycle_status TEXT)')
            before = hashlib.sha256(path.read_bytes()).hexdigest()
            start, end = capture.window('2026-09-25', datetime(2026, 9, 26, 9, tzinfo=timezone.utc))
            result = capture.db_capture(path, 1, start, end, '2026-09-25', limit, 'session_fixture')
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), before)
            return result

    def test_large_finalized_ledger_projects_without_exporting_source_text(self):
        doc = {'schemaVersion': 'tiktok_show_evidence_ledger_v2', 'showKey': 'session_fixture',
               'operationalEvents': [1, 2], 'trackRoster': [1], 'discordInteractions': [],
               'messages': ['PRIVATE_LEDGER_TEXT'], 'padding': ''}
        prefix = json.dumps(doc, separators=(',', ':'))
        for chars in (3_999_999, 4_000_000, 4_000_001, 5_214_732,
                      capture.LEDGER_STORAGE_BYTE_LIMIT-1, capture.LEDGER_STORAGE_BYTE_LIMIT,
                      capture.LEDGER_STORAGE_BYTE_LIMIT+1):
            with self.subTest(chars=chars):
                doc['padding'] = 'x'*(chars-len(prefix))
                raw = json.dumps(doc, separators=(',', ':'))
                self.assertEqual(len(raw), chars)
                result = self.ledger_capture(raw)
                row = result['showLedgers']['rows'][0]
                self.assertEqual(row['source_digest'], 'a'*64)
                if chars <= capture.LEDGER_STORAGE_BYTE_LIMIT:
                    self.assertEqual(row['sessionId'], 'session_fixture')
                    self.assertEqual([row[field+'Count'] for field in capture.LEDGER_COUNT_FIELDS], [2, 1, 0, 1])
                    self.assertTrue(row['ledgerProjection']['available'])
                    self.assertTrue(row['ledgerProjection']['countCoverage']['available'])
                else:
                    self.assertEqual(row['sessionId'], '')
                    self.assertFalse(row['ledgerProjection']['available'])
                    self.assertEqual(row['ledgerProjection']['reason'], 'ledger_storage_byte_limit')
                self.assertEqual(row['ledgerProjection']['storageBytes'], chars)
                self.assertNotIn('ledger_json', row)
                self.assertNotIn('PRIVATE_LEDGER_TEXT', json.dumps(result))
                self.assertLess(len(json.dumps(row)), 2000)

    def test_storage_byte_limit_at_below_and_above_with_multibyte_json(self):
        raw = json.dumps({'schemaVersion': 'tiktok_show_evidence_ledger_v2', 'showKey': 'session_fixture',
                          'operationalEvents': [], 'trackRoster': [], 'discordInteractions': [],
                          'messages': ['漢🙂'*100]}, ensure_ascii=False)
        for encoding, python_encoding in (('UTF-8', 'utf-8'), ('UTF-16le', 'utf-16le')):
            size = len(raw.encode(python_encoding))
            self.assertGreater(size, len(raw))
            for cap in (size-1, size, size+1):
                with self.subTest(encoding=encoding, cap=cap), patch.object(capture, 'LEDGER_STORAGE_BYTE_LIMIT', cap):
                    row = self.ledger_capture(raw, encoding=encoding)['showLedgers']['rows'][0]
                    projection = row['ledgerProjection']
                    self.assertEqual(projection['storageBytes'], size)
                    self.assertEqual(projection['storageByteLimit'], cap)
                    self.assertEqual(projection['available'], size <= cap)
                    self.assertEqual(row['sessionId'], 'session_fixture' if size <= cap else '')
                    if size > cap:
                        self.assertEqual(projection['reason'], 'ledger_storage_byte_limit')

    def test_size_type_and_raw_nul_guards_precede_json_parsing(self):
        with sqlite3.connect(':memory:') as conn, patch.object(capture, 'LEDGER_STORAGE_BYTE_LIMIT', 512):
            conn.execute('CREATE TABLE fixture(show_key TEXT, schema_version TEXT, ledger_json)')
            conn.create_function('json_valid', 1, lambda _: self.fail('guarded source reached JSON parser'))
            for raw, reason in (('x'*513, 'ledger_storage_byte_limit'),
                                (b'private bytes', 'invalid_ledger_json_type'),
                                ('{}\x00PRIVATE_SUFFIX', 'invalid_ledger_json')):
                with self.subTest(reason=reason):
                    conn.execute('DELETE FROM fixture')
                    conn.execute('INSERT INTO fixture VALUES(?,?,?)', ('session_fixture', 'tiktok_show_evidence_ledger_v2', raw))
                    _, summary = conn.execute('SELECT '+capture.ledger_projection_selection()+' FROM fixture').fetchone()
                    self.assertEqual(json.loads(summary), {'available': 0, 'reason': reason})

    def test_invalid_ledger_keeps_safe_exact_session_diagnostics(self):
        valid = '{"schemaVersion":"tiktok_show_evidence_ledger_v2","showKey":"session_fixture","messages":[]}'
        cases = (
            ('not JSON PRIVATE_TEXT', 'invalid_ledger_json'),
            ('[]', 'ledger_json_not_object'),
            (valid+'\x00PRIVATE_SUFFIX', 'invalid_ledger_json'),
            (valid.replace('"showKey":', '"showKey":"other","showKey":'), 'duplicate_ledger_metadata_keys'),
            (valid.replace('"showKey":', '"show\\u004bey":"other","showKey":'), 'duplicate_ledger_metadata_keys'),
            (valid.replace('"messages":[]', '"messages":[],"messages":["PRIVATE_TEXT"]'), 'duplicate_ledger_metadata_keys'),
            (valid.replace('tiktok_show_evidence_ledger_v2', 'legacy'), 'ledger_schema_mismatch'),
            (valid.replace('"showKey":"session_fixture"', '"showKey":"other"'), 'ledger_session_mismatch'),
            (valid.replace('"showKey":"session_fixture"', '"showKey":null'), 'ledger_session_mismatch'),
        )
        for raw, reason in cases:
            with self.subTest(reason=reason, raw=raw[:30]):
                result = self.ledger_capture(raw)
                self.assertTrue(result['showLedgers']['available'])
                self.assertEqual(len(result['showLedgers']['rows']), 1)
                row = result['showLedgers']['rows'][0]
                self.assertEqual(row['show_key'], 'session_fixture')
                self.assertEqual(row['sessionId'], '')
                self.assertFalse(row['ledgerProjection']['available'])
                self.assertEqual(row['ledgerProjection']['reason'], reason)
                self.assertFalse(result['episodeProjections']['available'])
                self.assertEqual(result['episodeProjections']['reason'], 'exact_session_ledger_unavailable')
                self.assertNotIn('counts', result['episodeProjections'])
                self.assertNotIn('PRIVATE', json.dumps(result))
        row = self.ledger_capture(valid, schema='legacy')['showLedgers']['rows'][0]
        self.assertEqual(row['ledgerProjection']['reason'], 'ledger_schema_mismatch')

    def test_exact_session_predicate_precedes_limit_and_other_guild_date_exclusion(self):
        raw = json.dumps({'schemaVersion': 'tiktok_show_evidence_ledger_v2', 'showKey': 'session_fixture'})
        other = json.dumps({'schemaVersion': 'tiktok_show_evidence_ledger_v2', 'showKey': 'other'})
        stamp = int(datetime(2026, 9, 26, 2, tzinfo=timezone.utc).timestamp()*1000)
        extra = [(1, 'other', 'tiktok_show_evidence_ledger_v2', '2026-09-25', 'finalized', stamp, 'b'*64, other),
                 (2, 'session_fixture', 'tiktok_show_evidence_ledger_v2', '2026-09-25', 'finalized', stamp, 'c'*64, raw),
                 (1, 'session_fixture', 'tiktok_show_evidence_ledger_v2', '2026-09-24', 'finalized', stamp, 'd'*64, raw)]
        result = self.ledger_capture(raw, extra_rows=extra, limit=1)['showLedgers']
        self.assertEqual(len(result['rows']), 1)
        self.assertFalse(result['truncated'])
        self.assertEqual(result['rows'][0]['source_digest'], 'a'*64)

    def test_decoded_top_level_nul_keys_cannot_alias_binding_or_counts(self):
        base = {'schemaVersion': 'tiktok_show_evidence_ledger_v2', 'showKey': 'session_fixture',
                'operationalEvents': [], 'trackRoster': [1], 'discordInteractions': [], 'messages': []}
        cases = []
        for field in ('showKey', 'schemaVersion'):
            others = {key: value for key, value in base.items() if key != field}
            alias_only = {field+'\x00PRIVATE_SUFFIX': base[field], **others}
            cases.append(alias_only)
            cases.append({**alias_only, field: 'conflicting_value'})
        for field in capture.LEDGER_COUNT_FIELDS:
            cases.append({field+'\x00PRIVATE_SUFFIX': [1, 2, 3], **base})
        cases.append({'UNRELATED_PRIVATE\x00KEY': 'PRIVATE_VALUE', **base})
        for slashes in range(1, 6):
            cases.append({'UNRELATED'+'\\'*slashes+'\x00PRIVATE': 'PRIVATE_VALUE', **base})
        for doc in cases:
            with self.subTest(keys=tuple(doc)):
                raw = json.dumps(doc)
                self.assertIn('\\u0000', raw)
                self.assertNotIn('\x00', raw)
                result = self.ledger_capture(raw)
                row = result['showLedgers']['rows'][0]
                self.assertEqual(row['sessionId'], '')
                self.assertFalse(row['ledgerProjection']['available'])
                self.assertEqual(row['ledgerProjection']['reason'], 'invalid_ledger_metadata_keys')
                self.assertTrue(all(row[field+'Count'] is None for field in capture.LEDGER_COUNT_FIELDS))
                self.assertFalse(result['episodeProjections']['available'])
                self.assertNotIn('PRIVATE', json.dumps(result))

    def test_binding_value_nul_cannot_match_a_valid_prefix(self):
        base = {'schemaVersion': 'tiktok_show_evidence_ledger_v2', 'showKey': 'session_fixture',
                'operationalEvents': [], 'trackRoster': [], 'discordInteractions': [], 'messages': []}
        for field in ('schemaVersion', 'showKey'):
            for slashes in range(6):
                for actual_nul in (True, False):
                    with self.subTest(field=field, slashes=slashes, actual_nul=actual_nul):
                        suffix = '\x00PRIVATE_SUFFIX' if actual_nul else 'u0000PRIVATE_SUFFIX'
                        doc = {**base, field: base[field]+'\\'*slashes+suffix}
                        result = self.ledger_capture(json.dumps(doc))
                        row = result['showLedgers']['rows'][0]
                        self.assertEqual(row['sessionId'], '')
                        self.assertFalse(row['ledgerProjection']['available'])
                        reason = row['ledgerProjection']['reason']
                        expected = 'invalid_ledger_metadata_values' if actual_nul else (
                            'ledger_schema_mismatch' if field == 'schemaVersion' else 'ledger_session_mismatch')
                        self.assertEqual(reason, expected)
                        self.assertNotIn('PRIVATE', json.dumps(result))

    def test_literal_nul_escape_keys_do_not_invalidate_safe_metadata(self):
        base = {'schemaVersion': 'tiktok_show_evidence_ledger_v2', 'showKey': 'session_fixture',
                'operationalEvents': [], 'trackRoster': [], 'discordInteractions': [], 'messages': []}
        for slashes in range(1, 6):
            with self.subTest(slashes=slashes):
                doc = {'showKey'+'\\'*slashes+'u0000PRIVATE_SUFFIX': 'PRIVATE_VALUE', **base}
                result = self.ledger_capture(json.dumps(doc))
                row = result['showLedgers']['rows'][0]
                self.assertEqual(row['sessionId'], 'session_fixture')
                self.assertTrue(row['ledgerProjection']['available'])
                self.assertTrue(row['ledgerProjection']['countCoverage']['available'])
                self.assertNotIn('PRIVATE', json.dumps(result))

    def test_nested_escaped_nul_keys_and_values_do_not_invalidate_safe_metadata(self):
        doc = {'schemaVersion': 'tiktok_show_evidence_ledger_v2', 'showKey': 'session_fixture',
               'operationalEvents': [], 'trackRoster': [], 'discordInteractions': [],
               'messages': [{'NESTED_PRIVATE\x00KEY': 'PRIVATE\x00VALUE'}, 'PRIVATE\x00VALUE']}
        result = self.ledger_capture(json.dumps(doc))
        row = result['showLedgers']['rows'][0]
        self.assertEqual(row['sessionId'], 'session_fixture')
        self.assertTrue(row['ledgerProjection']['available'])
        self.assertTrue(row['ledgerProjection']['countCoverage']['available'])
        self.assertEqual(row['messagesCount'], 2)
        self.assertNotIn('PRIVATE', json.dumps(result))

    def test_missing_nonarray_counts_are_unavailable_without_zero_or_lost_binding(self):
        raw = json.dumps({'schemaVersion': 'tiktok_show_evidence_ledger_v2', 'showKey': 'session_fixture',
                          'operationalEvents': [], 'trackRoster': {}, 'messages': None})
        row = self.ledger_capture(raw, lifecycle='active')['showLedgers']['rows'][0]
        self.assertEqual(row['sessionId'], 'session_fixture')
        self.assertEqual(row['lifecycle_status'], 'active')
        self.assertEqual(row['operationalEventsCount'], 0)
        self.assertIsNone(row['trackRosterCount'])
        self.assertIsNone(row['discordInteractionsCount'])
        self.assertIsNone(row['messagesCount'])
        self.assertFalse(row['ledgerProjection']['countCoverage']['available'])
        self.assertEqual(row['ledgerProjection']['countCoverage']['missingOrNonArrayFields'],
                         ['trackRoster', 'discordInteractions', 'messages'])

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



class CanonicalProjectionTests(unittest.TestCase):
    SESSION = 'session_fixture'
    DIGEST = 'a'*64

    def participant_key(self, participant, surface):
        identity = (participant.get('subjectRef') or participant.get('handle') or 'unknown-viewer')[:240]
        return self.SESSION+':participant:'+surface+':'+hashlib.sha256(identity.encode()).hexdigest()[:32]

    def native_capture(self, participants=(), discord=(), *, raw=None, rows=None,
                       index='canonical', extra_rows=(), lifecycle='finalized',
                       digest=None, limit=5, trace=None):
        doc = {'schemaVersion': 'tiktok_show_evidence_ledger_v2', 'showKey': self.SESSION,
               'sourceDigest': self.DIGEST, 'participants': list(participants),
               'discordParticipants': list(discord), 'operationalEvents': [],
               'trackRoster': [], 'discordInteractions': [], 'messages': ['PRIVATE_SOURCE_TEXT']}
        if raw is None:
            raw = json.dumps(doc)
        if rows is None:
            keys = {self.participant_key(item, surface)
                    for surface, people in (('tiktok', participants), ('discord', discord))
                    for item in people}
            rows = [(1, 'tiktok_show_evidence', self.SESSION, self.DIGEST, self.SESSION,
                     'barcode_radio.show_episode', 1, 'public_safe', 'active')]
            rows.extend((1, 'tiktok_show_evidence', key, self.DIGEST, self.SESSION,
                         'barcode_radio.show_participation', 1, 'public_safe', 'active') for key in keys)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'canonical.sqlite'
            stamp = int(datetime(2026, 9, 26, 8, tzinfo=timezone.utc).timestamp()*1000)
            with sqlite3.connect(path) as conn:
                conn.execute('CREATE TABLE tiktok_show_evidence_ledgers(guild_id INTEGER, show_key TEXT, schema_version TEXT, show_date TEXT, lifecycle_status TEXT, ended_at_ms INTEGER, source_digest TEXT, ledger_json TEXT)')
                conn.execute('INSERT INTO tiktok_show_evidence_ledgers VALUES(?,?,?,?,?,?,?,?)',
                             (1, self.SESSION, doc['schemaVersion'], '2026-09-25', lifecycle,
                              stamp, self.DIGEST if digest is None else digest, raw))
                conn.execute('CREATE TABLE memory_ledger_entries(guild_id INTEGER, source_table TEXT, source_row_id TEXT, source_revision TEXT, source_event_key TEXT, predicate_key TEXT, public_usable INTEGER, visibility TEXT, lifecycle_status TEXT)')
                if index == 'canonical':
                    conn.execute('CREATE INDEX idx_mle_source ON memory_ledger_entries(guild_id,source_table,source_row_id,source_revision)')
                elif index == 'wrong':
                    conn.execute('CREATE INDEX idx_mle_source ON memory_ledger_entries(guild_id,predicate_key)')
                elif index == 'partial':
                    conn.execute('CREATE INDEX idx_mle_source ON memory_ledger_entries(guild_id,source_table,source_row_id,source_revision) WHERE public_usable=1')
                conn.execute('CREATE INDEX idx_mle_predicate ON memory_ledger_entries(guild_id,predicate_key)')
                conn.executemany('INSERT INTO memory_ledger_entries VALUES(?,?,?,?,?,?,?,?,?)', [*rows, *extra_rows])
            before = hashlib.sha256(path.read_bytes()).hexdigest()
            start, end = capture.window('2026-09-25', datetime(2026, 9, 26, 9, tzinfo=timezone.utc))
            original_connect = sqlite3.connect
            def connect(*args, **kwargs):
                conn = original_connect(*args, **kwargs)
                if trace is not None:
                    conn.set_trace_callback(trace.append)
                return conn
            with patch.object(capture.sqlite3, 'connect', side_effect=connect):
                result = capture.db_capture(path, 1, start, end, '2026-09-25', limit, self.SESSION)
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), before)
            return result

    def test_current_canonical_counts_and_internal_identity_privacy(self):
        people = [{'subjectRef': 'PRIVATE_SUBJECT_REF', 'handle': 'PRIVATE_HANDLE'}]
        result = self.native_capture(people, [{'handle': 'PRIVATE_DISCORD_HANDLE'}])
        section = result['episodeProjections']
        self.assertTrue(section['available'])
        self.assertEqual(section['counts'], {'barcode_radio.show_episode': 1, 'barcode_radio.show_participation': 2})
        self.assertEqual(section['expectedCanonicalRows'], 3)
        self.assertIn('Current canonical native projection rows', section['scope'])
        exported = json.dumps(result)
        packet = capture.pack({'database': result})
        with zipfile.ZipFile(io.BytesIO(packet)) as archive:
            exported += archive.read('evidence.json').decode()
        for sentinel in ('PRIVATE_SUBJECT_REF', 'PRIVATE_HANDLE', 'PRIVATE_DISCORD_HANDLE',
                         'PRIVATE_SOURCE_TEXT', ':participant:', 'ledger_json'):
            self.assertNotIn(sentinel, exported)

    def test_native_fallback_unicode_truncation_and_surface_deduplication(self):
        people = [{'subjectRef': '🙂'*241}, {'subjectRef': '🙂'*240+'different'},
                  {'subjectRef': None, 'handle': 'fallback'}, {'subjectRef': '', 'handle': 'fallback'},
                  {}, {'subjectRef': ' '}, {'subjectRef': r'literal\u0000value'}]
        result = self.native_capture(people, [{'handle': 'fallback'}])
        self.assertEqual(result['episodeProjections']['counts']['barcode_radio.show_participation'], 6)
        self.assertEqual(result['episodeProjections']['expectedCanonicalRows'], 7)

    def test_stale_foreign_ineligible_and_cross_wired_rows_are_excluded(self):
        person = {'subjectRef': 'PRIVATE_IDENTITY'}
        key = self.participant_key(person, 'tiktok')
        episode = (1, 'tiktok_show_evidence', self.SESSION, self.DIGEST, self.SESSION,
                   'barcode_radio.show_episode', 1, 'public_safe', 'active')
        participation = (1, 'tiktok_show_evidence', key, self.DIGEST, self.SESSION,
                         'barcode_radio.show_participation', 1, 'public_safe', 'active')
        extras = []
        for base in (episode, participation):
            for field, value in ((0, 2), (1, 'foreign_source'), (3, 'b'*64),
                                 (4, 'different_episode'), (6, 0), (7, 'private'), (8, 'superseded')):
                changed = list(base); changed[field] = value; extras.append(tuple(changed))
        extras.extend([
            (1, 'tiktok_show_evidence', key, self.DIGEST, self.SESSION, 'barcode_radio.show_episode', 1, 'public', 'active'),
            (1, 'tiktok_show_evidence', self.SESSION, self.DIGEST, self.SESSION, 'barcode_radio.show_participation', 1, 'public', 'active'),
            (1, 'tiktok_show_evidence', 'different_row', self.DIGEST, self.SESSION, 'barcode_radio.show_participation', 1, 'public', 'active'),
        ])
        trace = []
        section = self.native_capture([person], extra_rows=extras, trace=trace)['episodeProjections']
        self.assertEqual(section['counts'], {'barcode_radio.show_episode': 1, 'barcode_radio.show_participation': 1})
        count_queries = [query for query in trace if 'SELECT COUNT(*) FROM memory_ledger_entries' in query]
        self.assertEqual(len(count_queries), 2)
        self.assertTrue(all('INDEXED BY idx_mle_source' in query and 'source_revision=' in query
                            and 'source_row_id IN' in query for query in count_queries))
        self.assertTrue(any('PRAGMA query_only=ON' in query for query in trace))

    def test_missing_wrong_or_partial_index_is_explicitly_unavailable(self):
        for index in ('missing', 'wrong', 'partial'):
            with self.subTest(index=index):
                trace = []
                result = self.native_capture(index=index, trace=trace)
                section = result['episodeProjections']
                self.assertTrue(result['available'])
                self.assertFalse(section['available'])
                self.assertEqual(section['reason'], 'native_source_index_unavailable')
                self.assertNotIn('counts', section)
                self.assertFalse(any('SELECT COUNT(*) FROM memory_ledger_entries' in query for query in trace))

    def test_missing_unsupported_and_mismatched_native_metadata_never_becomes_zero(self):
        base = {'schemaVersion': 'tiktok_show_evidence_ledger_v2', 'showKey': self.SESSION,
                'sourceDigest': self.DIGEST, 'participants': [], 'discordParticipants': []}
        docs = []
        for field in ('participants', 'discordParticipants', 'sourceDigest'):
            missing = dict(base); missing.pop(field); docs.append(missing)
            for value in (None, {}, 'PRIVATE_VALUE', 3, True):
                docs.append({**base, field: value})
        docs.extend({**base, 'participants': [item]} for item in
                    (None, 'PRIVATE_VALUE', 7, [], {'subjectRef': 7}, {'handle': False},
                     {'subjectRef': 'PRIVATE\x00VALUE'}, {'handle': '\ud800'}))
        for doc in docs:
            with self.subTest(fields=tuple(doc)):
                result = self.native_capture(raw=json.dumps(doc), rows=[])
                section = result['episodeProjections']
                self.assertFalse(section['available'])
                self.assertNotIn('counts', section)
                self.assertIn(section['reason'], ('unsupported_native_projection_metadata',
                                                  'native_projection_digest_mismatch'))
                self.assertNotIn('PRIVATE', json.dumps(result))
        section = self.native_capture(raw=json.dumps({**base, 'sourceDigest': 'b'*64}), rows=[])['episodeProjections']
        self.assertEqual(section['reason'], 'native_projection_digest_mismatch')
        for digest in ('A'*64, 'a'*63, 'PRIVATE_DIGEST', None):
            # None uses the fixture default; test missing table digest with an empty string instead.
            if digest is None:
                digest = ''
            section = self.native_capture(digest=digest, rows=[])['episodeProjections']
            self.assertEqual(section['reason'], 'unsupported_native_projection_metadata')
            self.assertNotIn('counts', section)

    def test_duplicate_and_nul_alias_identity_metadata_is_rejected(self):
        base = '{"schemaVersion":"tiktok_show_evidence_ledger_v2","showKey":"session_fixture","sourceDigest":"'+self.DIGEST+'","participants":[ITEM],"discordParticipants":[]}'
        items = ('{"subject\\u0052ef":"PRIVATE_SUBJECT"}',
                 '{"ha\\u006edle":"PRIVATE_HANDLE"}',
                 '{"subject\\u0052ef":7}',
                 '{"ha\\u006edle":false}',
                 '{"subject\\u0052ef":"PRIVATE_SUBJECT","handle":"fallback"}',
                 '{"subjectRef":"first","subjectRef":"PRIVATE_SECOND"}',
                 '{"subject\\u0052ef":"first","subjectRef":"PRIVATE_SECOND"}',
                 '{"handle":"first","handle":"PRIVATE_SECOND"}',
                 '{"subjectRef\\u0000PRIVATE_SUFFIX":"first","subjectRef":"second"}',
                 '{"handle\\u0000PRIVATE_SUFFIX":"first"}',
                 '{"subjectRef":"first\\u0000PRIVATE_SUFFIX"}')
        for item in items:
            with self.subTest(item=item[:30]):
                result = self.native_capture(raw=base.replace('ITEM', item), rows=[])
                self.assertFalse(result['episodeProjections']['available'])
                self.assertNotIn('counts', result['episodeProjections'])
                self.assertNotIn('PRIVATE', json.dumps(result))
        for field, value in (('sourceDigest', '"'+self.DIGEST+'"'),
                             ('participants', '[]'), ('discordParticipants', '[]')):
            raw = base.replace('ITEM', '{}').replace('"'+field+'":', '"'+field+'":'+value+',"'+field+'":')
            section = self.native_capture(raw=raw, rows=[])['episodeProjections']
            self.assertFalse(section['available'])
            self.assertNotIn('counts', section)

    def test_participant_bound_and_batching_are_independent_of_export_limit(self):
        people = [{'subjectRef': 'PRIVATE_REF_'+str(index)} for index in range(7)]
        with patch.object(capture, 'PROJECTION_PARTICIPANT_LIMIT', 7), \
             patch.object(capture, 'PROJECTION_QUERY_BATCH', 2):
            trace = []
            section = self.native_capture(people, limit=1, trace=trace)['episodeProjections']
            self.assertTrue(section['available'])
            self.assertEqual(section['counts']['barcode_radio.show_participation'], 7)
            self.assertEqual(len([query for query in trace if 'SELECT COUNT(*) FROM memory_ledger_entries' in query]), 5)
            section = self.native_capture(people, [{}], rows=[], limit=1)['episodeProjections']
            self.assertFalse(section['available'])
            self.assertEqual(section['reason'], 'native_projection_participant_limit')
            self.assertNotIn('counts', section)
        with patch.object(capture, 'PROJECTION_IDENTITY_BYTE_LIMIT', 32):
            section = self.native_capture([{'subjectRef': 'PRIVATE_REF_'*10}], rows=[])['episodeProjections']
            self.assertFalse(section['available'])
            self.assertEqual(section['reason'], 'unsupported_native_projection_metadata')

    def test_nonfinalized_ledger_and_section_failure_do_not_export_partial_counts(self):
        result = self.native_capture(lifecycle='active')
        self.assertEqual(result['episodeProjections']['reason'], 'exact_session_ledger_unavailable')
        original = capture.canonical_episode_projections
        def interrupted(conn, *args):
            class InterruptingConnection:
                def execute(self, query, params=()):
                    if 'SELECT COUNT(*) FROM memory_ledger_entries' in query:
                        raise sqlite3.OperationalError('interrupted PRIVATE_SQL')
                    return conn.execute(query, params)
            return original(InterruptingConnection(), *args)
        with patch.object(capture, 'canonical_episode_projections', side_effect=interrupted):
            result = self.native_capture([{'handle': 'PRIVATE_HANDLE'}])
        self.assertTrue(result['available'])
        self.assertTrue(result['showLedgers']['available'])
        section = result['episodeProjections']
        self.assertFalse(section['available'])
        self.assertEqual((section['errorStage'], section['errorCategory']), ('episodeProjections', 'interrupted'))
        self.assertNotIn('counts', section)
        self.assertNotIn('PRIVATE', json.dumps(result))

if __name__ == '__main__':
    unittest.main()
