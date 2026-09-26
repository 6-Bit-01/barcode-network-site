#!/usr/bin/env python3
"""Bounded, read-only after-show evidence. No bot import, restart or network call.

Run on the existing VPS after the show. Output is a private evidence ZIP, not a
database backup. Missing permissions, schemas and retention limits stay explicit.
"""
from __future__ import annotations
import argparse
import base64
from datetime import date, datetime, time as day_time, timedelta, timezone
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import time
import zipfile
from zoneinfo import ZoneInfo

sys.dont_write_bytecode = True
PACIFIC = ZoneInfo("America/Los_Angeles")
GUILD = 1288269405209235551
# Reviewed, content-free inspect() implementations. Never import an unknown
# revision merely because it has the same filename. No runtime_configuration()
# call here: the collector neither imports BNL nor reads service credentials.
HEALTH_READERS = {
    "584ec9bfafc98cad022e88c1fdf5b539d1befb8e1a73594bd1976c13e84e7f19": "initial",
    "24bbbc51846f4de5a2e89374b3234dd04773e02e03b074628a0ea0ba36e9c5fa": "shared_inputs_2026_09_25",
}
PUBLIC_POLICIES = ("public_home", "public_context", "public_selective")
PACKET_LANES = frozenset((
    "current_intent", "conversation_context", "assessment_observation",
    "approved_fact", "moment", "episode", "show_episode", "atomic_knowledge",
    "recurring_theme", "open_loop", "canon", "journal_publication",
    "relay_publication", "website_read_model", "source_file", "relationship_posture",
))
EVENTS = (
    "conversation_context_v2", "named_public_conversation_context_loaded",
    "named_public_member_memory_context_loaded", "show_episode_evidence_context_loaded",
    "generation_started_after_wait", "active_packet_generation_started",
    "gemini_generation_completed", "response_send_commit_complete", "response_send_failed",
    "batch_response_persistence_skipped", "bnl_read_model_fetch_completed",
    "bnl_read_model_fetch_failed", "ambient_source_read", "ambient_source_check",
    "ambient_delivery", "website_relay_event",
)
EVENT_PATTERN = re.compile(r"\b(" + "|".join(EVENTS) + r")\b")
NUMERIC_PATTERN = re.compile(r"\b(elapsed_seconds|selected_wait_seconds|headers_seconds|bytes|shows|"
    r"subject_match|subject_count|query_terms|chars|same_pairs|cross_pairs|payload_count|"
    r"generation_id|channel_id|guild_id|source_count|message_id)=([0-9]+(?:\.[0-9]+)?)(?=[;\s,]|$)")


def window(show_date: str, now: datetime) -> tuple[datetime, datetime]:
    day = date.fromisoformat(show_date)
    start = datetime.combine(day, day_time(12), PACIFIC).astimezone(timezone.utc)
    latest = datetime.combine(day + timedelta(days=1), day_time(12), PACIFIC).astimezone(timezone.utc)
    end = min(now.astimezone(timezone.utc), latest)
    if end <= start:
        raise ValueError("Capture after the selected show's noon-Pacific window begins.")
    return start, end


def safe_text(value: object, limit: int = 6000) -> dict:
    original = str(value or "")
    text = re.sub(r"https?://\S+", "[URL omitted]", original)
    text = re.sub(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", "[email omitted]", text)
    text = re.sub(r"(?i)\b(?:bearer\s+|(?:api[_-]?key|token|secret|password)\s*[:=]\s*)[^\s,;]+", "[credential omitted]", text)
    return {"text": text[:limit], "textTruncated": len(text) > limit,
            "textRedacted": text != original}


def speaker_key(value: object) -> str:
    return hashlib.sha256(str(value or "unknown").encode()).hexdigest()[:20]


def lane_counts(raw: object) -> dict:
    """Export only known source-lane counters, never arbitrary JSON keys/text."""
    try:
        value = json.loads(raw) if isinstance(raw, str) and len(raw) <= 8192 else None
        if not isinstance(value, dict) or len(value) > 64:
            raise ValueError("invalid_counts")
    except (ValueError, TypeError):
        return {"available": False, "reason": "invalid_lane_counts", "counts": {}}
    counts = {key: count for key, count in value.items()
              if key in PACKET_LANES and type(count) is int and 0 <= count <= 1_000_000}
    omitted = len(value) - len(counts)
    return {"available": not omitted, "counts": counts, "omittedEntries": omitted}


def command(args: list[str], timeout: int = 15) -> dict:
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        return {"available": result.returncode == 0, "exitCode": result.returncode,
                "stdout": result.stdout, "stderrPresent": bool(result.stderr.strip())}
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"available": False, "errorType": type(exc).__name__}


