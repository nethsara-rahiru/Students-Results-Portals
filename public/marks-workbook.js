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
      let students = data.students
        .filter(
          (s) =>
            s.active &&
            (!next ||
              (next === "unassigned" ? !s.classId : s.classId === next)),
        )
        .sort(
          (a, b) => a.name.localeCompare(b.name) || a._id.localeCompare(b._id),
        );
      let papers = data.papers.filter(
        (p) => !next || !p.classId || p.classId === next,
      );
      const scope = next || "all";
      const space = await api("/admin/worksheet-space/" + scope);
      const studentRows = new Map(students.map((s, r) => [s._id, r + 1]));
      const paperColumns = new Map(papers.map((p, c) => [p._id, c + 1]));
      const markMap = new Map(
        data.marks.map((m) => [m.studentId + ":" + m.paperId, m]),
      );
      const rowKey = (r) =>
        r === 0 ? "h" : students[r - 1]?._id || "x" + (r - students.length - 1);
      const columnKey = (c) =>
        c === 0 ? "h" : papers[c - 1]?._id || "x" + (c - papers.length - 1);
      const rowFor = (key) =>
        key === "h"
          ? 0
          : key.startsWith("x")
            ? students.length + 1 + Number(key.slice(1))
            : studentRows.get(key);
      const columnFor = (key) =>
        key === "h"
          ? 0
          : key.startsWith("x")
            ? papers.length + 1 + Number(key.slice(1))
            : paperColumns.get(key);
      const extraMap = new Map(
        space.cells.map((cell) => [cell.rowKey + ":" + cell.columnKey, cell]),
      );
      const cells = { A1: "Name" };
      papers.forEach((p, c) => (cells[columnName(c + 1) + "1"] = p.name));
      students.forEach(
        (student, r) =>
          (cells["A" + (r + 2)] =
            student.name + (student.label ? " · " + student.label : "")),
      );
      for (const mark of data.marks) {
        const r = studentRows.get(mark.studentId),
          c = paperColumns.get(mark.paperId);
        if (r && c)
          cells[columnName(c) + (r + 1)] = mark.formula
            ? rebaseFormula(mark, students, papers, scope)
            : mark.status === "absent"
              ? "A"
              : String(mark.value ?? "");
      }
      for (const cell of space.cells) {
        const r = rowFor(cell.rowKey),
          c = columnFor(cell.columnKey);
        if (r !== undefined && c !== undefined)
          cells[columnName(c) + (r + 1)] = cell.value.startsWith("=")
            ? rebaseFormula(
                { formula: cell.value, formulaBindings: cell.formulaBindings },
                students,
                papers,
                scope,
              )
            : cell.value;
      }
      const state = {
        rows: Math.max(2, students.length + 1 + space.extraRows),
        columns: Math.max(2, papers.length + 1 + space.extraColumns),
        cells,
        revision: 0,
      };
      const isMark = (r, c) =>
        r > 0 && c > 0 && !!students[r - 1] && !!papers[c - 1];
      const editable = (r, c) => {
        if (
          (r === 0 && c <= papers.length) ||
          (c === 0 && r <= students.length)
        )
          return false;
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
        classes: data.classes,
        classId: next,
        onClassChange: load,
        emptyMessage: !students.length
          ? "No active students in this class. Add a student row or use the blank working rows below."
          : !papers.length
            ? "No papers yet. Add a paper column or use the blank working columns."
            : "",
        save: async (workbook) => {
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
                ? bindingsFor(formula, students, papers, true, scope)
                : [],
            });
          }
          const pendingExtras = new Map();
          for (const [address, value] of Object.entries(workbook.cells)) {
            const [r, c] = coordinates(address);
            if (isMark(r, c) || !editable(r, c)) continue;
            const cell = {
              rowKey: rowKey(r),
              columnKey: columnKey(c),
              value,
              formulaBindings: value.startsWith("=")
                ? bindingsFor(value, students, papers, true, scope)
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
            extraColumns: Math.max(0, workbook.columns - papers.length - 1),
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
          return { revision: workbook.revision + 1 };
        },
      });
      classId = next;
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
