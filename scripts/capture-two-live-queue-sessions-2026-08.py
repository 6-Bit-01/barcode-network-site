#!/usr/bin/env python3
"""Read-only capture of the August 7 and August 14 Pacific queue sessions.

This utility is deliberately pinned to the immutable Vercel deployment built
from a1537f6.  The August 7 Pacific broadcast is bound to the known historical
session ID from an owner-supplied export; that source record carries showDate
2026-08-08 because of the legacy UTC rollover.  The utility discovers every
exact August 14 source-date candidate, requires the operator to select one
exact session ID, and writes a private local evidence artifact with both raw
source dates and canonical Pacific broadcast dates.  Every bounded successful
HTTP response is saved before it is interpreted (oversized responses retain a
marked limit-detecting prefix), and accepted capture progress is checkpointed
after each read so an intermittently unavailable historical Redis can be
resumed without discarding earlier evidence.  It never calls a queue mutation
route and never sends a Redis credential.

The authenticated admin route exposes the complete logical QueueState for one
session, but not the byte-for-byte QueueStore value held in Redis.  The
artifact records that limitation explicitly.  To keep the authenticated
import request beneath Vercel's body limit, it stores each exact raw target
response once; the importer derives the reduced session projection from those
authenticated bytes.
"""

import base64
import datetime
import fcntl
import getpass
import hashlib
import io
import json
import os
import secrets
import stat
import sys
import urllib.error
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar
from zoneinfo import ZoneInfo


BASE_URL = "https://barcode-network-site-cpps-fg7a9jcmf-6-bits-projects.vercel.app"
EXPECTED_SOURCE_COMMIT = "a1537f611db69e5a1c3d74ebb941d06d68ad49ff"
CANONICAL_SHOW_DATES = ("2026-08-07", "2026-08-14")
KNOWN_AUGUST_7_SESSION_ID = "session_msjmzqjk_w1rkj"
OWNER_EXPORT_SHA256 = "49c950556a9662f98fa402beb84a7e579120afff8da9cc5c70077f4b46cd6c2e"
SOURCE_SHOW_DATE_BY_CANONICAL_DATE = {
    "2026-08-07": "2026-08-08",
    "2026-08-14": "2026-08-14",
}
ALLOWED_SOURCE_STATUSES_BY_CANONICAL_DATE = {
    "2026-08-07": frozenset(("closed", "archived")),
    "2026-08-14": frozenset(("open", "closed", "archived")),
}
PACIFIC_TIMEZONE = ZoneInfo("America/Los_Angeles")
SENTINEL_SESSION_ID = "__bnl_queue_capture_reserved_sentinel_91a972c__"
ALLOWED_PURPOSE_BY_CANONICAL_DATE = {
    # Session purpose/provenance was introduced on August 8 (88cafdb).  A
    # genuine August 7 live session therefore normalizes to "unknown" when its
    # stored record predates that field.
    "2026-08-07": frozenset(("unknown", "live_broadcast")),
    "2026-08-14": frozenset(("live_broadcast",)),
}
OUTPUT_DIR = "/home/ubuntu/barcode-queue-recovery"
WORK_DIR = os.path.join(OUTPUT_DIR, "two-live-queue-capture-work")
# Deliberately do not reuse or overwrite progress.json from the incompatible
# date-selection capture.  Its evidence remains available for provenance, but
# only this v3 checkpoint can drive the corrected v2 artifact.
PROGRESS_PATH = os.path.join(WORK_DIR, "progress-v3.json")
LOCK_PATH = os.path.join(WORK_DIR, "capture.lock")
MAX_RESPONSE_BYTES = 1_200_000
MAX_ARTIFACT_BYTES = 3_500_000
MAX_PROGRESS_BYTES = 8_000_000
MAX_EVIDENCE_BYTES = 2_000_000
REQUEST_TIMEOUT_SECONDS = 30
ARTIFACT_SCHEMA = "barcode_queue_two_session_source_capture_v2"
PROGRESS_SCHEMA = "barcode_queue_two_session_capture_progress_v3"
REQUEST_EVIDENCE_SCHEMA = "barcode_queue_capture_request_evidence_v1"


