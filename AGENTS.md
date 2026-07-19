# BARCODE Network Site — Agent Instructions

## Source of truth

- `main` is the stable production branch. Never push directly to it.
- Work on a branch and submit a scoped pull request.
- Current source and tests override historical checkpoint documents when they disagree.
- Read `README.md` and the relevant contract document before changing a subsystem.

## Existing systems must be extended, not duplicated

The repository already contains active implementations for:

- the native BARCODE Radio queue, uploads, Wheel, Priority, Stripe, overlays, archives, and show management;
- BNL Presence/Relay v2 and public/admin consumers;
- the BNL Journal and its independent visibility and memory-eligibility controls;
- the public Database renderer and the internal Source File/dossier workflow;
- the global identity shell, Terminal, releases, Transmissions, Merch, and Radio pages.

Before adding a capability, identify where it belongs in those systems. Do not create a second queue, second relay, second Journal, second dossier store, or second identity shell.

## Historical code

- `_archive/`, `stream-engine/`, and `discord-bot/` are reference-only.
- Their queue shapes, endpoints, tiers, and automation assumptions are stale.
- Do not run, deploy, restore, or copy them into active routes without an explicit rewrite plan against current contracts.

## Queue and public-submission truth

- Native `/queue` and admin queue routes are active, intentional code.
- Queue-derived public and BNL truth is disabled unless `BARCODE_QUEUE_PRODUCTION_ENABLED` is exactly `true`.
- Until the owner authorizes native cutover, public Radio participation copy continues to point to Auxchord.
- Preserve Free/Wheel alternation, backend-confirmed Priority, exact displacement/restoration, Finish-versus-Remove behavior, payment idempotency, upload cleanup, and default-off production gating.
- Do not add new providers, tiers, payment methods, or queue semantics incidentally.

## Protected boundaries

Change these only when the requested scope requires it, and test every affected consumer:

- Header and Footer navigation.
- API routes and middleware.
- Vercel cron/configuration.
- BARCODE Radio submission flow.
- Database canon/lore entries and release catalog.
- Stripe, Redis, Blob, BNL, and Source File authority boundaries.

Never expose admin notes, payment state, private identities, test sessions, or non-public Source File evidence through public or BNL read models.

## BARCODE canon and public truth

- BARCODE Radio is the weekly host-led live broadcast.
- The people, music, broadcasts, and community are real; mythology adds continuity without replacing reality.
- Do not invent releases, entities, sponsors, availability, operational status, or platform capabilities.
- If a fact is unavailable, use an honest unavailable state.

## Change discipline

- Make the smallest coherent change that fully solves the requested problem.
- Avoid unrelated copy, visual, schema, or behavior changes.
- When removing a public item, search active routes, shared content, navigation, sitemap, metadata, cards, CTAs, tests, and API/read-model consumers.
- Do not delete historical references unless the request includes historical cleanup.
- Preserve user changes already present in the worktree.

## Verification

For code or configuration changes:

```bash
npm ci
npm run check
npm run build
```

Add focused regressions for behavior changes. A final handoff must list changed files, validation performed, intentionally untouched areas, and any required deployment checks.
