# BARCODE Radio provider integration audit

Access date for all cited sources: 2026-07-11.

## 1. Executive decision

For this repository, "first-class" should mean extending the existing queue seams instead of adding a parallel provider system: a dedicated `QueueSourceType`, deterministic URL validation, a stable `providerId`, duplicate-safe `normalizedSourceKey` behavior, public/admin labels, officially sourced metadata only where available, and the existing external-open fallback when official embeds or controls are insufficient.

Recommended maximum levels:

- **TikTok video / Short: Level 4 candidate after implementation and rehearsal.** TikTok has official oEmbed metadata and a separate official iframe Embed Player with postMessage play, pause, seek, mute, current-time, state, and error events.
- **Apple Music: Level 3 maximum.** Apple Music has official catalog metadata and MusicKit playback controls, but practical full playback requires user authorization/subscription and does not fit current host-authoritative overlay without browser/user-token ownership work.
- **Amazon Music: Level 2 maximum with closed-beta approval; Level 1 without approval.** Amazon documents catalog metadata in a closed-beta Web API, including track title, artists, images, and duration, but public site use depends on approved access and no official public iframe/control surface was verified.
- **Bandcamp: Level 1 maximum.** Bandcamp has an official account/commerce API and official embed UI/help, but no verified public track metadata API or controllable JavaScript player API for arbitrary submitted URLs.
- **Suno: Level 1 maximum.** Suno help confirms link-only/public song behavior and duration ranges for generated songs, but no verified official public song metadata API, oEmbed endpoint, or controllable embed/player was found.

Recommended implementation order: TikTok Level 1-3 first, TikTok Level 4 only after preview rehearsal, Apple Music Level 1-2, Amazon Music Level 1 plus gated Level 2 only after approved credentials, Bandcamp Level 1, Suno Level 1.

## 2. Current repository architecture

Future work should extend these existing files and functions:

- `src/lib/queue-types.ts`: `QueueSourceType` is currently `upload | link | youtube | soundcloud | spotify | other`; `QueueDurationSource` includes provider-specific and generic sources; `detectQueueSourceType()` classifies YouTube, SoundCloud, Spotify, malformed links, and `other`; `getTrackArtworkUrl()` has YouTube thumbnail logic and provider-artwork passthrough.
- `src/lib/track-duration.ts`: `TrackDurationProvider`, `TrackDurationSource`, `parseSafeTrackProviderUrl()`, and `detectTrackDurationFromLink()` parse supported track URLs and fetch official provider duration where configured.
- `src/lib/queue.ts`: `ProviderMetadata` is the metadata contract (`detectedArtistName`, `detectedSongTitle`, `providerTitle`, `detectedDurationSeconds`, `durationSource`, `artworkUrl`); `detectProviderMetadata()` routes provider metadata lookup; `normalizeQueueSourceKey()` strips tracking params; `parseProviderId()` creates provider-specific IDs; duplicate detection checks `normalizedSourceKey`, `providerId`, and upload metadata.
- `src/app/api/queue/route.ts`: public submissions call `detectQueueSourceType()` and `submitRadioTrack()`; duplicate checks reuse `normalizeQueueSourceKey()`.
- `src/components/AdminRadioQueueControl.tsx`: `sourceLabel()`, `openUrl()`, and `embedUrl()` drive PlayerDock labels, external-open fallback, and iframes; only YouTube uses the custom admin player and overlay sync.
- `src/components/RadioQueueForm.tsx`: public submission/result displays show the accepted `sourceType` from the API.
- `src/components/PublicQueueSession.tsx`: public labels use `sourceTypeLabel()`; public cards link to `publicSourceUrl`, show artwork via `SourceArt`, and style uploads/links/other.
- `src/lib/live-overlay.ts` and `src/lib/live-overlay-resolver.ts`: overlay state accepts known source types plus `unknown`; YouTube is the only synchronized provider, with `LiveOverlayYouTubeSync`, `serverStampYouTubeSync()`, freshness rules, and Shorts presentation handling.
- Tests: `tests/track-duration.test.mjs`, `tests/queue-playback.test.mjs`, and `tests/live-overlay-resolver.test.mjs` cover parser/duration behavior, queue playback rules, duplicate/provider handling, and YouTube-only overlay synchronization.

