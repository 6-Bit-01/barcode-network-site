#!/usr/bin/env python3
"""One-time, fail-closed repair for BNL Journal rehydrate timestamps."""

from __future__ import annotations

import calendar
import copy
import datetime as dt
import getpass
import hashlib
import json
import os
import re
import sqlite3
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


DB_PATH = Path("/home/ubuntu/bnl01/bnl01_conversations.db")
BACKUP_DIR = Path("/home/ubuntu/barcode-queue-recovery")
EXPECTED_ROWS = 28

CONTROLS_KEY = "barcode:bnl-journal:v1:entry-controls"
INDEX_KEYS = (
    "barcode:bnl-journal:v1:index",
    "barcode:bnl-journal:v1:index:daily",
    "barcode:bnl-journal:v1:index:weekly",
)
RECORD_PREFIX = "barcode:bnl-journal:v1:entry"
LATEST_PREFIX = "barcode:bnl-journal:v1:latest"

ISO_UTC = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$")
HASH = re.compile(r"^[a-f0-9]{64}$")
ENTRY_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$")
NIL_SCORE = "__BNL_SCORE_ABSENT__"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, file_pointer, code, message, headers, new_url):
        return None


HTTP = urllib.request.build_opener(
    urllib.request.ProxyHandler({}),
    urllib.request.HTTPSHandler(context=ssl.create_default_context()),
    NoRedirect(),
)


SNAPSHOT_LUA = r'''
local recordCount = tonumber(ARGV[1])
local latestCount = tonumber(ARGV[2])
if not recordCount or not latestCount then
  return cjson.encode({status="invalid_counts"})
end
local function typeName(key)
  local value = redis.call("TYPE", key)
  if type(value) == "table" then return value.ok end
  return value
end
local function valueOrFalse(key)
  local value = redis.call("GET", key)
  if not value then return false end
  return value
end
local function scoreOrFalse(key, member)
  local value = redis.call("ZSCORE", key, member)
  if not value then return false end
  return value
end
local result = {
  status = "snapshot",
  controlsRaw = valueOrFalse(KEYS[1]),
  controlsType = typeName(KEYS[1]),
  indexTypes = {typeName(KEYS[2]), typeName(KEYS[3]), typeName(KEYS[4])},
  indexPttls = {redis.call("PTTL", KEYS[2]), redis.call("PTTL", KEYS[3]), redis.call("PTTL", KEYS[4])},
  indexMembers = {
    redis.call("ZRANGE", KEYS[2], 0, -1),
    redis.call("ZRANGE", KEYS[3], 0, -1),
    redis.call("ZRANGE", KEYS[4], 0, -1)
  },
  records = {},
  recordTypes = {},
  recordPttls = {},
  latest = {},
  latestTypes = {},
  latestPttls = {},
  scores = {}
}
for i = 1, recordCount do
  local keyIndex = 4 + i
  result.records[i] = valueOrFalse(KEYS[keyIndex])
  result.recordTypes[i] = typeName(KEYS[keyIndex])
  result.recordPttls[i] = redis.call("PTTL", KEYS[keyIndex])
end
for i = 1, latestCount do
  local keyIndex = 4 + recordCount + i
  local member = ARGV[2 + i]
  result.latest[i] = valueOrFalse(KEYS[keyIndex])
  result.latestTypes[i] = typeName(KEYS[keyIndex])
  result.latestPttls[i] = redis.call("PTTL", KEYS[keyIndex])
  result.scores[i] = {
    scoreOrFalse(KEYS[2], member),
    scoreOrFalse(KEYS[3], member),
    scoreOrFalse(KEYS[4], member)
  }
end
return cjson.encode(result)
'''


