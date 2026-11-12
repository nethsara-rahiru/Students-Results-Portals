# Delivery verification

Revalidated for the MongoDB restoration with Node 24.22.1, an isolated MongoDB process (`mongodb-memory-server`), and Playwright Chromium 158. Tests use synthetic records and do not connect to the production database.

| Check | Result |
| --- | --- |
| `npm test` | 14 API integration tests passed |
| `npm run test:e2e` | 5 Chromium tests passed |
| `npm run format:check` | Passed |
| `npm audit --omit=dev` | 0 reported vulnerabilities |

API coverage: unauthorized access, synchronizer CSRF, wrong/correct login, token rotation, secure session attributes, classes and student creation, duplicate normalized names with distinct labels, post-submission similarity suggestions, draft creation and column ordering, complete-batch validation, formula rejection, decimal marks, blank/zero/absence, audit entries, publish/unpublish, per-student results, paper reorder, optional student codes, deactivation, class isolation, maximum/date validation, database validators, Mongo session persistence, logout, lookup rate limiting, and preservation of original MVP IDs/published results during migration.

Browser coverage: no lookup requests while typing; profile confirmation; remembered profile; full ordered two-paper journey; spinner settling exactly on actual marks; percentage normalization; final achievement/confetti; summary; single-paper zero result; replay; reduced motion; keyboard profile selection; 390px mobile student layout; teacher sign-in; Tab navigation; multi-cell TSV paste; undo/redo; range fill; invalid edit restoration; student filtering; student and paper creation; mobile admin layout; Tab leaving the final spreadsheet cell.

Visual review: desktop welcome, teacher spreadsheet, final result and mobile welcome were captured in `docs/screenshots`. Unsupported arrow glyphs were replaced with SVG; clipping of score glow and grid keyboard exit were corrected. A migration test exposed asynchronous session index initialization at shutdown; startup now waits for store readiness. Browser tests exposed that re-entering a restored value does not emit a native change event; recovery verification uses a changed valid value.

Limits: Chromium mobile tests emulate viewport size, not physical devices. No independent penetration test, screen-reader certification, production load test, production database migration, live TLS deployment or disaster-recovery restore was performed. Multi-cell persistence and audit inserts are not one MongoDB transaction; concurrent teacher editing has no conflict resolution. See README known limitations before operating a confidential or large deployment.

GitHub Actions runs the integration/browser/format checks on push and pull request. Its remote run must be inspected separately; local passing tests do not establish that CI has finished.
