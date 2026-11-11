# Supabase / static architecture

The original Express/MongoDB implementation is retained on the original development branch. This branch replaces its production backend while preserving the vanilla UI, native spreadsheet and animation modules. Only `public/` is deployed to GitHub Pages. Relative assets and `#admin` navigation work at a repository subpath without rewrite rules.

`public/backend.js` adapts the existing UI actions to Supabase Auth and bounded PostgreSQL RPCs, using the locally bundled official SDK. Project URL/publishable key are public; no service-role or database credential is used by the browser. Student browsers obtain anonymous Auth sessions, while teachers sign in with email/password and must also exist in a private administrator allowlist.

The SQL migration is authoritative. Public data tables have RLS and no direct browser permissions. Security-definer entrypoints use fixed search paths; private helpers/code hashes/rate limits are not exposed. Student result RPCs read a single active profile's published, class-appropriate numeric marks. Optional eight-hour access-code grants bind Auth UID to one student profile. Name mode intentionally permits published results by name.

SQL transactions serialize administrative edits; marks and audit triggers commit/roll back atomically. Server-side constraints validate all data, including pastes. This improves on the previous non-transactional MongoDB batch/audit path. Concurrent valid changes remain last-write-wins.

Development tools start isolated native PostgreSQL. Tests provide Auth claims/roles and a test-only HTTP Auth/PostgREST transport; that transport is never deployed. Hosted Supabase configuration must be checked separately. The optional Python converter imports legacy MongoDB JSON while preserving text IDs; the database is never contacted automatically.