REPAIR_LUA = r'''
local payload = cjson.decode(ARGV[1])
local NIL = "__BNL_SCORE_ABSENT__"
local function typeName(key)
  local value = redis.call("TYPE", key)
  if type(value) == "table" then return value.ok end
  return value
end
local function fail(reason, item)
  return cjson.encode({status="aborted", reason=reason, item=item or 0})
end
local function allowedStringType(key)
  local kind = typeName(key)
  return kind == "string"
end
local function allowedIndexType(key)
  local kind = typeName(key)
  return kind == "none" or kind == "zset"
end
if payload.schema ~= 1 then return fail("invalid_payload_schema") end
if not allowedIndexType(KEYS[2]) or not allowedIndexType(KEYS[3]) or not allowedIndexType(KEYS[4]) then
  return fail("wrong_index_type")
end
for i = 1, 3 do
  if redis.call("PTTL", KEYS[1 + i]) ~= tonumber(payload.indexPttls[i]) then
    return fail("index_ttl_changed", i)
  end
  local currentMembers = redis.call("ZRANGE", KEYS[1 + i], 0, -1)
  local expectedMembers = payload.indexMembers[i]
  if #currentMembers ~= #expectedMembers then
    return fail("index_members_changed", i)
  end
  for j = 1, #currentMembers do
    if currentMembers[j] ~= expectedMembers[j] then
      return fail("index_members_changed", i)
    end
  end
end
local currentControls = redis.call("GET", KEYS[1])
if payload.controlsExists then
  if typeName(KEYS[1]) ~= "string" or currentControls ~= payload.controlsRaw then
    return fail("controls_changed")
  end
else
  if currentControls then return fail("controls_changed") end
end
for i, item in ipairs(payload.records) do
  local key = KEYS[4 + i]
  if not allowedStringType(key) then return fail("record_type_changed", i) end
  if redis.call("PTTL", key) ~= -1 then return fail("record_ttl_changed", i) end
  if redis.call("GET", key) ~= item.oldRaw then return fail("record_changed", i) end
  local candidate = cjson.decode(item.newRaw)
  if candidate.entryId ~= item.entryId
     or tonumber(candidate.revision) ~= tonumber(item.revision)
     or candidate.contentHash ~= item.contentHash
     or candidate.publishedAt ~= item.publishedAt
     or tonumber(candidate._score) ~= tonumber(item.newScore) then
    return fail("invalid_record_replacement", i)
  end
end
local recordCount = #payload.records
for i, item in ipairs(payload.latest) do
  local key = KEYS[4 + recordCount + i]
  if not allowedStringType(key) then return fail("latest_type_changed", i) end
  if redis.call("PTTL", key) ~= -1 then return fail("latest_ttl_changed", i) end
  if redis.call("GET", key) ~= item.oldRaw then return fail("latest_changed", i) end
  local candidate = cjson.decode(item.newRaw)
  if candidate.entryId ~= item.entryId
     or tonumber(candidate.revision) ~= tonumber(item.revision)
     or candidate.contentHash ~= item.contentHash
     or candidate.publishedAt ~= item.publishedAt
     or tonumber(candidate._score) ~= tonumber(item.newScore) then
    return fail("invalid_latest_replacement", i)
  end
end
for i, item in ipairs(payload.entries) do
  local keys = {KEYS[2], KEYS[3], KEYS[4]}
  for j = 1, 3 do
    local current = redis.call("ZSCORE", keys[j], item.entryId)
    local expected = item.oldScores[j]
    if expected == NIL then
      if current then return fail("index_changed", i) end
    elseif (not current) or current ~= expected then
      return fail("index_changed", i)
    end
  end
end

-- Every assertion is complete before the first mutation. The remaining
-- operations only target preflighted string or sorted-set keys.
for i, item in ipairs(payload.records) do
  redis.call("SET", KEYS[4 + i], item.newRaw)
end
for i, item in ipairs(payload.latest) do
  redis.call("SET", KEYS[4 + recordCount + i], item.newRaw)
end
for _, item in ipairs(payload.entries) do
  if item.visible then
    redis.call("ZADD", KEYS[2], item.newScore, item.entryId)
    if item.entryKind == "daily" then
      redis.call("ZADD", KEYS[3], item.newScore, item.entryId)
    elseif item.entryKind == "weekly" then
      redis.call("ZADD", KEYS[4], item.newScore, item.entryId)
    end
  end
end
return cjson.encode({status="repaired", records=#payload.records, entries=#payload.entries})
'''


def die(message: str) -> "NoReturn":
    raise SystemExit("STOP: " + message)


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def parse_iso_utc(value: Any, label: str) -> dt.datetime:
    if not isinstance(value, str) or not ISO_UTC.fullmatch(value):
        die(f"{label} is not a canonical UTC timestamp")
    parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.utcoffset() != dt.timedelta(0):
        die(f"{label} is not UTC")
    return parsed


def score_for(published_at: str, revision: int) -> float:
    value = parse_iso_utc(published_at, "published_at")
    milliseconds = (
        calendar.timegm(value.utctimetuple()) * 1000
        + value.microsecond // 1000
    )
    return float(milliseconds) + min(revision, 999) / 1000.0


