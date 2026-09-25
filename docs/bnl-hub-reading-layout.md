# BNL Hub reading layout

Item 7 replaces the repeated introductory explanation below the hero with the
latest public Journal preview next to the recent Relay history. The preview
shows the existing publication date, kind, title and excerpt, with one link to
the full entry. The existing Journal page still renders every section. Up to
four earlier entries form a compact responsive row below. Ballad discovery,
Discord, Radio, Terminal and dossier navigation remain available.

The same governed public Journal and Relay readers supply this layout; no new
request, poll, content store or publication logic is introduced. An unavailable
Journal is distinct from an empty archive, and a Relay outage is independent.
The existing Relay history retains its twenty-entry bound and keyboard-scrollable
region. Narrow screens put the Journal preview before the Relay history.

Verification: npm ci, npm run check (1,355 Node tests and 20 after-show fixtures,
typecheck, lint with zero errors and 37 existing warnings), npm run build, and
git diff --check. Static-render browser layout fixtures passed normal/empty/
unavailable states at 1440, 390 and 320 pixels with no horizontal overflow;
entry links, bounded Relay history and responsive order were checked. Desktop
and phone screenshots were inspected. These are layout checks, not acceptance
of generated prose or runtime bot deployment.

Normal website deployment only. No VPS restart, environment setting or migration
is required. Queue, payments, host playback, BNL generation and automation are
unchanged. Radio remains Archive-only with no Deck link. This is a bounded item-7
improvement; it does not declare every presentation opportunity complete.
