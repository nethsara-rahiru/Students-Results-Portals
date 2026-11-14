import { columnName } from "./formulas.js";
import { rebaseFormula } from "./worksheet-references.js";
export function worksheetModel(data, space, scope = "all") {
  const students = data.students
    .filter(
      (s) =>
        s.active &&
        (scope === "all" ||
          (scope === "unassigned" ? !s.classId : s.classId === scope)),
    )
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, "en") || a._id.localeCompare(b._id),
    );
  const papers = data.papers.filter(
    (p) => scope === "all" || !p.classId || p.classId === scope,
  );
  const studentRows = new Map(students.map((s, r) => [s._id, r + 1])),
    paperColumns = new Map(papers.map((p, c) => [p._id, c + 1]));
  const promotions = new Map(
    papers
      .filter((p) => p.worksheetSource?.scope === scope)
      .map((p) => [Number(p.worksheetSource.columnKey.slice(1)), p._id]),
  );
  const used = [...promotions.keys()].sort((a, b) => a - b);
  const slotForIndex = (index) => {
    let slot = index;
    for (const usedSlot of used) {
      if (usedSlot <= slot) slot++;
      else break;
    }
    return slot;
  };
  const indexForSlot = (slot) =>
    slot - used.filter((usedSlot) => usedSlot < slot).length;
  const rowKey = (r) =>
    r === 0 ? "h" : students[r - 1]?._id || "x" + (r - students.length - 1);
  const columnKey = (c) =>
    c === 0
      ? "h"
      : papers[c - 1]?._id || "x" + slotForIndex(c - papers.length - 1);
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
        ? promotions.has(Number(key.slice(1)))
          ? paperColumns.get(promotions.get(Number(key.slice(1))))
          : papers.length + 1 + indexForSlot(Number(key.slice(1)))
        : paperColumns.get(key);
  const isMark = (r, c) =>
    r > 0 && c > 0 && !!students[r - 1] && !!papers[c - 1];
  const cells = { A1: "Name" };
  papers.forEach((p, c) => (cells[columnName(c + 1) + "1"] = p.name));
  students.forEach(
    (s, r) =>
      (cells["A" + (r + 2)] = s.name + (s.label ? " · " + s.label : "")),
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
    if (
      r !== undefined &&
      c !== undefined &&
      !isMark(r, c) &&
      !(r === 0 && c <= papers.length) &&
      !(c === 0 && r <= students.length)
    )
      cells[columnName(c) + (r + 1)] = cell.value.startsWith("=")
        ? rebaseFormula(
            { formula: cell.value, formulaBindings: cell.formulaBindings },
            students,
            papers,
            scope,
          )
        : cell.value;
  }
  const extraColumns = Math.max(
    0,
    space.extraColumns -
      used.filter((slot) => slot < space.extraColumns).length,
  );
  return {
    students,
    papers,
    studentRows,
    paperColumns,
    rowKey,
    columnKey,
    rowFor,
    columnFor,
    isMark,
    cells,
    slotForIndex,
    state: {
      rows: Math.max(2, students.length + 1 + space.extraRows),
      columns: Math.max(2, papers.length + 1 + extraColumns),
      cells,
      revision: 0,
    },
    extraExtent: (columns) => {
      const count = Math.max(0, columns - papers.length - 1);
      return count
        ? slotForIndex(count - 1) + 1
        : used.length
          ? used.at(-1) + 1
          : 0;
    },
  };
}