def score_text(score: float) -> str:
    # Python and JavaScript both serialize finite IEEE-754 doubles using a
    # shortest round-trippable decimal. Redis accepts this as the ZADD score.
    return json.dumps(score, allow_nan=False, separators=(",", ":"))


def post_command(url: str, token: str, parts: list[Any], timeout: int = 90) -> Any:
    body = json.dumps(parts, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(body) > 9_000_000:
        die(f"atomic Redis request would be too large ({len(body)} bytes)")
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Cache-Control": "no-store",
            "User-Agent": "barcode-journal-date-repair/1.0",
        },
    )
    try:
        with HTTP.open(request, timeout=timeout) as response:
            raw = response.read(12_000_000)
    except urllib.error.HTTPError as error:
        error.read(2000)
        die(f"Upstash rejected the request with HTTP {error.code}")
    except (urllib.error.URLError, TimeoutError):
        die("Upstash request failed")
    try:
        decoded = json.loads(raw)
    except json.JSONDecodeError:
        die("Upstash returned non-JSON data")
    if not isinstance(decoded, dict):
        die("Upstash returned an unexpected response")
    if "error" in decoded:
        die("Upstash rejected the Redis command")
    if "result" not in decoded:
        die("Upstash response has no result")
    return decoded["result"]


def eval_command(url: str, token: str, script: str, keys: list[str], args: list[str], *, readonly: bool) -> Any:
    return post_command(
        url,
        token,
        ["EVAL_RO" if readonly else "EVAL", script, str(len(keys)), *keys, *args],
    )


