// Native, accessible spreadsheet. Only validated numeric values/absence leave this module.
export function mountSheet(host, { students, papers, marks, save, onStatus }) {
  let anchor = [0, 0],
    focus = [0, 0],
    undo = [],
    redo = [],
    busy = false;
  let idlePromise = Promise.resolve(true);
  let resolveIdle;
  const values = new Map(
    marks.map((m) => [
      m.studentId + ":" + m.paperId,
      m.status === "absent" ? "A" : (m.value ?? ""),
    ]),
  );
  const key = (r, c) => students[r]._id + ":" + papers[c]._id;
  const inputs = [];
  const table = document.createElement("table");
  table.setAttribute("aria-label", "Student marks spreadsheet");
  const header = table.createTHead().insertRow();
  for (const label of [
    "Student / profile",
    ...papers.map((p) => `${p.name} · /${p.max}`),
  ]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = label;
    header.append(th);
  }
  const body = table.createTBody();
  students.forEach((s, r) => {
    const tr = body.insertRow();
    const th = document.createElement("th");
    th.scope = "row";
    th.textContent = s.name + (s.label ? " · " + s.label : "");
    tr.append(th);
    inputs[r] = [];
    papers.forEach((p, c) => {
      const td = tr.insertCell(),
        input = document.createElement("input");
      input.value = values.get(key(r, c)) ?? "";
      input.setAttribute(
        "aria-label",
        `${s.name}, ${p.name}, maximum ${p.max}`,
      );
      input.autocomplete = "off";
      input.dataset.row = r;
      input.dataset.col = c;
      input.inputMode = "decimal";
      if (p.classId && s.classId !== p.classId) {
        input.disabled = true;
        input.title = "Different class";
      }
      input.addEventListener("pointerdown", (e) => {
        if (!e.shiftKey) anchor = [r, c];
        focus = [r, c];
        paint();
      });
      input.addEventListener("focus", () => {
        focus = [r, c];
        paint();
      });
      input.addEventListener("change", () =>
        commit([{ r, c, next: input.value }]),
      );
      input.addEventListener("keydown", (e) => navigate(e, r, c));
      td.append(input);
      inputs[r][c] = input;
    });
  });
  host.replaceChildren(table);
  const status = document.createElement("div");
  status.className = "sheet-calculations";
  status.setAttribute("aria-live", "polite");
  host.after(status);
  const range = () => {
    const cells = [];
    for (
      let r = Math.min(anchor[0], focus[0]);
      r <= Math.max(anchor[0], focus[0]);
      r++
    )
      for (
        let c = Math.min(anchor[1], focus[1]);
        c <= Math.max(anchor[1], focus[1]);
        c++
      )
        if (inputs[r]?.[c] && !inputs[r][c].disabled) cells.push({ r, c });
    return cells;
  };
  function paint() {
    for (const row of inputs)
      for (const i of row) i.classList.remove("selected");
    const ns = [];
    for (const { r, c } of range()) {
      inputs[r][c].classList.add("selected");
      const v = values.get(key(r, c));
      if (v !== "" && v !== undefined && v !== "A") ns.push(Number(v));
    }
    const sum = ns.reduce((a, b) => a + b, 0);
    status.textContent = `COUNT ${ns.length}  ·  SUM ${sum.toFixed(2)}  ·  AVERAGE ${ns.length ? (sum / ns.length).toFixed(2) : "—"}  ·  MIN ${ns.length ? Math.min(...ns) : "—"}  ·  MAX ${ns.length ? Math.max(...ns) : "—"}`;
  }
  function parsed(raw, c) {
    const s = String(raw).trim();
    if (!s) return "";
    if (s.toUpperCase() === "A") return "A";
    if (!/^\d+(\.\d{1,2})?$/.test(s))
      throw Error(
        "Use a number, blank, or A for absent. Formulas cannot be stored.",
      );
    const v = Number(s);
    if (v > papers[c].max)
      throw Error(`${papers[c].name}: maximum is ${papers[c].max}`);
    return v;
  }
  async function apply(changes) {
    if (busy) throw Error("Wait for the current save");
    busy = true;
    let succeeded = false;
    idlePromise = new Promise((resolve) => {
      resolveIdle = resolve;
    });
    for (const row of inputs) for (const input of row) input.readOnly = true;
    onStatus("Saving…");
    try {
      await save(
        changes.map(({ r, c, next }) => ({
          studentId: students[r]._id,
          paperId: papers[c]._id,
          value: next === "A" || next === "" ? null : next,
          status: next === "A" ? "absent" : "present",
        })),
      );
      for (const { r, c, next } of changes) {
        values.set(key(r, c), next);
        inputs[r][c].value = next;
      }
      succeeded = true;
      onStatus("All changes saved");
      paint();
    } finally {
      busy = false;
      resolveIdle(succeeded);
      for (const row of inputs) for (const input of row) input.readOnly = false;
    }
  }
  async function commit(changes) {
    try {
      const normalized = changes
        .filter((x) => inputs[x.r]?.[x.c] && !inputs[x.r][x.c].disabled)
        .map((x) => ({
          ...x,
          next: parsed(x.next, x.c),
          previous: values.get(key(x.r, x.c)) ?? "",
        }));
      if (!normalized.length) return;
      await apply(normalized);
      undo.push(normalized);
      redo = [];
    } catch (e) {
      for (const { r, c } of changes)
        if (inputs[r]?.[c]) inputs[r][c].value = values.get(key(r, c)) ?? "";
      onStatus(e.message, true);
    }
  }
  async function history(from, to, reverse) {
    const change = from.at(-1);
    if (!change) return;
    try {
      await apply(
        change.map((x) => ({ ...x, next: reverse ? x.previous : x.next })),
      );
      from.pop();
      to.push(change);
    } catch (e) {
      onStatus(e.message, true);
    }
  }
  function move(r, c, shift) {
    r = Math.max(0, Math.min(students.length - 1, r));
    c = Math.max(0, Math.min(papers.length - 1, c));
    if (!shift) anchor = [r, c];
    focus = [r, c];
    inputs[r]?.[c]?.focus();
    paint();
  }
  function navigate(e, r, c) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      history(e.shiftKey ? redo : undo, e.shiftKey ? undo : redo, !e.shiftKey);
      return;
    }
    if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      history(redo, undo, false);
      return;
    }
    if (mod && e.key.toLowerCase() === "d") {
      e.preventDefault();
      fill();
      return;
    }
    if (e.key === "Delete") {
      e.preventDefault();
      commit(range().map((x) => ({ ...x, next: "" })));
      return;
    }
    const delta = {
      ArrowDown: [1, 0],
      ArrowUp: [-1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      Enter: [e.shiftKey ? -1 : 1, 0],
      Tab: [0, e.shiftKey ? -1 : 1],
    }[e.key];
    if (delta) {
      if (
        e.key === "Tab" &&
        ((!e.shiftKey &&
          r === students.length - 1 &&
          c === papers.length - 1) ||
          (e.shiftKey && r === 0 && c === 0))
      )
        return;
      e.preventDefault();
      let nr = r + delta[0],
        nc = c + delta[1];
      if (e.key === "Tab") {
        if (nc >= papers.length) {
          nc = 0;
          nr++;
        }
        if (nc < 0) {
          nc = papers.length - 1;
          nr--;
        }
      }
      move(nr, nc, e.shiftKey && e.key.startsWith("Arrow"));
    }
  }
  function fill() {
    const cells = range();
    const top = Math.min(anchor[0], focus[0]);
    commit(
      cells.map(({ r, c }) => ({ r, c, next: values.get(key(top, c)) ?? "" })),
    );
  }
  host.addEventListener("copy", (e) => {
    if (!e.target.matches("input")) return;
    e.preventDefault();
    const rows = [];
    for (
      let r = Math.min(anchor[0], focus[0]);
      r <= Math.max(anchor[0], focus[0]);
      r++
    ) {
      const row = [];
      for (
        let c = Math.min(anchor[1], focus[1]);
        c <= Math.max(anchor[1], focus[1]);
        c++
      )
        row.push(values.get(key(r, c)) ?? "");
      rows.push(row.join("\t"));
    }
    e.clipboardData.setData("text/plain", rows.join("\n"));
  });
  host.addEventListener("paste", (e) => {
    if (!e.target.matches("input")) return;
    e.preventDefault();
    const rows = e.clipboardData
      .getData("text/plain")
      .replace(/\r/g, "")
      .replace(/\n$/, "")
      .split("\n");
    const changes = [];
    if (rows.length > 2000) {
      onStatus("Paste at most 2000 cells", true);
      return;
    }
    rows.forEach((line, dr) =>
      line
        .split("\t")
        .forEach((next, dc) =>
          changes.push({ r: focus[0] + dr, c: focus[1] + dc, next }),
        ),
    );
    if (changes.length > 2000 || changes.some(({ r, c }) => !inputs[r]?.[c])) {
      onStatus("Paste exceeds spreadsheet bounds or 2000 cells", true);
      return;
    }
    commit(changes);
  });
  paint();
  return {
    fill,
    undo: () => history(undo, redo, true),
    redo: () => history(redo, undo, false),
    isBusy: () => busy,
    whenIdle: () => idlePromise,
    hasUnsavedChanges: () =>
      busy ||
      inputs.some((row, r) =>
        row.some(
          (input, c) =>
            !input.disabled &&
            input.value !== String(values.get(key(r, c)) ?? ""),
        ),
      ),
  };
}
