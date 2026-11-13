# Delivery verification

Revalidated for the MongoDB restoration with Node 24.22.1, an isolated MongoDB process (`mongodb-memory-server`), and Playwright Chromium 158. Tests use synthetic records and do not connect to the production database.

| Check | Result |
| --- | --- |
| `npm test` | 15 API integration tests passed |
| `npm run test:e2e` | 15 Chromium tests passed |
| `npm run format:check` | Passed |
| `npm audit --omit=dev` | 0 reported vulnerabilities |

API coverage: unauthorized access, synchronizer CSRF, wrong/correct login, token rotation, secure session attributes, classes and student creation, duplicate normalized names with distinct labels, post-submission similarity suggestions, draft creation and column ordering, complete-batch validation, formula rejection, decimal marks, blank/zero/absence, audit entries, publish/unpublish, per-student results, paper reorder, optional student codes, deactivation, class isolation, maximum/date validation, database validators, Mongo session persistence, logout, lookup rate limiting, and preservation of original MVP IDs/published results during migration; distinct protected admin documents, cache controls, unknown-page handling and safe login redirects.

Browser coverage: prompt-and-textbox landing without a card/form/header/footer; Enter-key lookup with no requests while typing; profile confirmation; remembered profile; full ordered two-paper journey; spinner settling exactly on actual marks; percentage normalization; final achievement/confetti; summary; single-paper zero result; replay; reduced motion; keyboard profile selection; 390px mobile student layout; teacher sign-in; Tab navigation; multi-cell TSV paste; undo/redo; range fill; invalid edit restoration; student filtering; student and paper creation; mobile admin layout; Tab leaving the final spreadsheet cell; document navigation through all six admin pages; direct URLs, reload, Back/Forward, per-page titles/current-page links, logout protection, pending-save navigation and failure/retry handling; exact cyan/purple palette and reduced-motion background behavior; real DOM identity and transform-keyframe checks through both papers/summary/replay; skipped and interrupted motion; detailed SVG fallback; actual WebGL shader compilation when supported; context-loss fallback; access-code mode using the same input and the real confidential-results API; mobile high-precision marks and long titles.

Visual review: desktop welcome, teacher spreadsheet, final result and mobile welcome were captured in `docs/screenshots`. Unsupported arrow glyphs were replaced with SVG; clipping of score glow and grid keyboard exit were corrected. A migration test exposed asynchronous session index initialization at shutdown; startup now waits for store readiness. Browser tests exposed that re-entering a restored value does not emit a native change event; recovery verification uses a changed valid value.

Limits: Chromium mobile tests emulate viewport size, not physical devices. No independent penetration test, screen-reader certification, production load test, production database migration, live TLS deployment or disaster-recovery restore was performed. Multi-cell persistence and audit inserts are not one MongoDB transaction; concurrent teacher editing has no conflict resolution. See README known limitations before operating a confidential or large deployment.

GitHub Actions runs the integration/browser/format checks on push and pull request. Its remote run must be inspected separately; local passing tests do not establish that CI has finished.

## Motion/graphics review

The visual reference was inspected in Chromium at its intro, hero and following scroll stage to study layered composition and persistent atmosphere. LevelUp's shaders, geometry, SVG artwork and scene transitions are original; no reference-site artwork is bundled. The student scene now retains its primary elements rather than replacing whole views. API/session initialization is awaited before tests capture element references.

The preview video (`docs/recordings/student-journey.webm`) records the real synthetic 64/100 → 42/50 journey through the final summary. Additional high-DPI screenshots show welcome, paper and summary stages. The initial minimal landing remains intact. A local variable font and vector details keep text/geometry sharp; primary movement uses transforms instead of whole-screen opacity swaps.

WebGL compilation is tested explicitly when supported, so a shader error cannot silently count as a successful GPU render. A separate test forces WebGL off and completes the reveal using SVG; another simulates context loss. Tests do not establish performance on every physical GPU or device. Hosted production data is not used by recordings or tests.
