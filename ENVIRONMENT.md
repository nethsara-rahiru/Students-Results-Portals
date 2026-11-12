# MongoDB application configuration

The active application uses Node.js, Express and MongoDB again. The Supabase edition remains in Git history and on `feat/supabase-github-pages`; no Supabase project or data is deleted by this change.

1. Copy `.env.example` to `.env` on the application server.
2. Set `MONGODB_URI` and `MONGODB_DB` for your MongoDB database.
3. Set `SESSION_SECRET` to a new random value from `openssl rand -hex 32`.
4. Run `npm ci`, then `npm run admin:set` to create/reset the administrator securely.
5. Run `npm start`; students use `/` and teachers use `/admin`.

Keep `.env` private and uncommitted. Previously uploaded database credentials must be rotated before reuse. `ADMIN_PASSWORD_HASH` is an optional first-run bootstrap hash, not a plaintext password. Choose `STUDENT_ACCESS_MODE=code` when published marks require confidential access.

For production use an HTTPS Node host/VPS and an authenticated private MongoDB connection. GitHub Pages cannot run this backend; the static Supabase Pages workflow has been removed. An existing Pages deployment is not a deployment of this restored application. See README for setup, tests, Nginx/systemd configuration, backups and limitations.

Existing MongoDB records are not rewritten by this code restoration. Any results entered in Supabase since switching are not automatically copied back; export/reconcile them separately before accepting live writes in MongoDB.
