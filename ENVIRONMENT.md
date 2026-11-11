# Static application configuration

LevelUp Results now uses GitHub Pages and Supabase. There is no Node server or MongoDB connection in the deployed site.

- `public/config.js` contains the browser-safe Supabase project URL and publishable key.
- `.env.example` documents optional public inputs for the static artifact generator. GitHub Pages does not read a runtime `.env`.
- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` GitHub repository variables can override both public settings during deployment.
- `TURNSTILE_SITE_KEY` is optional for CAPTCHA. Its secret must remain in Supabase Auth settings, never browser code.
- Never publish a database password, `sb_secret_` key or service-role key. Previously uploaded MongoDB credentials should be rotated; removing a file does not remove its history.

Complete [Supabase setup](docs/supabase-setup.md), including anonymous sign-ins, the SQL migration and teacher allowlist. Then use the GitHub Actions Pages deployment workflow. See [README](README.md) for no-Node local serving, deployment, testing and migration instructions.
