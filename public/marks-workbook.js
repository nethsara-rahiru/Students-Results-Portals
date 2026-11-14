import { worksheetModel, automaticPaperColumns } from "./worksheet-model.js";
import { api, notify } from "./client.js";
import { mountWorkbook } from "./workbook.js";
import { calculator, columnName, coordinates } from "./formulas.js";
import { bindingsFor, rebaseFormula } from "./worksheet-references.js";
export async function mountMarksWorkbook(
  host,
  data,
  { addStudent, addPaper } = {},
) {
  let controller,
    loading = false;
  const available = new Set([
    "",
    "unassigned",
    ...data.classes.map((c) => c._id),
  ]);
  let classId = sessionStorage.getItem("levelup-admin-class") || "";
  if (!available.has(classId)) classId = "";
  async function load(next = classId) {
    if (loading) return;
    document.activeElement?.blur();
    if (controller?.hasUnsavedChanges() && !(await controller.whenIdle())) {
      notify("Please retry saving your worksheet before changing class.");
      return false;
    }
    loading = true;
    try {
      const scope = next || "all",
        space = await api("/admin/worksheet-space/" + scope);
      const model = worksheetModel(data, space, scope);
      const {
        students,
        papers,
        studentRows,
        paperColumns,
        rowKey,
        columnKey,
        rowFor,
        columnFor,
        isMark,
        state,
        slotForIndex,
      } = model;
      const markMap = new Map(
        data.marks.map((m) => [m.studentId + ":" + m.paperId, m]),
      );
      const extraMap = new Map(
        space.cells.map((cell) => [cell.rowKey + ":" + cell.columnKey, cell]),
      );
      const recoverableColumns = new Set();
      const editable = (r, c) => {
        if (c === 0 && r <= students.length) return false;
        return (
          !isMark(r, c) ||
          !papers[c - 1].classId ||
          papers[c - 1].classId === students[r - 1].classId
        );
      };
      controller = await mountWorkbook(host, data, {
        state,
        editable,
        expandable: true,
        studentCount: students.length,
        paperCount: papers.length,
        caption: `${next === "unassigned" ? "Students without a class" : data.classes.find((cls) => cls._id === next)?.name || "All students"} · ${students.length} students · ${papers.length} papers · Working rows and columns grow as needed`,
        addStudent: () => addStudent?.(next === "unassigned" ? "" : next),
        addPaper: () => addPaper?.(next === "unassigned" ? "" : next),
        canConvert: (c) => c > 0,
        convertColumn: (c, name) => {
          const paper = papers[c - 1];
          if (paper && paper.worksheetImportComplete !== false) {
            addPaper?.(next === "unassigned" ? "" : next, { paper });
            return;
          }
          const source = paper?.worksheetSource;
          addPaper?.(next === "unassigned" ? "" : next, {
            scope: source?.scope || scope,
            columnKey: source?.columnKey || columnKey(c),
            name: paper?.name || name || "Final marks",
            max: paper?.max || 100,
            recoverable: recoverableColumns.has(
              source?.columnKey || columnKey(c),
            ),
          });
        },
        nextColumn: (workbook) => {
          const used = new Set(
            Object.keys(workbook.cells).map((address) => {
              const [r, c] = coordinates(address);
              return r <= students.length && workbook.cells[address] !== ""
                ? c
                : -1;
            }),
          );
          let c = papers.length + 1;
          while (used.has(c)) c++;
          return c;
        },
        nextPaperName: () =>
          "Paper " + String(data.papers.length + 1).padStart(2, "0"),
        onRefresh: async (result) => {
          if (classId !== next) return;
          if (await load(next)) {
            const fresh = data.papers.filter(
                (p) => !next || !p.classId || p.classId === next,
              ),
              c = fresh.findIndex((p) => p._id === result.paperId) + 1;
            if (c > 0)
              controller.reveal(
                result.rename ? 0 : Math.max(1, result.row || 1),
                c,
                result.rename,
              );
            return true;
          }
          return false;
        },
        classes: data.classes,
        classId: next,
        onClassChange: load,
        emptyMessage: !students.length
          ? "No active students in this class. Add a student row or use the blank working rows below."
          : !papers.length
            ? "No papers yet. Add a paper column or use the blank working columns."
            : "",
        save: async (workbook) => {
          recoverableColumns.clear();
          for (let c = 1; c <= papers.length; c++) {
            const paper = papers[c - 1],
              name = String(workbook.cells[columnName(c) + "1"] || "").trim();
            if (!name || name.length > 120 || name.startsWith("="))
              throw Error(
                "Give every paper column a text heading (1–120 characters).",
              );
            if (name !== paper.name) {
              await api(
                "/admin/papers/" + paper._id,
                {
                  name,
                  max: paper.max,
                  classId: paper.classId || null,
                  subject: paper.subject || "",
                  grade: paper.grade || "",
                  date: paper.date || "",
                  state: paper.state,
                },
                "PATCH",
              );
              paper.name = name;
            }
          }
          const calculate = calculator(
              workbook.cells,
              workbook.rows,
              workbook.columns,
            ),
            entries = [];
          const candidates = new Set(Object.keys(workbook.cells));
          for (const mark of data.marks) {
            const r = studentRows.get(mark.studentId),
              c = paperColumns.get(mark.paperId);
            if (r && c) candidates.add(columnName(c) + (r + 1));
          }
          for (const address of candidates) {
            const [r, c] = coordinates(address);
            if (!isMark(r, c) || !editable(r, c)) continue;
            const student = students[r - 1],
              paper = papers[c - 1],
              raw = (workbook.cells[address] || "").trim();
            const formula = raw.startsWith("=") ? raw : "";
            const result = formula ? calculate(address) : raw;
            const absent = !formula && raw.toUpperCase() === "A",
              blank = !formula && raw === "";
            if (
              !absent &&
              !blank &&
              (typeof result === "boolean" ||
                (typeof result === "string" && !/^\d+(\.\d+)?$/.test(result)) ||
                !Number.isFinite(Number(result)))
            )
              throw Error(
                `${student.name}, ${paper.name}: enter a number, A for absent, blank, or a numeric formula`,
              );
            const value = absent || blank ? null : Number(result),
              status = absent ? "absent" : "present";
            if (
              value !== null &&
              (value < 0 ||
                value > paper.max ||
                Math.abs(Math.round(value * 100) - value * 100) > 1e-7)
            )
              throw Error(
                `${student.name}, ${paper.name}: mark must be 0–${paper.max} with up to two decimals. Use ROUND for formulas.`,
              );
            const previous = markMap.get(student._id + ":" + paper._id);
            const oldFormula = previous?.formula
              ? rebaseFormula(previous, students, papers, scope)
              : "";
            if (
              (previous?.value ?? null) === value &&
              (previous?.status || "present") === status &&
              oldFormula === formula
            )
              continue;
            entries.push({
              studentId: student._id,
              paperId: paper._id,
              value,
              status,
              formula,
              formulaBindings: formula
                ? bindingsFor(
                    formula,
                    students,
                    papers,
                    true,
                    scope,
                    slotForIndex,
                  )
                : [],
            });
          }
          const pendingExtras = new Map();
          for (const [address, value] of Object.entries(workbook.cells)) {
            const [r, c] = coordinates(address);
            if (
              isMark(r, c) ||
              (r === 0 && c <= papers.length) ||
              !editable(r, c)
            )
              continue;
            const cell = {
              rowKey: rowKey(r),
              columnKey: columnKey(c),
              value,
              formulaBindings: value.startsWith("=")
                ? bindingsFor(
                    value,
                    students,
                    papers,
                    true,
                    scope,
                    slotForIndex,
                  )
                : [],
            };
            pendingExtras.set(cell.rowKey + ":" + cell.columnKey, cell);
          }
          const changes = [];
          for (const [key, cell] of pendingExtras) {
            const old = extraMap.get(key),
              oldValue = old?.value.startsWith("=")
                ? rebaseFormula(
                    {
                      formula: old.value,
                      formulaBindings: old.formulaBindings,
                    },
                    students,
                    papers,
                    scope,
                  )
                : old?.value;
            if (oldValue !== cell.value) changes.push(cell);
          }
          for (const [key, cell] of extraMap) {
            const r = rowFor(cell.rowKey),
              c = columnFor(cell.columnKey);
            if (r !== undefined && c !== undefined && !pendingExtras.has(key))
              changes.push({ ...cell, value: "", formulaBindings: [] });
          }
          // Requests are batched; worksheet dimensions are independent of transport limits.
          async function batches(items, send) {
            let batch = [],
              bytes = 0;
            for (const item of items) {
              const size = new TextEncoder().encode(
                JSON.stringify(item),
              ).length;
              if (
                batch.length &&
                (batch.length >= 100 || bytes + size > 180000)
              ) {
                await send(batch);
                batch = [];
                bytes = 0;
              }
              batch.push(item);
              bytes += size;
            }
            if (batch.length) await send(batch);
          }
          await batches(entries, async (batch) => {
            await api("/admin/marks", { entries: batch }, "PUT");
            for (const entry of batch) {
              const key = entry.studentId + ":" + entry.paperId,
                old = markMap.get(key);
              if (old) Object.assign(old, entry);
              else {
                data.marks.push({ ...entry });
                markMap.set(key, data.marks.at(-1));
              }
            }
          });
          const dimensions = {
            extraRows: Math.max(0, workbook.rows - students.length - 1),
            extraColumns: model.extraExtent(workbook.columns),
          };
          await batches(changes.length ? changes : [null], async (batch) => {
            const changed = batch.filter(Boolean);
            await api(
              "/admin/worksheet-space/" + scope,
              { ...dimensions, entries: changed },
              "PUT",
            );
            for (const cell of changed) {
              const key = cell.rowKey + ":" + cell.columnKey;
              if (cell.value === "") extraMap.delete(key);
              else extraMap.set(key, cell);
            }
          });
          const automatic = automaticPaperColumns(workbook, model);
          const incomplete = papers
            .filter(
              (p) =>
                p.worksheetSource?.scope === scope &&
                !p.worksheetImportComplete,
            )
            .map((p) => ({
              columnKey: p.worksheetSource.columnKey,
              name: p.name,
              max: p.max,
            }));
          let created;
          for (const column of [...incomplete, ...automatic]) {
            try {
              created = await api("/admin/worksheet-paper", {
                scope,
                columnKey: column.columnKey,
                name: column.name,
                max: column.max || 100,
                state: "draft",
              });
            } catch (error) {
              recoverableColumns.add(column.columnKey);
              throw error;
            }
          }
          if (created) {
            Object.assign(data, await api("/admin/data"));
            return {
              revision: workbook.revision + 1,
              refresh: true,
              paperId: created.id,
              row: workbook.selection?.[0] || 1,
              rename: !!workbook.registerColumns?.length,
            };
          }
          return { revision: workbook.revision + 1 };
        },
      });
      const pendingPaper = sessionStorage.getItem("levelup-new-paper");
      if (pendingPaper && paperColumns.has(pendingPaper)) {
        const column = paperColumns.get(pendingPaper),
          paper = papers[column - 1],
          row =
            students.findIndex(
              (student) => !paper.classId || student.classId === paper.classId,
            ) + 1;
        controller.reveal(row > 0 ? row : 0, column);
        sessionStorage.removeItem("levelup-new-paper");
      }
      classId = next;
      if (
        automaticPaperColumns(state, model).length ||
        papers.some(
          (p) =>
            p.worksheetSource?.scope === scope && !p.worksheetImportComplete,
        )
      )
        await controller.flush();
      sessionStorage.setItem("levelup-admin-class", next);
      return true;
    } catch (error) {
      notify(error.message);
      return false;
    } finally {
      loading = false;
    }
  }
  if (!(await load()))
    throw Error(
      "Unable to open the marks worksheet. Check the selected class and try again.",
    );
  return {
    isBusy: () => loading || !!controller?.isBusy(),
    whenIdle: () => controller?.whenIdle() || Promise.resolve(true),
    hasUnsavedChanges: () => !!controller?.hasUnsavedChanges(),
  };
}
