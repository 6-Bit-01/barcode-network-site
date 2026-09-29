# HellcatNZ contest standings

Hellcat's read-only KOTH ladder appears on its own `/contests` page, linked from desktop/mobile navigation, the Footer and the sitemap. It does not appear on Radio. HellcatNZ remains the source of the ranks and official 0–100 scores. The website does not calculate results or connect these entries to BARCODE queue tracks, Archive history, BNL memory, dossiers or identities. The Contests page can host future community contests without making them part of BARCODE Radio.

The page also presents the community information supplied by the owner: daily KOTH submissions played on community radio and reviewed by `@reviewcrew`, live feedback and a winner shout-out, daily Community Radio, weekly Artist Features, and rotating Song Creation Challenges. Numbered panels use BARCODE's existing dark palette and green terminal-style accents. The explicit **Join HellcatNZ's Discord** link points to the supplied `https://discord.gg/HellcatNZ` invite; it does not join a server automatically. The contest and these activities remain attributed to HellcatNZ.

The shared desktop/mobile main menu places Database immediately after Releases: BNL-01 Hub → Contests → Releases → Database.

## Configuration and rollout

Set these **server-only** environment variables in the intended Vercel environment:

| Variable | Value |
| --- | --- |
| `HELLCAT_LADDER_URL` | Hellcat's current full HTTPS URL ending in `/ladder` |
| `HELLCAT_LADDER_TOKEN` | The bearer token, without the `Bearer ` prefix |

Do not prefix either variable with `NEXT_PUBLIC_`. Enter the token through the deployment platform's secret environment settings, never in GitHub, browser JavaScript, screenshots or PR comments. The owner has the token; no real credential is included or required for fixture tests.

The initial URL supplied on September 23, 2026 was `https://salaries-painted-repair-trust.trycloudflare.com/ladder`. This is an operator-provided endpoint, not a permanent discovery URL. Hellcat said it can change after a radio-server restart; the token remains the same. Update `HELLCAT_LADDER_URL` and redeploy when he supplies a replacement. Only HTTPS and the exact `/ladder` path are accepted; URL credentials, query strings and fragments are rejected.

1. Review this scoped PR and its fixture checks.
2. Configure the two variables for this branch's preview, then redeploy the preview. No queue, BNL, Redis, Blob, cron or payment configuration is needed.
3. Confirm the anonymous public endpoint `/api/hellcat/ladder` returns the expected official rank order and scores. Check null labels, null scores, zero scores and an empty ladder against the real response if present. Do not publish the raw upstream response or token.
4. Review `/contests` and its navigation link on desktop and phone widths, including the global live/submissions badge. The table has its own scroll region for long ladders. All supplied rows are retained.
5. Confirm the browser contacts only the site's public endpoint and sees only rank, title, artist, score, retrieval time and freshness metadata. Check client bundles for the credential value without printing it.
6. After owner merge/activation approval, set the same server variables in Production, merge and verify the production endpoint and page. A redeploy is required for environment changes. Preview success is not production evidence.

Implementation, merge and live configuration remain separate steps. Until configured, the section reports that standings are temporarily unavailable; it never displays fixture songs or treats a failed connection as an empty ladder. Roll back the connection by removing its variables and redeploying. Revert the PR if the section itself should be removed.

## Read and cache contract

