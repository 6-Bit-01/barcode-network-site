#!/usr/bin/env python3
"""Read-only capture of the August 7 and August 14 queue sessions.

This utility is deliberately pinned to the immutable Vercel deployment built
from a1537f6.  It authenticates once, performs four authenticated GETs (a
start sentinel, one GET for each exact show date, and an end sentinel), and
writes a private local evidence artifact.  It never calls a queue mutation
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
import getpass
import hashlib
import json
import os
import stat
import sys
import urllib.error
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar


BASE_URL = "https://barcode-network-site-cpps-fg7a9jcmf-6-bits-projects.vercel.app"
EXPECTED_SOURCE_COMMIT = "a1537f611db69e5a1c3d74ebb941d06d68ad49ff"
TARGET_DATES = ("2026-08-07", "2026-08-14")
ALLOWED_PURPOSE_BY_DATE = {
    # Session purpose/provenance was introduced on August 8 (88cafdb).  A
    # genuine August 7 live session therefore normalizes to "unknown" when its
    # stored record predates that field.
    "2026-08-07": frozenset(("unknown", "live_broadcast")),
    "2026-08-14": frozenset(("live_broadcast",)),
}
OUTPUT_DIR = "/home/ubuntu/barcode-queue-recovery"
MAX_RESPONSE_BYTES = 1_200_000
MAX_ARTIFACT_BYTES = 3_500_000
REQUEST_TIMEOUT_SECONDS = 30
ARTIFACT_SCHEMA = "barcode_queue_two_session_source_capture_v1"


class CaptureError(Exception):
    """Expected fail-closed capture failure."""


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


def read_limited(response, stage):
    raw = response.read(MAX_RESPONSE_BYTES + 1)
    if len(raw) > MAX_RESPONSE_BYTES:
        raise CaptureError("%s exceeded the 1,200,000-byte response limit." % stage)
    return raw


def call_json(opener, path, stage, method="GET", body=None):
    if not path.startswith("/") or path.startswith("//"):
        raise CaptureError("Internal error: unsafe request path.")
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
            if response.headers.get_content_type().lower() != "application/json":
                raise CaptureError("%s did not return application/json." % stage)
            raw = read_limited(response, stage)
    except urllib.error.HTTPError as error:
        # Do not print provider response bodies: authenticated admin responses
        # can contain private queue information.
        raise CaptureError("%s returned HTTP %s. No retry was attempted." % (stage, error.code)) from error
    except urllib.error.URLError as error:
        raise CaptureError("%s could not be reached. No retry was attempted." % stage) from error
    except TimeoutError as error:
        raise CaptureError("%s timed out. No retry was attempted." % stage) from error

    payload = parse_json_response(raw, stage)
    return payload, hashlib.sha256(raw).hexdigest(), len(raw), raw


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
    if viewed_session_id != active["sessionId"]:
        raise CaptureError("%s did not resolve its default active session consistently." % stage)

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

    targets = {}
    for target_date in TARGET_DATES:
        matches = [
            summary
            for summary in summaries_by_id.values()
            if summary.get("showDate") == target_date
        ]
        if len(matches) != 1:
            raise CaptureError(
                "%s found %d sessions with exact showDate %s; expected exactly one."
                % (stage, len(matches), target_date)
            )
        targets[target_date] = matches[0]
        if matches[0].get("status") != "archived":
            raise CaptureError(
                "%s session for %s has status %r; archived is required for a stable projection."
                % (stage, target_date, matches[0].get("status"))
            )
        purpose = matches[0].get("purpose")
        if purpose not in ALLOWED_PURPOSE_BY_DATE[target_date]:
            raise CaptureError(
                "%s session for %s has purpose %r; expected one of %s."
                % (
                    stage,
                    target_date,
                    purpose,
                    sorted(ALLOWED_PURPOSE_BY_DATE[target_date]),
                )
            )

    ordered_identities = sorted(identities, key=lambda item: item["sessionId"])
    roster_sha256 = hashlib.sha256(canonical_json_bytes(ordered_identities)).hexdigest()
    return {
        "revision": revision,
        "activeSessionId": active["sessionId"],
        "activeSessionShowDate": active["showDate"],
        "rosterCount": len(ordered_identities),
        "rosterSha256": roster_sha256,
        "targets": targets,
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
    if loaded is not None:
        primary_ids.append(loaded["id"])
    if len(primary_ids) != len(set(primary_ids)):
        raise CaptureError("%s contains a duplicate track across primary lifecycle positions." % label)

    counts["nextInLine"] = 1 if state.get("nextInLine") is not None else 0
    counts["loadedTrack"] = 1 if loaded is not None else 0
    counts["primaryUnique"] = len(primary_ids)

    summary = require_dict(state.get("session"), label + ".session")
    if summary.get("status") != "archived":
        raise CaptureError("%s.session.status must remain archived." % label)
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


def validate_target_response(payload, expected_date, expected_summary, sentinel, stage):
    state = require_dict(payload, stage)
    revision = require_revision(state.get("revision"), stage + ".revision")
    if revision != sentinel["revision"]:
        raise CaptureError(
            "%s revision changed from %d to %d."
            % (stage, sentinel["revision"], revision)
        )

    expected_identity = stable_summary_identity(expected_summary, stage + ".expectedSummary")
    actual_identity = stable_summary_identity(state.get("session"), stage + ".session")
    if actual_identity != expected_identity:
        raise CaptureError("%s did not return the exact discovered session identity." % stage)
    if actual_identity["showDate"] != expected_date:
        raise CaptureError("%s returned the wrong showDate." % stage)
    if actual_identity["status"] != "archived":
        raise CaptureError("%s is not archived; capture refused." % stage)
    viewed_session_id = require_string(state.get("viewedSessionId"), stage + ".viewedSessionId")
    if viewed_session_id != expected_identity["sessionId"]:
        raise CaptureError("%s viewedSessionId does not match the requested session." % stage)

    response_summaries = state.get("sessions")
    if not isinstance(response_summaries, list):
        raise CaptureError("%s.sessions must be an array." % stage)
    response_identities = []
    for index, summary in enumerate(response_summaries):
        response_identities.append(stable_summary_identity(summary, "%s.sessions[%d]" % (stage, index)))
    response_identities.sort(key=lambda item: item["sessionId"])
    response_roster_sha256 = hashlib.sha256(canonical_json_bytes(response_identities)).hexdigest()
    if response_roster_sha256 != sentinel["rosterSha256"]:
        raise CaptureError("%s session roster differs from the start sentinel." % stage)

    counts = validate_track_shape(state, stage)
    return counts


def public_target_summary(summary):
    value = require_dict(summary, "target summary")
    return {
        "sessionId": value.get("sessionId"),
        "showDate": value.get("showDate"),
        "status": value.get("status"),
        "purpose": value.get("purpose"),
        "bnlPublicationStatus": value.get("bnlPublicationStatus"),
        "createdAt": value.get("createdAt"),
        "updatedAt": value.get("updatedAt"),
    }


def confirmation_text(revision, targets):
    return (
        "CAPTURE revision=%d %s=%s %s=%s"
        % (
            revision,
            TARGET_DATES[0],
            targets[TARGET_DATES[0]]["sessionId"],
            TARGET_DATES[1],
            targets[TARGET_DATES[1]]["sessionId"],
        )
    )


def ensure_private_output_dir():
    try:
        info = os.lstat(OUTPUT_DIR)
    except FileNotFoundError:
        os.makedirs(OUTPUT_DIR, mode=0o700, exist_ok=False)
        info = os.lstat(OUTPUT_DIR)
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        raise CaptureError("Recovery output path is not a real directory.")
    os.chmod(OUTPUT_DIR, 0o700)
    info = os.stat(OUTPUT_DIR)
    if stat.S_IMODE(info.st_mode) != 0o700:
        raise CaptureError("Recovery output directory is not mode 0700.")


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

    ensure_private_output_dir()
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
    try:
        controlling_tty = open("/dev/tty", "r+", encoding="utf-8", buffering=1)
    except OSError as error:
        raise CaptureError("A controlling TTY is required for password and confirmation prompts.") from error
    if not controlling_tty.isatty():
        controlling_tty.close()
        raise CaptureError("A controlling TTY is required for password and confirmation prompts.")

    cookies = CookieJar()
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({}),
        NoRedirect(),
        urllib.request.HTTPCookieProcessor(cookies),
    )

    password = getpass.getpass("Existing BARCODE admin password: ", stream=controlling_tty)
    if not password:
        raise CaptureError("Admin password was empty.")
    try:
        auth, _, _, _ = call_json(
            opener,
            "/api/admin/auth",
            "admin authentication",
            method="POST",
            body={"password": password},
        )
    finally:
        password = ""
    if not isinstance(auth, dict) or auth.get("ok") is not True:
        raise CaptureError("Admin authentication was not confirmed.")
    validate_admin_cookie(cookies)

    capture_started = utc_now()
    start_payload, start_response_sha256, start_response_bytes, _ = call_json(
        opener,
        "/api/admin/queue",
        "start sentinel",
    )
    start = parse_sentinel(start_payload, "start sentinel")
    targets = start["targets"]

    print("SOURCE:", BASE_URL)
    print("EXPECTED SOURCE COMMIT:", EXPECTED_SOURCE_COMMIT)
    print("EXPECTED SOURCE REDIS GETS: 12 (16 only if the v2 key is absent and legacy fallback is used)")
    print("START REVISION:", start["revision"])
    for target_date in TARGET_DATES:
        summary = public_target_summary(targets[target_date])
        print(
            "TARGET:",
            target_date,
            "sessionId=" + str(summary["sessionId"]),
            "status=" + str(summary["status"]),
            "purpose=" + str(summary["purpose"]),
        )
        if target_date == "2026-08-07" and summary["purpose"] == "unknown":
            print(
                "PROVENANCE NOTE:",
                target_date,
                "predates the purpose field and is normalized to unknown; exact operator confirmation is required.",
            )

    expected_confirmation = confirmation_text(start["revision"], targets)
    print("To confirm the exact source identities, type:")
    print(expected_confirmation)
    controlling_tty.write(expected_confirmation + "\n> ")
    supplied_confirmation = controlling_tty.readline().strip()
    controlling_tty.close()
    if supplied_confirmation != expected_confirmation:
        raise CaptureError("Confirmation did not exactly match. Nothing was saved.")

    captured_sessions = []
    for target_date in TARGET_DATES:
        summary = targets[target_date]
        session_id = summary["sessionId"]
        path = "/api/admin/queue?" + urllib.parse.urlencode({"sessionId": session_id})
        stage = "target session %s" % target_date
        payload, response_sha256, response_bytes, raw_response = call_json(opener, path, stage)
        counts = validate_target_response(payload, target_date, summary, start, stage)
        captured_sessions.append({
            "showDate": target_date,
            "sessionId": session_id,
            "revision": start["revision"],
            "sourceResponseSha256": response_sha256,
            "sourceResponseBytes": response_bytes,
            "sourceResponseBase64": base64.b64encode(raw_response).decode("ascii"),
            "summaryAtStart": public_target_summary(summary),
            "trackCounts": counts,
        })

    end_payload, end_response_sha256, end_response_bytes, _ = call_json(
        opener,
        "/api/admin/queue",
        "end sentinel",
    )
    end = parse_sentinel(end_payload, "end sentinel")
    if end["revision"] != start["revision"]:
        raise CaptureError(
            "Queue revision changed during capture (%d -> %d). Nothing was saved."
            % (start["revision"], end["revision"])
        )
    if end["activeSessionId"] != start["activeSessionId"]:
        raise CaptureError("Active session changed during capture. Nothing was saved.")
    if end["rosterSha256"] != start["rosterSha256"]:
        raise CaptureError("Session roster changed during capture. Nothing was saved.")
    for target_date in TARGET_DATES:
        if end["targets"][target_date]["sessionId"] != targets[target_date]["sessionId"]:
            raise CaptureError("Target identity changed during capture. Nothing was saved.")

    capture_finished = utc_now()
    artifact = {
        "schema": ARTIFACT_SCHEMA,
        "capturedAt": iso_utc(capture_finished),
        "source": {
            "baseUrl": BASE_URL,
            "expectedGitCommit": EXPECTED_SOURCE_COMMIT,
            "route": "/api/admin/queue",
            "captureKind": "authenticated_admin_logical_session_state",
            "canonicalRawRedis": False,
            "remoteMutationRequests": 0,
            "expectedRedisGetCommands": 12,
            "legacyFallbackMaximumRedisGetCommands": 16,
            "automaticRetries": 0,
            "redirectsFollowed": 0,
        },
        "scope": {
            "exactShowDates": list(TARGET_DATES),
            "sessionCount": len(captured_sessions),
        },
        "consistency": {
            "captureStartedAt": iso_utc(capture_started),
            "captureFinishedAt": iso_utc(capture_finished),
            "revision": start["revision"],
            "activeSessionId": start["activeSessionId"],
            "rosterCount": start["rosterCount"],
            "rosterSha256": start["rosterSha256"],
            "startSentinelResponseSha256": start_response_sha256,
            "startSentinelResponseBytes": start_response_bytes,
            "endSentinelResponseSha256": end_response_sha256,
            "endSentinelResponseBytes": end_response_bytes,
            "startEndMatch": True,
        },
        "sessions": captured_sessions,
        "knownSourceLimitations": [
            "The immutable admin route exposes QueueState, not the byte-for-byte radioQueue:v2:sessions Redis value.",
            "The a1537f6 route normalizes legacy queue fields and defaults before returning QueueState.",
            "QueueState omits internal QueueSession lane-restoration fields that are not part of the admin response.",
            "Exact raw target responses include unrelated session summaries and transient timing; the importer discards those fields when reconstructing each target session.",
            "A legacy session may normalize to purpose=unknown even when the operator knows it was a live broadcast.",
        ],
    }
    artifact_path, checksum_path, artifact_sha256 = write_artifact(artifact)

    print("CAPTURE: COMPLETE")
    print("REVISION:", start["revision"])
    for session in captured_sessions:
        print(
            "CAPTURED:",
            session["showDate"],
            "sessionId=" + session["sessionId"],
            "primaryTracks=" + str(session["trackCounts"]["primaryUnique"]),
            "spotlight=" + str(session["trackCounts"]["spotlight"]),
        )
    print("ARTIFACT:", artifact_path)
    print("SHA256 FILE:", checksum_path)
    print("ARTIFACT SHA256:", artifact_sha256)
    print("No queue import or remote mutation was performed.")
    cookies.clear()


if __name__ == "__main__":
    try:
        main()
    except (CaptureError, OSError, ValueError) as error:
        print("CAPTURE FAILED:", str(error), file=sys.stderr)
        raise SystemExit(1)
