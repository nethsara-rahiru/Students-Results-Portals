# Repository audit and architecture

The existing branch contains an Express/MongoDB MVP and vanilla browser client. Its name normalization, stable ObjectIds, unique mark index, explicit publication, and single-paper reveal are retained. Missing persistent sessions, CSRF, complete validation, audit history, class management, spreadsheet batching and tests are addressed in this iteration.

The server exposes a factory for isolated integration testing. MongoDB holds students, classes, papers, marks, administrators, auditLogs and sessions. Administrative writes require both an authenticated session and a synchronizer CSRF token. Student result authorization is either explicitly public name-based access or a student-bound session established using an access code. Every result query filters published papers and a single student. Sheet edits validate complete batches before writing; audit records preserve prior/new values. Client formulas calculate only selections and never enter stored marks.

The browser uses a native input grid with range selection, clipboard TSV, undo/redo and keyboard navigation. A shared ordered paper list drives both spreadsheet and reveal. Blank, absent and numeric zero are distinct.

## Independent teacher documents

Each administrator section is served from its own template in `views/admin/`: login, marks, students, papers, classes, performance and history. Normal links cause document navigation to `/admin/<section>`; there is no tab switcher or client-side history router. Express validates page names, protects HTML routes with the session, preserves safe local login destinations and sends `Cache-Control: no-store`. The existing JSON APIs retain their authentication and CSRF checks.

The student module (`public/app.js`) and teacher module (`public/admin.js`) share CSRF-aware requests and common UI helpers in `public/client.js`. Admin forms reload their current document after successful writes. Spreadsheet navigation waits for pending saves, and browser reload/close warns while marks are unsaved. Returning from a cached admin document triggers a fresh authorization check.

CSS theme tokens define the cyan/purple gradient and accessible lighter accents. Noninteractive, clipped, composited background layers animate slowly behind the content, and CSS reduced-motion rules stop their motion.
