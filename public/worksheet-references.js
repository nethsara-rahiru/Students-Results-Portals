import { columnName, coordinates } from "./formulas.js";
const references = /"(?:[^"]|"")*"|(\$?)([A-Z]+)(\$?)([1-9]\d*)/gi;
export function bindingsFor(
  formula,
  students,
  papers,
  allowExtra = false,
  scope,
  slotForIndex = (index) => index,
) {
  const bindings = new Map();
  formula.replace(references, (whole, ac, col, ar, row) => {
    if (whole.startsWith('"')) return whole;
    const [r, c] = coordinates(col + row);
    const studentId = r ? students[r - 1]?._id : null,
      paperId = c ? papers[c - 1]?._id : null;
    if (!allowExtra && ((r && !studentId) || (c && !paperId)))
      throw Error("Formula references a cell outside this class worksheet");
    const ref = col.toUpperCase() + row;
    bindings.set(ref, {
      ref,
      studentId: studentId || null,
      paperId: paperId || null,
      ...(scope && (r > students.length || c > papers.length)
        ? { extraScope: scope }
        : {}),
      ...(r > students.length ? { extraRow: r - students.length - 1 } : {}),
      ...(c > papers.length
        ? { extraColumn: slotForIndex(c - papers.length - 1) }
        : {}),
    });
    return whole;
  });
  return [...bindings.values()];
}
export function rebaseFormula(mark, students, papers, scope) {
  if (!mark.formula) return "";
  const map = new Map(
    (mark.formulaBindings || []).map((binding) => [binding.ref, binding]),
  );
  return mark.formula.replace(references, (whole, ac, col, ar, row) => {
    if (whole.startsWith('"')) return whole;
    const binding = map.get(col.toUpperCase() + row);
    if (
      !binding ||
      (binding.extraScope &&
        scope &&
        binding.extraScope !== scope &&
        (binding.extraRow !== undefined ||
          !papers.some(
            (p) =>
              p.worksheetSource?.scope === binding.extraScope &&
              p.worksheetSource?.columnKey === "x" + binding.extraColumn,
          )))
    )
      return "#REF!";
    const r =
      binding.extraRow !== undefined
        ? students.length + 1 + binding.extraRow
        : binding.studentId
          ? students.findIndex((s) => s._id === binding.studentId) + 1
          : 0;
    const promoted = papers.findIndex(
      (p) =>
        p.worksheetSource?.scope === binding.extraScope &&
        p.worksheetSource?.columnKey === "x" + binding.extraColumn,
    );
    const used = papers
      .filter(
        (p) =>
          p.worksheetSource &&
          p.worksheetSource.scope === (binding.extraScope || scope),
      )
      .map((p) => Number(p.worksheetSource.columnKey.slice(1)));
    const c =
      binding.extraColumn !== undefined
        ? promoted >= 0
          ? promoted + 1
          : papers.length +
            1 +
            binding.extraColumn -
            used.filter((slot) => slot < binding.extraColumn).length
        : binding.paperId
          ? papers.findIndex((p) => p._id === binding.paperId) + 1
          : 0;
    if ((binding.studentId && !r) || (binding.paperId && !c)) return "#REF!";
    return ac + columnName(c) + ar + (r + 1);
  });
}
