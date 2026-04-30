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
