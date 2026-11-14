# Delivery verification

Revalidated for the MongoDB restoration with Node 24.22.1, an isolated MongoDB process (`mongodb-memory-server`), and Playwright Chromium 158. Tests use synthetic records and do not connect to the production database.

| Check | Result |
| --- | --- |
| `npm test` | 15 API integration tests passed |
| `npm run test:e2e` | 15 Chromium tests passed |
| `npm run format:check` | Passed |
| `npm audit --omit=dev` | 0 reported vulnerabilities |

API coverage: unauthorized access, synchronizer CSRF, wrong/correct login, token rotation, secure session attributes, classes and student creation, duplicate normalized names with distinct labels, post-submission similarity suggestions, draft creation and column ordering, complete-batch validation, formula rejection, decimal marks, blank/zero/absence, audit entries, publish/unpublish, per-student results, paper reorder, optional student codes, deactivation, class isolation, maximum/date validation, database validators, Mongo session persistence, logout, lookup rate limiting, and preservation of original MVP IDs/published results during migration; distinct protected admin documents, cache controls, unknown-page handling and safe login redirects.

Browser coverage: prompt-and-textbox landing without a card/form/header/footer; Enter-key lookup with no requests while typing; profile confirmation; remembered profile; full ordered two-paper journey; spinner settling exactly on actual marks; percentage normalization; final achievement/confetti; summary; single-paper zero result; replay; reduced motion; keyboard profile selection; 390px mobile student layout; teacher sign-in; Tab navigation; multi-cell TSV paste; undo/redo; range fill; invalid edit restoration; student filtering; student and paper creation; mobile admin layout; Tab leaving the final spreadsheet cell; document navigation through all six admin pages; direct URLs, reload, Back/Forward, per-page titles/current-page links, logout protection, pending-save navigation and failure/retry handling; exact cyan/purple palette and reduced-motion background behavior; real DOM identity and transform-keyframe checks through both papers/summary/replay; skipped and interrupted motion; absence of canvas/circular/orbital artwork and WebGL requests; centered welcome with an open score display; access-code mode using the same input and the real confidential-results API; mobile high-precision marks and long titles.

Visual review: desktop welcome, teacher spreadsheet, final result and mobile welcome were captured in `docs/screenshots`. Unsupported arrow glyphs were replaced with SVG; clipping of score glow and grid keyboard exit were corrected. A migration test exposed asynchronous session index initialization at shutdown; startup now waits for store readiness. Browser tests exposed that re-entering a restored value does not emit a native change event; recovery verification uses a changed valid value.

Limits: Chromium mobile tests emulate viewport size, not physical devices. No independent penetration test, screen-reader certification, production load test, production database migration, live TLS deployment or disaster-recovery restore was performed. Multi-cell persistence and audit inserts are not one MongoDB transaction; concurrent teacher editing has no conflict resolution. See README known limitations before operating a confidential or large deployment.

GitHub Actions runs the integration/browser/format checks on push and pull request. Its remote run must be inspected separately; local passing tests do not establish that CI has finished.

## Motion/graphics review

The circular/orbital graphic has been removed. The retained motion system uses a straight underline and rectangular paper frame, with centered welcome typography and an unframed score. Tests confirm that canvas, circles, ellipses, orbital emblems and WebGL requests are absent while the reveal, summary and replay remain functional.

Updated screenshots and the preview video in `docs/recordings/student-journey.webm` use synthetic records. API/session initialization is awaited before element references are captured. All primary scene nodes persist across transitions; the rendering no longer depends on GPU/browser WebGL capabilities.

## Admin UI refresh

The admin redesign retains separate protected HTML pages and existing MongoDB APIs. Validation completed with 15 API tests, the full 16-test browser suite, and a subsequent seven-test admin run including the added performance/history/dialog check. CI runs the final 17-test browser suite. Formatting and `git diff --check` pass.

New coverage exercises directory search, activity/publication filters, empty-state recovery, keyboard dialog cancellation, normalized performance bars, searchable audit history, and mobile overflow. Existing checks continue to cover spreadsheet bulk paste, validation, undo/redo, keyboard navigation, safe pending-save navigation, session logout, and protected deep links. Screenshots use synthetic fixture data; no production records are included.

## Flexible worksheet

Validation: 21 Node tests (16 API integration tests and five formula-engine tests) and 19 browser tests. Added checks cover private workbook access, CSRF, persisted formulas, revision conflicts, bounds validation, circular/invalid/extreme references, bounded parsing, aggregates, logical functions, copy/fill anchors, row insertion/deletion with undo, column addition, TSV paste, live recalculation, reload persistence, mobile overflow, numeric-only mark persistence, and failed-save navigation/retry. Formula expressions never execute JavaScript. Screenshots use isolated MongoDB fixture data.


## Unified class marks worksheet

23 Node tests (17 API tests and six formula/reference tests) and 20 browser tests cover the updated workflow. The previous two-workspace browser cases were replaced with checks for one worksheet, protected Name/paper headers, actual mark persistence, live formula persistence/recalculation, duplicate-name class isolation, dropdown-driven auto-fill, zero marks, empty classes, class selection across reload, preselected class in row/column creation dialogs, and failed-save class-change/navigation blocking. Existing paste, fill, undo/redo, validation, keyboard exit, mobile, auth, publication and student reveal coverage remains. Reference tests explicitly reorder student and paper IDs and verify missing references produce #REF!.

A 501-student boundary test verifies that the Name class picker remains available when the all-students view exceeds the worksheet limit; selecting a small class loads normally. Playwright gracefully stops the fixture server so its temporary MongoDB data is removed.


## Expandable worksheet

26 Node tests (19 API tests and seven formula/reference tests) and 23 browser tests cover the current iteration. New coverage verifies sparse private storage beyond the previous dimensions, CSRF/auth, protection of real mark cells, large sparse aggregate ranges, cross-scope formula safety, one-click row/column growth, paste expansion with 3,000 saved cells, reload persistence, working-cell formulas feeding validated marks, a 501-student rendered window, and direct editing at row 2,000,000 / column 200,001. Large-sheet browser checks assert that fewer than 1,100 cell inputs are mounted. Existing admin and student regressions remain in the suite. Test data is isolated and synthetic; the distant-cell test creates a sparse note, not a full matrix of records.

Login-rate tests verify that successful teacher sign-ins do not consume the failed-login allowance, while ten incorrect-password attempts still trigger throttling.


## Calculated papers and point-and-click formulas

29 Node tests (20 API tests and nine formula/model tests) and 27 browser tests cover the current update. New checks validate idempotent column promotion, server-calculated averages, draft/publish/unpublish visibility, invalid-result rejection before paper creation, formula metadata privacy, stable aliases, formula-only function suggestions, keyboard completion, bare-equals cell picking, range references, formula-bar input, Escape cancellation, and editing after reopening a very large sparse worksheet. Browser coverage also checks parent-mark edits recalculating the published final result, its full student reveal/celebration through the actual result API, and Add column creating a real paper. Fixtures remain isolated and synthetic.


## No-form automatic columns

30 Node tests (20 API tests and ten formula/model tests) and 28 browser tests cover this update. Add column and spare numeric/formula columns register as draft papers without a creation dialog; headings edit inline and class assignments persist. Tests retain the published average's real student journey, function completion, clicked references, large sparse sheets, and failed-save protection. Additional checks distinguish notes/spare rows from actual result columns and recover a non-default maximum through optional settings without discarding saved inputs.