Current external-open fallback remains required for every non-upload provider when no official embed URL exists or an embed fails. Current live-overlay synchronization is intentionally YouTube-only.

## 3. Capability-level definitions

### Level 1 — Recognized provider

A Level 1 provider has a dedicated source type, public/admin provider label, URL validation, canonical ID, duplicate normalization, and safe external-open fallback. Metadata, embeds, and overlay control are not required.

### Level 2 — Metadata-supported provider

A Level 2 provider adds officially supported title, creator/artist, artwork, and duration when available, with graceful fallback to submitted copy/internal estimate when metadata lookup fails.

### Level 3 — Embedded admin playback

A Level 3 provider has an official embed/player that can load reliably in the admin PlayerDock, with controlled fallback and no unsupported playback-control claims.

### Level 4 — Live-overlay synchronization

A Level 4 provider has official play/pause/seek controls plus ready/state/current-time/error events sufficient for host authority, receiver synchronization, refresh recovery, current-time drift correction, heartbeat publishing, and tested failure behavior.

A provider can and often should stop at Level 1 without qualifying for Levels 2-4.

## 4. Provider capability matrix

| Provider | Accepted canonical URL forms | Share/redirect forms | Stable content ID | Official metadata interface | Authentication | Title | Artist/creator | Artwork | Duration | Official embed | Play/pause | Seek | Current-time events | Error events | Region/subscription restrictions | Safe fallback | Recommended maximum level | Confidence | Official sources |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Apple Music | Supported with conditions | Supported with conditions | Supported | Supported with conditions | Supported with conditions | Supported | Supported | Supported | Supported | Supported with conditions | Supported with conditions | Supported with conditions | Supported with conditions | Unknown pending evidence | Supported with conditions | Supported | Level 3 | Supported with conditions | Apple Music API, Catalog Song, MusicKit, MusicKit Web, Marketing Tools |
| Amazon Music | Supported with conditions | Supported with conditions | Supported | Supported with conditions | Supported with conditions | Supported | Supported | Supported | Supported | Unknown pending evidence | Not officially supported | Not officially supported | Not officially supported | Not officially supported | Supported with conditions | Supported | Level 2 if approved; otherwise Level 1 | Supported with conditions | Amazon Music Web API Overview, Tracks, Player |
| Suno | Supported with conditions | Unknown pending evidence | Supported with conditions | Not officially supported | Unknown pending evidence | Not officially supported | Not officially supported | Not officially supported | Not officially supported | Not officially supported | Not officially supported | Not officially supported | Not officially supported | Not officially supported | Supported with conditions | Supported | Level 1 | Supported with conditions | Suno Help link-only songs, duration, rights |
| Bandcamp | Supported with conditions | Unknown pending evidence | Unknown pending evidence | Not officially supported | Supported with conditions | Unknown pending evidence | Unknown pending evidence | Unknown pending evidence | Unknown pending evidence | Supported with conditions | Not officially supported | Not officially supported | Not officially supported | Not officially supported | Supported with conditions | Supported | Level 1 | Supported with conditions | Bandcamp Developer, Account API, Sales API, Exclusive Embed Help |
| TikTok video / Short | Supported | Supported with conditions | Supported | Supported | Not appropriate — no authentication documented for public oEmbed or Embed Player; authenticated Display API is not used | Supported | Supported | Supported | Unknown pending evidence | Supported | Supported | Supported | Supported | Supported | Supported with conditions | Supported | Level 4 candidate | Supported | TikTok Embed Videos, Embed Player, Display API |

## 5. Detailed provider findings

### Apple Music

