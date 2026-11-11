# LevelUp Results — GitHub Pages + Supabase

A student results portal and teacher marks workspace built with **vanilla HTML, CSS and JavaScript**. GitHub Pages serves static files; Supabase supplies authentication and PostgreSQL. **No Node.js server, Express, MongoDB, Edge Function or paid VPS is required at runtime.** Node is optional development tooling for tests and refreshing the checked-in browser SDK.

![Student welcome](docs/screenshots/welcome.png)

## Connect and launch

The browser-safe project URL and publishable key supplied for this project are configured in [`public/config.js`](public/config.js). These are public API settings, not database credentials. A private key, service-role key or database password must never appear in this file or in a Pages artifact.

Complete [Supabase setup](docs/supabase-setup.md):

1. **Enable anonymous sign-ins** in Supabase Authentication. Students use anonymous Auth sessions so access grants and rate limits have a server-verified identity. This does not authenticate a student's real-world identity.
2. Run [`supabase/migrations/202611110001_levelup.sql`](supabase/migrations/202611110001_levelup.sql) once in the project's SQL Editor.
3. Create a confirmed teacher email/password user in **Authentication → Users**, then edit and run [`supabase/bootstrap-teacher.sql`](supabase/bootstrap-teacher.sql) with that email. No account becomes a teacher automatically.
4. In GitHub **Settings → Pages**, select **GitHub Actions**. After the reviewed Supabase branch is merged to `main`, the Pages workflow deploys the static site. Its deployment step uses Python and GitHub's Pages actions, with no npm build or application server.
5. Open `https://nethsara-rahiru.github.io/Students-Results-Portals/` for students and append **`#admin`** for teachers. GitHub Pages does not support the old Express `/admin` route; the hash route works on page refresh and under a repository subpath.

An empty Supabase project is not configured simply by supplying its public URL/key. The schema, anonymous provider and teacher allowlist must also be set up. As of the initial live settings check, email authentication was enabled and anonymous sign-ins were disabled. No hosted teacher account or database migration is claimed verified until project setup is complete.

### Run locally without Node

With Python 3 installed:

```bash
python3 -m http.server 3000 --directory public
```

Open `http://localhost:3000/` and `http://localhost:3000/#admin`. The frontend connects to the configured Supabase project. No `.env` loader or database connection string runs in the browser. `.env.example` contains optional public **build inputs** only; a runtime `.env` file cannot be used by GitHub Pages.

### Static deployment configuration

`public/` is the complete deployable website, including a checked-in Supabase browser SDK. All asset URLs are relative, and navigation uses `#admin` for project-path compatibility. The Pages workflow copies **only** this directory into `dist/`, adds `.nojekyll`, and uploads it. It never includes the SQL migration, database export, tests, private `.env` or development server.

Optional GitHub repository variables `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` override the checked-in public configuration when both are provided. `TURNSTILE_SITE_KEY` configures the optional public CAPTCHA site key. Secret/service-role keys are rejected by the browser validation and the deployment generator. To test artifact generation:

```bash
python3 scripts/prepare-pages.py
python3 -m http.server 3000 --directory dist
```

If using a custom Supabase domain, adjust the `connect-src` allowlist in the HTML meta CSP. GitHub Pages does not provide application-controlled HTTP headers; the meta CSP supplies the available browser-side policy but is not a substitute for database permissions.

## Teacher workflow

- Sign in with your **Supabase teacher email/password**. Create classes; add, edit or deactivate students; assign non-sensitive profile labels to distinguish duplicate names.
- Create papers with subject, grade, date, maximum and optional class. New papers default to **draft** and immediately add spreadsheet columns. **Papers → Move left** changes both spreadsheet and reveal order.
- Enter marks in **Marks**. **Blank** means no result, **0** is a valid zero, and **A** represents absence. Numeric marks support up to two decimal places. The status line reports saving, success and errors.
- Select cells with click, Shift-click or Shift+arrows. Navigate with arrows/Tab/Enter; copy/paste Excel TSV; fill down with the button or Ctrl/⌘+D; Delete clears values; Undo/Redo uses buttons or Ctrl/⌘+Z. The student-name column and headers remain frozen while scrolling. Search, class filtering and name sorting are provided.
- Selection calculations show **SUM, AVERAGE, MAX, MIN, COUNT**. These are local summaries; formulas are never evaluated or stored as marks. Batch saves are limited to **2,000 cells**. A failed batch rolls back every mark and audit entry in the transaction.
- Verify results, then explicitly choose **published** in a paper's editor. **draft** and **unpublished** papers are never included in student results. Editing a published mark changes the visible result immediately; unpublish before making private corrections.
- **Performance** normalizes scores as percentages. **History** shows the latest 200 audit events with previous/new values; older events remain in PostgreSQL. **Access** lets teachers choose name mode or access-code mode.

## Student experience and privacy

Name lookup happens only on form submission, never while typing. Exact matching ignores case and unnecessary whitespace; otherwise up to five similar names are returned using PostgreSQL trigram matching. Duplicate names remain separate profiles with stable internal IDs and distinct labels/classes. Teachers should help students resolve ambiguity before selection.

The confirmed profile ID is remembered in `localStorage`, with no ordinary account-switch button. Browser storage is a convenience, not an identity lock. Clearing it creates a new browser identity; shared-device operators should clear site data between users.

**Name mode is publicly accessible by name.** Anyone who knows or guesses a profile can view its published numeric results. Anonymous Supabase Auth sessions do not change that privacy limitation. Use name mode only with consent for results approved for sharing.

