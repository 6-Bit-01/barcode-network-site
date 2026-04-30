# BARCODE Network Site — Agent Instructions

## Source of truth

- main is the stable live branch.
- Do not push directly to main.
- All changes must be made on a branch and submitted as a pull request.
- Keep pull requests small and scoped.

## Do not restore removed features

- Do not create, restore, or reactivate /queue routes.
- Do not add AI Stream Queue pages, payments, queue tiers, or 24/7 AI stream features unless explicitly requested.
- Archived queue files under _archive/ are reference only and should not be moved into src/app/.

## Protected content

Do not modify these unless explicitly requested:

- Header navigation
- Footer navigation
- API routes
- Middleware
- Vercel config
- Database canon/lore entries
- Release catalog
- BARCODE Radio submission flow

## BARCODE canon

- BARCODE Radio is the weekly live broadcast.
- Submissions go through Auxchord.
- Do not invent new lore, mechanics, releases, entities, sponsors, or platform features.
- If a detail is missing, leave it unchanged instead of making something up.

## Change discipline

- Make only the requested change.
- Do not perform broad cleanup unless requested, and a specific plan is established. 
- Do not rewrite unrelated copy.
- Do not rename files or reorganize folders unless explicitly requested.
- Before finishing, summarize exactly which files changed and why.

## Removal tasks

When asked to remove a page, entry, article, route, feature, or public-facing item:

- Search the repo for all active references before editing.
- Check page routes under `src/app/`.
- Check shared content/data files such as `src/content.ts`.
- Check navigation components such as Header and Footer only if the removed item may be linked there.
- Check sitemap and metadata files.
- Check imports, cards, lists, indexes, and related CTAs.
- Remove only active/public references unless explicitly asked to remove archived materials.
- Do not delete archived/reference materials under `_archive/` unless explicitly requested.
- After finishing, list every reference found and whether it was removed, left alone, or already inactive.

## Scope interpretation

- If a task says "remove from [specific page]," remove it from that page only, unless the user also says to scrub all references.
- If a task says "remove from the site," "scrub," "delete everywhere," or "remove all traces," search and clean all active references.
- If unclear, make the smallest safe change and report what related references still exist.

## Routing safety

- Do not create new public routes under `src/app/` unless explicitly requested.
- Do not restore deleted routes from `_archive/`.
- Do not move archived files back into active app routes unless explicitly requested.
- Before adding or removing a route, check whether it affects Header, Footer, sitemap, metadata, or internal links.

## Verification checklist

Before finishing any task, verify:

- The changed files match the requested scope.
- No unrelated copy was rewritten.
- No removed feature was restored.
- No new route was created accidentally.
- The app builds or type-checks if the task touched code.
- The final response includes changed files and a short reason for each.

## PR summary format

At the end of every task, summarize:

- Files changed
- What changed
- Why it changed
- Anything intentionally left untouched
- Any follow-up risks or manual checks needed