def journal_metadata(row: dict) -> dict | None:
    message = row.get("MESSAGE", "")
    if not isinstance(message, str):
        return None
    match = EVENT_PATTERN.search(message)
    if not match:
        if str(row.get("PRIORITY", "")) in {"0", "1", "2", "3", "4"}:
            return {"event": "service_warning_or_error", "priority": str(row["PRIORITY"]),
                    "timestampUs": str(row.get("__REALTIME_TIMESTAMP", ""))}
        return None
    record = {"event": match.group(1), "timestampUs": str(row.get("__REALTIME_TIMESTAMP", ""))}
    record.update(dict(NUMERIC_PATTERN.findall(message)))
    return record


def capture_journal(start: datetime, end: datetime) -> dict:
    cap = 20000
    result = command(["journalctl", "-u", "bnl01", "--since", start.strftime("%Y-%m-%d %H:%M:%S UTC"),
                      "--until", end.strftime("%Y-%m-%d %H:%M:%S UTC"), "--no-pager", "-n", str(cap + 1), "-o", "json"], 25)
    raw = result.pop("stdout", "").splitlines()
    records, malformed = [], 0
    for line in raw[-cap:]:
        try:
            item = journal_metadata(json.loads(line))
            if item:
                records.append(item)
        except (ValueError, TypeError, AttributeError):
            malformed += 1
    return {**result, "inputRowLimit": cap, "inputRowsRead": len(raw), "truncated": len(raw) > cap,
            "malformedRows": malformed, "records": records,
            "coverageVerified": False,
            "meaning": "Allowlisted timing/event metadata only. Missing logs are not proof that an event never happened; model completion and Relay event logs are not delivery proof."}


