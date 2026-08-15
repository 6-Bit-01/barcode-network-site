#!/usr/bin/env python3
"""Fail-closed import of the captured August 7/14 live queue sessions.

This operator utility is pinned to the current BARCODE production hostname.
It verifies the private capture and its checksum locally, authenticates through
the normal admin route, restores an exact empty revision-zero durable snapshot
to the dedicated queue store only when necessary, dry-runs the historical
import, requires the server-issued confirmations on a controlling TTY, applies
the import once, and verifies aligned revision one with exactly two sessions.

The script never accepts, reads, prints, or stores a database credential.  It
does not follow redirects, use environment proxies, or retry a request.
"""

import base64
import datetime
import getpass
import hashlib
import io
import json
import os
import re
import stat
import sys
import urllib.error
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar
from zoneinfo import ZoneInfo


BASE_URL = "https://barcode-network-site-cpps.vercel.app"
SOURCE_BASE_URL = "https://barcode-network-site-cpps-fg7a9jcmf-6-bits-projects.vercel.app"
SOURCE_COMMIT = "a1537f611db69e5a1c3d74ebb941d06d68ad49ff"
CAPTURE_SCHEMA = "barcode_queue_two_session_source_capture_v2"
TARGET_DATES = ("2026-08-07", "2026-08-14")
AUGUST_7_SOURCE_DATE = "2026-08-08"
AUGUST_7_SESSION_ID = "session_msjmzqjk_w1rkj"
AUGUST_7_EXPORT_SHA256 = "49c950556a9662f98fa402beb84a7e579120afff8da9cc5c70077f4b46cd6c2e"
AUGUST_7_DATE_RULE = "legacy_utc_rollover_to_pacific_broadcast_date"
EXACT_DATE_RULE = "exact_source_show_date"
PACIFIC_TIME_ZONE = "America/Los_Angeles"
OUTPUT_DIR = "/home/ubuntu/barcode-queue-recovery"
CAPTURE_NAME_RE = re.compile(
    r"^queue-sessions-2026-08-07_2026-08-14-source-\d{8}T\d{6}Z\.json$"
)
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
MAX_CAPTURE_FILE_BYTES = 3_500_000
MAX_SOURCE_RESPONSE_BYTES = 1_200_000
MAX_REQUEST_BODY_BYTES = 3_900_000
MAX_RESPONSE_BYTES = 2_000_000
REQUEST_TIMEOUT_SECONDS = 45
EXPECTED_ACCEPTED_LOSSES = (
    "source_active_session_id_when_no_captured_session_is_current",
    "current_track_previous_lane_and_index",
    "loaded_track_previous_lane_and_index",
    "loaded_track_was_next_in_line",
    "loaded_track_fallback_lane_when_not_present_on_the_loaded_track",
)


