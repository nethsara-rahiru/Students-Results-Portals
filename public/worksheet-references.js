import { columnName, coordinates } from "./formulas.js";
const references = /"(?:[^"]|"")*"|(\$?)([A-Z]+)(\$?)([1-9]\d*)/gi;
export function bindingsFor(formula, students, papers) {
  const bindings = new Map();
  formula.replace(references, (whole, ac, col, ar, row) => {
    if (whole.startsWith('"')) return whole;
    const [r, c] = coordinates(col + row);
    const studentId = r ? students[r - 1]?._id : null,
      paperId = c ? papers[c - 1]?._id : null;
    if ((r && !studentId) || (c && !paperId))
      throw Error("Formula references a cell outside this class worksheet");
    const ref = col.toUpperCase() + row;
    bindings.set(ref, {
      ref,
      studentId: studentId || null,
      paperId: paperId || null,
    });
    return whole;
  });
  return [...bindings.values()];
}
export function rebaseFormula(mark, students, papers) {
  if (!mark.formula) return "";
  const map = new Map(
    (mark.formulaBindings || []).map((binding) => [binding.ref, binding]),
  );
  return mark.formula.replace(references, (whole, ac, col, ar, row) => {
    if (whole.startsWith('"')) return whole;
    const binding = map.get(col.toUpperCase() + row);
    if (!binding) return "#REF!";
    const r = binding.studentId
      ? students.findIndex((s) => s._id === binding.studentId) + 1
      : 0;
    const c = binding.paperId
      ? papers.findIndex((p) => p._id === binding.paperId) + 1
      : 0;
    if ((binding.studentId && !r) || (binding.paperId && !c)) return "#REF!";
    return ac + columnName(c) + ar + (r + 1);
  });
}