For confidential results, teachers select **Access → Student access code required** and assign distinct random codes in student profiles. Prefer 16+ random characters; the accepted range is 8–64 characters, within bcrypt's 72-byte input limit. Codes are hashed in PostgreSQL and never returned through the API. A successful unlock grants only that profile to the current Auth identity for eight hours. Changing the code revokes previous grants immediately. Distribute/reset codes outside the application. Roster suggestions remain visible, so deployments requiring confidential roster membership need a stronger student-login design.

Students click each paper to reveal their result, one full-screen paper at a time in spreadsheet order. Vertical digits decelerate to the exact mark. The final paper receives the largest light/achievement/confetti treatment, with replay and all-results actions. Blank and absent results are skipped; zero is revealed. Improvement statements compare normalized percentages with the previous paper and never claim an unsupported personal best. Reduced-motion preferences remove rolling transitions/confetti, and Skip animation is available.

## Security and database design

The schema contains students, classes, papers, marks and audit logs, plus a private teacher allowlist, hashed codes, access grants, settings and shared rate-limit buckets. Stable text IDs accept both UUIDs and legacy MongoDB ObjectIds. Foreign keys, unique mark pairs, unique profile labels within a name/class, validation constraints and indexes protect integrity.

All application tables have **Row Level Security enabled**, with direct browser table access revoked. Public API access is restricted to explicitly granted `levelup_*` RPC functions. Administrative functions check the private allowlist and reject anonymous Auth identities. Function search paths are fixed; helpers and code hashes live in a private schema. A regular registered user cannot self-assign teacher access.

All administrative edits use transaction-scoped serialization. Mark batches and row-trigger audits commit together, including old/new values. Invalid types, formulas, out-of-range scores, incompatible classes and paper maximum reductions are rejected by PostgreSQL. Concurrent valid edits still use last-write-wins; the UI has no visual conflict resolver.

Authentication uses Supabase bearer tokens, persisted by the SDK in browser storage. It does **not** use the old Express HTTP-only cookie sessions or cookie-based CSRF protection. Escaped record text, a meta CSP and local bundled scripts reduce XSS exposure; browser tokens can still be stolen if untrusted script runs. Sign out on shared teacher devices. Supabase's Auth logs cover login events; application audit logs cover data changes. Removing a teacher allowlist entry blocks their next administrative request immediately, even if an access JWT has not expired.

Shared database rate limits apply per Auth UID in 15-minute windows: **25 lookups, 15 code attempts, 120 result reads**. Failed code attempts count. A new anonymous account can bypass per-identity limits, so production should enable **Supabase Auth CAPTCHA/rate limits** and monitor anonymous account creation. Optional Turnstile support is implemented for both anonymous and teacher sign-in. Its secret belongs only in Supabase's settings; only the site key is public. See [setup/security guidance](docs/supabase-setup.md) for details, anonymous-user cleanup and backups.

## Migrate existing MongoDB data

The original application remains on `feat/levelup-results-mvp`. This branch does not delete or connect to that database. The offline [migration guide](docs/mongodb-migration.md) and Python converter preserve student/paper IDs, marks, ordering and publication from MongoDB exports:

```bash
python3 scripts/convert-mongo-export.py mongo-export --output mongo-export/import.sql
```

The output is confidential and created with owner-only permissions. It imports in one transaction and refuses collisions rather than overwriting existing destination data. Old administrator passwords/sessions are not copied; provision teachers in Supabase Auth. Back up and verify all data before switching portals.

## Development and verification

Optional tooling requires Node 22+ (24 recommended), Python 3 and npm. It is **not** needed on GitHub Pages:

```bash
npm ci
npm test
npx playwright install chromium
npm run test:e2e
npm run format:check
npm audit
```

The database suite starts a real isolated PostgreSQL process and applies the production SQL migration. It stubs only Supabase's Auth schema/JWT context. Browser tests serve static files at `/Students-Results-Portals/`, use the real bundled SDK and execute database RPCs against that PostgreSQL instance through a test-only Auth/PostgREST transport. They do not write to your hosted Supabase project.

Verified coverage includes teacher allowlist/RLS boundaries, exact/similar lookup, duplicate names, atomic invalid batches, zero/blank/absence, codes and reset/revocation, rate limiting, ordering, publish/unpublish, legacy import, browser authentication, spreadsheet interactions, single/multiple reveals, exact spinner completion, final celebration, reduced motion and mobile/keyboard layouts. See [verification report](docs/testing.md) and [screenshots](docs/screenshots/).

The SDK is checked in so no CDN, bundler or Node runtime is needed to serve the site. After updating `@supabase/supabase-js`, regenerate it with `npm run vendor:build`, retain licensing notices, and rerun tests. GitHub Actions runs the tests on pushes/PRs; the separate Pages workflow deploys main.

## Remaining limits

- Name mode is not confidential authentication. Code mode is shared-secret access without student MFA, automatic recovery or private roster membership.
- Hosted Auth configuration, schema application and teacher creation require project-owner setup. Public project settings alone cannot prove a teacher's account/allowlist is correct.
- No real data was migrated automatically. Do not publish until teachers verify imported marks and consent/access settings.
- Undo history belongs to the current grid and resets on rebuilding it. No full Excel formula language, workbook upload/download or offline editing is provided. Very large grids are not virtualized; the lookup API caps exact results at 30 and similar results at five.
- Per-UID limits are not an IP firewall. Configure CAPTCHA, Auth rate limits and monitoring. Anonymous accounts, audit logs and database growth need operational maintenance.
- Email delivery, password recovery UI and backup scheduling are not included. Use the Supabase dashboard/provider facilities and a tested backup plan appropriate to your paid/free plan.
- Browser coverage uses Chromium with mobile viewport emulation, not every physical device/browser. No independent penetration test or formal accessibility certification is claimed.
