# Preserve existing MongoDB data

The old Node/MongoDB implementation remains in `feat/levelup-results-mvp` and Git history. This Supabase branch never connects to, deletes or alters that database. Supabase starts empty until you create or import records. MongoDB administrator passwords/sessions are not imported: provision new teachers with Supabase Auth and the private allowlist.

1. Back up MongoDB and stop editing marks during migration. Keep the old application available for rollback, but do not accept writes in both systems.
2. Export `students`, `papers`, `marks`, and optionally `classes` and `auditLogs` using MongoDB Database Tools. Use a protected Database Tools config for the URI/password instead of command-line secrets. Save each collection as `<collection>.json` in a private `mongo-export/` directory. JSON arrays and newline-delimited Extended JSON are accepted. Do not commit these files.
3. Apply the Supabase schema in a new project. Generate import SQL locally with Python 3 (no npm/Node required):

   ```bash
   python3 scripts/convert-mongo-export.py mongo-export --output mongo-export/import.sql
   ```

4. Review the private SQL. Import it with the Supabase SQL editor for small datasets or a secure PostgreSQL client connection for larger datasets. The file contains confidential records; do not share or commit it. It uses one transaction and refuses existing-ID collisions, rather than overwriting destination records.
5. Compare student/paper/mark counts, blank vs zero vs absence, class assignments, paper order and publication state. Existing MongoDB ObjectId strings remain unchanged. Duplicate legacy names lacking unique labels receive an explicit imported-profile label containing their stable ID; teachers should replace it with a helpful non-sensitive label.
6. By default, old access-code hashes are excluded; set fresh codes in the teacher dashboard. The optional `--include-access-codes` flag copies compatible bcrypt hashes if you have a reviewed need to preserve codes. Never migrate plaintext codes. Keep code mode disabled from public use until codes have been assigned and tested.
7. Create Supabase teacher accounts, grant their allowlist entries, test access/publication in the new portal, then announce the new URL. Retain encrypted MongoDB backups according to your policy. Do not leave old published results unintentionally accessible after switching.

Auth identities and anonymous-student grants belong to the new Supabase project. Stored student profile IDs survive the import; the browser will still need a new Supabase session, and code mode requires unlocking again. Historic audit events are imported as legacy events, retaining their old IDs inside `changes`. New import row triggers also record the import operation. Database exports and service credentials must never enter the Pages artifact.
