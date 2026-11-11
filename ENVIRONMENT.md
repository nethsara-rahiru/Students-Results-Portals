# System environment configuration

Copy `.env.example` to `.env` on the machine running LevelUp Results. Keep `.env` private; it is excluded from Git. Never upload database credential files to GitHub.

Configure:

- `MONGODB_URI`: authenticated MongoDB Atlas connection string, with the database username/password URL-encoded. Allow the application server's IP in Atlas Network Access.
- `MONGODB_DB`: application database, default `levelup_results`.
- `SESSION_SECRET`: a unique random secret generated using `openssl rand -hex 32`.
- `STUDENT_ACCESS_MODE`: `name` for public-by-name published results, or `code` for student access codes. Name mode does not provide private student authentication.
- `NODE_ENV`: `development` locally; `production` behind an HTTPS reverse proxy.
- `HOST` / `PORT`: default `127.0.0.1:3000`.
- `TRUST_PROXY_HOPS`: number of trusted reverse proxies, normally `1` for the supplied Nginx setup. Keep the application port private.

With the application source installed, use `npm ci`, then `npm run admin:set` to provision the administrator securely, then `npm start`. `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH` are optional first-run bootstrap settings; never enter a plaintext administrator password in them.

The application is currently on `feat/levelup-results-mvp`, under review in pull request #1. This configuration commit does not merge that application into main.

If database credentials have been uploaded to GitHub, rotate the Atlas database password and update the private `.env`. Removing a file from the latest commit does not remove it from Git history. Do not reuse exposed passwords.
