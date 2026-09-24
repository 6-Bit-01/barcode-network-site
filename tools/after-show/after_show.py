#!/usr/bin/env python3
"""Private after-show outbox. Read-only sources; no bot import or service restart."""
from __future__ import annotations
import argparse
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from email.policy import SMTP
from email.utils import format_datetime
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path
import re
import smtplib
import ssl
import subprocess
import sys
import tempfile
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
import zipfile

import bnl_after_show_capture as capture

UTC = timezone.utc
MAX_HTTP = 8 * 1024 * 1024
MAX_ATTACHMENTS = 10 * 1024 * 1024
SCHEMA = "barcode_after_show_export_v1"
ID = re.compile(r"^[A-Za-z0-9_-]{1,160}$")
MAIL = re.compile(r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")


def utc(value: str) -> datetime:
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("Timezone required")
    return result.astimezone(UTC)


def encode(value) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode()


def atomic(path: Path, data: bytes):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, name = tempfile.mkstemp(dir=path.parent, prefix=".write-")
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
        parent = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def config(path: Path) -> dict:
    if path.stat().st_mode & 0o077:
        raise ValueError("Config must have mode 600")
    value = json.loads(path.read_text())
    endpoint = urlsplit(value["endpoint"])
    if (endpoint.scheme != "https" or not endpoint.hostname or endpoint.username
            or endpoint.password or endpoint.query or endpoint.fragment
            or endpoint.path != "/api/ops/after-show"):
        raise ValueError("An HTTPS after-show export endpoint is required")
    if len(value["export_token"]) < 32 or any(c.isspace() for c in value["export_token"]):
        raise ValueError("Export token must be at least 32 characters")
    for field in ("sender", "recipient", "smtp_user"):
        if not MAIL.fullmatch(value[field]):
            raise ValueError("One plain email address is required per mail field")
    if not re.fullmatch(r"[A-Za-z0-9.-]+", value["smtp_host"]):
        raise ValueError("Invalid mail host")
    if not 1 <= int(value["smtp_port"]) <= 65535 or not value["smtp_password"]:
        raise ValueError("Mail credentials required")
    utc(value["not_before"])
    if not Path(value["root"]).is_absolute() or not Path(value["state_dir"]).is_absolute():
        raise ValueError("Absolute source and outbox paths required")
    if not 1 <= int(value.get("row_limit", 5000)) <= 20000:
        raise ValueError("Invalid capture row limit")
    return value


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # Never forward the export bearer credential to a redirect.


def fetch(cfg: dict, session_id: str | None = None) -> dict:
    query = "?" + urlencode({"sessionId": session_id}) if session_id else ""
    request = Request(cfg["endpoint"] + query, headers={"Authorization": "Bearer " + cfg["export_token"], "Accept": "application/json"})
    with build_opener(NoRedirect()).open(request, timeout=30) as response:
        if response.headers.get_content_type() != "application/json":
            raise ValueError("Unexpected export content type")
        raw = response.read(MAX_HTTP + 1)
    if len(raw) > MAX_HTTP:
        raise ValueError("Export too large")
    value = json.loads(raw)
    if value.get("schemaVersion") != SCHEMA:
        raise ValueError("Unknown export schema")
    return value


def validate_show(show: dict, now: datetime) -> None:
    if not ID.fullmatch(show.get("sessionId", "")):
        raise ValueError("Invalid session ID")
    datetime.strptime(show["showDate"], "%Y-%m-%d")
    started, ended = utc(show["startedAt"]), utc(show["endedAt"])
    if ended < started or ended > now:
        raise ValueError("Invalid archived show interval")


def validate_export(value: dict, show: dict):
    if value.get("kind") != "show" or value.get("show") != show:
        raise ValueError("Show changed or wrong export session")
    for key, schema in (("showLog", "barcode_queue_show_log_v2"), ("playback", "barcode_queue_playback_diagnostics_v1")):
        part = value.get(key, {})
        session = part.get("session") or {}
        if (part.get("schemaVersion") != schema or session.get("sessionId") != show["sessionId"]
                or session.get("showDate") != show["showDate"] or session.get("status") != "archived"):
            raise ValueError("Wrong or unarchived source section")
    if value["showLog"].get("revision") != value["playback"]["session"].get("revision"):
        raise ValueError("Website snapshot revisions differ")


def collect_bnl(cfg: dict, show: dict) -> dict:
    args = [sys.executable, str(Path(__file__).with_name("bnl_after_show_capture.py")),
            "--root", cfg["root"], "--guild-id", str(cfg["guild_id"]),
            "--show-date", show["showDate"], "--session-id", show["sessionId"],
            "--row-limit", str(cfg.get("row_limit", 5000)), "--stdout-json"]
    result = subprocess.run(args, capture_output=True, timeout=120, check=False)
    if result.returncode:
        raise RuntimeError("BNL capture failed")
    value = json.loads(result.stdout)
    if value.get("sessionId") != show["sessionId"] or value.get("showDatePacific") != show["showDate"]:
        raise ValueError("Wrong BNL capture session")
    return value


def finalized(bnl: dict, show: dict) -> bool:
    rows = bnl.get("database", {}).get("showLedgers", {}).get("rows", [])
    return any(row.get("sessionId") == show["sessionId"]
               and row.get("schema_version") == "tiktok_show_evidence_ledger_v2"
               and row.get("lifecycle_status") == "finalized" for row in rows)


def redact(value):
    if isinstance(value, dict):
        return {key: redact(item) for key, item in value.items()}
    if isinstance(value, list):
        return [redact(item) for item in value]
    if isinstance(value, str):
        return capture.safe_text(value, limit=6000)["text"]
    return value


def issues_in(value, prefix=""):
    issues = []
    if isinstance(value, dict):
        if value.get("available") is False:
            issues.append(prefix + ":unavailable")
        if any(value.get(k) is True for k in ("truncated", "textTruncated", "deliveryTruncated")):
            issues.append(prefix + ":truncated")
        for key, item in value.items():
            issues.extend(issues_in(item, prefix + "." + key))
    elif isinstance(value, list):
        for item in value:
            issues.extend(issues_in(item, prefix + "[]"))
    return sorted(set(issues))


def bundle(site: dict, bnl: dict, now: datetime, is_test=False) -> tuple[dict, dict[str, bytes]]:
    site, bnl = redact(site), redact(bnl)
    show = site["show"]
    parts = {"website-evidence.txt": site, "bnl-evidence.txt": bnl}
    # Explicit transport truncation rather than a silent rejected oversized mail.
    omitted = {}
    while sum(len(encode(part)) for part in parts.values()) > MAX_ATTACHMENTS:
        candidates = [(key, item) for key, item in bnl.get("database", {}).items()
                      if isinstance(item, dict) and len(item.get("rows", [])) > 1]
        candidates += [("journal", bnl["journal"])] if len(bnl.get("journal", {}).get("records", [])) > 1 else []
        if not candidates:
            raise ValueError("Evidence exceeds delivery limit")
        key, section = max(candidates, key=lambda pair: len(encode(pair[1])))
        field = "records" if key == "journal" else "rows"
        keep = max(1, len(section[field]) // 2)
        omitted[key] = omitted.get(key, 0) + len(section[field]) - keep
        section[field] = section[field][:keep]
        section["deliveryTruncated"] = True
    files = {name: encode(part) for name, part in parts.items()}
    problems = issues_in(bnl, "bnl")
    if not finalized(bnl, show):
        problems.append("exact_session_finalized_ledger_missing")
    if bnl.get("startInclusive") and utc(bnl["startInclusive"]) > utc(show["startedAt"]):
        problems.append("capture_starts_after_broadcast")
    if bnl.get("endExclusive") and utc(bnl["endExclusive"]) < utc(show["endedAt"]):
        problems.append("capture_ends_before_archive")
    for name, limited in site.get("coverage", {}).items():
        if name.endswith("AtLimit") and limited:
            problems.append("website." + name)
    manifest = {"schemaVersion": 1, "kind": "barcode_after_show_packet", "isTest": is_test,
                "show": show, "collectedAt": now.isoformat(),
                "sourceRevision": site.get("sourceRevision"), "sourceCommit": site.get("sourceCommit"),
                "captureWindow": {"start": bnl.get("startInclusive"), "end": bnl.get("endExclusive")},
                "status": "partial" if problems else "collected", "coverageIssues": sorted(set(problems)),
                "deliveryRowsOmitted": omitted, "freeTextRedactionApplied": True,
                "acceptancePassed": False,
                "limits": "Existing source retention applies; collection does not prove full-show playback or publication delivery.",
                "files": {name: {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)} for name, data in files.items()}}
    manifest["packetId"] = hashlib.sha256(encode(manifest)).hexdigest()
    files["manifest.txt"] = encode(manifest)
    return manifest, files


def message(cfg: dict, manifest: dict, files: dict[str, bytes]) -> bytes:
    show = manifest["show"]
    result = EmailMessage(policy=SMTP)
    result["From"] = cfg["sender"]
    result["To"] = cfg["recipient"]
    result["Subject"] = f"[BARCODE AFTER-SHOW] {'TEST ' if manifest['isTest'] else ''}{show['showDate']} {show['sessionId']}"
    result["Message-ID"] = f"<barcode-after-show-{manifest['packetId']}@{cfg['sender'].split('@')[1]}>"
    result["Date"] = format_datetime(utc(manifest["collectedAt"]))
    result.set_content(f"Private BARCODE evidence packet. Status: {manifest['status']}.\nPacket: {manifest['packetId']}\nRead all three text attachments and coverage markers. No recording is attached.\nThis packet does not establish a feature or show acceptance pass.\n")
    for name, data in files.items():
        result.add_attachment(data.decode("utf-8"), subtype="plain", charset="utf-8", filename=name, cte="base64")
    return result.as_bytes()


def deliver(cfg: dict, raw: bytes):
    with smtplib.SMTP_SSL(cfg["smtp_host"], int(cfg["smtp_port"]), timeout=45, context=ssl.create_default_context()) as smtp:
        smtp.login(cfg["smtp_user"], cfg["smtp_password"])
        refused = smtp.sendmail(cfg["sender"], [cfg["recipient"]], raw)
        if refused:
            raise RuntimeError("Recipient rejected")


def stage(directory: Path, cfg: dict, manifest: dict, files: dict[str, bytes]):
    data = io.BytesIO()
    with zipfile.ZipFile(data, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    atomic(directory / "evidence.zip", data.getvalue())
    atomic(directory / "message.eml", message(cfg, manifest, files))
    atomic(directory / "manifest.json", encode(manifest))


def run(cfg: dict, *, now=None, is_test=False, fetcher=fetch, collector=collect_bnl, sender=deliver):
    now = now or datetime.now(UTC)
    state_dir = Path(cfg["state_dir"])
    state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (state_dir / "worker.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {"status": "already_running"}
        state_path = state_dir / "state.json"
        state = json.loads(state_path.read_text()) if state_path.exists() else {"version": 1, "shows": {}}
        index = fetcher(cfg)
        if index.get("kind") != "index" or not isinstance(index.get("shows"), list):
            raise ValueError("Invalid show index")
        if index.get("truncated") and (is_test or not index["shows"] or min(utc(show["endedAt"]) for show in index["shows"]) >= utc(cfg["not_before"])):
            raise ValueError("Show index truncated; review archive coverage")
        shows = index["shows"][:1] if is_test else sorted(index["shows"], key=lambda row: row["endedAt"])
        outcomes = []
        for show in shows:
            validate_show(show, now)
            session_id = show["sessionId"]
            ended = utc(show["endedAt"])
            if not is_test and (ended < utc(cfg["not_before"]) or now < ended + timedelta(minutes=20)):
                continue
            key = hashlib.sha256(session_id.encode()).hexdigest()
            entry = state["shows"].setdefault(session_id, {}) if not is_test else {}
            if entry.get("status") == "smtp_accepted" or (entry.get("nextAttemptAt") and utc(entry["nextAttemptAt"]) > now):
                continue
            directory = state_dir / ("tests" if is_test else "outbox") / key
            try:
                site = fetcher(cfg, session_id)  # Revalidate eligibility before every retry/send.
                validate_export(site, show)
                if entry.get("status") != "pending_send":
                    try:
                        bnl = collector(cfg, show)
                    except Exception as error:
                        bnl = {"sessionId": session_id, "showDatePacific": show["showDate"],
                               "available": False, "errorType": type(error).__name__}
                    if not is_test and not finalized(bnl, show) and now < ended + timedelta(hours=2):
                        outcomes.append({"sessionId": session_id, "status": "waiting_for_bnl_finalization"})
                        continue
                    manifest, files = bundle(site, bnl, now, is_test)
                    stage(directory, cfg, manifest, files)
                    entry.update(status="pending_send", packetId=manifest["packetId"])
                    if not is_test:
                        atomic(state_path, encode(state))  # Durable packet before any send attempt.
                sender(cfg, (directory / "message.eml").read_bytes())
                entry.update(status="smtp_accepted", smtpAcceptedAt=now.isoformat(), inboxReceiptVerified=False)
                entry.pop("nextAttemptAt", None)
                outcomes.append({"sessionId": session_id, "status": "test_smtp_accepted" if is_test else "smtp_accepted", "packetId": entry.get("packetId")})
            except Exception as error:
                attempts = int(entry.get("attempts", 0)) + 1
                entry.update(attempts=attempts, lastErrorType=type(error).__name__,
                             nextAttemptAt=(now + timedelta(minutes=min(360, 5 * 2 ** min(attempts - 1, 7)))).isoformat())
                outcomes.append({"sessionId": session_id, "status": "retry_pending", "errorType": type(error).__name__})
            if not is_test:
                atomic(state_path, encode(state))
            if len(outcomes) >= 3:
                break
        result = {"checkedAt": now.isoformat(), "isTest": is_test, "results": outcomes}
        atomic(state_dir / ("test-status.json" if is_test else "last-status.json"), encode(result))
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=Path.home() / ".config/barcode-after-show/config.json")
    parser.add_argument("--test", action="store_true", help="Capture and mail the latest archived public show as TEST; do not mark it sent for normal operation")
    args = parser.parse_args()
    os.umask(0o077)
    try:
        result = run(config(args.config), is_test=args.test)
        print(json.dumps(result))
        if any(row.get("status") == "retry_pending" for row in result.get("results", [])):
            raise SystemExit(1)
    except Exception as error:
        # Exceptions can contain URLs, mail addresses or bearer credentials.
        print(json.dumps({"status": "failed", "errorType": type(error).__name__}), file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