def db_capture(db_path: Path, guild: int, start: datetime, end: datetime, show_date: str, limit: int, session_id: str | None = None) -> dict:
    result = {"scope": "One read-only SQLite transaction; only currently public-eligible text. Publication/source metadata is not a prose or delivery verdict."}
    try:
        conn = sqlite3.connect(db_path.resolve().as_uri() + "?mode=ro", uri=True, timeout=3)
    except sqlite3.Error as exc:
        return {**result, "available": False, "errorType": type(exc).__name__}
    try:
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA query_only=ON")
        deadline = time.monotonic() + 20
        conn.set_progress_handler(lambda: int(time.monotonic() > deadline), 10000)
        conn.execute("BEGIN")
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}

        def columns(table):
            return {r[1] for r in conn.execute(f"PRAGMA table_info({table})")} if table in tables else set()

        def read(key, table, required, selection, where, args, order):
            if not set(required) <= columns(table):
                result[key] = {"available": False, "reason": "table_or_required_columns_missing"}
                return []
            try:
                rows = conn.execute(f"SELECT {selection} FROM {table} WHERE {where} ORDER BY {order} LIMIT ?", (*args, limit + 1)).fetchall()
                result[key] = {"available": True, "rowLimit": limit, "truncated": len(rows) > limit, "rows": [dict(r) for r in rows[:limit]]}
                return result[key]["rows"]
            except sqlite3.Error as exc:
                result[key] = {"available": False, "errorType": type(exc).__name__}
                return []

        cols = columns("conversations")
        fields = ["id", "timestamp", "role", "channel_id", "user_id", "content"]
        fields.extend(field for field in ("message_id", "route_mode") if field in cols)
        # The live conversations table uses channel_policy. Like BNL's existing
        # Journal reader, honor public_usable when present without requiring it.
        where = "guild_id=? AND channel_policy IN (?,?,?) AND role IN ('user','model','assistant') AND julianday(timestamp)>=julianday(?) AND julianday(timestamp)<julianday(?)"
        if "public_usable" in cols:
            where += " AND public_usable=1"
        if "visibility" in cols:
            where += " AND visibility IN ('public','public_safe')"
        rows = read("publicDiscord", "conversations", fields + ["guild_id", "channel_policy"],
                    ",".join(fields), where, (guild, *PUBLIC_POLICIES, start.isoformat(), end.isoformat()), "timestamp,id")
        for row in rows:
            user_id = row.pop("user_id")
            source_text = row.pop("content")
            if row["role"] in {"model", "assistant"}:
                row["speakerKey"] = speaker_key("bnl_model")
                if user_id:
                    row["addressedSpeakerKey"] = speaker_key("discord_user:" + str(user_id))
                # Same encoding as synthesis._digest(final_response). A match
                # can link exact stored text to a receipt; no timing-based join.
                # Grouped/chunked replies may not have a one-row match.
                row["responseReceiptHash"] = hashlib.sha256(json.dumps(
                    [str(source_text or "")], ensure_ascii=False,
                    sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
            else:
                row["speakerKey"] = speaker_key("discord_user:" + str(user_id))
            row.update(safe_text(source_text))
            row["deliveryVerified"] = False

        fields = ["event_seq", "source_key", "occurred_at_ms", "subject_ref", "raw_text"]
        rows = read("publicTikTok", "bnl_journal_source_events", fields + ["guild_id", "source_kind", "public_usable"],
                    ",".join(fields), "guild_id=? AND source_kind='tiktok_live_chat' AND public_usable=1 AND occurred_at_ms>=? AND occurred_at_ms<?",
                    (guild, int(start.timestamp()*1000), int(end.timestamp()*1000)), "occurred_at_ms,event_seq")
        for row in rows:
            row["speakerKey"] = speaker_key(row.pop("subject_ref"))
            row.update(safe_text(row.pop("raw_text")))

        specs = [
            ("showLedgers", "tiktok_show_evidence_ledgers", "ended_at_ms", True,
             ["show_key", "schema_version", "show_date", "lifecycle_status", "started_at_ms", "ended_at_ms", "event_count", "participant_count", "topic_count", "track_count", "source_digest", "ledger_json"]),
            ("journalRuns", "bnl_journal_automation_runs", "updated_at", False,
             ["run_id", "cadence", "source_window_start", "source_window_end", "lifecycle_state", "reason", "journal_entry_id", "attempt_count", "created_at", "updated_at"]),
            ("relayPublications", "website_relay_history", "published_timestamp", False,
             ["relay_id", "published_timestamp", "event_type"]),
            ("relayAttempts", "website_relay_attempts", "started_at", False,
             ["started_at", "outcome", "reason"]),
            ("momentWindows", "memory_moment_windows", "last_activity_at", False,
             ["lifecycle_status", "qualification_reason", "human_entry_count", "model_entry_count", "participant_count", "last_activity_at"]),
            ("sharedBrainReceipts", "memory_governance_shared_brain_synthesis_runs", "created_at", False,
             ["run_id", "packet_run_id", "packet_id", "schema_version", "created_at", "updated_at",
              "route_family", "authority_mode", "route_mode", "channel_policy", "channel_scope_hash",
              "packet_item_count", "rendered_item_count", "rendered_lane_counts_json", "selected_lane_counts_json",
              "packet_digest", "source_ref_digest", "source_snapshot_digest",
              "prompt_applied", "candidate_selected", "live_applied", "response_sent",
              "revalidation_status", "frame_revalidation_status", "source_revalidation_status",
              "guard_status", "fallback_reason", "provider_call_count", "corrective_call_count",
              "processing_error_count", "candidate_generation_latency_ms", "final_response_hash", "final_response_length"]),
            ("intelligencePacketReceipts", "memory_governance_intelligence_packet_runs", "created_at", False,
             ["run_id", "packet_id", "schema_version", "created_at", "route_mode", "channel_policy",
              "visibility_allowance", "item_count", "validation_item_count",
              "selected_lane_counts_json", "validation_lane_counts_json",
              "conflict_count", "visibility_exclusion_count", "budget_exclusion_count",
              "duplicate_suppression_count", "processing_error_count", "invalid_invariant_count",
              "revalidation_status", "revalidation_changed_count", "packet_digest", "source_ref_digest",
              "prompt_applied", "live_applied"]),
        ]
        for key, table, stamp, millis, wanted in specs:
            present = columns(table)
            selected = [field for field in wanted if field in present]
            params = (guild, int(start.timestamp()*1000), int(end.timestamp()*1000)) if millis else (guild, start.isoformat(), end.isoformat())
            predicate = f"guild_id=? AND {stamp}>=? AND {stamp}<?" if millis else f"guild_id=? AND julianday({stamp})>=julianday(?) AND julianday({stamp})<julianday(?)"
            if key == "showLedgers" and "show_date" in present:
                predicate = "guild_id=? AND show_date=?"
                params = (guild, show_date)
            rows = read(key, table, ["guild_id", stamp], ",".join(selected), predicate, params, stamp)
            if key in {"sharedBrainReceipts", "intelligencePacketReceipts"}:
                missing = [field for field in wanted if field not in present]
                result[key]["fieldCoverage"] = {"available": not missing, "missingFields": missing}
                for row in rows:
                    for field in ("rendered_lane_counts_json", "selected_lane_counts_json", "validation_lane_counts_json"):
                        if field in row:
                            row[field.removesuffix("_json")] = lane_counts(row.pop(field))
            if key == "showLedgers":
                for row in rows:
                    raw = row.pop("ledger_json", "")
                    try:
                        ledger = json.loads(raw) if isinstance(raw, str) and len(raw) <= 4_000_000 else {}
                        if not isinstance(ledger, dict):
                            ledger = {}
                    except (ValueError, TypeError):
                        ledger = {}
                    # Current v2 stores the website session ID as showKey. Never
                    # infer a session from the date or a legacy show:<hash> key.
                    ledger_key = str(row.get("show_key") or "")
                    bound = (ledger.get("schemaVersion") == "tiktok_show_evidence_ledger_v2"
                             and ledger.get("showKey") == ledger_key and not ledger_key.startswith("show:"))
                    row["sessionId"] = ledger_key if bound else ""
                    for field in ("operationalEvents", "trackRoster", "discordInteractions", "messages"):
                        row[field + "Count"] = len(ledger[field]) if isinstance(ledger.get(field), list) else None
                if session_id is not None and result[key].get("available"):
                    rows = [row for row in rows if row.get("sessionId") == session_id]
                    result[key]["rows"] = rows
            for row in rows:
                for field, value in row.items():
                    if isinstance(value, str) and not re.fullmatch(r"[A-Za-z0-9_ .:+/=-]{0,200}", value):
                        row[field] = "[unstructured metadata omitted]"
        if session_id is not None:
            keys = [row["show_key"] for row in result.get("showLedgers", {}).get("rows", []) if row.get("sessionId") == session_id and row.get("show_key")]
            required = {"guild_id", "source_event_key", "predicate_key", "public_usable", "visibility", "lifecycle_status"}
            if required <= columns("memory_ledger_entries"):
                counts = {"barcode_radio.show_episode": 0, "barcode_radio.show_participation": 0}
                if keys:
                    slots = ",".join("?" for _ in keys)
                    query = f"SELECT predicate_key, COUNT(*) FROM memory_ledger_entries WHERE guild_id=? AND source_event_key IN ({slots}) AND public_usable=1 AND visibility IN ('public','public_safe') AND lifecycle_status='active' AND predicate_key IN ('barcode_radio.show_episode','barcode_radio.show_participation') GROUP BY predicate_key"
                    counts.update(dict(conn.execute(query, (guild, *keys)).fetchall()))
                result["episodeProjections"] = {"available": True, "sessionId": session_id, "counts": counts}
            else:
                result["episodeProjections"] = {"available": False, "reason": "table_or_required_columns_missing"}
        result["available"] = True
    except sqlite3.Error as exc:
        result.update(available=False, errorType=type(exc).__name__)
    finally:
        conn.close()
    return result


def existing_health(root: Path, db: Path, guild: int, end: datetime) -> dict:
    path = root / "scripts/journal_relay_health.py"
    try:
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest not in HEALTH_READERS:
            return {"available": False, "reason": "health_reader_changed; not imported"}
        spec = importlib.util.spec_from_file_location("existing_journal_health", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return {"available": True, "readerSha256": digest, "readerVersion": HEALTH_READERS[digest],
                "report": module.inspect(str(db), guild, now=end),
                "meaning": "Existing content-free health reader. Its recent window is the 24 hours ending at capture/window end; this differs from the show-text window."}
    except Exception as exc:
        return {"available": False, "errorType": type(exc).__name__}


def runtime(root: Path) -> dict:
    head = command(["git", "-C", str(root), "rev-parse", "HEAD"])
    sha = head.pop("stdout", "").strip()
    head["commit"] = sha if re.fullmatch(r"[a-f0-9]{40}", sha) else None
    status = command(["git", "-C", str(root), "status", "--porcelain", "--untracked-files=no"])
    dirty = bool(status.pop("stdout", "").strip()) if status["available"] else None
    service = command(["systemctl", "show", "bnl01", "--property=ActiveState,SubState,MainPID,ExecMainStartTimestamp,NRestarts"])
    lines = service.pop("stdout", "").splitlines()
    service["properties"] = dict(line.split("=", 1) for line in lines if "=" in line and line.split("=", 1)[0] in {"ActiveState", "SubState", "MainPID", "ExecMainStartTimestamp", "NRestarts"})
    return {"repository": head, "trackedChangesPresent": dirty, "service": service}


def pack(report: dict) -> bytes:
    output = io.BytesIO()
    files = {"evidence.json": (json.dumps(report, indent=2, ensure_ascii=False) + "\n").encode(),
             "READ_ME.txt": b"Read coverage and unavailable/truncated fields before judging results. This private packet includes eligible public chat, not secrets/configuration/DB backups. It does not prove audible/visible playback, delivery from generation alone, future schedules, or paused feature acceptance. Add the exact show's website Show Log JSON and Playback Diagnostics. Keep the full recording local; request a short clip only for a specific unresolved check.\n"}
    files["SHA256SUMS.txt"] = "".join(hashlib.sha256(body).hexdigest()+"  "+name+"\n" for name, body in files.items()).encode()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, body in files.items():
            archive.writestr(name, body)
    return output.getvalue()


def collect(root: Path, guild: int, show_date: str, limit: int = 5000, session_id: str | None = None, skip_journal: bool = False) -> dict:
    now = datetime.now(timezone.utc)
    start, end = window(show_date, now)
    db = root / "bnl01_conversations.db"
    return {"schema": "barcode_after_show_evidence_v1", "collectorVersion": "shared_brain_receipts_2026_09_26", "generatedAt": now.isoformat(),
            "sessionId": session_id, "showDatePacific": show_date,
            "startInclusive": start.isoformat(), "endExclusive": end.isoformat(),
            "coverage": "Pacific noon before the show to capture time, capped at next-day noon. No boot/PID filter: restarts remain visible. Separate services are not an atomic snapshot.",
            "runtime": runtime(root),
            "database": db_capture(db, guild, start, end, show_date, limit, session_id),
            "existingHealth": existing_health(root, db, guild, end),
            "journal": {"available": False, "reason": "explicitly_skipped"} if skip_journal else capture_journal(start, end)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--show-date", required=True, help="Pacific date, YYYY-MM-DD")
    parser.add_argument("--root", type=Path, default=Path("/home/ubuntu/bnl01"))
    parser.add_argument("--guild-id", type=int, default=GUILD)
    parser.add_argument("--row-limit", type=int, default=5000)
    parser.add_argument("--skip-journal", action="store_true")
    parser.add_argument("--session-id")
    output = parser.add_mutually_exclusive_group(required=True)
    output.add_argument("--output", type=Path)
    output.add_argument("--stdout-base64", action="store_true")
    output.add_argument("--stdout-json", action="store_true")
    args = parser.parse_args()
    if not 1 <= args.row_limit <= 20000:
        parser.error("row-limit must be between 1 and 20000")
    try:
        report = collect(args.root, args.guild_id, args.show_date, args.row_limit, args.session_id, args.skip_journal)
    except ValueError as exc:
        parser.error(str(exc))
    if args.stdout_json:
        print(json.dumps(report, ensure_ascii=False))
        return
    payload = pack(report)
    if args.stdout_base64:
        print(base64.b64encode(payload).decode("ascii"))
    else:
        # Never overwrite an existing packet; this is the only intentional file write.
        with args.output.open("xb") as stream:
            stream.write(payload)
        print(str(args.output.resolve()))


if __name__ == "__main__":
    main()