class ImportErrorSafe(Exception):
    """Expected fail-closed import error."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc)


def iso_utc(value):
    return value.astimezone(datetime.timezone.utc).isoformat().replace("+00:00", "Z")


def reject_duplicate_object_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ImportErrorSafe("JSON contains a duplicate object key.")
        result[key] = value
    return result


def reject_nonfinite_json(value):
    raise ImportErrorSafe("JSON contains a non-finite number: %s" % value)


def parse_json_bytes(raw, label):
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as error:
        raise ImportErrorSafe("%s is not UTF-8." % label) from error
    try:
        return json.loads(
            text,
            object_pairs_hook=reject_duplicate_object_keys,
            parse_constant=reject_nonfinite_json,
        )
    except ImportErrorSafe:
        raise
    except json.JSONDecodeError as error:
        raise ImportErrorSafe("%s is not valid JSON." % label) from error


def require_dict(value, label):
    if not isinstance(value, dict):
        raise ImportErrorSafe("%s must be a JSON object." % label)
    return value


def require_list(value, label):
    if not isinstance(value, list):
        raise ImportErrorSafe("%s must be a JSON array." % label)
    return value


def require_string(value, label):
    if not isinstance(value, str) or not value.strip():
        raise ImportErrorSafe("%s must be a non-empty string." % label)
    return value


def require_nullable_string(value, label):
    if value is not None and not isinstance(value, str):
        raise ImportErrorSafe("%s must be a string or null." % label)
    return value


def require_bool(value, label):
    if not isinstance(value, bool):
        raise ImportErrorSafe("%s must be a boolean." % label)
    return value


def require_nonnegative_integer(value, label):
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ImportErrorSafe("%s must be a non-negative integer." % label)
    return value


def require_sha256(value, label):
    digest = require_string(value, label).lower()
    if not SHA256_RE.fullmatch(digest):
        raise ImportErrorSafe("%s must be a SHA-256 digest." % label)
    return digest


def canonical_json_bytes(value):
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def ensure_private_directory():
    info = os.lstat(OUTPUT_DIR)
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        raise ImportErrorSafe("Recovery directory is not a real directory.")
    if info.st_uid != os.getuid():
        raise ImportErrorSafe("Recovery directory is not owned by the current user.")
    if stat.S_IMODE(info.st_mode) != 0o700:
        raise ImportErrorSafe("Recovery directory must be mode 0700.")


def open_private_regular(path, maximum_bytes, label):
    info = os.lstat(path)
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
        raise ImportErrorSafe("%s is not a regular non-symlink file." % label)
    if info.st_uid != os.getuid():
        raise ImportErrorSafe("%s is not owned by the current user." % label)
    if stat.S_IMODE(info.st_mode) != 0o600:
        raise ImportErrorSafe("%s must be mode 0600." % label)
    if info.st_size <= 0 or info.st_size > maximum_bytes:
        raise ImportErrorSafe(
            "%s size must be between 1 and %d bytes." % (label, maximum_bytes)
        )
    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    descriptor = os.open(path, flags)
    try:
        opened = os.fstat(descriptor)
        if opened.st_dev != info.st_dev or opened.st_ino != info.st_ino:
            raise ImportErrorSafe("%s changed while it was being opened." % label)
        chunks = []
        remaining = maximum_bytes + 1
        while remaining > 0:
            chunk = os.read(descriptor, min(remaining, 1024 * 1024))
            if not chunk:
                break
            chunks.append(chunk)
            remaining -= len(chunk)
        raw = b"".join(chunks)
        if len(raw) > maximum_bytes:
            raise ImportErrorSafe("%s exceeded its size limit while being read." % label)
        return raw
    finally:
        os.close(descriptor)


def load_verified_capture(argument):
    ensure_private_directory()
    path = os.path.abspath(argument)
    if os.path.dirname(path) != OUTPUT_DIR:
        raise ImportErrorSafe("Capture must be directly inside %s." % OUTPUT_DIR)
    filename = os.path.basename(path)
    if not CAPTURE_NAME_RE.fullmatch(filename):
        raise ImportErrorSafe("Capture filename does not match the source-capture naming contract.")

    raw = open_private_regular(path, MAX_CAPTURE_FILE_BYTES, "capture artifact")
    checksum_path = path + ".sha256"
    checksum_raw = open_private_regular(checksum_path, 256, "capture checksum")
    try:
        checksum_text = checksum_raw.decode("ascii")
    except UnicodeDecodeError as error:
        raise ImportErrorSafe("Capture checksum is not ASCII.") from error
    expected_line = re.fullmatch(r"([0-9a-f]{64})  ([^/\r\n]+)\n", checksum_text)
    if not expected_line or expected_line.group(2) != filename:
        raise ImportErrorSafe("Capture checksum file has the wrong format or filename.")
    actual_sha256 = hashlib.sha256(raw).hexdigest()
    if expected_line.group(1) != actual_sha256:
        raise ImportErrorSafe("Capture checksum does not match the artifact.")

    capture = parse_json_bytes(raw, "capture artifact")
    summary = validate_capture(capture)
    compact_bytes = canonical_json_bytes(capture)
    if len(compact_bytes) > MAX_CAPTURE_FILE_BYTES:
        raise ImportErrorSafe("Compact capture exceeds the 3,500,000-byte import limit.")
    return {
        "path": path,
        "filename": filename,
        "bytes": len(raw),
        "sha256": actual_sha256,
        "capture": capture,
        "summary": summary,
        "compactBytes": len(compact_bytes),
    }


def require_track(value, label):
    track = require_dict(value, label)
    for field in ("id", "artist", "title", "createdAt"):
        require_string(track.get(field), label + "." + field)
    if not isinstance(track.get("link"), str):
        raise ImportErrorSafe("%s.link must be a string." % label)
    return track


def decoded_source_response(captured, label):
    encoded = require_string(captured.get("sourceResponseBase64"), label + ".sourceResponseBase64")
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (ValueError, TypeError) as error:
        raise ImportErrorSafe("%s.sourceResponseBase64 is not canonical base64." % label) from error
    if base64.b64encode(raw).decode("ascii") != encoded:
        raise ImportErrorSafe("%s.sourceResponseBase64 is not canonical base64." % label)
    expected_bytes = require_nonnegative_integer(
        captured.get("sourceResponseBytes"), label + ".sourceResponseBytes"
    )
    if expected_bytes != len(raw) or len(raw) > MAX_SOURCE_RESPONSE_BYTES:
        raise ImportErrorSafe("%s embedded response length is invalid." % label)
    expected_sha256 = require_sha256(
        captured.get("sourceResponseSha256"), label + ".sourceResponseSha256"
    )
    if hashlib.sha256(raw).hexdigest() != expected_sha256:
        raise ImportErrorSafe("%s embedded response checksum does not match." % label)
    return raw, require_dict(parse_json_bytes(raw, label + " embedded response"), label + " response")


def pacific_date_for_iso(value, label):
    text = require_string(value, label)
    try:
        parsed = datetime.datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as error:
        raise ImportErrorSafe("%s must be an ISO timestamp." % label) from error
    if parsed.tzinfo is None:
        raise ImportErrorSafe("%s must include a timezone." % label)
    return parsed.astimezone(ZoneInfo(PACIFIC_TIME_ZONE)).date().isoformat()


def is_simulation_track(track):
    note = track.get("note")
    return (
        track.get("isTestTrack") is True
        or (isinstance(note, str) and "[QUEUE SIMULATION TRACK]" in note)
        or track["artist"].startswith("SIM ")
        or track["title"].startswith("SIM ")
    )


def expected_applied_normalizations(canonical_show_date, source_show_date, session):
    result = []
    if canonical_show_date != source_show_date:
        result.append("source_show_date_to_canonical_pacific_show_date")
    if session.get("status") != "archived":
        result.append("source_status_to_archived")
    if session.get("queueOpen") is not False:
        result.append("queue_closed_for_historical_archive")
    if session.get("showStarted") is True:
        result.append("show_stopped_for_historical_archive")
    if session.get("broadcastPhase") != "ended":
        result.append("broadcast_phase_ended_for_historical_archive")
    return result


def source_roster_identity(value, label):
    summary = require_dict(value, label)
    return {
        field: require_string(summary.get(field), label + "." + field)
        for field in (
            "sessionId",
            "title",
            "status",
            "purpose",
            "bnlPublicationStatus",
            "showDate",
            "createdAt",
            "updatedAt",
        )
    }


def validate_source_roster(
    response,
    expected_count,
    expected_sha256,
    source_active_session_id,
    selected_session,
    label,
):
    raw_roster = require_list(response.get("sessions"), label + ".sessions")
    if len(raw_roster) != expected_count:
        raise ImportErrorSafe("%s roster count does not match capture consistency." % label)
    identities = []
    by_id = {}
    for index, raw_summary in enumerate(raw_roster):
        identity = source_roster_identity(
            raw_summary, "%s.sessions[%d]" % (label, index)
        )
        session_id = identity["sessionId"]
        if session_id in by_id:
            raise ImportErrorSafe("%s roster repeats a session ID." % label)
        by_id[session_id] = identity
        identities.append(identity)
    identities.sort(key=lambda item: item["sessionId"])
    actual_sha256 = hashlib.sha256(canonical_json_bytes(identities)).hexdigest()
    if actual_sha256 != expected_sha256:
        raise ImportErrorSafe("%s roster SHA-256 does not match capture consistency." % label)
    if source_active_session_id not in by_id:
        raise ImportErrorSafe("%s roster does not contain the source active session." % label)
    selected_identity = source_roster_identity(selected_session, label + ".session")
    if by_id.get(selected_identity["sessionId"]) != selected_identity:
        raise ImportErrorSafe("%s selected session identity does not match its roster." % label)


def validate_capture_session(
    captured,
    expected_revision,
    expected_date_normalization,
    expected_roster_count,
    expected_roster_sha256,
    source_active_session_id,
    label,
):
    item = require_dict(captured, label)
    if "state" in item:
        raise ImportErrorSafe("%s contains the obsolete duplicated state field." % label)
    canonical_show_date = require_string(
        item.get("canonicalShowDate"), label + ".canonicalShowDate"
    )
    source_show_date = require_string(
        item.get("sourceShowDate"), label + ".sourceShowDate"
    )
    session_id = require_string(item.get("sessionId"), label + ".sessionId")
    if (
        canonical_show_date != expected_date_normalization["canonicalShowDate"]
        or source_show_date != expected_date_normalization["sourceShowDate"]
        or session_id != expected_date_normalization["sessionId"]
    ):
        raise ImportErrorSafe("%s does not match its source-date normalization." % label)
    revision = require_nonnegative_integer(item.get("revision"), label + ".revision")
    if revision != expected_revision:
        raise ImportErrorSafe("%s revision does not match capture consistency." % label)
    _, response = decoded_source_response(item, label)
    if require_nonnegative_integer(response.get("revision"), label + ".response.revision") != expected_revision:
        raise ImportErrorSafe("%s source response revision does not match." % label)
    if response.get("viewedSessionId") != session_id:
        raise ImportErrorSafe("%s viewedSessionId does not match." % label)
    session = require_dict(response.get("session"), label + ".response.session")
    if session.get("sessionId") != session_id or session.get("showDate") != source_show_date:
        raise ImportErrorSafe("%s source response identity does not match." % label)
    validate_source_roster(
        response,
        expected_roster_count,
        expected_roster_sha256,
        source_active_session_id,
        session,
        label + ".response",
    )
    source_status = session.get("status")
    if source_status not in ("open", "closed", "archived"):
        raise ImportErrorSafe("%s source session status is not recoverable." % label)
    if canonical_show_date == "2026-08-07" and source_status not in ("closed", "archived"):
        raise ImportErrorSafe("August 7 source session must be closed or archived.")
    purpose = require_string(session.get("purpose"), label + ".response.session.purpose")
    if canonical_show_date == "2026-08-07" and purpose not in ("unknown", "live_broadcast"):
        raise ImportErrorSafe("August 7 source session purpose is not allowed.")
    if canonical_show_date == "2026-08-14" and purpose != "live_broadcast":
        raise ImportErrorSafe("August 14 source session is not a live broadcast.")
    title = require_string(session.get("title"), label + ".response.session.title")

    summary_at_start = require_dict(item.get("summaryAtStart"), label + ".summaryAtStart")
    for field in (
        "sessionId", "showDate", "status", "purpose", "bnlPublicationStatus",
        "createdAt", "updatedAt", "queueOpen", "showStarted", "broadcastStartedAt",
    ):
        if summary_at_start.get(field) != session.get(field):
            raise ImportErrorSafe("%s summaryAtStart.%s does not match." % (label, field))

    lifecycle = {}
    primary_ids = []
    for field in ("queue", "history", "removed", "spotlight"):
        entries = require_list(response.get(field), label + ".response." + field)
        if len(entries) > 500:
            raise ImportErrorSafe("%s response.%s contains too many records." % (label, field))
        for index, entry in enumerate(entries):
            require_track(entry, "%s.response.%s[%d]" % (label, field, index))
        lifecycle[field] = len(entries)
        if field != "spotlight":
            primary_ids.extend(entry["id"] for entry in entries)
    for field in ("nextInLine", "loadedTrack", "nowPlaying"):
        entry = response.get(field)
        if entry is not None:
            require_track(entry, label + ".response." + field)
    if response.get("loadedTrack") != response.get("nowPlaying"):
        raise ImportErrorSafe("%s loadedTrack and nowPlaying disagree." % label)
    if response.get("nextInLine") is not None:
        primary_ids.append(response["nextInLine"]["id"])
    if response.get("loadedTrack") is not None:
        primary_ids.append(response["loadedTrack"]["id"])
    if len(primary_ids) != len(set(primary_ids)):
        raise ImportErrorSafe("%s repeats a primary lifecycle track ID." % label)
    primary_records = (
        response["queue"]
        + response["history"]
        + response["removed"]
        + ([response["nextInLine"]] if response.get("nextInLine") is not None else [])
        + ([response["loadedTrack"]] if response.get("loadedTrack") is not None else [])
    )
    removed_ids = {entry["id"] for entry in response["removed"]}
    accepted_ids = set()

    def count_accepted(entry, allowed_statuses):
        if entry is None or entry["id"] in removed_ids or is_simulation_track(entry):
            return
        if entry.get("status") in allowed_statuses:
            accepted_ids.add(entry["id"])

    for entry in response["queue"]:
        count_accepted(entry, ("queued", "playing"))
    count_accepted(response.get("nextInLine"), ("queued", "next", "playing"))
    count_accepted(response.get("loadedTrack"), ("queued", "next", "playing"))
    for entry in response["history"]:
        count_accepted(entry, ("completed", "played"))
    completed_ids = {
        entry["id"]
        for entry in response["history"]
        if entry["id"] not in removed_ids
        and not is_simulation_track(entry)
        and entry.get("status") in ("completed", "played")
    }
    lifecycle.update({
        "nextInLine": 1 if response.get("nextInLine") is not None else 0,
        "loadedTrack": 1 if response.get("loadedTrack") is not None else 0,
        "primaryUnique": len(primary_ids),
        "nonSimulationPrimary": sum(
            1 for entry in primary_records if not is_simulation_track(entry)
        ),
        "activeCount": sum(
            1
            for entry in response["queue"]
            if entry.get("status") in ("queued", "playing")
        )
        + (1 if response.get("nextInLine") is not None else 0)
        + (1 if response.get("loadedTrack") is not None else 0),
        "acceptedCount": len(accepted_ids),
        "completedCount": len(completed_ids),
        "removedCount": len(response["removed"]),
        "spotlightCount": len(response["spotlight"]),
    })
    recorded_counts = require_dict(item.get("trackCounts"), label + ".trackCounts")
    for field, actual in lifecycle.items():
        if require_nonnegative_integer(recorded_counts.get(field), label + ".trackCounts." + field) != actual:
            raise ImportErrorSafe("%s trackCounts.%s does not match." % (label, field))
    for field in (
        "activeCount", "acceptedCount", "completedCount", "removedCount", "spotlightCount"
    ):
        if require_nonnegative_integer(
            session.get(field), label + ".response.session." + field
        ) != lifecycle[field]:
            raise ImportErrorSafe(
                "%s response.session.%s disagrees with lifecycle records."
                % (label, field)
            )
    if require_nonnegative_integer(
        response.get("totalPlayed"), label + ".response.totalPlayed"
    ) != lifecycle["completedCount"]:
        raise ImportErrorSafe("%s response.totalPlayed disagrees with completedCount." % label)

    if canonical_show_date == "2026-08-07":
        removed = response["removed"]
        august_7_primary_records = response["history"] + removed
        if (
            session_id != AUGUST_7_SESSION_ID
            or source_show_date != AUGUST_7_SOURCE_DATE
            or lifecycle["queue"] != 0
            or lifecycle["history"] != 40
            or lifecycle["removed"] != 1
            or lifecycle["spotlight"] != 0
            or lifecycle["nextInLine"] != 0
            or lifecycle["loadedTrack"] != 0
            or lifecycle["primaryUnique"] != 41
            or any(is_simulation_track(track) for track in august_7_primary_records)
            or removed[0].get("artist") != "MagicSZN"
            or removed[0].get("title") != "HighFive"
        ):
            raise ImportErrorSafe("August 7 source does not match the verified 40 played / 1 removed live export.")
    else:
        if pacific_date_for_iso(session.get("createdAt"), label + ".response.session.createdAt") != "2026-08-14":
            raise ImportErrorSafe("August 14 source session was not created on August 14 Pacific time.")
        if not any(not is_simulation_track(track) for track in primary_records):
            raise ImportErrorSafe("August 14 source session contains no real queue records.")

    return {
        "showDate": canonical_show_date,
        "sourceShowDate": source_show_date,
        "sessionId": session_id,
        "status": "archived",
        "sourceStatus": source_status,
        "appliedNormalizations": expected_applied_normalizations(
            canonical_show_date, source_show_date, session
        ),
        "title": title,
        "purpose": purpose,
        "queueCount": lifecycle["queue"],
        "completedCount": lifecycle["history"],
        "removedCount": lifecycle["removed"],
        "spotlightCount": lifecycle["spotlight"],
        "hasNextInLine": lifecycle["nextInLine"] == 1,
        "hasLoadedTrack": lifecycle["loadedTrack"] == 1,
    }


def validate_source_date_normalizations(scope):
    canonical_dates = require_list(
        scope.get("canonicalShowDates"), "capture.scope.canonicalShowDates"
    )
    if (
        any(not isinstance(item, str) for item in canonical_dates)
        or sorted(canonical_dates) != sorted(TARGET_DATES)
    ):
        raise ImportErrorSafe("Capture scope has the wrong canonical show dates.")
    records = require_list(
        scope.get("sourceDateNormalization"),
        "capture.scope.sourceDateNormalization",
    )
    if len(records) != 2:
        raise ImportErrorSafe("Capture scope must contain exactly two date-normalization records.")
    by_date = {}
    session_ids = set()
    for index, raw in enumerate(records):
        label = "capture.scope.sourceDateNormalization[%d]" % index
        record = require_dict(raw, label)
        canonical_show_date = require_string(
            record.get("canonicalShowDate"), label + ".canonicalShowDate"
        )
        source_show_date = require_string(
            record.get("sourceShowDate"), label + ".sourceShowDate"
        )
        session_id = require_string(record.get("sessionId"), label + ".sessionId")
        rule = require_string(record.get("rule"), label + ".rule")
        provenance = require_dict(record.get("provenance"), label + ".provenance")
        require_string(provenance.get("detail"), label + ".provenance.detail")
        if canonical_show_date in by_date or session_id in session_ids:
            raise ImportErrorSafe("Capture scope repeats a date or session ID.")
        if canonical_show_date == "2026-08-07":
            if (
                source_show_date != AUGUST_7_SOURCE_DATE
                or session_id != AUGUST_7_SESSION_ID
                or rule != AUGUST_7_DATE_RULE
                or provenance.get("kind") != "owner_supplied_export"
                or require_sha256(
                    provenance.get("sourceSha256"), label + ".provenance.sourceSha256"
                ) != AUGUST_7_EXPORT_SHA256
            ):
                raise ImportErrorSafe("August 7 date-normalization provenance is invalid.")
        elif canonical_show_date == "2026-08-14":
            if (
                source_show_date != "2026-08-14"
                or rule != EXACT_DATE_RULE
                or provenance.get("kind") != "authenticated_source_queue_state"
            ):
                raise ImportErrorSafe("August 14 date provenance is invalid.")
        else:
            raise ImportErrorSafe("Capture scope contains an unsupported canonical show date.")
        by_date[canonical_show_date] = {
            "canonicalShowDate": canonical_show_date,
            "sourceShowDate": source_show_date,
            "sessionId": session_id,
        }
        session_ids.add(session_id)
    if set(by_date) != set(TARGET_DATES):
        raise ImportErrorSafe("Capture scope date-normalization records are incomplete.")
    return by_date


def validate_capture(capture):
    value = require_dict(capture, "capture")
    if value.get("schema") != CAPTURE_SCHEMA:
        raise ImportErrorSafe("Capture schema is not %s." % CAPTURE_SCHEMA)
    source = require_dict(value.get("source"), "capture.source")
    expected_source = {
        "baseUrl": SOURCE_BASE_URL,
        "expectedGitCommit": SOURCE_COMMIT,
        "route": "/api/admin/queue",
        "captureKind": "authenticated_admin_logical_session_state",
        "canonicalRawRedis": False,
        "remoteMutationRequests": 0,
        "automaticRetries": 0,
        "redirectsFollowed": 0,
    }
    for field, expected in expected_source.items():
        if source.get(field) != expected:
            raise ImportErrorSafe("Capture source provenance field %s is invalid." % field)
    scope = require_dict(value.get("scope"), "capture.scope")
    if scope.get("sessionCount") != 2:
        raise ImportErrorSafe("Capture scope is not exactly August 7 and August 14.")
    date_normalizations = validate_source_date_normalizations(scope)
    consistency = require_dict(value.get("consistency"), "capture.consistency")
    if consistency.get("startEndMatch") is not True:
        raise ImportErrorSafe("Capture does not prove start/end consistency.")
    source_revision = require_nonnegative_integer(
        consistency.get("revision"), "capture.consistency.revision"
    )
    source_active_session_id = require_string(
        consistency.get("activeSessionId"), "capture.consistency.activeSessionId"
    )
    roster_sha256 = require_sha256(
        consistency.get("rosterSha256"), "capture.consistency.rosterSha256"
    )
    roster_count = require_nonnegative_integer(
        consistency.get("rosterCount"), "capture.consistency.rosterCount"
    )
    if roster_count < 2:
        raise ImportErrorSafe("Capture roster must contain both target sessions.")
    sessions = require_list(value.get("sessions"), "capture.sessions")
    if len(sessions) != 2:
        raise ImportErrorSafe("Capture must contain exactly two sessions.")
    summaries = []
    for index, item in enumerate(sessions):
        label = "capture.sessions[%d]" % index
        captured = require_dict(item, label)
        canonical_show_date = require_string(
            captured.get("canonicalShowDate"), label + ".canonicalShowDate"
        )
        date_normalization = date_normalizations.get(canonical_show_date)
        if date_normalization is None:
            raise ImportErrorSafe(
                "%s has no matching source-date normalization." % label
            )
        summaries.append(
            validate_capture_session(
                captured,
                source_revision,
                date_normalization,
                roster_count,
                roster_sha256,
                source_active_session_id,
                label,
            )
        )
    if sorted(item["showDate"] for item in summaries) != sorted(TARGET_DATES):
        raise ImportErrorSafe("Capture must contain one session for each target date.")
    if len({item["sessionId"] for item in summaries}) != 2:
        raise ImportErrorSafe("Capture repeats a session ID.")
    summaries.sort(key=lambda item: item["showDate"])
    return {
        "sourceRevision": source_revision,
        "sourceActiveSessionId": source_active_session_id,
        "sessions": summaries,
    }


def read_limited(response, stage):
    raw = response.read(MAX_RESPONSE_BYTES + 1)
    if len(raw) > MAX_RESPONSE_BYTES:
        raise ImportErrorSafe("%s exceeded the response size limit." % stage)
    return raw


def call_json(opener, path, stage, evidence_events, method="GET", body=None):
    if not path.startswith("/") or path.startswith("//"):
        raise ImportErrorSafe("Internal error: unsafe request path.")
    data = None
    headers = {
        "Accept": "application/json",
        "Cache-Control": "no-store",
        "User-Agent": "barcode-queue-two-session-import/1.0",
    }
    if body is not None:
        try:
            data = json.dumps(
                body,
                ensure_ascii=False,
                separators=(",", ":"),
                allow_nan=False,
            ).encode("utf-8")
        except (TypeError, ValueError) as error:
            raise ImportErrorSafe("%s request body is not valid JSON." % stage) from error
        if len(data) > MAX_REQUEST_BODY_BYTES:
            raise ImportErrorSafe("%s request exceeds the 3,900,000-byte transport limit." % stage)
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(BASE_URL + path, data=data, method=method, headers=headers)
    try:
        with opener.open(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            if response.status != 200:
                raise ImportErrorSafe("%s returned HTTP %s." % (stage, response.status))
            if response.headers.get_content_type().lower() != "application/json":
                raise ImportErrorSafe("%s did not return application/json." % stage)
            raw = read_limited(response, stage)
    except urllib.error.HTTPError as error:
        raise ImportErrorSafe(
            "%s returned HTTP %s. No retry was attempted." % (stage, error.code)
        ) from error
    except urllib.error.URLError as error:
        raise ImportErrorSafe("%s could not be reached. No retry was attempted." % stage) from error
    except TimeoutError as error:
        raise ImportErrorSafe("%s timed out. No retry was attempted." % stage) from error
    payload = parse_json_bytes(raw, stage)
    evidence_events.append({
        "stage": stage,
        "method": method,
        "path": path,
        "responseBytes": len(raw),
        "responseSha256": hashlib.sha256(raw).hexdigest(),
        "payload": sanitized_response(stage, payload),
    })
    return payload


def sanitized_response(stage, payload):
    if not isinstance(payload, dict):
        return {"responseType": type(payload).__name__}
    if stage.startswith("historical import"):
        sanitized = dict(payload)
        sessions = sanitized.get("sessions")
        if isinstance(sessions, list):
            sanitized["sessions"] = [
                {key: value for key, value in item.items() if key != "title"}
                if isinstance(item, dict) else {"invalid": True}
                for item in sessions
            ]
        return sanitized
    return payload


def validate_admin_cookie(cookies):
    expected_host = urllib.parse.urlsplit(BASE_URL).hostname
    matches = [cookie for cookie in cookies if cookie.name == "barcode_admin"]
    if len(matches) != 1:
        raise ImportErrorSafe("Authentication did not set exactly one admin cookie.")
    cookie = matches[0]
    if (
        not expected_host
        or cookie.domain.lower().lstrip(".") != expected_host.lower()
        or cookie.domain_specified
    ):
        raise ImportErrorSafe("Admin cookie was not host-only for the pinned production host.")
    if cookie.path != "/" or not cookie.path_specified:
        raise ImportErrorSafe("Admin cookie was not scoped to the root path.")
    if cookie.secure is not True or not cookie.value or cookie.is_expired():
        raise ImportErrorSafe("Admin cookie is insecure, empty, or expired.")


def validate_status(payload, stage):
    status_value = require_dict(payload, stage)
    durable = require_dict(status_value.get("durable"), stage + ".durable")
    redis = require_dict(status_value.get("redis"), stage + ".redis")
    for label, side in (("durable", durable), ("redis", redis)):
        require_bool(side.get("configured"), stage + "." + label + ".configured")
        require_bool(side.get("available"), stage + "." + label + ".available")
        require_nullable_string(side.get("activeSessionId"), stage + "." + label + ".activeSessionId")
        require_nonnegative_integer(side.get("sessionCount"), stage + "." + label + ".sessionCount")
        require_nonnegative_integer(side.get("trackRecordCount"), stage + "." + label + ".trackRecordCount")
        revision = side.get("revision")
        if revision is not None:
            require_nonnegative_integer(revision, stage + "." + label + ".revision")
    require_bool(redis.get("dedicated"), stage + ".redis.dedicated")
    if redis.get("isolatedFromShared") is not True:
        raise ImportErrorSafe(
            "Recovery status does not prove that the queue destination is isolated from the shared application store. No restore or import mutation was sent."
        )
    require_string(redis.get("configurationStatus"), stage + ".redis.configurationStatus")
    require_nullable_string(status_value.get("requiredConfirmation"), stage + ".requiredConfirmation")
    require_string(status_value.get("alignment"), stage + ".alignment")
    return status_value


def assert_exact_dedicated_redis(redis, available, revision, session_count, track_count, active_id):
    if redis.get("isolatedFromShared") is not True:
        raise ImportErrorSafe(
            "The queue destination is not proven isolated from the shared application store. No restore or import mutation was sent."
        )
    expected = {
        "configured": True,
        "configurationStatus": "dedicated",
        "dedicated": True,
        "isolatedFromShared": True,
        "available": available,
        "revision": revision,
        "activeSessionId": active_id,
        "sessionCount": session_count,
        "trackRecordCount": track_count,
        "failureReason": None,
        "failureStage": None,
        "failureDetail": None,
    }
    for field, expected_value in expected.items():
        if redis.get(field) != expected_value:
            raise ImportErrorSafe(
                "Dedicated queue status field redis.%s is %r; expected %r."
                % (field, redis.get(field), expected_value)
            )


def assert_exact_durable_empty(status_value, alignment):
    if status_value.get("alignment") != alignment:
        raise ImportErrorSafe("Queue alignment must be %s." % alignment)
    durable = status_value["durable"]
    expected = {
        "configured": True,
        "available": True,
        "failureReason": None,
        "revision": 0,
        "sessionCount": 1,
        "trackRecordCount": 0,
    }
    for field, expected_value in expected.items():
        if durable.get(field) != expected_value:
            raise ImportErrorSafe(
                "Durable queue field %s is %r; expected %r."
                % (field, durable.get(field), expected_value)
            )
    durable_active = require_string(durable.get("activeSessionId"), "durable.activeSessionId")
    if status_value.get("requiredConfirmation") != "RESTORE DURABLE QUEUE REVISION 0":
        raise ImportErrorSafe("Recovery status did not issue the exact revision-zero restore confirmation.")
    if alignment == "durable_only":
        assert_exact_dedicated_redis(status_value["redis"], False, 0, 0, 0, None)
    else:
        assert_exact_dedicated_redis(status_value["redis"], True, 0, 1, 0, durable_active)
    return durable_active


def validate_restore_result(payload, dry_run, durable_active):
    value = require_dict(payload, "durable restore result")
    expected = {
        "dryRun": dry_run,
        "restored": not dry_run,
        "revision": 0,
        "activeSessionId": durable_active,
        "sessionCount": 1,
        "trackRecordCount": 0,
        "previousRedisRevision": 0,
    }
    for field, expected_value in expected.items():
        if value.get(field) != expected_value:
            raise ImportErrorSafe(
                "Durable restore result field %s is %r; expected %r."
                % (field, value.get(field), expected_value)
            )
    return value


def validate_import_result(payload, capture_info, mode):
    value = require_dict(payload, "historical import result")
    mode_fields = {
        "planned": (True, False, False, 0, 1),
        "applied": (False, True, False, 0, 1),
        "already_present": (True, False, True, 1, 1),
    }
    if mode not in mode_fields:
        raise ImportErrorSafe("Internal error: invalid historical import validation mode.")
    dry_run, imported, already_present, current_revision, target_revision = mode_fields[mode]
    expected = {
        "dryRun": dry_run,
        "imported": imported,
        "alreadyPresent": already_present,
        "sourceRevision": capture_info["summary"]["sourceRevision"],
        "currentRevision": current_revision,
        "targetRevision": target_revision,
    }
    for field, expected_value in expected.items():
        if value.get(field) != expected_value:
            raise ImportErrorSafe(
                "Historical import field %s is %r; expected %r."
                % (field, value.get(field), expected_value)
            )
    source_digest = require_sha256(value.get("sourceDigest"), "historical import sourceDigest")
    expected_confirmation = "IMPORT 2 HISTORICAL QUEUE SESSIONS %s INTO REVISION 0" % source_digest
    if value.get("requiredConfirmation") != expected_confirmation:
        raise ImportErrorSafe("Historical import returned an invalid confirmation phrase.")
    source_active = require_string(value.get("sourceActiveSessionId"), "historical import sourceActiveSessionId")
    if source_active != capture_info["summary"]["sourceActiveSessionId"]:
        raise ImportErrorSafe(
            "Historical import source active session does not match the verified capture."
        )
    active_id = require_string(value.get("activeSessionId"), "historical import activeSessionId")
    if value.get("activeSessionSelection") != "newest_imported_archived_session":
        raise ImportErrorSafe(
            "Historical import must select the canonical August 14 archive session."
        )
    sessions = require_list(value.get("sessions"), "historical import sessions")
    if len(sessions) != 2:
        raise ImportErrorSafe("Historical import plan does not contain exactly two sessions.")
    server_by_date = {}
    for index, item in enumerate(sessions):
        summary = require_dict(item, "historical import sessions[%d]" % index)
        show_date = require_string(summary.get("showDate"), "historical import session showDate")
        if show_date in server_by_date:
            raise ImportErrorSafe("Historical import repeats a show date.")
        if summary.get("status") != "archived":
            raise ImportErrorSafe("Historical import session is not archived.")
        require_string(summary.get("title"), "historical import session title")
        server_by_date[show_date] = summary
    local_by_date = {
        item["showDate"]: item for item in capture_info["summary"]["sessions"]
    }
    if set(server_by_date) != set(TARGET_DATES):
        raise ImportErrorSafe("Historical import plan has the wrong show dates.")
    for show_date in TARGET_DATES:
        server = server_by_date[show_date]
        local = local_by_date[show_date]
        for field in (
            "sessionId", "sourceShowDate", "sourceStatus", "appliedNormalizations", "title",
            "status", "queueCount", "completedCount", "removedCount",
            "spotlightCount", "hasNextInLine", "hasLoadedTrack",
        ):
            if server.get(field) != local[field]:
                raise ImportErrorSafe(
                    "Historical import %s field %s does not match the verified capture."
                    % (show_date, field)
                )
    expected_active_id = local_by_date["2026-08-14"]["sessionId"]
    if active_id != expected_active_id:
        raise ImportErrorSafe(
            "Historical import did not select the canonical August 14 archive session."
        )
    losses = value.get("acceptedLosses")
    if losses != list(EXPECTED_ACCEPTED_LOSSES):
        raise ImportErrorSafe("Historical import accepted-loss contract changed.")
    expected_tracks = sum(
        item["queueCount"]
        + item["completedCount"]
        + item["removedCount"]
        + item["spotlightCount"]
        + (1 if item["hasNextInLine"] else 0)
        + (1 if item["hasLoadedTrack"] else 0)
        for item in server_by_date.values()
    )
    return {
        "sourceDigest": source_digest,
        "requiredConfirmation": expected_confirmation,
        "sourceActiveSessionId": source_active,
        "activeSessionId": active_id,
        "activeSessionSelection": value["activeSessionSelection"],
        "sessions": [server_by_date[date] for date in TARGET_DATES],
        "expectedTrackRecordCount": expected_tracks,
    }


def assert_aligned_revision_one_candidate(payload):
    status_value = validate_status(payload, "aligned revision-one status")
    if status_value.get("alignment") != "aligned":
        raise ImportErrorSafe("Revision-one idempotency check requires aligned status.")
    durable = status_value["durable"]
    durable_active = require_string(durable.get("activeSessionId"), "durable.activeSessionId")
    durable_tracks = require_nonnegative_integer(
        durable.get("trackRecordCount"), "durable.trackRecordCount"
    )
    expected_durable = {
        "configured": True,
        "available": True,
        "failureReason": None,
        "revision": 1,
        "sessionCount": 2,
    }
    for field, expected_value in expected_durable.items():
        if durable.get(field) != expected_value:
            raise ImportErrorSafe(
                "Revision-one durable field %s is %r; expected %r."
                % (field, durable.get(field), expected_value)
            )
    if status_value.get("requiredConfirmation") != "RESTORE DURABLE QUEUE REVISION 1":
        raise ImportErrorSafe("Revision-one recovery status issued the wrong restore confirmation.")
    assert_exact_dedicated_redis(
        status_value["redis"], True, 1, 2, durable_tracks, durable_active
    )
    return status_value


def assert_final_status(payload, plan):
    status_value = validate_status(payload, "final recovery status")
    if status_value.get("alignment") != "aligned":
        raise ImportErrorSafe("Final queue status is not aligned.")
    for side_name in ("durable", "redis"):
        side = status_value[side_name]
        expected = {
            "configured": True,
            "available": True,
            "failureReason": None,
            "revision": 1,
            "activeSessionId": plan["activeSessionId"],
            "sessionCount": 2,
            "trackRecordCount": plan["expectedTrackRecordCount"],
        }
        for field, expected_value in expected.items():
            if side.get(field) != expected_value:
                raise ImportErrorSafe(
                    "Final %s.%s is %r; expected %r."
                    % (side_name, field, side.get(field), expected_value)
                )
    assert_exact_dedicated_redis(
        status_value["redis"],
        True,
        1,
        2,
        plan["expectedTrackRecordCount"],
        plan["activeSessionId"],
    )
    return status_value


def prompt_exact(controlling_tty, explanation, expected):
    print(explanation)
    print(expected)
    controlling_tty.write("Type the exact line above, then press Enter:\n> ")
    supplied = controlling_tty.readline().rstrip("\r\n")
    if supplied != expected:
        raise ImportErrorSafe("Confirmation did not exactly match. The pending mutation was not sent.")


def create_private_file(path, data):
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    descriptor = None
    created = False
    try:
        descriptor = os.open(path, flags, 0o600)
        created = True
        offset = 0
        while offset < len(data):
            written = os.write(descriptor, data[offset:])
            if written <= 0:
                raise OSError("short write")
            offset += written
        os.fsync(descriptor)
        os.close(descriptor)
        descriptor = None
        if stat.S_IMODE(os.stat(path).st_mode) != 0o600:
            raise ImportErrorSafe("Evidence file is not mode 0600.")
    except Exception:
        if descriptor is not None:
            os.close(descriptor)
        if created:
            try:
                os.unlink(path)
            except OSError:
                pass
        raise


def write_evidence(capture_info, events, outcome, error_message, mutation_requests):
    ensure_private_directory()
    finished_at = utc_now()
    evidence = {
        "schema": "barcode_queue_two_session_import_evidence_v1",
        "finishedAt": iso_utc(finished_at),
        "productionBaseUrl": BASE_URL,
        "sourceCapture": {
            "filename": capture_info["filename"],
            "bytes": capture_info["bytes"],
            "compactBytes": capture_info["compactBytes"],
            "sha256": capture_info["sha256"],
        },
        "outcome": outcome,
        "error": error_message,
        "automaticRetries": 0,
        "redirectsFollowed": 0,
        "remoteQueueMutationRequests": mutation_requests,
        "events": events,
    }
    raw = json.dumps(
        evidence,
        ensure_ascii=False,
        sort_keys=True,
        indent=2,
        allow_nan=False,
    ).encode("utf-8") + b"\n"
    digest = hashlib.sha256(raw).hexdigest()
    timestamp = finished_at.strftime("%Y%m%dT%H%M%SZ")
    filename = "queue-sessions-2026-08-07_2026-08-14-import-evidence-%s.json" % timestamp
    path = os.path.join(OUTPUT_DIR, filename)
    checksum_path = path + ".sha256"
    create_private_file(path, raw)
    checksum_created = False
    try:
        create_private_file(
            checksum_path,
            (digest + "  " + filename + "\n").encode("ascii"),
        )
        checksum_created = True
        directory_descriptor = os.open(OUTPUT_DIR, os.O_RDONLY)
        try:
            os.fsync(directory_descriptor)
        finally:
            os.close(directory_descriptor)
    except Exception:
        if checksum_created:
            try:
                os.unlink(checksum_path)
            except OSError:
                pass
        try:
            os.unlink(path)
        except OSError:
            pass
        raise
    return path, checksum_path, digest


def run_import(capture_info, controlling_tty):
    events = []
    mutation_requests = 0
    cookies = CookieJar()
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({}),
        NoRedirect(),
        urllib.request.HTTPCookieProcessor(cookies),
    )
    try:
        password = getpass.getpass("Existing BARCODE admin password: ", stream=controlling_tty)
        if not password:
            raise ImportErrorSafe("Admin password was empty.")
        try:
            auth = call_json(
                opener,
                "/api/admin/auth",
                "admin authentication",
                events,
                method="POST",
                body={"password": password},
            )
        finally:
            password = ""
        if not isinstance(auth, dict) or auth.get("ok") is not True:
            raise ImportErrorSafe("Admin authentication was not confirmed.")
        validate_admin_cookie(cookies)

        initial = validate_status(
            call_json(opener, "/api/admin/queue/recovery", "initial recovery status", events),
            "initial recovery status",
        )
        capture = capture_info["capture"]

        if initial.get("alignment") == "aligned" and initial["durable"].get("revision") == 1:
            assert_aligned_revision_one_candidate(initial)
            already_dry = call_json(
                opener,
                "/api/admin/queue/recovery",
                "historical import idempotency dry run",
                events,
                method="POST",
                body={"action": "importHistoricalSessions", "capture": capture, "dryRun": True},
            )
            already_plan = validate_import_result(
                already_dry, capture_info, "already_present"
            )
            final_existing = call_json(
                opener,
                "/api/admin/queue/recovery",
                "final recovery status",
                events,
            )
            assert_final_status(final_existing, already_plan)
            evidence_path, checksum_path, evidence_sha256 = write_evidence(
                capture_info,
                events,
                "already_present",
                None,
                mutation_requests,
            )
            print("\nIMPORT: ALREADY PRESENT — VERIFIED WITHOUT MUTATION")
            print("ALIGNMENT: aligned")
            print("REVISION: 1")
            print("SESSION COUNT: 2")
            print("EVIDENCE:", evidence_path)
            print("EVIDENCE SHA256 FILE:", checksum_path)
            print("EVIDENCE SHA256:", evidence_sha256)
            return 0

        if initial.get("alignment") == "durable_only":
            durable_active = assert_exact_durable_empty(initial, "durable_only")
            restore_dry = call_json(
                opener,
                "/api/admin/queue/recovery",
                "durable restore dry run",
                events,
                method="POST",
                body={"action": "restoreDurableSnapshot", "dryRun": True},
            )
            validate_restore_result(restore_dry, True, durable_active)
            restore_confirmation = "RESTORE DURABLE QUEUE REVISION 0"
            prompt_exact(
                controlling_tty,
                "The replacement queue store is empty. Confirm the dry-run-verified durable revision-zero restore:",
                restore_confirmation,
            )
            mutation_requests += 1
            try:
                restore_apply = call_json(
                    opener,
                    "/api/admin/queue/recovery",
                    "durable restore apply",
                    events,
                    method="POST",
                    body={
                        "action": "restoreDurableSnapshot",
                        "dryRun": False,
                        "confirmation": restore_confirmation,
                    },
                )
                validate_restore_result(restore_apply, False, durable_active)
            except (ImportErrorSafe, OSError) as restore_error:
                events.append({
                    "stage": "durable restore apply response ambiguity",
                    "method": "POST",
                    "path": "/api/admin/queue/recovery",
                    "responseVerified": False,
                    "error": str(restore_error)[:300],
                })
            aligned_zero = validate_status(
                call_json(opener, "/api/admin/queue/recovery", "post-restore recovery status", events),
                "post-restore recovery status",
            )
            assert_exact_durable_empty(aligned_zero, "aligned")
        elif initial.get("alignment") == "aligned":
            assert_exact_durable_empty(initial, "aligned")
        else:
            raise ImportErrorSafe(
                "Initial queue status is %r; only exact durable_only or aligned empty revision zero is allowed."
                % initial.get("alignment")
            )

        import_dry = call_json(
            opener,
            "/api/admin/queue/recovery",
            "historical import dry run",
            events,
            method="POST",
            body={"action": "importHistoricalSessions", "capture": capture, "dryRun": True},
        )
        plan = validate_import_result(import_dry, capture_info, "planned")

        print("\nHISTORICAL IMPORT DRY RUN VERIFIED")
        print("PRODUCTION:", BASE_URL)
        print("CAPTURE SHA256:", capture_info["sha256"])
        print("SOURCE REVISION:", capture_info["summary"]["sourceRevision"])
        print("CURRENT REVISION: 0")
        print("TARGET REVISION: 1")
        for summary in plan["sessions"]:
            print(
                "SESSION:",
                summary["showDate"],
                "sessionId=" + summary["sessionId"],
                "status=" + summary["status"],
                "queue=" + str(summary["queueCount"]),
                "completed=" + str(summary["completedCount"]),
                "removed=" + str(summary["removedCount"]),
                "spotlight=" + str(summary["spotlightCount"]),
                "nextInLine=" + str(summary["hasNextInLine"]).lower(),
                "loadedTrack=" + str(summary["hasLoadedTrack"]).lower(),
            )
        print("ACTIVE SESSION:", plan["activeSessionId"], "via", plan["activeSessionSelection"])
        print("EXPECTED TRACK RECORD COUNT:", plan["expectedTrackRecordCount"])
        print("ACCEPTED NORMALIZATION LOSSES:")
        for loss in EXPECTED_ACCEPTED_LOSSES:
            print(" -", loss)

        prompt_exact(
            controlling_tty,
            "Confirm the exact server-issued historical import plan:",
            plan["requiredConfirmation"],
        )
        mutation_requests += 1
        apply_response_ambiguous = False
        try:
            import_apply = call_json(
                opener,
                "/api/admin/queue/recovery",
                "historical import apply",
                events,
                method="POST",
                body={
                    "action": "importHistoricalSessions",
                    "capture": capture,
                    "dryRun": False,
                    "confirmation": plan["requiredConfirmation"],
                },
            )
            applied_plan = validate_import_result(import_apply, capture_info, "applied")
            if applied_plan != plan:
                raise ImportErrorSafe("Applied import result does not match the verified dry-run plan.")
        except (ImportErrorSafe, OSError) as apply_error:
            apply_response_ambiguous = True
            events.append({
                "stage": "historical import apply response ambiguity",
                "method": "POST",
                "path": "/api/admin/queue/recovery",
                "responseVerified": False,
                "error": str(apply_error)[:300],
            })

        # This is an idempotent readback, not a retry.  It never resends the
        # apply action.  It resolves a lost/invalid apply response and also
        # independently proves the normal success response against storage.
        import_readback = call_json(
            opener,
            "/api/admin/queue/recovery",
            "historical import post-apply idempotency dry run",
            events,
            method="POST",
            body={"action": "importHistoricalSessions", "capture": capture, "dryRun": True},
        )
        readback_plan = validate_import_result(
            import_readback, capture_info, "already_present"
        )
        if readback_plan != plan:
            raise ImportErrorSafe("Post-apply idempotency readback does not match the verified plan.")

        final = call_json(
            opener,
            "/api/admin/queue/recovery",
            "final recovery status",
            events,
        )
        assert_final_status(final, plan)
        evidence_path, checksum_path, evidence_sha256 = write_evidence(
            capture_info,
            events,
            "success_after_ambiguous_apply_response" if apply_response_ambiguous else "success",
            None,
            mutation_requests,
        )
        print("\nIMPORT: COMPLETE")
        print("ALIGNMENT: aligned")
        print("REVISION: 1")
        print("SESSION COUNT: 2")
        if apply_response_ambiguous:
            print("APPLY RESPONSE: ambiguous; exact same-capture readback proved the committed result")
        print("EVIDENCE:", evidence_path)
        print("EVIDENCE SHA256 FILE:", checksum_path)
        print("EVIDENCE SHA256:", evidence_sha256)
        return 0
    except Exception as error:
        safe_message = str(error)
        try:
            evidence_path, _, _ = write_evidence(
                capture_info,
                events,
                "failed",
                safe_message,
                mutation_requests,
            )
            print("FAILURE EVIDENCE:", evidence_path, file=sys.stderr)
        except Exception as evidence_error:
            print("WARNING: failure evidence could not be saved: %s" % evidence_error, file=sys.stderr)
        raise
    finally:
        cookies.clear()


def main():
    if len(sys.argv) != 2:
        raise ImportErrorSafe(
            "Usage: %s /home/ubuntu/barcode-queue-recovery/queue-sessions-2026-08-07_2026-08-14-source-TIMESTAMP.json"
            % os.path.basename(sys.argv[0])
        )
    capture_info = load_verified_capture(sys.argv[1])
    print("CAPTURE VERIFIED:", capture_info["path"])
    print("CAPTURE SHA256:", capture_info["sha256"])
    print("CAPTURE BYTES:", capture_info["bytes"])
    print("COMPACT IMPORT BYTES:", capture_info["compactBytes"])
    for summary in capture_info["summary"]["sessions"]:
        print(
            "CAPTURED SESSION:",
            "canonical=" + summary["showDate"],
            "source=" + summary["sourceShowDate"],
            "sessionId=" + summary["sessionId"],
            "sourceStatus=" + summary["sourceStatus"],
            "destinationStatus=" + summary["status"],
            "purpose=" + summary["purpose"],
            "normalizations=" + ",".join(summary["appliedNormalizations"]),
        )
    try:
        controlling_tty = io.TextIOWrapper(
            io.FileIO(os.open("/dev/tty", os.O_RDWR | os.O_NOCTTY), mode="w+"),
            encoding="utf-8",
            line_buffering=True,
        )
    except OSError as error:
        raise ImportErrorSafe("A controlling TTY is required for password and confirmation prompts.") from error
    if not controlling_tty.isatty():
        controlling_tty.close()
        raise ImportErrorSafe("A controlling TTY is required for password and confirmation prompts.")
    try:
        return run_import(capture_info, controlling_tty)
    finally:
        controlling_tty.close()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ImportErrorSafe, OSError, ValueError) as error:
        print("IMPORT FAILED:", str(error), file=sys.stderr)
        raise SystemExit(1)