- The server sends `GET` with `Authorization: Bearer <token>` and `Accept: application/json`. Browsers never receive or forward that token. Visitor headers and query parameters cannot choose credentials or an upstream URL.
- The upstream request refuses redirects, times out after eight seconds and reads at most 512 KiB. The parser accepts at most 1,000 tracks and 1,000 characters per title/artist. Oversized or malformed results fail as a whole; there is no silently truncated or renumbered ranking.
- The first rank must be 1; subsequent ranks must be positive safe integers in increasing order. Gaps are preserved. Title and artist are strings or null; score is a finite number from 0 through 100 or null. Scores are never used to sort. Unknown response fields are discarded. API errors, including a 200 response containing `error`, are unavailable results.
- Only the sanitized snapshot (or a failed-read `null`) enters Next's Data Cache. Revalidation is three minutes and traffic-driven, not a scheduled job. A hash of the configured URL and token partitions cache entries; neither raw value is a cache argument/key or public metadata. Changing either value selects a new entry.
- Concurrent cold requests and background refreshes share one upstream request per server instance. The Data Cache persists across requests; the in-process map only coalesces reads. Different cold instances may each make an initial request.
- Next may serve a previous snapshot while refreshing it. Responses at least three minutes old are explicitly marked stale; at ten minutes the server withholds all rows even if the framework still retains them. When an expired snapshot or cached outage has a refresh already in flight, the request waits for that bounded refresh so the first visitor can recover immediately. A failed refresh replaces the cached snapshot with unavailable. Both success and failure are briefly cached to avoid per-view upstream requests.
- The public endpoint returns only `status`, `snapshot` (tracks and `fetchedAt`) and, when available, server-calculated `ageMs`. Its response is `Cache-Control: no-store`, so a CDN/browser cannot extend the snapshot's lifetime. Unavailable results use HTTP 503 and `snapshot: null`; a valid empty ladder is HTTP 200 with `tracks: []`.
- The page uses the existing visibility-aware polling helper at a three-minute cadence. It cancels on unmount, bounds browser requests to twelve seconds, clears failed reads and ages displayed results using server age rather than the visitor's wall clock. A loaded tab marks old standings as refresh-pending and removes them at the age limit.
- The server logs only fixed failure reason codes and, when relevant, a numeric upstream HTTP status under `[hellcat-ladder]`. It never logs original errors, response bodies, endpoint values or credentials. These diagnostics stay in private runtime logs; public responses deliberately do not distinguish auth failure from other upstream failures. Cached failed reads do not emit another upstream warning until a fresh request is attempted.

## Diagnosing a configured preview

Open `/contests` on the intended branch preview and inspect that deployment's runtime logs for `/api/hellcat/ladder`, searching for `[hellcat-ladder]`. An upstream failure can be cached for three minutes, so an immediate repeat may not produce a new warning. Use logs from the deployed request; an unauthenticated probe from a different environment does not establish why Vercel's authenticated request failed.

| Private reason code | What it establishes / next check |
| --- | --- |
| `configuration_missing` | At least one variable is absent or blank in this deployment. Check Preview/branch scope and redeploy after saving. |
| `configuration_invalid` | Both values exist but fail validation. Check the exact HTTPS `/ladder` URL and a raw token without `Bearer `, quotes or internal whitespace. |
| `upstream_unauthorized` | HTTP 401/403 or Hellcat's `unauthorized` JSON response. Recheck the saved token through the platform's private settings. |
| `upstream_http_error` | The deployed server received another non-success HTTP status. The log includes its number; a 502 here is evidence from Vercel's request. |
| `upstream_timeout` / `upstream_network_error` | The request timed out or failed in transport. Verify the current tunnel URL and server availability with Hellcat; a network error alone does not identify which side failed. |
| `upstream_empty_response` / `upstream_invalid_json` / `upstream_invalid_tracks` / `upstream_body_too_large` | The response did not meet the bounded JSON ladder contract. Inspect it only in the protected operator environment. |
| `cache_error` | The site's cache operation failed. Investigate the deployment runtime. |

The token setting contains only the raw token because the server adds `Bearer ` when constructing the `Authorization` header. Never share token values or raw upstream bodies to diagnose a failure; the reason code and numeric status are sufficient for the first check.

## Verification and remaining evidence

`tests/hellcat-ladder.test.mjs` covers the data projection, official ordering, nullable values, malformed/auth/error/oversized responses, credential and redirect boundaries, cache partitioning and reuse, concurrent reads, age limits, public route behavior, table escaping and browser lifecycle.

Required repository gates are `npm ci`, `npm run check` and `npm run build`. The actual bearer-authenticated Hellcat connection and final placement acceptance require the configured preview. Fixture success alone does not establish live availability or validate the temporary tunnel URL.
