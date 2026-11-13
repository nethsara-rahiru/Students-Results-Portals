// Deliberately interpreted expressions: no eval, Function, scripts or network access.
export const columnName = (index) => {
  if (!Number.isSafeInteger(index) || index < 0 || index > 16383)
    throw Error("#REF!");
  let name = "";
  for (index++; index; index = Math.floor((index - 1) / 26))
    name = String.fromCharCode(65 + ((index - 1) % 26)) + name;
  return name;
};
export function coordinates(ref) {
  const match = /^\$?([A-Z]+)\$?([1-9]\d*)$/i.exec(ref);
  if (!match) throw Error("#REF!");
  const result = [
    Number(match[2]) - 1,
    [...match[1].toUpperCase()].reduce(
      (n, c) => n * 26 + c.charCodeAt(0) - 64,
      0,
    ) - 1,
  ];
  if (
    !result.every(Number.isSafeInteger) ||
    result[0] > 1048575 ||
    result[1] > 16383
  )
    throw Error("#REF!");
  return result;
}
export function calculator(cells, rows, columns) {
  const cache = new Map(),
    visiting = new Set();
  let budget = 100000;
  function cell(ref, depth = 0) {
    if (--budget < 0 || depth > 100) throw Error("#LIMIT!");
    const [r, c] = coordinates(ref);
    ref = columnName(c) + (r + 1);
    if (r >= rows || c >= columns) throw Error("#REF!");
    if (cache.has(ref)) return cache.get(ref);
    if (visiting.has(ref)) throw Error("#CYCLE!");
    visiting.add(ref);
    try {
      const raw = String(cells[ref] ?? "");
      const result = raw.startsWith("=")
        ? expression(raw.slice(1), depth + 1)
        : raw.trim() !== "" && Number.isFinite(Number(raw))
          ? Number(raw)
          : raw;
      if (typeof result === "number" && !Number.isFinite(result))
        throw Error("#NUM!");
      cache.set(ref, result);
      return result;
    } finally {
      visiting.delete(ref);
    }
  }
  const numeric = (v) => {
    if (v === "" || typeof v === "boolean") return Number(v);
    if (typeof v !== "number") throw Error("#VALUE!");
    return v;
  };
  function expression(source, depth) {
    const tokens =
      source.match(
        /\s*(?:\d*\.\d+|\d+(?:\.\d*)?|"(?:[^"]|"")*"|\$?[A-Z]+\$?\d+|[A-Z_]+|#[A-Z0-9/]+[!?]|<>|<=|>=|[+\-*/^%=<>():,])/gi,
      ) || [];
    if (tokens.join("").replace(/\s/g, "") !== source.replace(/\s/g, ""))
      throw Error("#PARSE!");
    const t = tokens.map((x) => x.trim());
    let at = 0;
    const take = (expected) => {
      if (t[at++] !== expected) throw Error("#PARSE!");
    };
    const ops = {
      "=": 1,
      "<>": 1,
      "<": 1,
      ">": 1,
      "<=": 1,
      ">=": 1,
      "+": 2,
      "-": 2,
      "*": 3,
      "/": 3,
      "^": 4,
    };
    function parse(min = 0, level = 0) {
      if (level > 100) throw Error("#LIMIT!");
      let token = t[at++],
        value;
      if (token?.startsWith("#")) throw Error(token);
      if (token === "+" || token === "-")
        value = (token === "-" ? -1 : 1) * numeric(parse(4, level + 1));
      else if (token === "(") {
        value = parse(0, level + 1);
        take(")");
      } else if (/^\d*\.?\d/.test(token || "")) value = Number(token);
      else if (token?.startsWith('"'))
        value = token.slice(1, -1).replace(/""/g, '"');
      else if (/^\$?[A-Z]+\$?\d+$/i.test(token || "")) {
        if (t[at] === ":") {
          at++;
          const end = t[at++];
          const [r1, c1] = coordinates(token),
            [r2, c2] = coordinates(end || "");
          if (Math.abs(r2 - r1) * Math.abs(c2 - c1) > 10000)
            throw Error("#LIMIT!");
          value = [];
          for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++)
            for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++)
              value.push(cell(columnName(c) + (r + 1), depth));
        } else value = cell(token, depth);
      } else if (/^(TRUE|FALSE)$/i.test(token || ""))
        value = token.toUpperCase() === "TRUE";
      else if (/^[A-Z_]+$/i.test(token || "") && t[at] === "(") {
        at++;
        const args = [];
        if (t[at] !== ")") {
          do {
            args.push(parse(0, level + 1));
            if (t[at] !== ",") break;
            at++;
          } while (true);
        }
        take(")");
        const nums = args.flat().filter((x) => typeof x === "number");
        const sum = nums.reduce((a, b) => a + b, 0);
        switch (token.toUpperCase()) {
          case "SUM":
            value = sum;
            break;
          case "AVERAGE":
            if (!nums.length) throw Error("#DIV/0!");
            value = sum / nums.length;
            break;
          case "MIN":
            value = nums.length ? Math.min(...nums) : 0;
            break;
          case "MAX":
            value = nums.length ? Math.max(...nums) : 0;
            break;
          case "COUNT":
            value = nums.length;
            break;
          case "COUNTA":
            value = args.flat().filter((x) => x !== "").length;
            break;
          case "ROUND": {
            const p = 10 ** numeric(args[1] ?? 0);
            value = Math.round((numeric(args[0]) + Number.EPSILON) * p) / p;
            break;
          }
          case "ABS":
            value = Math.abs(numeric(args[0]));
            break;
          case "IF":
            if (args.length !== 3) throw Error("#VALUE!");
            value = args[0] ? args[1] : args[2];
            break;
          case "AND":
            value = args.flat().every(Boolean);
            break;
          case "OR":
            value = args.flat().some(Boolean);
            break;
          case "NOT":
            value = !args[0];
            break;
          default:
            throw Error("#NAME?");
        }
      } else throw Error("#PARSE!");
      while (t[at] === "%") {
        at++;
        value = numeric(value) / 100;
      }
      while (ops[t[at]] >= min) {
        const op = t[at++],
          right = parse(ops[op] + (op === "^" ? 0 : 1), level + 1);
        if (["=", "<>", "<", ">", "<=", ">="].includes(op))
          value =
            op === "="
              ? value === right
              : op === "<>"
                ? value !== right
                : op === "<"
                  ? value < right
                  : op === ">"
                    ? value > right
                    : op === "<="
                      ? value <= right
                      : value >= right;
        else {
          const a = numeric(value),
            b = numeric(right);
          if (op === "/" && b === 0) throw Error("#DIV/0!");
          value =
            op === "+"
              ? a + b
              : op === "-"
                ? a - b
                : op === "*"
                  ? a * b
                  : op === "/"
                    ? a / b
                    : a ** b;
        }
      }
      return value;
    }
    const value = parse();
    if (at !== t.length || Array.isArray(value)) throw Error("#VALUE!");
    return value;
  }
  return (ref) => {
    try {
      return cell(ref);
    } catch (error) {
      return error.message.startsWith("#") ? error.message : "#ERROR!";
    }
  };
}
export function shiftFormula(raw, dr, dc) {
  // Quoted strings remain literal; $ anchors are honored during fill/copy.
  return raw.startsWith("=")
    ? raw.replace(
        /"(?:[^"]|"")*"|(\$?)([A-Z]+)(\$?)([1-9]\d*)/gi,
        (whole, ac, col, ar, row) => {
          if (whole.startsWith('"')) return whole;
          const [r, c] = coordinates(col + row),
            nr = r + (ar ? 0 : dr),
            nc = c + (ac ? 0 : dc);
          return nr < 0 || nc < 0
            ? "#REF!"
            : ac + columnName(nc) + ar + (nr + 1);
        },
      )
    : raw;
}
