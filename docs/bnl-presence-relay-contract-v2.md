# BNL Presence/Relay Contract v2

Contract v2 keeps the existing authenticated `POST /api/bnl/status` endpoint and `x-api-key` header, but separates operational presence from accepted public relay speech.

## Presence write

```json
{
  "contractVersion": 2,
  "kind": "presence",
  "presence": { "status": "ONLINE", "mode": "OBSERVATION", "source": "heartbeat" }
}
```

Presence sources are `heartbeat`, `startup`, `admin`, `reset`, and `unknown`. The website assigns `receivedAt`. Presence writes update only `bnl:presence:v2` and never alter relay speech, relay publication time, or accepted-relay history. The queue is not an allowed presence source.

## Relay write

```json
{
  "contractVersion": 2,
  "kind": "relay",
  "relay": {
    "relayId": "stable-producer-generated-id",
    "message": "Substantive public relay speech.",
    "currentDirective": "A grounded line of inquiry or invitation.",
    "sourceClass": "approved_canon",
    "trigger": "scheduled"
  }
}
```

Source classes are `fresh_public_event`, `recent_public_continuity`, `scoped_broadcast_memory`, `public_safe_memory`, `approved_canon`, and `grounded_reflection`. Triggers are `scheduled`, `force_pull`, and `manual`. The website assigns `publishedAt`. The queue is not an allowed relay source.

## Response shape

Public `GET /api/bnl/status` still returns flat compatibility fields: `status`, `mode`, `message`, `currentDirective`, `source`, `lastSeen`, and `persisted`. It may also include `contractVersion: 2`, `presence`, and `relay`; `relay` is `null` until a validated v2 relay envelope has been accepted. `adminNote`, Redis keys, force-pull status paths, webhook data, secrets, and internal compatibility metadata are not public.

## v1 compatibility

The existing flat authenticated payload (`status`, `mode`, `message`, `currentDirective`, `source`, `adminNote`) remains accepted and stored in the existing v1 keys. Existing v1 force-pull, status, history, and admin contracts are not migrated or rewritten. When no v2 relay record exists, the website keeps the latest v1 status in the flat compatibility fields exactly as stored, including its original `source`; the structured `relay` field remains `null` and no legacy record is classified as `grounded_reflection`, `scheduled`, or any accepted v2 relay.

## Storage and idempotency

Canonical v2 keys are `bnl:presence:v2`, `bnl:relay:current:v2`, and `bnl:relay:history:v2`. Relay history retains the latest 25 distinct accepted relays. Duplicate delivery of the same `relayId` with identical relay content is idempotent: the original accepted relay object and original `publishedAt` are returned, current relay storage and history are not updated, and an older archived retry cannot roll the public current relay backward. Reuse of the same `relayId` with different substantive content is rejected with conflict and preserves the last valid records. New relay current/history persistence is coordinated in one Redis transaction when Redis is available.

## Partial cutover

The resolver supports v2 presence with legacy flat speech, legacy presence with v2 relay, v1 only, and v2 only. Flat status/mode come from resolved presence. If a v2 relay exists, flat message/directive/source/lastSeen come from that relay, so `lastSeen` remains relay publication time rather than heartbeat receipt time. If no v2 relay exists, flat message/directive/source/lastSeen come from the legacy v1 status unchanged and structured `relay` remains `null`. `force_pull` maps to public `forcePull`; other accepted v2 triggers map to `relay`.

## Deferred producer cutover and rollback

The bot producer cutover is deferred. This PR does not modify BNL01-Bot, cadence, force-pull behavior, admin controls, queue, now-playing, payments, memory, canon retrieval, Field Logs, editorial posts, or site-rehaul work. Rollback is safe because v1 records are untouched and v2 records are isolated; removing v2 reads returns the site to the existing v1 path.
