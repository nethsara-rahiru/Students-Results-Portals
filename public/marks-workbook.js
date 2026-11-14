import { api, notify } from "./client.js";
import { mountWorkbook } from "./workbook.js";
import { calculator, columnName } from "./formulas.js";
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
      const oversized =
        Math.max(2, students.length + 1) * Math.max(2, papers.length + 1) >
          10000 ||
        students.length > 499 ||
        papers.length > 99;
      if (oversized && controller)
        throw Error(
          "This class exceeds the worksheet limit. Select a smaller class (up to 499 students, 99 papers and 10,000 cells).",
        );
      if (oversized) {
        students = [];
        papers = [];
      }
      const cells = { A1: "Name" };
      papers.forEach((p, c) => (cells[columnName(c + 1) + "1"] = p.name));
      students.forEach((s, r) => {
        cells["A" + (r + 2)] = s.name + (s.label ? " · " + s.label : "");
        papers.forEach((p, c) => {
          const mark = data.marks.find(
            (m) => m.studentId === s._id && m.paperId === p._id,
          );
          if (mark)
            cells[columnName(c + 1) + (r + 2)] = mark.formula
              ? rebaseFormula(mark, students, papers)
              : mark.status === "absent"
                ? "A"
                : String(mark.value ?? "");
        });
      });
      const state = {
        rows: Math.max(2, students.length + 1),
        columns: Math.max(2, papers.length + 1),
        cells,
        revision: 0,
      };
      const editable = (r, c) =>
        r > 0 &&
        c > 0 &&
        !!students[r - 1] &&
        !!papers[c - 1] &&
        (!papers[c - 1].classId ||
          papers[c - 1].classId === students[r - 1].classId);
      controller = await mountWorkbook(host, data, {
        state,
        editable,
        caption: oversized
          ? "Choose a class to load marks"
          : `${next === "unassigned" ? "Students without a class" : data.classes.find((cls) => cls._id === next)?.name || "All students"} · ${students.length} ${students.length === 1 ? "student" : "students"} · ${papers.length} ${papers.length === 1 ? "paper" : "papers"}`,
        addStudent: () => addStudent?.(next === "unassigned" ? "" : next),
        addPaper: () => addPaper?.(next === "unassigned" ? "" : next),
        classes: data.classes,
        classId: next,
        onClassChange: load,
        emptyMessage: oversized
          ? "This roster is too large to display at once. Use the Name header dropdown to select a smaller class."
          : !students.length
            ? "No active students in this class. Add a student row to get started."
            : !papers.length
              ? "No papers yet. Add a paper column to begin entering marks."
              : "",
        save: async (workbook) => {
          const calculate = calculator(
              workbook.cells,
              workbook.rows,
              workbook.columns,
            ),
            entries = [];
          students.forEach((student, r) =>
            papers.forEach((paper, c) => {
              if (!editable(r + 1, c + 1)) return;
              const address = columnName(c + 1) + (r + 2),
                raw = (workbook.cells[address] || "").trim();
              const formula = raw.startsWith("=") ? raw : "";
              const result = formula ? calculate(address) : raw;
              const absent = !formula && raw.toUpperCase() === "A",
                blank = !formula && raw === "";
              if (
                !absent &&
                !blank &&
                (typeof result === "boolean" ||
                  (typeof result === "string" &&
                    !/^\d+(\.\d+)?$/.test(result)) ||
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
              const previous = data.marks.find(
                (m) => m.studentId === student._id && m.paperId === paper._id,
              );
              const oldFormula = previous?.formula
                ? rebaseFormula(previous, students, papers)
                : "";
              if (
                (previous?.value ?? null) === value &&
                (previous?.status || "present") === status &&
                oldFormula === formula
              )
                return;
              entries.push({
                studentId: student._id,
                paperId: paper._id,
                value,
                status,
                formula,
                formulaBindings: formula
                  ? bindingsFor(formula, students, papers)
                  : [],
              });
            }),
          );
          if (entries.length > 2000)
            throw Error(
              "This edit recalculates more than 2,000 marks. Save a smaller range.",
            );
          if (entries.length) {
            await api("/admin/marks", { entries }, "PUT");
            for (const entry of entries) {
              const previous = data.marks.find(
                (m) =>
                  m.studentId === entry.studentId &&
                  m.paperId === entry.paperId,
              );
              if (previous) Object.assign(previous, entry);
              else data.marks.push(entry);
            }
          }
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
