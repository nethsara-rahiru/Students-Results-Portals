# Supabase delivery verification

Testing uses Node 24, Python 3, an isolated native PostgreSQL 18 instance and Chromium. Production has no Node runtime. Test records are synthetic and never written to the configured Supabase project.

| Check | Scope |
| --- | --- |
| `npm test` | **15 passed** — PostgreSQL migration/RPC security, validation and import tests |
| `npm run test:e2e` | **8 passed** — static project-path UI with the bundled Supabase SDK and real local SQL functions |
| `npm run format:check` | Passed — first-party JavaScript/CSS/HTML formatting |
| `npm audit` | 0 reported vulnerabilities across all development/tooling dependencies |
| `python3 scripts/prepare-pages.py` | Passed — static-only deployment artifact, no runtime server/credentials |

The database suite verifies configuration rejects privileged browser keys; anon/student/regular accounts cannot access teacher RPCs or raw tables; allowlist revocation takes effect immediately; exact and typo lookup are bounded; duplicate names use stable IDs/labels; paper validation and ordering work; invalid batches roll back ALL marks and audit entries; zero, decimals, blanks and absence remain distinct; publishing/unpublishing and classes limit student results; access-code grants bind to user/profile and are revoked on reset; null/invalid codes fail; failed code guesses still count toward rate limits; lookup limits persist; legacy MongoDB IDs and safely escaped JSON imports work; security-definer functions have fixed paths and no PUBLIC/anon execution.

Browser coverage includes no lookup while typing; confirmation and remembered profile; two-paper ordered reveal, exact spinner completion, normalized comparison, final achievement/confetti and summary; a single zero mark, replay and reduced motion; keyboard selection and mobile student layout; teacher email/password sign-in; grid navigation, TSV paste, undo/redo, range fill, invalid edit restoration, search, student/paper creation; mobile teacher layout and Tab exiting the grid; wrong credentials; missing configuration feedback; and teacher-controlled code mode with wrong/correct student codes.

A test-fixture startup issue from stale shared Unix socket locks was fixed by assigning each temporary PostgreSQL cluster its own socket directory. The SQL access-code function was explicitly tested to reject NULL codes; failed guesses return a value so their rate-limit writes commit instead of rolling back with an exception.

The local Auth/PostgREST transport is a test harness, not proof that hosted Supabase Auth has been configured. Live public settings initially confirmed email/password enabled and anonymous sign-ins disabled. Hosted schema/teacher-account setup must be completed and verified separately before publishing. CAPTCHA requires external provider setup and was not solved automatically in tests. No live MongoDB data migration, hosted backup restoration, load test, independent penetration test or formal accessibility certification is claimed.

Screenshots in `docs/screenshots/` show synthetic students and the current static application. CI runs PostgreSQL/browser/format checks on push and pull request. The Pages deployment workflow is separate and only deploys main or a manually selected revision after GitHub Pages is enabled.