class CaptureError(Exception):
    """Expected fail-closed capture failure."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc)


def iso_utc(value):
    return value.astimezone(datetime.timezone.utc).isoformat().replace("+00:00", "Z")


def parse_iso_utc(value, label):
    text = require_string(value, label)
    try:
        parsed = datetime.datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as error:
        raise CaptureError("%s must be an ISO-8601 timestamp." % label) from error
    if parsed.tzinfo is None:
        raise CaptureError("%s must include a timezone." % label)
    return parsed.astimezone(datetime.timezone.utc)


def require_sha256(value, label):
    text = require_string(value, label)
    if len(text) != 64 or any(character not in "0123456789abcdef" for character in text):
        raise CaptureError("%s must be a lowercase SHA-256 digest." % label)
    return text


def reject_duplicate_object_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise CaptureError("Server response contains a duplicate JSON object key.")
        result[key] = value
    return result


def reject_nonfinite_json(value):
    raise CaptureError("Server response contains a non-finite JSON number: %s" % value)


def parse_json_response(raw, stage):
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as error:
        raise CaptureError("%s returned non-UTF-8 data." % stage) from error
    try:
        return json.loads(
            text,
            object_pairs_hook=reject_duplicate_object_keys,
            parse_constant=reject_nonfinite_json,
        )
    except CaptureError:
        raise
    except json.JSONDecodeError as error:
        raise CaptureError("%s did not return valid JSON." % stage) from error


def call_json(opener, path, stage, method, body=None):
    if not path.startswith("/") or path.startswith("//"):
        raise CaptureError("Internal error: unsafe request path.")
    is_admin_auth = (
        path == "/api/admin/auth"
        and method == "POST"
        and isinstance(body, dict)
        and set(body) == {"password"}
        and isinstance(body.get("password"), str)
    )
    is_read_only_queue = (
        path == "/api/admin/queue"
        and method == "POST"
        and isinstance(body, dict)
        and set(body) == {"action", "sessionId"}
        and body.get("action") == "viewSession"
        and isinstance(body.get("sessionId"), str)
    )
    if not is_admin_auth and not is_read_only_queue:
        raise CaptureError(
            "Internal error: source requests are restricted to admin authentication and read-only queue viewSession."
        )
    data = None
    headers = {
        "Accept": "application/json",
        "Cache-Control": "no-store",
        "User-Agent": "barcode-queue-two-session-capture/1.0",
    }
    if body is not None:
        data = json.dumps(body, separators=(",", ":"), allow_nan=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(
        BASE_URL + path,
        data=data,
        method=method,
        headers=headers,
    )
    try:
        with opener.open(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            if response.status != 200:
                raise CaptureError("%s returned HTTP %s." % (stage, response.status))
            content_type = response.headers.get_content_type().lower()
            raw = response.read(MAX_RESPONSE_BYTES + 1)
            evidence = record_success_response(
                stage=stage,
                method=method,
                path=path,
                status=response.status,
                content_type=content_type,
                raw=raw,
                safe_request_body=(
                    body
                    if method == "POST"
                    and path == "/api/admin/queue"
                    and isinstance(body, dict)
                    and body.get("action") == "viewSession"
                    and isinstance(body.get("sessionId"), str)
                    else None
                ),
            )
            if len(raw) > MAX_RESPONSE_BYTES:
                raise CaptureError(
                    "%s exceeded the 1,200,000-byte response limit; the first bytes were preserved as evidence."
                    % stage
                )
            if content_type != "application/json":
                raise CaptureError(
                    "%s did not return application/json; the response was preserved as evidence."
                    % stage
                )
    except urllib.error.HTTPError as error:
        # Do not print provider response bodies: authenticated admin responses
        # can contain private queue information.
        raise CaptureError("%s returned HTTP %s. No retry was attempted." % (stage, error.code)) from error
    except urllib.error.URLError as error:
        raise CaptureError("%s could not be reached. No retry was attempted." % stage) from error
    except TimeoutError as error:
        raise CaptureError("%s timed out. No retry was attempted." % stage) from error

    payload = parse_json_response(raw, stage)
    decoded_evidence = decode_request_evidence(evidence, stage + " evidence")
    return payload, hashlib.sha256(raw).hexdigest(), len(raw), raw, decoded_evidence


def call_read_only_queue(opener, session_id, stage):
    if not isinstance(session_id, str):
        raise CaptureError("Internal error: read-only queue session ID must be a string.")
    return call_json(
        opener,
        "/api/admin/queue",
        stage,
        method="POST",
        body={"action": "viewSession", "sessionId": session_id},
    )


def validate_admin_cookie(cookies):
    expected_host = urllib.parse.urlsplit(BASE_URL).hostname
    if not expected_host:
        raise CaptureError("Internal error: immutable source host is invalid.")
    matches = [cookie for cookie in cookies if cookie.name == "barcode_admin"]
    if len(matches) != 1:
        raise CaptureError("Authentication did not set exactly one admin cookie.")
    cookie = matches[0]
    cookie_host = cookie.domain.lower().lstrip(".")
    if cookie_host != expected_host.lower() or cookie.domain_specified:
        raise CaptureError("Admin cookie was not scoped to the exact immutable host.")
    if cookie.path != "/" or not cookie.path_specified:
        raise CaptureError("Admin cookie was not scoped to the root path.")
    if cookie.secure is not True:
        raise CaptureError("Admin cookie was not marked Secure.")
    if not cookie.value or cookie.is_expired():
        raise CaptureError("Admin cookie is empty or expired.")


def require_dict(value, label):
    if not isinstance(value, dict):
        raise CaptureError("%s must be a JSON object." % label)
    return value


def require_string(value, label):
    if not isinstance(value, str) or not value.strip():
        raise CaptureError("%s must be a non-empty string." % label)
    return value


def require_revision(value, label):
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise CaptureError("%s must be a non-negative integer." % label)
    return value


def stable_summary_identity(summary, label):
    value = require_dict(summary, label)
    return {
        "sessionId": require_string(value.get("sessionId"), label + ".sessionId"),
        "title": require_string(value.get("title"), label + ".title"),
        "status": require_string(value.get("status"), label + ".status"),
        "purpose": require_string(value.get("purpose"), label + ".purpose"),
        "bnlPublicationStatus": require_string(
            value.get("bnlPublicationStatus"),
            label + ".bnlPublicationStatus",
        ),
        "showDate": require_string(value.get("showDate"), label + ".showDate"),
        "createdAt": require_string(value.get("createdAt"), label + ".createdAt"),
        "updatedAt": require_string(value.get("updatedAt"), label + ".updatedAt"),
    }


def canonical_json_bytes(value):
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def parse_sentinel(payload, stage):
    value = require_dict(payload, stage)
    revision = require_revision(value.get("revision"), stage + ".revision")
    active = stable_summary_identity(value.get("session"), stage + ".session")
    viewed_session_id = require_string(value.get("viewedSessionId"), stage + ".viewedSessionId")
    if viewed_session_id != SENTINEL_SESSION_ID:
        raise CaptureError("%s did not echo the reserved read-only sentinel ID." % stage)

    summaries = value.get("sessions")
    if not isinstance(summaries, list) or not summaries:
        raise CaptureError("%s.sessions must be a non-empty array." % stage)
    identities = []
    summaries_by_id = {}
    for index, summary in enumerate(summaries):
        identity = stable_summary_identity(summary, "%s.sessions[%d]" % (stage, index))
        session_id = identity["sessionId"]
        if session_id in summaries_by_id:
            raise CaptureError("%s contains duplicate session ID %s." % (stage, session_id))
        summaries_by_id[session_id] = require_dict(summary, "%s.sessions[%d]" % (stage, index))
        identities.append(identity)

    if SENTINEL_SESSION_ID in summaries_by_id:
        raise CaptureError("%s reserved sentinel ID unexpectedly exists in the source roster." % stage)
    if active["sessionId"] not in summaries_by_id:
        raise CaptureError("%s fallback active session is absent from the source roster." % stage)

    august_7 = summaries_by_id.get(KNOWN_AUGUST_7_SESSION_ID)
    if august_7 is None:
        raise CaptureError(
            "%s does not contain the owner-verified August 7 session ID %s."
            % (stage, KNOWN_AUGUST_7_SESSION_ID)
        )
    if august_7.get("showDate") != SOURCE_SHOW_DATE_BY_CANONICAL_DATE["2026-08-07"]:
        raise CaptureError(
            "%s owner-verified August 7 session has source showDate %r; expected 2026-08-08."
            % (stage, august_7.get("showDate"))
        )

    august_14_candidates = [
        summary
        for summary in summaries_by_id.values()
        if summary.get("showDate") == SOURCE_SHOW_DATE_BY_CANONICAL_DATE["2026-08-14"]
    ]
    if not august_14_candidates:
        raise CaptureError("%s found no sessions with exact source showDate 2026-08-14." % stage)
    candidates = {
        "2026-08-07": [august_7],
        "2026-08-14": sorted(
            august_14_candidates,
            key=lambda item: (str(item.get("createdAt")), str(item.get("sessionId"))),
        ),
    }

    ordered_identities = sorted(identities, key=lambda item: item["sessionId"])
    roster_sha256 = hashlib.sha256(canonical_json_bytes(ordered_identities)).hexdigest()
    return {
        "revision": revision,
        "activeSessionId": active["sessionId"],
        "activeSessionShowDate": active["showDate"],
        "rosterCount": len(ordered_identities),
        "rosterSha256": roster_sha256,
        "candidates": candidates,
        "rosterIdentities": ordered_identities,
        "identitiesById": {item["sessionId"]: item for item in ordered_identities},
    }


def require_track(value, label):
    track = require_dict(value, label)
    require_string(track.get("id"), label + ".id")
    require_string(track.get("artist"), label + ".artist")
    require_string(track.get("title"), label + ".title")
    if not isinstance(track.get("link"), str):
        raise CaptureError("%s.link must be a string." % label)
    require_string(track.get("createdAt"), label + ".createdAt")
    return track


def is_simulation_track(track):
    note = track.get("note")
    return (
        track.get("isTestTrack") is True
        or (isinstance(note, str) and "[QUEUE SIMULATION TRACK]" in note)
        or track["artist"].startswith("SIM ")
        or track["title"].startswith("SIM ")
    )


def require_count(value, label):
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise CaptureError("%s must be a non-negative integer." % label)
    return value


def validate_track_shape(state, label):
    primary_ids = []
    non_simulation_primary_ids = []
    counts = {}
    for field in ("queue", "history", "removed", "spotlight"):
        entries = state.get(field)
        if not isinstance(entries, list):
            raise CaptureError("%s.%s must be an array." % (label, field))
        for index, entry in enumerate(entries):
            require_track(entry, "%s.%s[%d]" % (label, field, index))
        counts[field] = len(entries)
        if field != "spotlight":
            primary_ids.extend(entry["id"] for entry in entries)
            non_simulation_primary_ids.extend(
                entry["id"] for entry in entries if not is_simulation_track(entry)
            )

    for field in ("nextInLine", "loadedTrack", "nowPlaying"):
        entry = state.get(field)
        if entry is not None:
            require_track(entry, "%s.%s" % (label, field))

    loaded = state.get("loadedTrack")
    now_playing = state.get("nowPlaying")
    if loaded != now_playing:
        raise CaptureError("%s loadedTrack and nowPlaying are not identical." % label)

    if state.get("nextInLine") is not None:
        primary_ids.append(state["nextInLine"]["id"])
        if not is_simulation_track(state["nextInLine"]):
            non_simulation_primary_ids.append(state["nextInLine"]["id"])
    if loaded is not None:
        primary_ids.append(loaded["id"])
        if not is_simulation_track(loaded):
            non_simulation_primary_ids.append(loaded["id"])
    if len(primary_ids) != len(set(primary_ids)):
        raise CaptureError("%s contains a duplicate track across primary lifecycle positions." % label)

    counts["nextInLine"] = 1 if state.get("nextInLine") is not None else 0
    counts["loadedTrack"] = 1 if loaded is not None else 0
    counts["primaryUnique"] = len(primary_ids)
    counts["nonSimulationPrimary"] = len(non_simulation_primary_ids)

    summary = require_dict(state.get("session"), label + ".session")
    removed_ids = {entry["id"] for entry in state["removed"]}
    accepted_ids = set()

    def count_accepted(entry, allowed_statuses):
        if entry is None:
            return
        if entry["id"] in removed_ids or is_simulation_track(entry):
            return
        if entry.get("status") in allowed_statuses:
            accepted_ids.add(entry["id"])

    for entry in state["queue"]:
        count_accepted(entry, ("queued", "playing"))
    count_accepted(state.get("nextInLine"), ("queued", "next", "playing"))
    count_accepted(loaded, ("queued", "next", "playing"))
    for entry in state["history"]:
        count_accepted(entry, ("completed", "played"))

    completed_ids = {
        entry["id"]
        for entry in state["history"]
        if entry["id"] not in removed_ids
        and not is_simulation_track(entry)
        and entry.get("status") in ("completed", "played")
    }
    active_count = sum(
        1 for entry in state["queue"] if entry.get("status") in ("queued", "playing")
    ) + counts["nextInLine"] + counts["loadedTrack"]
    expected_counts = {
        "activeCount": active_count,
        "acceptedCount": len(accepted_ids),
        "completedCount": len(completed_ids),
        "removedCount": len(state["removed"]),
        "spotlightCount": len(state["spotlight"]),
    }
    for field, expected in expected_counts.items():
        actual = require_count(summary.get(field), "%s.session.%s" % (label, field))
        if actual != expected:
            raise CaptureError(
                "%s.session.%s is %d but the captured lifecycle data implies %d."
                % (label, field, actual, expected)
            )
    total_played = require_count(state.get("totalPlayed"), label + ".totalPlayed")
    if total_played != expected_counts["completedCount"]:
        raise CaptureError("%s.totalPlayed disagrees with completedCount." % label)
    counts.update(expected_counts)
    return counts


def validate_target_response(payload, canonical_show_date, expected_summary, sentinel, stage):
    state = require_dict(payload, stage)
    revision = require_revision(state.get("revision"), stage + ".revision")
    if revision != sentinel["revision"]:
        raise CaptureError(
            "%s revision changed from %d to %d."
            % (stage, sentinel["revision"], revision)
        )

    expected_identity = stable_summary_identity(expected_summary, stage + ".expectedSummary")
    actual_summary = require_dict(state.get("session"), stage + ".session")
    actual_identity = stable_summary_identity(actual_summary, stage + ".session")
    if actual_identity != expected_identity:
        raise CaptureError("%s did not return the exact discovered session identity." % stage)
    for field in ("queueOpen", "showStarted", "broadcastStartedAt"):
        if actual_summary.get(field) != expected_summary.get(field):
            raise CaptureError("%s source session %s changed after the start sentinel." % (stage, field))
    source_show_date = SOURCE_SHOW_DATE_BY_CANONICAL_DATE[canonical_show_date]
    if actual_identity["showDate"] != source_show_date:
        raise CaptureError(
            "%s returned source showDate %r; expected %s for canonical %s."
            % (stage, actual_identity["showDate"], source_show_date, canonical_show_date)
        )
    if actual_identity["status"] not in ALLOWED_SOURCE_STATUSES_BY_CANONICAL_DATE[canonical_show_date]:
        raise CaptureError(
            "%s source status %r is not allowed for canonical %s."
            % (stage, actual_identity["status"], canonical_show_date)
        )
    viewed_session_id = require_string(state.get("viewedSessionId"), stage + ".viewedSessionId")
    if viewed_session_id != expected_identity["sessionId"]:
        raise CaptureError("%s viewedSessionId does not match the requested session." % stage)

    response_summaries = state.get("sessions")
    if not isinstance(response_summaries, list):
        raise CaptureError("%s.sessions must be an array." % stage)
    response_identities = []
    response_ids = set()
    for index, summary in enumerate(response_summaries):
        identity = stable_summary_identity(summary, "%s.sessions[%d]" % (stage, index))
        if identity["sessionId"] in response_ids:
            raise CaptureError("%s contains a duplicate session ID." % stage)
        response_ids.add(identity["sessionId"])
        response_identities.append(identity)
    response_identities.sort(key=lambda item: item["sessionId"])
    response_roster_sha256 = hashlib.sha256(canonical_json_bytes(response_identities)).hexdigest()
    if response_roster_sha256 != sentinel["rosterSha256"]:
        raise CaptureError("%s session roster differs from the start sentinel." % stage)

    counts = validate_track_shape(state, stage)
    if canonical_show_date == "2026-08-07":
        # The owner-supplied export contains 41 submission rows: 40 played and
        # one removed.  QueueState's acceptedCount intentionally excludes the
        # removed row, so the lossless guard binds the lifecycle shape instead
        # of incorrectly demanding acceptedCount == 41.
        expected_counts = {
            "queue": 0,
            "history": 40,
            "removed": 1,
            "spotlight": 0,
            "nextInLine": 0,
            "loadedTrack": 0,
            "primaryUnique": 41,
            "nonSimulationPrimary": 41,
            "activeCount": 0,
            "completedCount": 40,
            "removedCount": 1,
            "spotlightCount": 0,
        }
        for field, expected in expected_counts.items():
            if counts.get(field) != expected:
                raise CaptureError(
                    "%s.%s is %r; owner-supplied August 7 export evidence requires %d."
                    % (stage, field, counts.get(field), expected)
                )
        removed = state["removed"]
        if removed[0].get("artist") != "MagicSZN" or removed[0].get("title") != "HighFive":
            raise CaptureError(
                "%s removed track does not match the owner-supplied August 7 export."
                % stage
            )
    elif counts["nonSimulationPrimary"] < 1:
        raise CaptureError(
            "%s has no non-simulation primary track record; August 14 capture refused."
            % stage
        )
    return counts


def public_target_summary(summary):
    value = require_dict(summary, "target summary")
    return {
        "sessionId": value.get("sessionId"),
        "title": value.get("title"),
        "showDate": value.get("showDate"),
        "status": value.get("status"),
        "purpose": value.get("purpose"),
        "bnlPublicationStatus": value.get("bnlPublicationStatus"),
        "createdAt": value.get("createdAt"),
        "updatedAt": value.get("updatedAt"),
        "queueOpen": value.get("queueOpen"),
        "showStarted": value.get("showStarted"),
        "broadcastStartedAt": value.get("broadcastStartedAt"),
    }


def candidate_summary(summary, active_session_id=None):
    value = require_dict(summary, "candidate summary")
    result = public_target_summary(value)
    for field in (
        "queueOpen",
        "showStarted",
        "broadcastStartedAt",
        "activeCount",
        "acceptedCount",
        "completedCount",
        "removedCount",
        "spotlightCount",
    ):
        result[field] = value.get(field)
    result["isActiveSession"] = value.get("sessionId") == active_session_id
    return result


def validate_selected_summary(summary, canonical_show_date, label):
    value = require_dict(summary, label)
    identity = stable_summary_identity(value, label)
    source_show_date = SOURCE_SHOW_DATE_BY_CANONICAL_DATE[canonical_show_date]
    if identity["showDate"] != source_show_date:
        raise CaptureError(
            "%s has source showDate %r; expected %s for canonical %s."
            % (label, identity["showDate"], source_show_date, canonical_show_date)
        )
    if (
        canonical_show_date == "2026-08-07"
        and identity["sessionId"] != KNOWN_AUGUST_7_SESSION_ID
    ):
        raise CaptureError(
            "%s is not the owner-verified August 7 session ID %s."
            % (label, KNOWN_AUGUST_7_SESSION_ID)
        )
    if identity["status"] not in ALLOWED_SOURCE_STATUSES_BY_CANONICAL_DATE[canonical_show_date]:
        raise CaptureError(
            "%s has source status %r; expected one of %s."
            % (
                label,
                identity["status"],
                sorted(ALLOWED_SOURCE_STATUSES_BY_CANONICAL_DATE[canonical_show_date]),
            )
        )
    if identity["purpose"] not in ALLOWED_PURPOSE_BY_CANONICAL_DATE[canonical_show_date]:
        raise CaptureError(
            "%s has purpose %r; expected one of %s."
            % (
                label,
                identity["purpose"],
                sorted(ALLOWED_PURPOSE_BY_CANONICAL_DATE[canonical_show_date]),
            )
        )
    for field in ("queueOpen", "showStarted"):
        if not isinstance(value.get(field), bool):
            raise CaptureError("%s.%s must be a boolean." % (label, field))
    broadcast_started_at = value.get("broadcastStartedAt")
    if broadcast_started_at is not None and not isinstance(broadcast_started_at, str):
        raise CaptureError("%s.broadcastStartedAt must be a string or null." % label)
    if canonical_show_date == "2026-08-14":
        created_at = parse_iso_utc(identity["createdAt"], label + ".createdAt")
        pacific_created_date = created_at.astimezone(PACIFIC_TIMEZONE).date().isoformat()
        if pacific_created_date != "2026-08-14":
            raise CaptureError(
                "%s createdAt resolves to Pacific date %s; expected 2026-08-14."
                % (label, pacific_created_date)
            )
    return value


def confirmation_text(revision, targets):
    return (
        "CAPTURE revision=%d canonical=%s source=%s session=%s canonical=%s source=%s session=%s"
        % (
            revision,
            CANONICAL_SHOW_DATES[0],
            SOURCE_SHOW_DATE_BY_CANONICAL_DATE[CANONICAL_SHOW_DATES[0]],
            targets[CANONICAL_SHOW_DATES[0]]["sessionId"],
            CANONICAL_SHOW_DATES[1],
            SOURCE_SHOW_DATE_BY_CANONICAL_DATE[CANONICAL_SHOW_DATES[1]],
            targets[CANONICAL_SHOW_DATES[1]]["sessionId"],
        )
    )


def ensure_private_directory(path):
    try:
        info = os.lstat(path)
    except FileNotFoundError:
        os.makedirs(path, mode=0o700, exist_ok=False)
        info = os.lstat(path)
    if (
        stat.S_ISLNK(info.st_mode)
        or not stat.S_ISDIR(info.st_mode)
        or info.st_uid != os.geteuid()
    ):
        raise CaptureError("Recovery path %s is not a current-user real directory." % path)
    os.chmod(path, 0o700)
    info = os.stat(path)
    if stat.S_IMODE(info.st_mode) != 0o700:
        raise CaptureError("Recovery directory %s is not mode 0700." % path)


def ensure_private_output_dirs():
    ensure_private_directory(OUTPUT_DIR)
    ensure_private_directory(WORK_DIR)


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
            raise CaptureError("Created evidence file is not mode 0600.")
    except Exception:
        if descriptor is not None:
            os.close(descriptor)
        if created:
            try:
                os.unlink(path)
            except OSError:
                pass
        raise


def fsync_directory(path):
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def read_private_file(path, maximum_bytes, label):
    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        descriptor = os.open(path, flags)
    except FileNotFoundError:
        return None
    try:
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode):
            raise CaptureError("%s is not a regular file." % label)
        if info.st_uid != os.geteuid():
            raise CaptureError("%s is not owned by the current user." % label)
        if stat.S_IMODE(info.st_mode) != 0o600:
            raise CaptureError("%s must be mode 0600." % label)
        data = b""
        while len(data) <= maximum_bytes:
            chunk = os.read(descriptor, min(65536, maximum_bytes + 1 - len(data)))
            if not chunk:
                break
            data += chunk
        if len(data) > maximum_bytes:
            raise CaptureError("%s exceeds its private-file size limit." % label)
        return data
    finally:
        os.close(descriptor)


def parse_private_json_file(path, maximum_bytes, label):
    raw = read_private_file(path, maximum_bytes, label)
    if raw is None:
        return None
    return require_dict(parse_json_response(raw, label), label)


def atomic_private_json(path, value, maximum_bytes, label):
    raw = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        indent=2,
        allow_nan=False,
    ).encode("utf-8") + b"\n"
    if len(raw) > maximum_bytes:
        raise CaptureError("%s exceeds its private-file size limit." % label)

    try:
        existing = os.lstat(path)
    except FileNotFoundError:
        existing = None
    if existing is not None and (
        stat.S_ISLNK(existing.st_mode)
        or not stat.S_ISREG(existing.st_mode)
        or existing.st_uid != os.geteuid()
        or stat.S_IMODE(existing.st_mode) != 0o600
    ):
        raise CaptureError("%s is not a safe mode-0600 current-user regular file." % label)

    temporary_path = path + ".tmp-" + secrets.token_hex(8)
    create_private_file(temporary_path, raw)
    try:
        os.replace(temporary_path, path)
        directory_descriptor = os.open(os.path.dirname(path), os.O_RDONLY)
        try:
            os.fsync(directory_descriptor)
        finally:
            os.close(directory_descriptor)
    except Exception:
        try:
            os.unlink(temporary_path)
        except OSError:
            pass
        raise


def record_success_response(
    stage,
    method,
    path,
    status,
    content_type,
    raw,
    safe_request_body=None,
):
    ensure_private_output_dirs()
    captured_at = utc_now()
    response_sha256 = hashlib.sha256(raw).hexdigest()
    event = {
        "schema": REQUEST_EVIDENCE_SCHEMA,
        "capturedAt": iso_utc(captured_at),
        "sourceBaseUrl": BASE_URL,
        "stage": stage,
        "request": {
            "method": method,
            "path": path,
        },
        "response": {
            "status": status,
            "contentType": content_type,
            "bytes": len(raw),
            "complete": len(raw) <= MAX_RESPONSE_BYTES,
            "sha256": response_sha256,
            "base64": base64.b64encode(raw).decode("ascii"),
        },
    }
    # Only the queue viewSession body is nonsecret and useful provenance.  In
    # particular, never persist or hash the admin-auth request body.
    if safe_request_body is not None:
        event["request"]["body"] = safe_request_body
    event_bytes = json.dumps(
        event,
        ensure_ascii=False,
        sort_keys=True,
        indent=2,
        allow_nan=False,
    ).encode("utf-8") + b"\n"
    if len(event_bytes) > MAX_EVIDENCE_BYTES:
        raise CaptureError("Successful %s response is too large to preserve safely." % stage)
    timestamp = captured_at.strftime("%Y%m%dT%H%M%S%fZ")
    filename = "request-%s-%s-%s.json" % (
        timestamp,
        os.getpid(),
        secrets.token_hex(4),
    )
    evidence_path = os.path.join(WORK_DIR, filename)
    create_private_file(evidence_path, event_bytes)
    fsync_directory(WORK_DIR)
    event["evidenceFile"] = filename
    print("PRESERVED SUCCESSFUL RESPONSE:", evidence_path)
    return event


def acquire_capture_lock():
    ensure_private_output_dirs()
    flags = os.O_RDWR | os.O_CREAT
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    descriptor = os.open(LOCK_PATH, flags, 0o600)
    info = os.fstat(descriptor)
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid():
        os.close(descriptor)
        raise CaptureError("Capture lock is not a safe current-user regular file.")
    os.fchmod(descriptor, 0o600)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError as error:
        os.close(descriptor)
        raise CaptureError("Another capture process is already running.") from error
    return descriptor


def decode_request_evidence(event, label):
    value = require_dict(event, label)
    if value.get("schema") != REQUEST_EVIDENCE_SCHEMA:
        raise CaptureError("%s has the wrong schema." % label)
    if value.get("sourceBaseUrl") != BASE_URL:
        raise CaptureError("%s names the wrong source deployment." % label)
    captured_at = parse_iso_utc(value.get("capturedAt"), label + ".capturedAt")
    request = require_dict(value.get("request"), label + ".request")
    method = require_string(request.get("method"), label + ".request.method")
    path = require_string(request.get("path"), label + ".request.path")
    response = require_dict(value.get("response"), label + ".response")
    if response.get("status") != 200:
        raise CaptureError("%s is not a successful response." % label)
    encoded = require_string(response.get("base64"), label + ".response.base64")
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (TypeError, ValueError) as error:
        raise CaptureError("%s response is not canonical base64." % label) from error
    if base64.b64encode(raw).decode("ascii") != encoded:
        raise CaptureError("%s response is not canonical base64." % label)
    response_bytes = require_count(response.get("bytes"), label + ".response.bytes")
    complete = response.get("complete")
    if not isinstance(complete, bool):
        raise CaptureError("%s.response.complete must be a boolean." % label)
    maximum_preserved = MAX_RESPONSE_BYTES if complete else MAX_RESPONSE_BYTES + 1
    if response_bytes != len(raw) or len(raw) > maximum_preserved:
        raise CaptureError("%s response length is invalid." % label)
    if complete != (len(raw) <= MAX_RESPONSE_BYTES):
        raise CaptureError("%s response completeness marker is invalid." % label)
    response_sha256 = require_sha256(response.get("sha256"), label + ".response.sha256")
    if hashlib.sha256(raw).hexdigest() != response_sha256:
        raise CaptureError("%s response checksum does not match." % label)
    return {
        "capturedAt": captured_at,
        "capturedAtText": value["capturedAt"],
        "method": method,
        "path": path,
        "body": request.get("body"),
        "contentType": response.get("contentType"),
        "complete": complete,
        "responseBytes": response_bytes,
        "responseSha256": response_sha256,
        "raw": raw,
        "evidenceFile": value.get("evidenceFile"),
    }


def load_request_evidence_files():
    ensure_private_output_dirs()
    events = []
    for filename in sorted(os.listdir(WORK_DIR)):
        if not filename.startswith("request-") or not filename.endswith(".json"):
            continue
        path = os.path.join(WORK_DIR, filename)
        value = parse_private_json_file(path, MAX_EVIDENCE_BYTES, "request evidence " + filename)
        if value is None:
            continue
        value["evidenceFile"] = filename
        decoded = decode_request_evidence(value, "request evidence " + filename)
        events.append(decoded)
    events.sort(key=lambda item: (item["capturedAt"], item["evidenceFile"]))
    return events


def matching_queue_evidence(events, session_id, after=None):
    matches = []
    expected_body = {"action": "viewSession", "sessionId": session_id}
    for event in events:
        if (
            event["method"] == "POST"
            and event["path"] == "/api/admin/queue"
            and event["body"] == expected_body
            and event["contentType"] == "application/json"
            and event["complete"] is True
            and (after is None or event["capturedAt"] > after)
        ):
            matches.append(event)
    return matches


def response_checkpoint(event):
    return {
        "capturedAt": event["capturedAtText"],
        "evidenceFile": event["evidenceFile"],
        "responseSha256": event["responseSha256"],
        "responseBytes": event["responseBytes"],
        "responseBase64": base64.b64encode(event["raw"]).decode("ascii"),
    }


def decode_response_checkpoint(value, label):
    checkpoint = require_dict(value, label)
    captured_at = parse_iso_utc(checkpoint.get("capturedAt"), label + ".capturedAt")
    evidence_file = require_string(checkpoint.get("evidenceFile"), label + ".evidenceFile")
    if os.path.basename(evidence_file) != evidence_file:
        raise CaptureError("%s.evidenceFile must be a basename." % label)
    encoded = require_string(checkpoint.get("responseBase64"), label + ".responseBase64")
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (TypeError, ValueError) as error:
        raise CaptureError("%s.responseBase64 is not canonical base64." % label) from error
    if base64.b64encode(raw).decode("ascii") != encoded:
        raise CaptureError("%s.responseBase64 is not canonical base64." % label)
    response_bytes = require_count(checkpoint.get("responseBytes"), label + ".responseBytes")
    if response_bytes != len(raw) or len(raw) > MAX_RESPONSE_BYTES:
        raise CaptureError("%s response length is invalid." % label)
    response_sha256 = require_sha256(checkpoint.get("responseSha256"), label + ".responseSha256")
    if hashlib.sha256(raw).hexdigest() != response_sha256:
        raise CaptureError("%s response checksum does not match." % label)
    return {
        "capturedAt": captured_at,
        "capturedAtText": checkpoint["capturedAt"],
        "evidenceFile": evidence_file,
        "responseSha256": response_sha256,
        "responseBytes": response_bytes,
        "raw": raw,
    }


def require_backing_evidence(checkpoint, events, session_id, label):
    expected_body = {"action": "viewSession", "sessionId": session_id}
    matches = [event for event in events if event["evidenceFile"] == checkpoint["evidenceFile"]]
    if len(matches) != 1:
        raise CaptureError("%s does not have exactly one backing evidence file." % label)
    event = matches[0]
    if (
        event["method"] != "POST"
        or event["path"] != "/api/admin/queue"
        or event["body"] != expected_body
        or event["contentType"] != "application/json"
        or event["complete"] is not True
        or event["capturedAt"] != checkpoint["capturedAt"]
        or event["responseSha256"] != checkpoint["responseSha256"]
        or event["responseBytes"] != checkpoint["responseBytes"]
        or event["raw"] != checkpoint["raw"]
    ):
        raise CaptureError("%s does not match its backing evidence file." % label)


def progress_source():
    return {
        "baseUrl": BASE_URL,
        "expectedGitCommit": EXPECTED_SOURCE_COMMIT,
        "route": "/api/admin/queue",
        "readMethod": "POST",
        "readAction": "viewSession",
        "reservedSentinelSessionId": SENTINEL_SESSION_ID,
        "canonicalShowDates": list(CANONICAL_SHOW_DATES),
        "sourceShowDateByCanonicalDate": dict(SOURCE_SHOW_DATE_BY_CANONICAL_DATE),
        "knownAugust7SessionId": KNOWN_AUGUST_7_SESSION_ID,
        "ownerExportSha256": OWNER_EXPORT_SHA256,
        "remoteMutationRequests": 0,
    }


def write_progress(progress):
    atomic_private_json(PROGRESS_PATH, progress, MAX_PROGRESS_BYTES, "capture progress")
    print("CHECKPOINT:", PROGRESS_PATH)


def new_progress(start_event):
    payload = parse_json_response(start_event["raw"], "preserved start sentinel")
    start = parse_sentinel(payload, "preserved start sentinel")
    progress = {
        "schema": PROGRESS_SCHEMA,
        "source": progress_source(),
        "start": response_checkpoint(start_event),
        "selection": None,
        "sessions": {},
        "end": None,
        "finalArtifact": None,
    }
    write_progress(progress)
    return progress, start


def selected_targets(start, selection, label="capture selection"):
    value = require_dict(selection, label)
    if set(value) != set(CANONICAL_SHOW_DATES):
        raise CaptureError("%s must name exactly August 7 and August 14." % label)
    targets = {}
    selected_ids = set()
    for target_date in CANONICAL_SHOW_DATES:
        session_id = require_string(value.get(target_date), label + "." + target_date)
        if session_id in selected_ids:
            raise CaptureError("%s repeats a session ID." % label)
        selected_ids.add(session_id)
        matches = [
            summary
            for summary in start["candidates"][target_date]
            if summary.get("sessionId") == session_id
        ]
        if len(matches) != 1:
            raise CaptureError(
                "%s selected ID %s is not an exact %s candidate."
                % (label, session_id, target_date)
            )
        targets[target_date] = validate_selected_summary(
            matches[0],
            target_date,
            "%s.%s" % (label, target_date),
        )
    return targets


def make_captured_session(target_date, summary, start, event):
    stage = "target session canonical %s" % target_date
    payload = parse_json_response(event["raw"], stage)
    counts = validate_target_response(payload, target_date, summary, start, stage)
    return {
        "canonicalShowDate": target_date,
        "sourceShowDate": summary["showDate"],
        "sessionId": summary["sessionId"],
        "revision": start["revision"],
        "sourceResponseSha256": event["responseSha256"],
        "sourceResponseBytes": event["responseBytes"],
        "sourceResponseBase64": base64.b64encode(event["raw"]).decode("ascii"),
        "summaryAtStart": public_target_summary(summary),
        "trackCounts": counts,
        "evidenceCapturedAt": event["capturedAtText"],
        "evidenceFile": event["evidenceFile"],
    }


def validate_captured_session(item, target_date, summary, start, events):
    value = require_dict(item, "saved target " + target_date)
    if (
        value.get("canonicalShowDate") != target_date
        or value.get("sourceShowDate") != SOURCE_SHOW_DATE_BY_CANONICAL_DATE[target_date]
        or value.get("sessionId") != summary["sessionId"]
    ):
        raise CaptureError("Saved target %s has the wrong identity." % target_date)
    if require_revision(value.get("revision"), "saved target revision") != start["revision"]:
        raise CaptureError("Saved target %s has the wrong revision." % target_date)
    checkpoint = decode_response_checkpoint(
        {
            "capturedAt": value.get("evidenceCapturedAt"),
            "evidenceFile": value.get("evidenceFile"),
            "responseSha256": value.get("sourceResponseSha256"),
            "responseBytes": value.get("sourceResponseBytes"),
            "responseBase64": value.get("sourceResponseBase64"),
        },
        "saved target " + target_date,
    )
    require_backing_evidence(checkpoint, events, summary["sessionId"], "saved target " + target_date)
    payload = parse_json_response(checkpoint["raw"], "saved target " + target_date)
    counts = validate_target_response(
        payload,
        target_date,
        summary,
        start,
        "saved target " + target_date,
    )
    if value.get("summaryAtStart") != public_target_summary(summary):
        raise CaptureError("Saved target %s start summary does not match." % target_date)
    if value.get("trackCounts") != counts:
        raise CaptureError("Saved target %s track counts do not match." % target_date)
    return checkpoint


def validate_stable_end(end, start, targets, label):
    if end["revision"] != start["revision"]:
        raise CaptureError(
            "%s queue revision changed (%d -> %d)."
            % (label, start["revision"], end["revision"])
        )
    if end["activeSessionId"] != start["activeSessionId"]:
        raise CaptureError("%s active session changed." % label)
    if end["rosterSha256"] != start["rosterSha256"]:
        raise CaptureError("%s session roster changed." % label)
    for target_date in CANONICAL_SHOW_DATES:
        session_id = targets[target_date]["sessionId"]
        if end["identitiesById"].get(session_id) != stable_summary_identity(
            targets[target_date],
            "%s.%s" % (label, target_date),
        ):
            raise CaptureError("%s selected %s identity changed." % (label, target_date))


def load_progress(events):
    progress = parse_private_json_file(PROGRESS_PATH, MAX_PROGRESS_BYTES, "capture progress")
    if progress is None:
        return None, None, None
    if progress.get("schema") != PROGRESS_SCHEMA:
        raise CaptureError("Capture progress has the wrong schema.")
    if progress.get("source") != progress_source():
        raise CaptureError("Capture progress source provenance is invalid.")
    start_checkpoint = decode_response_checkpoint(progress.get("start"), "capture progress.start")
    require_backing_evidence(
        start_checkpoint,
        events,
        SENTINEL_SESSION_ID,
        "capture progress.start",
    )
    start_payload = parse_json_response(start_checkpoint["raw"], "capture progress start response")
    start = parse_sentinel(start_payload, "capture progress start response")
    selection = progress.get("selection")
    targets = None if selection is None else selected_targets(start, selection)
    sessions = require_dict(progress.get("sessions"), "capture progress.sessions")
    if any(target_date not in CANONICAL_SHOW_DATES for target_date in sessions):
        raise CaptureError("Capture progress contains an unexpected saved target.")
    if sessions and targets is None:
        raise CaptureError("Capture progress has target data without a confirmed selection.")
    captured_times = []
    if targets is not None:
        for target_date, item in sessions.items():
            checkpoint = validate_captured_session(
                item,
                target_date,
                targets[target_date],
                start,
                events,
            )
            captured_times.append(checkpoint["capturedAt"])
    end_value = progress.get("end")
    if end_value is not None:
        if targets is None or set(sessions) != set(CANONICAL_SHOW_DATES):
            raise CaptureError("Capture progress has an end sentinel before both targets.")
        end_checkpoint = decode_response_checkpoint(end_value, "capture progress.end")
        require_backing_evidence(
            end_checkpoint,
            events,
            SENTINEL_SESSION_ID,
            "capture progress.end",
        )
        if not captured_times or end_checkpoint["capturedAt"] <= max(captured_times):
            raise CaptureError("Capture progress end sentinel is not later than both targets.")
        end_payload = parse_json_response(end_checkpoint["raw"], "capture progress end response")
        end = parse_sentinel(end_payload, "capture progress end response")
        validate_stable_end(end, start, targets, "capture progress end response")
    return progress, start, targets


def reusable_start_event(events):
    for event in reversed(matching_queue_evidence(events, SENTINEL_SESSION_ID)):
        try:
            payload = parse_json_response(event["raw"], "preserved start candidate")
            parse_sentinel(payload, "preserved start candidate")
        except CaptureError as error:
            print(
                "PRESERVED RESPONSE NOT REUSED:",
                event["evidenceFile"],
                "reason=" + str(error),
            )
            continue
        return event
    return None


def reusable_target_capture(events, target_date, summary, start, after):
    for event in matching_queue_evidence(events, summary["sessionId"], after=after):
        try:
            captured = make_captured_session(target_date, summary, start, event)
        except CaptureError as error:
            print(
                "PRESERVED RESPONSE NOT REUSED:",
                event["evidenceFile"],
                "reason=" + str(error),
            )
            continue
        return event, captured
    return None, None


def reusable_end_event(events, start, targets, after):
    for event in matching_queue_evidence(
        events,
        SENTINEL_SESSION_ID,
        after=after,
    ):
        try:
            payload = parse_json_response(event["raw"], "preserved end candidate")
            end = parse_sentinel(payload, "preserved end candidate")
            validate_stable_end(end, start, targets, "preserved end candidate")
        except CaptureError as error:
            print(
                "PRESERVED RESPONSE NOT REUSED:",
                event["evidenceFile"],
                "reason=" + str(error),
            )
            continue
        return event
    return None


def prompt_for_selection(controlling_tty, start):
    print("SOURCE:", BASE_URL)
    print("EXPECTED SOURCE COMMIT:", EXPECTED_SOURCE_COMMIT)
    print("START REVISION:", start["revision"])
    print(
        "August 7 Pacific is pinned by owner-supplied export evidence; its raw source showDate is 2026-08-08."
    )
    august_7_summary = start["candidates"]["2026-08-07"][0]
    august_7_target = validate_selected_summary(
        august_7_summary,
        "2026-08-07",
        "owner-verified August 7 session",
    )
    august_7_display = candidate_summary(august_7_summary, start["activeSessionId"])
    august_7_display["canonicalShowDate"] = "2026-08-07"
    august_7_display["sourceShowDate"] = august_7_display.pop("showDate")
    august_7_display["pinnedByOwnerExportSha256"] = OWNER_EXPORT_SHA256
    print("PINNED AUGUST 7 TARGET:")
    print(json.dumps(august_7_display, ensure_ascii=False, sort_keys=True, indent=2))

    target_date = "2026-08-14"
    print(
        "The source may have multiple exact August 14 records. Select by exact sessionId; date alone is not accepted."
    )
    print("CANDIDATES FOR CANONICAL/SOURCE 2026-08-14:")
    for summary in start["candidates"][target_date]:
        display = candidate_summary(summary, start["activeSessionId"])
        display["canonicalShowDate"] = target_date
        display["sourceShowDate"] = display.pop("showDate")
        try:
            validate_selected_summary(summary, target_date, "candidate")
            display["eligibleForCapture"] = True
        except CaptureError as error:
            display["eligibleForCapture"] = False
            display["ineligibleReason"] = str(error)
        print(json.dumps(display, ensure_ascii=False, sort_keys=True, indent=2))
    controlling_tty.write("Exact sessionId for 2026-08-14: ")
    controlling_tty.flush()
    supplied_id = controlling_tty.readline().strip()
    matches = [
        summary
        for summary in start["candidates"][target_date]
        if summary.get("sessionId") == supplied_id
    ]
    if len(matches) != 1:
        raise CaptureError(
            "Selection for 2026-08-14 did not exactly match one displayed sessionId. Nothing was selected."
        )
    august_14_target = validate_selected_summary(
        matches[0],
        target_date,
        "selected August 14 session",
    )
    selection = {
        "2026-08-07": KNOWN_AUGUST_7_SESSION_ID,
        "2026-08-14": supplied_id,
    }
    targets = {
        "2026-08-07": august_7_target,
        "2026-08-14": august_14_target,
    }
    if len(set(selection.values())) != len(CANONICAL_SHOW_DATES):
        raise CaptureError("The two dates cannot select the same session ID.")

    expected_confirmation = confirmation_text(start["revision"], targets)
    print("To bind this checkpoint to the exact selected identities, type:")
    print(expected_confirmation)
    controlling_tty.write("> ")
    controlling_tty.flush()
    supplied_confirmation = controlling_tty.readline().strip()
    if supplied_confirmation != expected_confirmation:
        raise CaptureError("Confirmation did not exactly match. Nothing was selected.")
    return selection, targets


def validated_final_artifact(progress):
    final = progress.get("finalArtifact")
    if final is None:
        return None
    value = require_dict(final, "capture progress.finalArtifact")
    artifact_file = require_string(value.get("artifactFile"), "final artifact filename")
    checksum_file = require_string(value.get("checksumFile"), "final checksum filename")
    if os.path.basename(artifact_file) != artifact_file or checksum_file != artifact_file + ".sha256":
        raise CaptureError("Final artifact filenames are invalid.")
    artifact_sha256 = require_sha256(value.get("sha256"), "final artifact SHA-256")
    artifact_path = os.path.join(OUTPUT_DIR, artifact_file)
    checksum_path = os.path.join(OUTPUT_DIR, checksum_file)
    raw = read_private_file(artifact_path, MAX_ARTIFACT_BYTES, "final capture artifact")
    checksum_raw = read_private_file(checksum_path, 512, "final capture checksum")
    if raw is None or checksum_raw is None:
        raise CaptureError("Final artifact checkpoint names missing files.")
    if hashlib.sha256(raw).hexdigest() != artifact_sha256:
        raise CaptureError("Final capture artifact checksum does not match progress.")
    expected_checksum = (artifact_sha256 + "  " + artifact_file + "\n").encode("ascii")
    if checksum_raw != expected_checksum:
        raise CaptureError("Final capture checksum file is invalid.")
    artifact = require_dict(parse_json_response(raw, "final capture artifact"), "final capture artifact")
    if artifact.get("schema") != ARTIFACT_SCHEMA:
        raise CaptureError("Final capture artifact has the wrong schema.")
    return artifact_path, checksum_path, artifact_sha256


def write_artifact(artifact):
    artifact_bytes = json.dumps(
        artifact,
        ensure_ascii=False,
        sort_keys=True,
        indent=2,
        allow_nan=False,
    ).encode("utf-8") + b"\n"
    if len(artifact_bytes) > MAX_ARTIFACT_BYTES:
        raise CaptureError(
            "Final capture artifact is %d bytes; the safe import limit is %d bytes. Nothing was saved."
            % (len(artifact_bytes), MAX_ARTIFACT_BYTES)
        )

    ensure_private_output_dirs()
    # The importer intentionally accepts only this exact second-precision
    # filename shape.  O_EXCL fails closed if two finalizations collide.
    timestamp = utc_now().strftime("%Y%m%dT%H%M%SZ")
    filename = "queue-sessions-2026-08-07_2026-08-14-source-%s.json" % timestamp
    artifact_path = os.path.join(OUTPUT_DIR, filename)
    checksum_path = artifact_path + ".sha256"
    artifact_sha256 = hashlib.sha256(artifact_bytes).hexdigest()
    checksum_bytes = (artifact_sha256 + "  " + filename + "\n").encode("ascii")

    create_private_file(artifact_path, artifact_bytes)
    checksum_created = False
    try:
        create_private_file(checksum_path, checksum_bytes)
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
            os.unlink(artifact_path)
        except OSError:
            pass
        raise
    return artifact_path, checksum_path, artifact_sha256


def main():
    lock_descriptor = acquire_capture_lock()
    controlling_tty = None
    cookies = CookieJar()
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({}),
        NoRedirect(),
        urllib.request.HTTPCookieProcessor(cookies),
    )
    authenticated = False

    def require_tty():
        nonlocal controlling_tty
        if controlling_tty is not None:
            return controlling_tty
        try:
            controlling_tty = io.TextIOWrapper(
                io.FileIO(os.open("/dev/tty", os.O_RDWR | os.O_NOCTTY), mode="w+"),
                encoding="utf-8",
                line_buffering=True,
            )
        except (OSError, ValueError) as error:
            raise CaptureError(
                "A controlling TTY is required for password and confirmation prompts."
            ) from error
        if not controlling_tty.isatty():
            controlling_tty.close()
            controlling_tty = None
            raise CaptureError(
                "A controlling TTY is required for password and confirmation prompts."
            )
        return controlling_tty

    def ensure_authenticated(events):
        nonlocal authenticated
        if authenticated:
            return
        tty = require_tty()
        password = getpass.getpass("Existing BARCODE admin password: ", stream=tty)
        if not password:
            raise CaptureError("Admin password was empty.")
        try:
            auth, _, _, _, auth_event = call_json(
                opener,
                "/api/admin/auth",
                "admin authentication",
                method="POST",
                body={"password": password},
            )
        finally:
            password = ""
        events.append(auth_event)
        if not isinstance(auth, dict) or auth.get("ok") is not True:
            raise CaptureError("Admin authentication was not confirmed.")
        validate_admin_cookie(cookies)
        authenticated = True

    try:
        events = load_request_evidence_files()
        progress, start, targets = load_progress(events)
        if progress is not None:
            finished = validated_final_artifact(progress)
            if finished is not None:
                artifact_path, checksum_path, artifact_sha256 = finished
                print("CAPTURE: ALREADY COMPLETE")
                print("ARTIFACT:", artifact_path)
                print("SHA256 FILE:", checksum_path)
                print("ARTIFACT SHA256:", artifact_sha256)
                print("No queue import or remote mutation was performed.")
                return

        if progress is None:
            start_event = reusable_start_event(events)
            if start_event is not None:
                print("RESUMING FROM PRESERVED START RESPONSE:", start_event["evidenceFile"])
            else:
                ensure_authenticated(events)
                _, _, _, _, start_event = call_read_only_queue(
                    opener,
                    SENTINEL_SESSION_ID,
                    "start sentinel",
                )
                events.append(start_event)
            progress, start = new_progress(start_event)
            targets = None

        if targets is None:
            selection, targets = prompt_for_selection(require_tty(), start)
            progress["selection"] = selection
            write_progress(progress)
        else:
            print("RESUMING CONFIRMED SELECTION:", confirmation_text(start["revision"], targets))

        start_checkpoint = decode_response_checkpoint(progress["start"], "capture progress.start")
        sessions = require_dict(progress["sessions"], "capture progress.sessions")
        for target_date in CANONICAL_SHOW_DATES:
            if target_date in sessions:
                print(
                    "REUSING CAPTURED TARGET:",
                    target_date,
                    "sessionId=" + sessions[target_date]["sessionId"],
                )
                continue
            summary = targets[target_date]
            session_id = summary["sessionId"]
            target_event, captured = reusable_target_capture(
                events,
                target_date,
                summary,
                start,
                start_checkpoint["capturedAt"],
            )
            if target_event is not None:
                print("RESUMING FROM PRESERVED TARGET RESPONSE:", target_event["evidenceFile"])
            else:
                ensure_authenticated(events)
                _, _, _, _, target_event = call_read_only_queue(
                    opener,
                    session_id,
                    "target session %s" % target_date,
                )
                events.append(target_event)
                captured = make_captured_session(target_date, summary, start, target_event)
            sessions[target_date] = captured
            progress["sessions"] = sessions
            write_progress(progress)
            print(
                "CAPTURED TARGET:",
                target_date,
                "sessionId=" + session_id,
                "primaryTracks=" + str(captured["trackCounts"]["primaryUnique"]),
            )

        captured_checkpoints = [
            validate_captured_session(
                sessions[target_date],
                target_date,
                targets[target_date],
                start,
                events,
            )
            for target_date in CANONICAL_SHOW_DATES
        ]
        latest_target_time = max(item["capturedAt"] for item in captured_checkpoints)

        if progress.get("end") is None:
            end_event = reusable_end_event(
                events,
                start,
                targets,
                latest_target_time,
            )
            if end_event is not None:
                print("RESUMING FROM PRESERVED END RESPONSE:", end_event["evidenceFile"])
            else:
                ensure_authenticated(events)
                _, _, _, _, end_event = call_read_only_queue(
                    opener,
                    SENTINEL_SESSION_ID,
                    "end sentinel",
                )
                events.append(end_event)
            end_payload = parse_json_response(end_event["raw"], "end sentinel")
            end = parse_sentinel(end_payload, "end sentinel")
            validate_stable_end(end, start, targets, "end sentinel")
            progress["end"] = response_checkpoint(end_event)
            write_progress(progress)

        end_checkpoint = decode_response_checkpoint(progress["end"], "capture progress.end")
        captured_sessions = []
        for target_date in CANONICAL_SHOW_DATES:
            item = sessions[target_date]
            captured_sessions.append({
                key: item[key]
                for key in (
                    "canonicalShowDate",
                    "sourceShowDate",
                    "sessionId",
                    "revision",
                    "sourceResponseSha256",
                    "sourceResponseBytes",
                    "sourceResponseBase64",
                    "summaryAtStart",
                    "trackCounts",
                )
            })

        artifact = {
            "schema": ARTIFACT_SCHEMA,
            "capturedAt": end_checkpoint["capturedAtText"],
            "source": {
                "baseUrl": BASE_URL,
                "expectedGitCommit": EXPECTED_SOURCE_COMMIT,
                "route": "/api/admin/queue",
                "captureKind": "authenticated_admin_logical_session_state",
                "canonicalRawRedis": False,
                "remoteMutationRequests": 0,
                "acceptedReadOnlyPostResponses": 4,
                "readOnlyPostAction": "viewSession",
                "expectedRedisGetCommandsForAcceptedResponses": 4,
                "legacyFallbackMaximumRedisGetCommandsForAcceptedResponses": 8,
                "failedReadOnlyPostAttemptsUncounted": True,
                "automaticRetries": 0,
                "redirectsFollowed": 0,
            },
            "scope": {
                "canonicalShowDates": list(CANONICAL_SHOW_DATES),
                "sessionCount": len(captured_sessions),
                "sourceDateNormalization": [
                    {
                        "canonicalShowDate": "2026-08-07",
                        "sourceShowDate": "2026-08-08",
                        "sessionId": KNOWN_AUGUST_7_SESSION_ID,
                        "rule": "legacy_utc_rollover_to_pacific_broadcast_date",
                        "provenance": {
                            "kind": "owner_supplied_export",
                            "sourceSha256": OWNER_EXPORT_SHA256,
                            "detail": "Owner-supplied live export identifies this source session as the August 7 Pacific broadcast.",
                        },
                    },
                    {
                        "canonicalShowDate": "2026-08-14",
                        "sourceShowDate": "2026-08-14",
                        "sessionId": targets["2026-08-14"]["sessionId"],
                        "rule": "exact_source_show_date",
                        "provenance": {
                            "kind": "authenticated_source_queue_state",
                            "detail": "Canonical date equals the authenticated source showDate.",
                        },
                    },
                ],
            },
            "consistency": {
                "captureStartedAt": start_checkpoint["capturedAtText"],
                "captureFinishedAt": end_checkpoint["capturedAtText"],
                "revision": start["revision"],
                "activeSessionId": start["activeSessionId"],
                "rosterCount": start["rosterCount"],
                "rosterSha256": start["rosterSha256"],
                "startSentinelResponseSha256": start_checkpoint["responseSha256"],
                "startSentinelResponseBytes": start_checkpoint["responseBytes"],
                "endSentinelResponseSha256": end_checkpoint["responseSha256"],
                "endSentinelResponseBytes": end_checkpoint["responseBytes"],
                "startEndMatch": True,
            },
            "sessions": captured_sessions,
            "knownSourceLimitations": [
                "The immutable admin route exposes QueueState, not the byte-for-byte radioQueue:v2:sessions Redis value.",
                "The a1537f6 route normalizes legacy queue fields and defaults before returning QueueState.",
                "QueueState omits internal QueueSession lane-restoration fields that are not part of the admin response.",
                "Exact raw target responses include unrelated session summaries and transient timing; the importer discards those fields when reconstructing each target session.",
                "A legacy session may normalize to purpose=unknown even when the operator knows it was a live broadcast.",
                "The August 7 Pacific broadcast is bound to session_msjmzqjk_w1rkj by the pinned owner-export digest; its raw source showDate is 2026-08-08 and remains preserved.",
                "QueueState acceptedCount excludes removed rows; the August 7 lossless guard therefore requires 40 history rows, one removed row, and 41 unique primary lifecycle records.",
                "The operator selected the August 14 session ID after reviewing every exact source-date candidate; showDate alone was not used as identity.",
                "Source status, queueOpen, showStarted, and broadcastStartedAt remain preserved in summaryAtStart and in each exact raw target response; destination archival is an import-time operation.",
                "Each accepted response may have been captured in a separate invocation; equal revision, active fallback identity, and roster digest bind the resumed reads.",
            ],
        }
        artifact_path, checksum_path, artifact_sha256 = write_artifact(artifact)
        progress["finalArtifact"] = {
            "artifactFile": os.path.basename(artifact_path),
            "checksumFile": os.path.basename(checksum_path),
            "sha256": artifact_sha256,
        }
        write_progress(progress)

        print("CAPTURE: COMPLETE")
        print("REVISION:", start["revision"])
        for session in captured_sessions:
            print(
                "CAPTURED:",
                "canonical=" + session["canonicalShowDate"],
                "source=" + session["sourceShowDate"],
                "sessionId=" + session["sessionId"],
                "primaryTracks=" + str(session["trackCounts"]["primaryUnique"]),
                "spotlight=" + str(session["trackCounts"]["spotlight"]),
            )
        print("ARTIFACT:", artifact_path)
        print("SHA256 FILE:", checksum_path)
        print("ARTIFACT SHA256:", artifact_sha256)
        print("No queue import or remote mutation was performed.")
    finally:
        cookies.clear()
        if controlling_tty is not None:
            controlling_tty.close()
        os.close(lock_descriptor)


if __name__ == "__main__":
    try:
        main()
    except (CaptureError, OSError, ValueError) as error:
        print("CAPTURE FAILED:", str(error), file=sys.stderr)
        print(
            "Any successful response was preserved privately; rerun this same verified script to resume.",
            file=sys.stderr,
        )
        raise SystemExit(1)
