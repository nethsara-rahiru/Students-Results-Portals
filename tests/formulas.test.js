import { test } from "node:test";
import assert from "node:assert/strict";
import { calculator, columnName, shiftFormula } from "../public/formulas.js";
test("worksheet arithmetic, aggregates, references and conditions", () => {
  const calc = calculator(
    {
      A1: "0",
      A2: "20",
      A3: "40",
      B1: "=SUM(A1:A3)",
      B2: "=AVERAGE(A1:A3)",
      B3: "=IF(B1>=60,ROUND(B2/3,2),0)",
      C1: "=COUNT(A1:A3)",
      C2: "=MAX(A1:A3)-MIN(A1:A3)",
      C3: "=2^3+50%",
    },
    5,
    5,
  );
  assert.equal(calc("B1"), 60);
  assert.equal(calc("B2"), 20);
  assert.equal(calc("B3"), 6.67);
  assert.equal(calc("C1"), 3);
  assert.equal(calc("C2"), 40);
  assert.equal(calc("C3"), 8.5);
});
test("invalid, cyclic and executable formulas never run", () => {
  const calc = calculator(
    {
      A1: "=B1",
      B1: "=A1",
      A2: "=1/0",
      A3: '=fetch("/api/admin/data")',
      A4: "=Z99",
      A5: "=SUM(1,2);alert(1)",
    },
    10,
    5,
  );
  assert.equal(calc("A1"), "#CYCLE!");
  assert.equal(calc("A2"), "#DIV/0!");
  assert.equal(calc("A3"), "#NAME?");
  assert.equal(calc("A4"), "#REF!");
  assert.equal(calc("A5"), "#PARSE!");
});
test("fill down preserves anchors and quoted text", () => {
  assert.equal(
    shiftFormula('=SUM(A1,$B1,C$2,$D$3)+IF(A1=1,"A1",0)', 2, 1),
    '=SUM(B3,$B3,D$2,$D$3)+IF(B3=1,"A1",0)',
  );
  assert.equal(columnName(26), "AA");
});
test("supported logical, rounding, text and error behavior", () => {
  const calc = calculator(
    {
      A1: '=COUNTA("a",0,"")',
      A2: "=ABS(-5)+ROUND(1.234,2)",
      A3: "=AND(1<2,NOT(FALSE),OR(FALSE,TRUE))",
      A4: "=#REF!+2",
      A5: '=IF(TRUE,"Ready","Wait")',
    },
    5,
    2,
  );
  assert.equal(calc("A1"), 2);
  assert.equal(calc("A2"), 6.23);
  assert.equal(calc("A3"), true);
  assert.equal(calc("A4"), "#REF!");
  assert.equal(calc("A5"), "Ready");
});
test("extreme references and deeply nested formulas terminate safely", () => {
  const calc = calculator(
    {
      A1: "=" + "Z".repeat(500) + "1",
      A2: "=" + "(".repeat(150) + "1" + ")".repeat(150),
      A3: "=A999999999999999999999",
    },
    5,
    5,
  );
  assert.equal(calc("A1"), "#REF!");
  assert.equal(calc("A2"), "#LIMIT!");
  assert.equal(calc("A3"), "#REF!");
});
