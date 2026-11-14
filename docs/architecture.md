# Repository audit and architecture

The existing branch contains an Express/MongoDB MVP and vanilla browser client. Its name normalization, stable ObjectIds, unique mark index, explicit publication, and single-paper reveal are retained. Missing persistent sessions, CSRF, complete validation, audit history, class management, spreadsheet batching and tests are addressed in this iteration.

The server exposes a factory for isolated integration testing. MongoDB holds students, classes, papers, marks, administrators, auditLogs and sessions. Administrative writes require both an authenticated session and a synchronizer CSRF token. Student result authorization is either explicitly public name-based access or a student-bound session established using an access code. Every result query filters published papers and a single student. Sheet edits validate complete batches before writing; audit records preserve prior/new values. Formula results are validated numeric mark values; optional formula text and stable student/paper reference bindings are stored as metadata on mark documents. Public result APIs return only numeric published marks, never formula metadata.

The browser uses a native input grid with range selection, clipboard TSV, undo/redo and keyboard navigation. A shared ordered paper list drives both spreadsheet and reveal. Blank, absent and numeric zero are distinct.

## Independent teacher documents

Each administrator section is served from its own template in `views/admin/`: login, marks, students, papers, classes, performance and history. Normal links cause document navigation to `/admin/<section>`; there is no tab switcher or client-side history router. Express validates page names, protects HTML routes with the session, preserves safe local login destinations and sends `Cache-Control: no-store`. The existing JSON APIs retain their authentication and CSRF checks.

The student module (`public/app.js`) and teacher module (`public/admin.js`) share CSRF-aware requests and common UI helpers in `public/client.js`. Admin forms reload their current document after successful writes. Spreadsheet navigation waits for pending saves, and browser reload/close warns while marks are unsaved. Returning from a cached admin document triggers a fresh authorization check.

CSS theme tokens define the cyan/purple gradient and accessible lighter accents. Noninteractive, clipped, composited background layers animate slowly behind the content, and CSS reduced-motion rules stop their motion.

## Persistent student motion system

`StudentJourney` mounts one scene and retains the graphic, title, input, score host and controls across all student phases. The input changes mode for access-code verification and is cleared after successful verification. A measured layout accommodates narrow screens, long names/titles, decimals and the 10000-mark maximum. FLIP Web Animations transform the real DOM nodes from their old bounds to the next layout; no route or shell replacement is used inside the student flow.

`JourneyAccent` interpolates a straight SVG underline into the rectangular paper frame and back. The orbital/circular artwork and WebGL renderer are removed. A centered welcome and unframed score keep the focus on the student and marks, while the same scene nodes and transform transitions remain. The bundled variable font is local and licensed.

Score reels start during the graphic morph, are reused on subsequent papers, settle at the exact database value, and expose a cancellable completion handle. Skip/reduced-motion changes are coordinated with layout completion so an old callback cannot reveal the wrong paper or duplicate a celebration. Summary/replay reuse the same scene. All authentication, publication and ordering decisions remain in the existing MongoDB APIs.


## Unified class worksheet

`marks-workbook.js` derives the single visible worksheet from active student IDs, ordered paper IDs and actual mark documents. Row 1 and column A are protected identity/metadata cells. The Name header owns a class dropdown; changing class rebuilds the roster and applicable papers after waiting for pending saves. Class-specific paper cells are read-only for incompatible students in the all-students view. New row/column actions use existing student/paper dialogs and default to the selected class.

`workbook.js` provides the formula bar, selection, clipboard, fill and history. Its configured save adapter evaluates mark cells, validates the entire recalculated set locally, and sends changed marks to the existing server-validated marks API. Formula text is optional data, not executable code. `worksheet-references.js` binds cell references to student/paper IDs and rebases their display coordinates when rows or columns move. Missing references report errors rather than silently pointing at another student. Marks keep existing last-write-wins behavior; recalculation occurs in the open worksheet on edits, not as a server background job.

Standalone workbooks from the previous UI remain preserved in their MongoDB collection/API. They are not merged into real marks implicitly. The old separate marks grid and worksheet tabs are no longer mounted.


## Expandable sparse working area

The active marks worksheet has no fixed dimensions or total-cell ceiling. The real roster and ordered papers occupy protected identity cells and validated mark cells. Additional working rows/columns are class-scoped sparse data in `worksheetCells` (unique scope/rowKey/columnKey index), with dimensions in `worksheetSpaces`. Stable real IDs and extra-row/column offsets preserve working notes and formula references when students or papers are added. The saved formula binding includes the original class scope so filtering cannot silently substitute another view's working values.

The client renders a scrolling window with pinned names and headers, proportional scroll spacers for very large dimensions, and an address box for direct navigation/expansion. No Cartesian student-by-paper loop is needed to construct a sparse worksheet. Autosave validates recalculated real marks first, then writes changed real marks and private working cells in byte-aware batches. Completed batches update the client baseline so retry sends remaining changes. No cross-request transaction is claimed. Working-data APIs require admin authentication and CSRF and cannot overwrite actual student/mark cells. Formula ranges iterate stored values instead of millions of empty coordinates. Formula complexity safeguards and request limits remain independent of grid dimensions.


## Calculated paper columns and formula entry

Add column now uses the real paper-creation workflow. Private scratch columns are explicitly Add working column. A working header can be promoted through the protected `/api/admin/worksheet-paper` endpoint. The server rebuilds the class worksheet from stored marks, working values and stable bindings, evaluates the selected column with the restricted interpreter, and validates every numeric result before creating a paper. A unique source scope/column index makes repeated conversion requests idempotent. Imports are kept draft while results are written and audited; publication is set only after successful completion. This uses the same nontransactional MongoDB deployment model as other marks writes, so a database failure can leave a draft import for retry.

`worksheet-model.js` is shared by server and browser. Promoted source slots alias their new paper IDs, preserving older formula references, working-row notes, and worksheet dimensions without a duplicate source column. Paper records retain source metadata through ordinary metadata/publication edits.

`formula-entry.js` manages a draft independently of saved cells. Function suggestions are formula-only and support keyboard selection. Pointer selection inserts references/ranges while preventing blur/autosave; Escape restores the original value. Scrolling a virtualized editor moves the draft to the formula bar. Evaluation and publication remain separate from editor completion. Student name entry is unchanged and still provides no suggestions while typing.
