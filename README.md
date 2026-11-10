# LevelUp Results

Gamified student results portal with a professional teacher marks-entry dashboard.

## Features
- Name lookup only after submitting; exact matches first, otherwise up to five similar names.
- Remembers selected student in browser localStorage (not secure identity verification).
- Full-screen paper-by-paper results with number spinner and a special final reveal.
- Teacher login; add students and papers; spreadsheet-style numeric entry and publication controls.
- Published marks only; ordered by paper creation order.
- Theme gradient: #768CF9 → #9577F8.

## Run locally
1. Install Node.js 20+ and MongoDB.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Generate a password hash: `node -e "import('bcryptjs').then(m=>m.default.hash('YOUR_PASSWORD',12).then(console.log))"`
5. Set `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, and `MONGODB_URI` in `.env`.
6. Run `npm start`. Student site: http://localhost:3000 ; admin: http://localhost:3000/admin

## Privacy and production warnings
**Name-only lookup does not authenticate students.** Anyone who knows or guesses a student's name may access published marks. localStorage is only a convenience, not a permanent identity lock. Obtain consent before publishing marks, and do not use this version for confidential results. Use private access codes or authenticated accounts for real privacy.

This is an initial MVP, **not production-ready**. Before deploying: replace the default in-memory session store with a persistent secure store, add CSRF protection, stronger admin audit logs, backups, accessibility testing, and comprehensive automated tests. Serve through HTTPS. Admin edits save on cell change, not full Excel formula support. No Google Sheets integration.

## Structure
- `server.js`: Express + MongoDB API
- `public/app.js`: student and teacher experiences
- `public/style.css`: design system and reveal animations

## Next milestones
1. Persistent sessions, CSRF protection, and secure identity verification.
2. Spreadsheet multi-cell copy/paste, undo, fill down, formula support, and keyboard navigation.
3. Improved animations, confetti, sound toggle, and accessibility testing.
4. End-to-end tests and production deployment.