def read_rows() -> list[dict[str, Any]]:
    uri = "file:" + urllib.parse.quote(str(DB_PATH)) + "?mode=ro"
    with sqlite3.connect(uri, uri=True) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """SELECT entry_id, revision, guild_id, canonical_payload_bytes,
                      content_hash, published_at
               FROM bnl_journal_entries
               WHERE lifecycle_state='published'
               ORDER BY published_at, entry_id, revision"""
        ).fetchall()
    if len(rows) != EXPECTED_ROWS:
        die(f"expected {EXPECTED_ROWS} published SQLite rows; found {len(rows)}")
    result: list[dict[str, Any]] = []
    seen: set[tuple[str, int]] = set()
    guild_ids: set[int] = set()
    for row in rows:
        entry_id = str(row["entry_id"] or "")
        revision = int(row["revision"] or 0)
        content_hash = str(row["content_hash"] or "")
        published_at = str(row["published_at"] or "")
        if not ENTRY_ID.fullmatch(entry_id) or revision <= 0 or not HASH.fullmatch(content_hash):
            die(f"invalid SQLite identity for {entry_id!r} revision {revision}")
        if (entry_id, revision) in seen:
            die(f"duplicate SQLite row for {entry_id} revision {revision}")
        seen.add((entry_id, revision))
        parse_iso_utc(published_at, f"{entry_id} published_at")
        guild_ids.add(int(row["guild_id"]))
        canonical_raw = row["canonical_payload_bytes"]
        if isinstance(canonical_raw, memoryview):
            canonical_bytes = canonical_raw.tobytes()
        elif isinstance(canonical_raw, (bytes, bytearray)):
            canonical_bytes = bytes(canonical_raw)
        elif isinstance(canonical_raw, str):
            canonical_bytes = canonical_raw.encode("utf-8")
        else:
            die(f"invalid canonical payload storage for {entry_id} revision {revision}")
        try:
            envelope = json.loads(canonical_bytes.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            die(f"invalid canonical payload for {entry_id} revision {revision}")
        if (
            not isinstance(envelope, dict)
            or set(envelope) != {"contractVersion", "kind", "entry"}
            or envelope.get("contractVersion") != 1
            or envelope.get("kind") != "journal_entry"
        ):
            die(f"invalid canonical envelope for {entry_id} revision {revision}")
        entry = envelope.get("entry")
        if not isinstance(entry, dict):
            die(f"missing canonical entry for {entry_id} revision {revision}")
        required_entry_keys = {
            "entryId", "revision", "title", "excerpt", "sections", "authoredAt",
            "sourceWindowStart", "sourceWindowEnd", "contentHash",
        }
        allowed_entry_keys = required_entry_keys | {"entryKind"}
        if not required_entry_keys.issubset(entry) or not set(entry).issubset(allowed_entry_keys):
            die(f"invalid canonical entry shape for {entry_id} revision {revision}")
        if (
            entry.get("entryId") != entry_id
            or entry.get("revision") != revision
            or entry.get("contentHash") != content_hash
        ):
            die(f"SQLite/canonical mismatch for {entry_id} revision {revision}")
        computed_hash = hashlib.sha256(
            (
                str(entry["title"])
                + "|"
                + str(entry["excerpt"])
                + "|"
                + canonical_json(entry["sections"])
            ).encode("utf-8")
        ).hexdigest()
        if computed_hash != content_hash:
            die(f"canonical content hash mismatch for {entry_id} revision {revision}")
        result.append(
            {
                "entryId": entry_id,
                "revision": revision,
                "guildId": int(row["guild_id"]),
                "contentHash": content_hash,
                "publishedAt": published_at,
                "entry": entry,
                "recordKey": f"{RECORD_PREFIX}:{entry_id}:{revision}",
            }
        )
    if len(guild_ids) != 1:
        die(f"expected one Journal guild; found {len(guild_ids)}")
    return result


def parse_json_result(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, str):
        die(f"{label} returned an unexpected non-string result")
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        die(f"{label} returned invalid JSON")
    if not isinstance(parsed, dict):
        die(f"{label} returned an invalid object")
    return parsed


def expected_normalized_fields(row: dict[str, Any]) -> dict[str, Any]:
    entry = row["entry"]
    expected = {
        "entryId": row["entryId"],
        "revision": row["revision"],
        "title": entry.get("title"),
        "excerpt": entry.get("excerpt"),
        "sections": entry.get("sections"),
        "authoredAt": entry.get("authoredAt"),
        "sourceWindowStart": entry.get("sourceWindowStart"),
        "sourceWindowEnd": entry.get("sourceWindowEnd"),
        "contentHash": row["contentHash"],
    }
    if "entryKind" in entry:
        expected["entryKind"] = entry["entryKind"]
    return expected


def validate_stored(raw: Any, row: dict[str, Any], label: str) -> dict[str, Any]:
    if not isinstance(raw, str):
        die(f"{label} is missing")
    try:
        stored = json.loads(raw)
    except json.JSONDecodeError:
        die(f"{label} is not valid JSON")
    if not isinstance(stored, dict):
        die(f"{label} is not a JSON object")
    expected = expected_normalized_fields(row)
    actual_content = {
        key: value
        for key, value in stored.items()
        if key not in ("publishedAt", "_score")
    }
    if actual_content != expected:
        die(f"{label} is not an exact canonical Journal record")
    current_date = parse_iso_utc(stored.get("publishedAt"), f"{label} publishedAt")
    del current_date
    score = stored.get("_score")
    if isinstance(score, bool) or not isinstance(score, (int, float)):
        die(f"{label} has no numeric _score")
    current_expected = score_for(stored["publishedAt"], row["revision"])
    if abs(float(score) - current_expected) > 0.0006:
        die(f"{label} publishedAt/_score mismatch")
    return stored


def main() -> None:
    rows = read_rows()
    latest_by_id: dict[str, dict[str, Any]] = {}
    for row in rows:
        prior = latest_by_id.get(row["entryId"])
        if prior is None or row["revision"] > prior["revision"]:
            latest_by_id[row["entryId"]] = row
    entry_ids = sorted(latest_by_id)
    record_keys = [row["recordKey"] for row in rows]
    latest_keys = [f"{LATEST_PREFIX}:{entry_id}" for entry_id in entry_ids]
    keys = [CONTROLS_KEY, *INDEX_KEYS, *record_keys, *latest_keys]

    url = getpass.getpass("Current Upstash REST URL (hidden): ").strip().rstrip("/")
    token = getpass.getpass("Current Upstash REST token (hidden): ").strip()
    parsed_url = urllib.parse.urlparse(url)
    hostname = (parsed_url.hostname or "").lower()
    if (
        parsed_url.scheme != "https"
        or not hostname.endswith(".upstash.io")
        or hostname == ".upstash.io"
        or parsed_url.username
        or parsed_url.password
        or parsed_url.port is not None
        or parsed_url.netloc.lower() != hostname
    ):
        die("REST URL must be an exact HTTPS *.upstash.io database endpoint")
    if parsed_url.path not in ("", "/") or parsed_url.query or parsed_url.fragment or not token:
        die("invalid REST URL or empty token")
    if post_command(url, token, ["PING"], timeout=20) != "PONG":
        die("current Upstash database did not answer PONG")

    raw_snapshot = eval_command(
        url,
        token,
        SNAPSHOT_LUA,
        keys,
        [str(len(rows)), str(len(entry_ids)), *entry_ids],
        readonly=True,
    )
    snapshot = parse_json_result(raw_snapshot, "Redis snapshot")
    if snapshot.get("status") != "snapshot":
        die("Redis snapshot failed: " + str(snapshot))
    if snapshot.get("controlsType") not in ("none", "string"):
        die("Journal controls key has the wrong Redis type")
    if snapshot.get("indexTypes") != [
        "none" if item == "none" else "zset" for item in snapshot.get("indexTypes", [])
    ] or len(snapshot.get("indexTypes", [])) != 3:
        die("a Journal index key has the wrong Redis type")
    index_pttls = snapshot.get("indexPttls", [])
    if len(index_pttls) != 3 or any(int(value) not in (-1, -2) for value in index_pttls):
        die("a Journal index unexpectedly has a TTL")
    if len(snapshot.get("records", [])) != len(rows) or len(snapshot.get("latest", [])) != len(entry_ids):
        die("Redis snapshot has incomplete Journal keys")
    if any(kind != "string" for kind in snapshot.get("recordTypes", [])):
        die("a Journal record key is missing or has the wrong type")
    if any(kind != "string" for kind in snapshot.get("latestTypes", [])):
        die("a Journal latest key is missing or has the wrong type")
    if any(int(value) != -1 for value in snapshot.get("recordPttls", [])):
        die("a Journal record unexpectedly has a TTL")
    if any(int(value) != -1 for value in snapshot.get("latestPttls", [])):
        die("a Journal latest record unexpectedly has a TTL")

    controls_raw = snapshot.get("controlsRaw")
    if controls_raw is False:
        controls: dict[str, Any] = {}
    elif isinstance(controls_raw, str):
        try:
            controls = json.loads(controls_raw)
        except json.JSONDecodeError:
            die("Journal controls value is invalid JSON")
        if not isinstance(controls, dict):
            die("Journal controls value is not an object")
    else:
        die("Journal controls snapshot is invalid")

    expected_members = [set(), set(), set()]
    for entry_id in entry_ids:
        row = latest_by_id[entry_id]
        control = controls.get(entry_id)
        if control is not None and not isinstance(control, dict):
            die(f"Journal control for {entry_id} is not an object")
        visible = control is None or control.get("publicVisible") is not False
        if visible:
            expected_members[0].add(entry_id)
            if row["entry"].get("entryKind") == "daily":
                expected_members[1].add(entry_id)
            elif row["entry"].get("entryKind") == "weekly":
                expected_members[2].add(entry_id)
    actual_members = snapshot.get("indexMembers", [])
    if len(actual_members) != 3:
        die("Journal index membership snapshot is incomplete")
    for position in range(3):
        if set(map(str, actual_members[position])) != expected_members[position]:
            die("Journal index membership does not exactly match the canonical entries and controls")

    record_replacements: list[dict[str, Any]] = []
    new_record_raw: dict[tuple[str, int], str] = {}
    for index, row in enumerate(rows):
        old_raw = snapshot["records"][index]
        stored = validate_stored(old_raw, row, row["recordKey"])
        repaired = copy.deepcopy(stored)
        repaired["publishedAt"] = row["publishedAt"]
        score = score_for(row["publishedAt"], row["revision"])
        repaired["_score"] = score
        new_raw = json.dumps(repaired, ensure_ascii=False, separators=(",", ":"))
        new_record_raw[(row["entryId"], row["revision"])] = new_raw
        record_replacements.append(
            {
                "entryId": row["entryId"],
                "revision": row["revision"],
                "contentHash": row["contentHash"],
                "publishedAt": row["publishedAt"],
                "newScore": score_text(score),
                "oldRaw": old_raw,
                "newRaw": new_raw,
            }
        )

    latest_replacements: list[dict[str, Any]] = []
    entry_repairs: list[dict[str, Any]] = []
    for index, entry_id in enumerate(entry_ids):
        row = latest_by_id[entry_id]
        old_latest_raw = snapshot["latest"][index]
        latest_stored = validate_stored(
            old_latest_raw,
            row,
            f"{LATEST_PREFIX}:{entry_id}",
        )
        record_stored = json.loads(snapshot["records"][rows.index(row)])
        if latest_stored != record_stored:
            die(f"latest and revision record differ for {entry_id}")
        new_raw = new_record_raw[(entry_id, row["revision"])]
        score = score_for(row["publishedAt"], row["revision"])
        latest_replacements.append(
            {
                "entryId": entry_id,
                "revision": row["revision"],
                "contentHash": row["contentHash"],
                "publishedAt": row["publishedAt"],
                "newScore": score_text(score),
                "oldRaw": old_latest_raw,
                "newRaw": new_raw,
            }
        )
        control = controls.get(entry_id)
        if control is not None and not isinstance(control, dict):
            die(f"Journal control for {entry_id} is not an object")
        visible = control is None or control.get("publicVisible") is not False
        old_scores = [
            NIL_SCORE if value is False else str(value)
            for value in snapshot["scores"][index]
        ]
        entry_repairs.append(
            {
                "entryId": entry_id,
                "entryKind": row["entry"].get("entryKind", "manual"),
                "visible": visible,
                "newScore": score_text(score),
                "oldScores": old_scores,
            }
        )

    repair_payload = {
        "schema": 1,
        "controlsExists": controls_raw is not False,
        "controlsRaw": "" if controls_raw is False else controls_raw,
        "indexPttls": [int(value) for value in index_pttls],
        "indexMembers": actual_members,
        "records": record_replacements,
        "latest": latest_replacements,
        "entries": entry_repairs,
    }

    BACKUP_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(BACKUP_DIR, 0o700)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_path = BACKUP_DIR / f"journal-date-repair-before-{stamp}.json"
    backup = {
        "schema": 1,
        "createdAt": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "redisHost": parsed_url.hostname,
        "databasePath": str(DB_PATH),
        "keys": keys,
        "entryIds": entry_ids,
        "snapshot": snapshot,
        "repairPayload": repair_payload,
    }
    backup_bytes = (json.dumps(backup, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    descriptor = os.open(backup_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "wb") as output:
        output.write(backup_bytes)
        output.flush()
        os.fsync(output.fileno())
    backup_hash = hashlib.sha256(backup_bytes).hexdigest()
    print("READ-ONLY PREFLIGHT OK")
    print("Published records:", len(rows))
    print("Unique entries:", len(entry_ids))
    print("Original range:", rows[0]["publishedAt"], "->", rows[-1]["publishedAt"])
    print("Rollback snapshot:", backup_path)
    print("Rollback snapshot SHA-256:", backup_hash)
    confirmation = input(f"Type REPAIR {len(rows)} JOURNAL DATES to continue: ").strip()
    if confirmation != f"REPAIR {len(rows)} JOURNAL DATES":
        die("confirmation did not match; no Redis writes were made")

    repair_raw = eval_command(
        url,
        token,
        REPAIR_LUA,
        keys,
        [json.dumps(repair_payload, ensure_ascii=False, separators=(",", ":"))],
        readonly=False,
    )
    repair_result = parse_json_result(repair_raw, "Redis repair")
    if repair_result.get("status") != "repaired":
        die("Redis repair made no changes: " + json.dumps(repair_result, sort_keys=True))

    verify_raw = eval_command(
        url,
        token,
        SNAPSHOT_LUA,
        keys,
        [str(len(rows)), str(len(entry_ids)), *entry_ids],
        readonly=True,
    )
    verify = parse_json_result(verify_raw, "post-repair verification")
    if verify.get("records") != [item["newRaw"] for item in record_replacements]:
        die("post-repair record verification failed; preserve the rollback snapshot")
    if verify.get("latest") != [item["newRaw"] for item in latest_replacements]:
        die("post-repair latest-record verification failed; preserve the rollback snapshot")
    verified_members = verify.get("indexMembers", [])
    if len(verified_members) != 3 or any(
        set(map(str, verified_members[position])) != expected_members[position]
        for position in range(3)
    ):
        die("post-repair index-membership verification failed; preserve the rollback snapshot")
    for index, item in enumerate(entry_repairs):
        scores = verify["scores"][index]
        expected_positions = [item["visible"], item["visible"] and item["entryKind"] == "daily", item["visible"] and item["entryKind"] == "weekly"]
        for present, actual in zip(expected_positions, scores):
            if not present and actual is not False:
                die("post-repair index verification failed; preserve the rollback snapshot")
            if present and (actual is False or abs(float(actual) - float(item["newScore"])) > 0.0006):
                die("post-repair index-score verification failed; preserve the rollback snapshot")

    print("REPAIR COMPLETE: 28 Journal publication dates and archive scores restored.")
    print("Rollback snapshot retained at:", backup_path)
    token = ""


if __name__ == "__main__":
    main()
