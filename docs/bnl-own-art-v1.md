# BNL own-art publication v2 (v1 compatible)

BNL's optional self-directed image accompanies one existing ambient Discord
message, at most once per America/Los_Angeles day. The bot owns creation and its
daily claim; the website only receives an already-generated image. Both sides
default `BNL_OWN_ART_ENABLED` off pending private acceptance.

Authenticated `POST /api/bnl/art` uses the existing BNL API key. Exact payload:
`contractVersion: 2`, `kind: bnl_own_art`, `art`, `imageBase64`. Art contains only
`artId`, `title`, `meaning`, UTC `createdAt`, original image `sha256`, `mimeType`
(`image/png` or `image/jpeg`), and `journal`
(null, or exact `entryId`, `revision`, `contentHash`), plus `sourceJournals`
(the at-most-two Journal references supplied to the creative prompt). No source excerpts,
prompts, Discord identifiers, provider secrets or admin notes are public.

The original v1 contract (`pngBase64`, no `art.mimeType`) remains accepted as
PNG. No provider output format is forced. The route checks actual bytes against
the declared MIME and preserves those bytes, their hash, correct extension and
response Content-Type without conversion. Existing stored v1 metadata stays
unchanged so its immutable receipts remain valid.

The route bounds the streamed body to 2,850,000 bytes and decoded image to 2 MiB,
verifies hash, dimensions, date and exact keys. The art ID is the creation's
Pacific date. Metadata is immutable and same-packet publication is idempotent;
a different packet for that date conflicts. Redis stores BNL art metadata and
a bounded public gallery index. Private Blob stores image bytes. Queue state,
uploads, Journal records and publication workers are not modified.

Optional Journal associations require the current exact public revision and
memory eligibility before and after upload. All supplied Journal inputs remain visibility dependencies even when BNL chooses
no explicit related-entry link. Public display follows Journal
visibility and revision; toggling memory eligibility later does not itself
hide an existing image. A hidden, changed or unavailable associated entry
closes gallery, Journal and direct media access. Private blob URLs are never
returned. `GET /api/bnl/art?id=...` serves only currently public images with
`no-store` and rechecks visibility after blob retrieval.

The Hub renders up to 12 published pieces. The matching Journal detail page
can display the same piece. These reads are optional Suspense sections; empty
or unavailable artwork never replaces Journal text or delays its publication.
The relationship is added after an entry is published; artwork is not required
to arrive with the 19:00 Daily.

Acceptance still requires a real private Gemini preview and, after activation,
one naturally delivered ambient attachment plus separate website receipt.
Unit tests or a merged PR alone do not establish that runtime acceptance.