- **Exact URL grammar:** verified accepted song grammar is the Apple Music album-form URL with a storefront path and a specific track query parameter: `https://music.apple.com/{storefront}/album/{slug}/{albumId}?i={songId}`. Accept locale/storefront path segments such as `us`; reject album URLs without a song ID, playlists, artists, radio/stations, and generic pages. The plausible `/song/{slug}/{songId}` form is not treated as verified accepted grammar until a first-party Apple source or current official `music.apple.com` page confirms it.
- **Accepted examples:** `https://music.apple.com/us/album/example/123456789?i=987654321`.
- **Invalid examples:** `https://music.apple.com/us/album/example/123456789`; `https://music.apple.com/us/playlist/...`; `https://music.apple.com/us/artist/...`.
- **Canonical ID strategy:** use `apple_music:song:{storefront}:{songId}` or `apple_music:song:{songId}` if duplicate behavior should merge storefronts. The Apple Music API identifies catalog songs by storefront plus song ID.
- **Redirect strategy:** do not require redirects for canonical album-form song links; if resolving Apple short/marketing links, use server-side allowlisted redirect resolution with strict limits.
- **Metadata strategy:** Apple Music API can retrieve catalog resources including songs; catalog song attributes include metadata suitable for title/artist/artwork/duration decisions. Requests require a developer token; user-specific data requires a Music User Token.
- **Duration strategy:** use catalog song duration when a developer token is configured; mark as unavailable/internal estimate if no token or storefront mismatch.
- **Embed strategy:** Apple marketing tools provide embeddable widgets; PlayerDock can embed only if an official iframe URL is derived from a validated song URL.
- **Playback strategy:** MusicKit lets websites play Apple Music with user permission; MusicPlayer exposes playback time and play/pause APIs, but full playback depends on user authorization/subscription.
- **Overlay strategy:** not Level 4 for this repo now because host-authoritative overlay would require managing user authorization/subscription and proving state/error/current-time behavior in the public receiver.
- **Fallback strategy:** external-open to canonical `music.apple.com` song URL.
- **Environment variables or credentials:** server-side Apple Music developer token material only; never expose private keys. A browser MusicKit developer token/user-token flow is a separate PR if ever needed.
- **Security/rate limits:** storefront allowlist/validation; token storage server-side; timeout and response-size caps.
- **Terms/policy:** use Apple Music API/MusicKit only under Apple Developer terms and marketing/widget rules.
- **Official citations:** Apple Music API overview (https://developer.apple.com/documentation/applemusicapi/); Get a Catalog Song (https://developer.apple.com/documentation/applemusicapi/get-a-catalog-song); Generating Developer Tokens (https://developer.apple.com/documentation/applemusicapi/generating-developer-tokens); User Authentication for MusicKit (https://developer.apple.com/documentation/applemusicapi/user-authentication-for-musickit); MusicKit (https://developer.apple.com/musickit/); MusicKit on the Web (https://developer.apple.com/musickit/web/); MusicPlayer (https://developer.apple.com/documentation/musickit/musicplayer); Apple Music Marketing Tools (https://artists.apple.com/support/1117-apple-music-marketing-tools).
- **Unresolved questions:** exact iframe URL generation contract for submitted song URLs, whether album-form `?i=` links should merge across storefronts, and whether `https://music.apple.com/{storefront}/song/{slug}/{songId}` is a current first-party Apple URL form that should be accepted later.

### Amazon Music

- **Exact URL grammar:** accept `https://music.amazon.{tld}/albums/{albumAsin}?trackAsin={trackAsin}` as a track link; accept `https://music.amazon.{tld}/tracks/{trackAsin}` only if verified by implementation; reject albums without `trackAsin`, artists, playlists, stations, podcasts, profiles, and general pages.
- **Accepted examples:** `https://music.amazon.com/albums/B08C5JCMKD/?trackAsin=B08C5GH2P9&do=play`.
- **Invalid examples:** `https://music.amazon.com/albums/B08C5JCMKD`; `https://music.amazon.com/artists/...`; `https://music.amazon.com/playlists/...`.
- **Canonical ID strategy:** `amazon_music:track:{trackAsin}` using the documented track/catalog ID/global ASIN.
- **Redirect strategy:** short/share links need allowlisted redirect resolution across `music.amazon.*` and Amazon-owned short hosts only after official examples are collected.
- **Metadata strategy:** Amazon Music Web API Tracks endpoint returns title, duration, album, artists, images, ISRC, territory, and eligibility, but the Web API is closed beta and requires approved access.
- **Duration strategy:** exact seconds are available from the Tracks endpoint only with approved OAuth/x-api-key access.
- **Embed strategy:** no official public iframe/oEmbed/control API was verified in the official sources checked.
- **Playback strategy:** Web API Player docs cover recently played history, not an iframe or JavaScript playback controller for this site use.
- **Overlay strategy:** not Level 4 because no official controllable embed/player with ready/current-time/error events was verified.
- **Fallback strategy:** external-open to canonical Amazon Music track URL.
- **Environment variables or credentials:** only after approval: LWA OAuth credentials and x-api-key/security profile ID stored server-side.
- **Security/rate limits:** closed-beta TPS limits require exponential backoff; no unauthenticated scraping.
- **Terms/policy:** closed-beta/preview docs and Amazon approval gate must be treated as blockers.
- **Official citations:** Amazon Music Web API Overview (https://developer.amazon.com/docs/music/API_web_overview.html); Tracks (https://developer.amazon.com/docs/music/API_web_track.html); Player (https://developer.amazon.com/docs/music/API_web_player.html); Albums (https://developer.amazon.com/docs/music/API_web_albums.html).
- **Unresolved questions:** approved access status, official share URL forms by country host, and any official embed program.

### Suno

- **Exact URL grammar:** accept only public/shared song URLs after implementation verifies current official host/path shape from live Suno share UI; likely `suno.com/song/{id}`-style direct song pages, but this audit does not mark an exact grammar implemented.
- **Accepted examples:** pending official share-UI capture in implementation PR.
- **Invalid examples:** profiles, library/workspace pages requiring auth, playlists, create pages, account pages, and generation endpoints.
- **Canonical ID strategy:** `suno:song:{id}` only when an ID is present in a public song URL.
- **Redirect strategy:** resolve only official Suno short/share hosts if documented or observed from first-party share UI; otherwise reject.
- **Metadata strategy:** no verified official public song metadata API, oEmbed endpoint, or public embed metadata contract was found. Do not scrape embedded JSON.
- **Duration strategy:** Suno help documents model duration ranges for generated songs, not exact public-song duration metadata; use internal estimate.
- **Embed strategy:** no verified official public embed/player documentation found.
- **Playback strategy:** no verified official controllable player API found.
- **Overlay strategy:** not Level 4.
- **Fallback strategy:** recognized source type, canonical ID, duplicate handling, external-open fallback only.
- **Environment variables or credentials:** none for Level 1.
- **Security/rate limits:** no metadata crawling; no generation API; no authenticated user-library access.
- **Terms/policy:** respect public/link-only visibility and rights distinctions; queue use must not imply commercial rights.
- **Official citations:** Suno link-only/public song help (https://help.suno.com/en/articles/2551361); Suno song duration help (https://help.suno.com/en/articles/2409473); Suno rights/copyright help (https://help.suno.com/en/articles/2746945); Suno commercial use help (https://help.suno.com/en/articles/9601985); Suno knowledge base (https://help.suno.com/).
- **Unresolved questions:** exact current public song URL grammar, official embed availability, official public metadata availability.

### Bandcamp

- **Exact URL grammar:** accept `https://{artist}.bandcamp.com/track/{slug}` and custom-domain `/track/{slug}` only after host validation; accept album selected-track URLs only if an official, stable track ID can be obtained without unsupported scraping; reject plain albums unless issue scope expands beyond tracks.
- **Accepted examples:** `https://artist.bandcamp.com/track/song-slug`.
- **Invalid examples:** `https://artist.bandcamp.com/album/album-slug` without selected track; `https://bandcamp.com/tag/...`; fan/profile pages; merch-only pages.
- **Canonical ID strategy:** if no official public ID exists in the URL, use canonical normalized URL for Level 1. Do not invent a scraped ID.
- **Redirect strategy:** allow custom domains only with careful host/path validation; avoid resolving arbitrary non-Bandcamp hosts unless deliberately implemented with SSRF controls.
- **Metadata strategy:** Bandcamp Developer docs cover account, sales, and merch/order APIs for account owners/partners, not a public arbitrary-track metadata API.
- **Duration strategy:** no official public duration interface verified for submitted track URLs.
- **Embed strategy:** Bandcamp official help describes Share/Embed and exclusive embeds, but obtaining player IDs for arbitrary submitted URLs appears to require page/UI context not provided by an official public metadata API.
- **Playback strategy:** no official JavaScript/postMessage playback-control API verified.
- **Overlay strategy:** not Level 4.
- **Fallback strategy:** external-open fallback remains necessary; Level 1 can still improve labels and duplicate normalization.
- **Environment variables or credentials:** none for Level 1; Bandcamp OAuth credentials are not appropriate for arbitrary fan-submitted public tracks.
- **Security/rate limits:** no arbitrary HTML scraping unless Bandcamp explicitly documents and permits it.
- **Terms/policy:** official API access is for labels/merch fulfillment partners and account-owned data, not public catalog scraping.
- **Official citations:** Bandcamp Developer (https://bandcamp.com/developer); Account API (https://bandcamp.com/developer/account); Sales Report API (https://bandcamp.com/developer/sales); Merch Orders API (https://bandcamp.com/developer/merch); Exclusive Embed Help (https://bandcamp.com/help/exclusive_embed).
- **Unresolved questions:** official public oEmbed/API existence, stable track IDs in share URLs, custom-domain validation list.

### TikTok video / Short

- **Exact URL grammar:** accept canonical post URLs `https://www.tiktok.com/@{handle}/video/{postId}` verified by TikTok oEmbed documentation and canonical player URLs `https://www.tiktok.com/player/v1/{postId}` verified by TikTok Embed Player documentation. Short/share redirect handling is conditional and must be added only for individually verified TikTok-owned hosts; no short-link hostname is accepted merely because it contains `tiktok`.
- **Accepted examples:** `https://www.tiktok.com/@scout2015/video/6718335390845095173`; `https://www.tiktok.com/player/v1/6718335390845095173`.
- **Invalid examples:** profiles without `/video/{id}`, tags, music pages, live pages, collection pages, deleted/private/unavailable content.
- **Canonical ID strategy:** `tiktok:video:{postId}`.
- **Redirect strategy:** keep short/share redirects unsupported unless each host is verified as TikTok-owned from first-party evidence or an actual official TikTok share flow. Any redirect resolver must enforce HTTPS, limited hops, request timeouts, response-size limits, private-network rejection, and final-host validation to a canonical TikTok post/player URL. If a host cannot be verified, that host remains unsupported and users can still submit the canonical URL.
- **Metadata strategy:** TikTok oEmbed documents `title`, `author_name`, `author_url`, `thumbnail_url`, `thumbnail_width`, `thumbnail_height`, and `html`. Map `author_name` to `detectedArtistName`, map `title` to `providerTitle` as the TikTok caption/video title, map `thumbnail_url` to `artworkUrl`, and leave `detectedSongTitle` as submitted/fallback data because the caption is not verified music-track metadata. Do not render or trust returned oEmbed `html` directly; construct the official player iframe from a validated post ID. TikTok Display API exists for authenticated user profile/videos but is unrelated to arbitrary public submitted-video handling.
- **Duration strategy:** no exact duration field is documented in the oEmbed response; use internal estimate unless the official player is tested and deliberately added later as a duration source.
- **Embed strategy:** use the official Embed Player iframe `https://www.tiktok.com/player/v1/{postId}` instead of assuming older blockquote embed control behavior.
- **Playback strategy:** the Embed Player supports host-to-player messages including play, pause, seekTo, mute, and unMute, and player-to-host messages including ready, state, current time, mute/volume, and errors.
- **Overlay strategy:** Level 4 candidate because official controls/events exist; implementation must validate `event.origin`, test autoplay/mute behavior, unavailable content, recommended-content behavior, vertical layout, and drift correction.
- **Fallback strategy:** external-open to canonical TikTok video URL; if embed/player errors, show controlled card/fallback.
- **Environment variables or credentials:** public oEmbed does not document an access-token requirement, and the official Embed Player iframe does not document an access-token requirement. TikTok Display API requires authentication but is unrelated to arbitrary public submitted-video handling. No TikTok client secret or user OAuth flow is needed for the proposed Level 1-3 queue implementation, based only on what the official documentation currently specifies.
- **Security/rate limits:** sanitize oEmbed HTML or avoid rendering it directly; prefer constructing official iframe from validated post ID.
- **Terms/policy:** comply with TikTok developer/embed terms and content availability restrictions.
- **Official citations:** TikTok Embed Videos/oEmbed (https://developers.tiktok.com/doc/embed-videos/); TikTok Embed Player (https://developers.tiktok.com/doc/embed-player); TikTok Display API get started (https://developers.tiktok.com/doc/display-api-get-started/).
- **Unresolved questions:** current list of individually verified TikTok-owned short-link hosts, whether any such hosts can be evidenced from first-party docs or an actual official TikTok share flow, and autoplay behavior in Vercel preview browsers.

## 6. Existing-system integration map

- **Apple Music Level 1-2/3:** `src/lib/queue-types.ts`, `src/lib/track-duration.ts`, `src/lib/queue.ts`, `src/app/api/queue/route.ts`, `src/components/AdminRadioQueueControl.tsx`, `src/components/PublicQueueSession.tsx`, `tests/track-duration.test.mjs`, `tests/queue-playback.test.mjs`. Do not touch live-overlay files unless a later proof upgrades to Level 4.
- **Amazon Music Level 1/2:** same queue/parser/metadata/admin/public/test files as Apple. Do not touch live-overlay files.
- **Suno Level 1:** `src/lib/queue-types.ts`, `src/lib/track-duration.ts` for parsing only if used by `parseSafeTrackProviderUrl()`, `src/lib/queue.ts`, public/admin labels, and queue tests. No metadata fetch, embeds, or overlay files.
- **Bandcamp Level 1:** same Level 1 queue/parser/label/test files; no runtime HTML scraping; no overlay files.
- **TikTok Level 1-3:** queue type/parser/metadata/admin/public/test files. **TikTok Level 4 only after separate PR:** add `src/lib/live-overlay.ts`, `src/lib/live-overlay-resolver.ts`, overlay receiver/admin sync components, and `tests/live-overlay-resolver.test.mjs` updates.

No generic plugin framework is required for the next PRs; a small shared provider registry may be justified only if repeated source labels, host allowlists, parser outputs, and embed URL builders begin duplicating across at least three providers.

## 7. Security and privacy boundaries

- Store Apple, Amazon, or other provider secrets only server-side; never expose private keys, client secrets, or refresh tokens in browser bundles.
- Use URL host allowlists per provider; do not accept `host.includes()` for new providers where a suffix allowlist is safer.
- Redirect resolution must use HTTPS-only final URLs, maximum hop count, short timeout, response-size limits, and explicit final-host checks.
- Avoid SSRF by rejecting private IPs, localhost, link-local ranges, non-HTTP(S) protocols, and user-controlled DNS expansion where possible.
- Validate content type and response size for metadata endpoints.
- Validate `event.origin` for TikTok or any iframe messaging; never use wildcard trust even if examples use `*` for sending.
- Sanitize oEmbed HTML or avoid direct rendering; construct known-safe iframes from validated IDs instead.
- Handle private/deleted/unavailable content with safe generic failures.
- Retain only canonical IDs, normalized keys, artwork URLs, and display metadata necessary for queue operation.
- Treat artwork URLs as untrusted remote URLs; allowlist provider CDNs where feasible and avoid proxying unbounded images.
- Do not display raw provider error payloads to public users.

## 8. Recommended PR sequence

1. **TikTok Level 1-3 site-only PR.** Files: queue types, parser/duration tests, queue metadata via oEmbed, admin PlayerDock iframe, public labels. Behavior: recognize canonical TikTok post/player URLs, add short/share redirects only for individually verified TikTok-owned hosts, provider ID duplicate detection, oEmbed title/author/thumbnail mapping where available, admin iframe fallback. Tests: parser, duplicate, metadata fallback, admin embed builder. Manual rehearsal: Vercel preview PlayerDock with public and unavailable TikToks. Blockers: short-link host list and event-origin checks. Live-overlay: not included.
2. **TikTok Level 4 overlay PR.** Files: live-overlay state/resolver/admin/receiver/tests. Behavior: host-authoritative TikTok player sync with play/pause/seek/current-time/error events. Tests: resolver freshness, event validation, fallback, drift correction. Manual rehearsal: required in preview. Blockers: autoplay/mute and private/deleted behavior.
3. **Apple Music Level 1-2 PR.** Files: queue types, track-duration, queue metadata, API route-adjacent tests, labels. Behavior: album-form `?i=` song parsing, storefront-aware provider ID, developer-token catalog metadata if configured, external-open fallback. Tests: URL grammar, album-without-song invalid, metadata fallback. Manual rehearsal: no browser playback required. Blockers: credential availability and storefront policy. Live-overlay: not included.
4. **Apple Music Level 3 admin embed PR.** Files: AdminRadioQueueControl and tests. Behavior: official Apple embeddable widget/iframe only with fallback. Manual rehearsal: preview PlayerDock. Blockers: exact official iframe construction.
5. **Amazon Music Level 1 PR.** Files: queue types/parser/labels/tests. Behavior: recognize `trackAsin`, canonical ID, duplicate protection, external-open fallback. Tests: country hosts and invalid album/profile/playlist pages. Manual rehearsal: none beyond links. Blockers: share URL samples. Live-overlay: not included.
6. **Amazon Music Level 2 gated metadata PR.** Files: track-duration, queue metadata, server env documentation if requested, tests. Behavior: closed-beta API metadata only when approved credentials exist; fallback otherwise. Manual rehearsal: credentialed staging only. Blockers: Amazon approval. Live-overlay: not included.
7. **Bandcamp Level 1 PR.** Files: queue types/parser/labels/tests. Behavior: accept track URLs and safe custom-domain strategy, duplicate by normalized URL, external-open fallback. Blockers: official public ID evidence. Live-overlay: not included.
8. **Suno Level 1 PR.** Files: queue types/parser/labels/tests. Behavior: accept verified public song URL grammar, duplicate by canonical song ID, external-open fallback. Blockers: official/current share URL grammar evidence. Live-overlay: not included.

## 9. Next implementation PR

Next step: **TikTok video / Short Level 1-3**.

- **Branch suggestion:** `codex/tiktok-queue-provider-level-3`
- **PR title:** `Add TikTok queue provider recognition and admin embed`
- **Expected files:** `src/lib/queue-types.ts`, `src/lib/track-duration.ts`, `src/lib/queue.ts`, `src/app/api/queue/route.ts` only if validation wiring requires it, `src/components/AdminRadioQueueControl.tsx`, `src/components/PublicQueueSession.tsx`, `tests/track-duration.test.mjs`, `tests/queue-playback.test.mjs`.
- **Behavior:** recognize canonical TikTok post/player URLs. Add short/share redirects only for individually verified TikTok-owned hosts. Create `tiktok:video:{postId}` provider IDs; use oEmbed with `author_name` mapped to `detectedArtistName`, `title` mapped only to `providerTitle`, and `thumbnail_url` mapped to `artworkUrl`; use official Embed Player iframe in admin; retain external-open fallback.
- **Must not change:** queue ordering/brain, payments, uploads, BNL bot, YouTube sync, live-overlay files, PlayerDock ownership semantics, public submission confirmation, accepted-source panel, or `WATCH ON TIKTOK` behavior beyond necessary labels.
- **Preview rehearsal:** required for PlayerDock iframe and unavailable/private video fallback; no live-overlay rehearsal until the separate Level 4 PR.

## 10. Sources

- Apple — Apple Music API — https://developer.apple.com/documentation/applemusicapi/ — accessed 2026-07-11 — Supports that Apple Music API retrieves albums, songs, artists, playlists, music videos, stations, ratings, charts, recommendations, and related catalog data.
- Apple — Get a Catalog Song — https://developer.apple.com/documentation/applemusicapi/get-a-catalog-song — accessed 2026-07-11 — Supports storefront/song ID catalog retrieval.
- Apple — Generating Developer Tokens — https://developer.apple.com/documentation/applemusicapi/generating-developer-tokens — accessed 2026-07-11 — Supports developer-token requirement.
- Apple — User Authentication for MusicKit — https://developer.apple.com/documentation/applemusicapi/user-authentication-for-musickit — accessed 2026-07-11 — Supports Music User Token requirement for subscriber-specific data.
- Apple — MusicKit — https://developer.apple.com/musickit/ — accessed 2026-07-11 — Supports website/app playback with user permission and Apple Music membership flows.
- Apple — MusicKit on the Web — https://developer.apple.com/musickit/web/ — accessed 2026-07-11 — Supports web integration and Apple Music API access.
- Apple — MusicPlayer — https://developer.apple.com/documentation/musickit/musicplayer — accessed 2026-07-11 — Supports playback time/readiness/player capability claims.
- Apple — MusicPlayer pause() — https://developer.apple.com/documentation/musickit/musicplayer/pause%28%29 — accessed 2026-07-11 — Supports play/pause control claims.
- Apple — Apple Music Marketing Tools — https://artists.apple.com/support/1117-apple-music-marketing-tools — accessed 2026-07-11 — Supports official badges/widgets/toolbox embedding availability.
- Amazon — Amazon Music Web API Overview — https://developer.amazon.com/docs/music/API_web_overview.html — accessed 2026-07-11 — Supports closed beta, metadata purpose, OAuth/x-api-key requirements, approval gate, and rate limiting.
- Amazon — Web API Tracks — https://developer.amazon.com/docs/music/API_web_track.html — accessed 2026-07-11 — Supports track ID, title, artists, images, duration, album URL, territory, and eligibility metadata.
- Amazon — Web API Player — https://developer.amazon.com/docs/music/API_web_player.html — accessed 2026-07-11 — Supports that documented Player endpoints are recent-playback/history, not iframe control.
- Amazon — Web API Albums — https://developer.amazon.com/docs/music/API_web_albums.html — accessed 2026-07-11 — Supports album metadata scope and catalog entity distinctions.
- Suno — Why don't I see songs in my profile? — https://help.suno.com/en/articles/2551361 — accessed 2026-07-11 — Supports link-only/default visibility and publishing to public profile.
- Suno — How long will my song be? — https://help.suno.com/en/articles/2409473 — accessed 2026-07-11 — Supports model duration ranges but not exact public-song metadata.
- Suno — Do I have the copyrights to songs I made? — https://help.suno.com/en/articles/2746945 — accessed 2026-07-11 — Supports rights distinctions.
- Suno — What is commercial use? — https://help.suno.com/en/articles/9601985 — accessed 2026-07-11 — Supports commercial-use licensing boundaries.
- Suno — Knowledge Base — https://help.suno.com/ — accessed 2026-07-11 — Supports official area checked for public support documentation.
- Bandcamp — Bandcamp API — https://bandcamp.com/developer — accessed 2026-07-11 — Supports OAuth, account/label/partner API scope, and absence of arbitrary public catalog metadata in documented API overview.
- Bandcamp — Account API — https://bandcamp.com/developer/account — accessed 2026-07-11 — Supports account-owned band metadata API scope.
- Bandcamp — Sales Report API — https://bandcamp.com/developer/sales — accessed 2026-07-11 — Supports account sales/report scope and item URL fields, not public catalog metadata.
- Bandcamp — Merch Orders API — https://bandcamp.com/developer/merch — accessed 2026-07-11 — Supports merch/order API scope and authenticated account usage.
- Bandcamp — How do I set up an exclusive embed? — https://bandcamp.com/help/exclusive_embed — accessed 2026-07-11 — Supports official Share/Embed UI existence and exclusive embed flow.
- TikTok — Embed Videos — https://developers.tiktok.com/doc/embed-videos/ — accessed 2026-07-11 — Supports oEmbed API, returned embed HTML, attribution, and video information.
- TikTok — Embed Player — https://developers.tiktok.com/doc/embed-player — accessed 2026-07-11 — Supports iframe player URL, query parameters, host-to-player messages, player-to-host messages, and error reporting.
- TikTok — Display API Get Started — https://developers.tiktok.com/doc/display-api-get-started/ — accessed 2026-07-11 — Supports authenticated Display API requirements and scopes.
