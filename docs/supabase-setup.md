# Connect the Supabase project

Project: `https://sduolmwattbwvjaczvgt.supabase.co`. Only its browser-safe publishable key is in `public/config.js`. No database password or service-role key is needed by GitHub Pages.

1. In **Authentication → Providers / Sign In → Anonymous**, enable anonymous sign-ins. The app uses a Supabase anonymous Auth identity for each student browser. This is an abuse-control identity, not proof of the student's real-world identity. The project's public settings showed this disabled during initial configuration.
2. In **SQL Editor**, run [the migration](../supabase/migrations/202611110001_levelup.sql) once. It creates LevelUp tables, RLS boundaries, private code/rate-limit tables, administrative functions, audit triggers and the transactional marks API. Use a dedicated project; do not apply it blindly to another application's database. Reapplying the same migration is intentionally not supported; CLI migrations track completed versions.
3. In **Authentication → Users → Add user**, create the teacher's email/password account and confirm it. Disable public email/password signups in Auth settings if your project permits anonymous sign-ins independently; otherwise the private administrator allowlist still prevents self-registration from granting teacher access. Use a strong password and the project's password/security settings.
4. Open [bootstrap-teacher.sql](../supabase/bootstrap-teacher.sql), replace the email placeholder with that account's email, and run it in SQL Editor. Creating an Auth account alone NEVER grants teacher privileges. Do not add anonymous users to the administrator allowlist.
5. In **Authentication → URL Configuration**, set Site URL to `https://nethsara-rahiru.github.io/Students-Results-Portals/`. If you later add email recovery links or another domain, explicitly allow the corresponding callback URL; this release uses email/password login without a redirect callback.
6. For production abuse resistance, configure Cloudflare Turnstile in Supabase Auth's CAPTCHA protection, register your Pages hostname with Turnstile, and put its public site key in `public/config.js` or the `TURNSTILE_SITE_KEY` GitHub repository variable. This is especially important for anonymous Auth: a caller can otherwise create new anonymous accounts to reset per-identity limits. The Turnstile secret belongs only in Supabase's CAPTCHA settings.
7. In **GitHub Settings → Pages**, choose **GitHub Actions** as the source. Merge the reviewed Supabase branch to main. The supplied Pages workflow copies only `public/` into its artifact and deploys it. The project URL and publishable key already have checked-in defaults; repository variables `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` can override both together.
8. Open the Pages URL for students and append `#admin` for teachers. Create classes/students, add draft papers, enter marks, verify, then publish. In **Access**, choose code mode for confidential marks and assign individual codes in student profiles.

## Verification after setup

- Student page should show the name form, with no suggestions before submission.
- A teacher account not in the allowlist must be refused dashboard access.
- Anonymous and regular student sessions must not read raw tables or administrative RPCs.
- Enter a draft mark, confirm it is hidden, publish and confirm only the selected student's numeric result is revealed.
- Switch Access to code, confirm an ID alone cannot fetch marks, then verify the assigned code. Resetting a code revokes existing grants immediately.
- Delete a teacher's allowlist row and confirm their next administrative operation is denied.

## Access model

All browser traffic uses HTTPS and Supabase Auth bearer tokens. No privileged key ships to the browser. The `authenticated` role covers both anonymous Auth users and signed-in teachers; every administrative RPC separately checks `levelup_private.administrators` and rejects anonymous identities. All public application tables have RLS enabled and no direct browser grants/policies. Only explicit `levelup_*` RPCs are executable by authenticated users. Private functions have fixed empty search paths and are not executable by browser roles.

Teacher tokens are persisted in browser storage by Supabase Auth, not HTTP-only cookies. CSRF based on ambient session cookies is not the authentication model here. An XSS vulnerability can steal browser tokens; the UI escapes record text and a restrictive meta CSP limits script sources. Use trusted devices and sign out after teaching. Supabase sign-out revokes refresh tokens; an already issued access JWT may remain valid until expiry. Removing the teacher allowlist row revokes application privileges immediately.

Codes are bcrypt-hashed inside PostgreSQL. An unlocked student grant is bound to the anonymous Auth UID and one profile for eight hours. Clearing browser storage creates a new identity and requires unlocking again. No ordinary student-switch button is offered.

Rate limits are atomic, shared across application instances, and keyed to Auth UID in 15-minute windows: lookup 25, code attempts 15, result reads 120. Failed code guesses still count. These are not IP limits and do not prevent bypass by creating new Auth identities. Configure Supabase's Auth rate limits, CAPTCHA and monitoring; consider gateway/WAF IP controls for a large or targeted deployment. Retain/clean anonymous accounts according to your privacy policy; Supabase does not automatically garbage-collect every anonymous user. Expired grants are excluded from access; their rows are removed when the related Auth user is removed or the code is reset.

## Backups and operational checks

Use Supabase's backup/restore facilities appropriate to your plan, plus independent encrypted PostgreSQL exports. Back up application and `levelup_private` tables, and ensure your recovery procedure preserves or recreates the correct Auth users/UIDs. Never put dumps in this repository. Test restores in a separate project. Do not assume the free plan includes the required retention, uptime or point-in-time recovery. Monitor database size, audit growth, Auth anonymous-user counts and failed operations.

The SQL schema has stable text identifiers, UUID defaults, foreign keys and unique per-student/per-paper marks. Old MongoDB ObjectIds remain valid during import. All administrative changes are serialized within a transaction; row-trigger audit events and the marks themselves commit or roll back together. Concurrent valid edits still use last-write-wins; there is no visual edit-conflict UI.
