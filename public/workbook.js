import { api, esc, notify } from "./client.js";
import {
  calculator,
  columnName,
  coordinates,
  shiftFormula,
} from "./formulas.js";

export async function mountWorkbook(host, data, config = {}) {
  const bound = !!config.state;
  const editable = (r, c) => (config.editable ? config.editable(r, c) : true);
  let state = config.state
    ? structuredClone(config.state)
    : await api("/admin/workbook");
  let selected = [0, 0],
    anchor = [0, 0],
    busy = false,
    dirty = false,
    undo = [],
    redo = [],
    idle = Promise.resolve(true);
  const ref = (r, c) => columnName(c) + (r + 1);
  const snapshot = () =>
    structuredClone({
      rows: state.rows,
      columns: state.columns,
      cells: state.cells,
    });
  host.innerHTML = `<div class="workbook-ribbon"><div><strong>Worksheet</strong><small>Private teacher calculations · saved to MongoDB</small></div><button data-action="add-row" class="secondary">Add row</button><button data-action="add-column" class="secondary">Add column</button><button data-action="insert-row" class="secondary">Insert row above</button><button data-action="insert-column" class="secondary">Insert column before</button><button data-action="delete-row" class="secondary">Delete row</button><button data-action="delete-column" class="secondary">Delete column</button><button data-action="undo" class="secondary">Undo</button><button data-action="redo" class="secondary">Redo</button><button data-action="fill" class="secondary">Fill down</button><button data-action="import" class="secondary">Load marks snapshot</button><button data-action="retry" class="secondary">Retry save</button></div><div class="formula-bar"><input id="cell-address" aria-label="Go to cell" value="A1" title="Enter an address and press Enter to jump or extend the sheet"><label>fx<input aria-label="Cell formula or value" autocomplete="off" placeholder="Type a value or =SUM(A1:A5)"></label></div><p class="workbook-status" role="status">All changes saved</p><div class="sheet workbook-grid" tabindex="0" aria-label="Flexible worksheet"></div><p class="workbook-selection" role="status"></p><details class="keyboard-guide"><summary>Worksheet help & supported formulas</summary><p>Click a cell to select it; double-click or use the formula bar to edit. Shift + click / arrows selects a range. Tab and Enter navigate. Copy/paste TSV from Excel, Delete clears, Ctrl/⌘ + D fills down, Ctrl/⌘ + Z / Y undoes/redoes. Rows and columns can be inserted or deleted at the selected cell. Fill down adjusts relative references and preserves $ anchors.</p><p>Functions: SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, ROUND, ABS, IF, AND, OR, NOT. Supports A1 references, ranges, arithmetic, comparisons, percentages and text literals. This is a supported subset of Excel, without macros, external links or XLSX files. IF arguments are evaluated eagerly. Limits: 500 rows, 100 columns and 10,000 cells. Loading marks replaces this worksheet after confirmation; calculations never publish results automatically.</p></details>`;
  if (bound) {
    host.classList.add("marks-bound-workbook");
    host.querySelector(".workbook-ribbon strong").textContent =
      "Flexible worksheet";
    host.querySelector(".workbook-ribbon small").textContent =
      "Actual student marks · autosaved";
    for (const action of [
      "insert-row",
      "insert-column",
      "delete-row",
      "delete-column",
      "import",
    ])
      host.querySelector(`[data-action="${action}"]`).remove();
    host.querySelector('[data-action="add-row"]').textContent =
      "Add student row";
    host.querySelector('[data-action="add-column"]').textContent =
      "Add paper column";
    if (config.expandable) {
      for (const [action, label] of [
        ["working-row", "Add row"],
        ["working-column", "Add column"],
      ]) {
        const button = document.createElement("button");
        button.className = "secondary";
        button.dataset.action = action;
        button.textContent = label;
        host.querySelector(".workbook-ribbon").append(button);
      }
    }
    const help = host.querySelector(".keyboard-guide");
    help.querySelector("p").textContent =
      "Column A contains student names; row 1 contains paper headers. Add row/Add column creates blank working space; paste expands it automatically. Enter any cell address in the address box and press Enter to jump or expand. Large sheets render a scrolling window. Working cells stay private to teachers and can feed formulas in real mark cells. Use the dropdown beside Name to load a class. Add student row and Add paper column create real profiles and draft papers. Names and headers are protected; edit them from Students and Papers. Shift + click / arrows selects a range; copy/paste, Delete, fill down, undo and redo work on mark cells. A = absent; blank = no result; zero is a valid mark.";
    help.querySelectorAll("p")[1].textContent =
      "Functions: SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, ROUND, ABS, IF, AND, OR, NOT. Formulas recalculate in this worksheet and save validated numeric marks plus their formula. Use ROUND to keep at most two decimals. Formula references follow student and paper IDs when switching classes or when rows move; a missing reference shows #REF!. Publishing is managed separately in Papers. The supported Excel subset does not include macros or XLSX import/export; IF arguments evaluate eagerly.";
    const caption = document.createElement("p");
    caption.className = "worksheet-context";
    caption.textContent = config.caption;
    host.querySelector(".formula-bar").before(caption);
    if (config.emptyMessage) {
      const empty = document.createElement("p");
      empty.className = "worksheet-empty";
      empty.textContent = config.emptyMessage;
      host.querySelector(".formula-bar").before(empty);
    }
  }
  const grid = host.querySelector(".workbook-grid"),
    bar = host.querySelector('[aria-label="Cell formula or value"]'),
    status = host.querySelector(".workbook-status");
  let inputs = [],
    visibleInputs = [],
    rendering = false,
    windowKey = "";
  const rowScale = () => Math.max(1, (state.rows * 44) / 8000000),
    columnScale = () => Math.max(1, (state.columns * 180) / 8000000);
  const rowStart = () =>
    state.rows <= 80
      ? 1
      : rowScale() > 1
        ? 1 +
          Math.floor(
            Math.max(
              0,
              Math.min(
                1,
                grid.scrollTop / Math.max(1, 8000083 - grid.clientHeight),
              ),
            ) *
              (state.rows - 56),
          )
        : Math.max(
            1,
            Math.min(state.rows - 1, Math.floor(grid.scrollTop / 44) - 5),
          );
  const columnStart = () =>
    state.columns <= 24
      ? 1
      : columnScale() > 1
        ? 1 +
          Math.floor(
            Math.max(
              0,
              Math.min(
                1,
                grid.scrollLeft / Math.max(1, 8000275 - grid.clientWidth),
              ),
            ) *
              (state.columns - 17),
          )
        : Math.max(
            1,
            Math.min(state.columns - 1, Math.floor(grid.scrollLeft / 180) - 3),
          );
  const rowGap = (count) =>
    rowScale() > 1
      ? (count / (state.rows - 56)) * (8000000 - 55 * 44)
      : count * 44;
  const columnGap = (count) =>
    columnScale() > 1
      ? (count / (state.columns - 17)) * (8000000 - 16 * 180)
      : count * 180;
  function message(text, error = false) {
    status.textContent = text;
    status.classList.toggle("error", error);
  }
  function bounds() {
    return [
      Math.min(anchor[0], selected[0]),
      Math.min(anchor[1], selected[1]),
      Math.max(anchor[0], selected[0]),
      Math.max(anchor[1], selected[1]),
    ];
  }
  function selection() {
    const [r1, c1, r2, c2] = bounds(),
      result = [];
    for (let r = r1; r <= r2; r++)
      for (let c = c1; c <= c2; c++) result.push([r, c]);
    return result;
  }
  function paint() {
    const calc = calculator(state.cells, state.rows, state.columns),
      [r1, c1, r2, c2] = bounds(),
      nums = [];
    for (const { r, c, input: el } of visibleInputs) {
      const raw = state.cells[ref(r, c)] || "",
        value =
          bound &&
          ((r === 0 && c <= config.paperCount) ||
            (c === 0 && r <= config.studentCount))
            ? raw
            : calc(ref(r, c));
      if (document.activeElement !== el) el.value = String(value);
      el.classList.toggle("formula-cell", raw.startsWith("="));
      el.classList.toggle(
        "cell-error",
        raw.startsWith("=") && String(value).startsWith("#"),
      );
      el.classList.toggle("selected", r >= r1 && r <= r2 && c >= c1 && c <= c2);
      el.title = raw.startsWith("=") || !editable(r, c) ? raw : "";
    }
    for (const address of Object.keys(state.cells)) {
      const [r, c] = coordinates(address);
      if (r >= r1 && r <= r2 && c >= c1 && c <= c2) {
        const value = calc(address);
        if (typeof value === "number") nums.push(value);
      }
    }
    if (document.activeElement !== host.querySelector("#cell-address"))
      host.querySelector("#cell-address").value = ref(...selected);
    bar.value = state.cells[ref(...selected)] || "";
    bar.readOnly = !editable(...selected);
    const sum = nums.reduce((a, b) => a + b, 0),
      count = (r2 - r1 + 1) * (c2 - c1 + 1);
    host.querySelector(".workbook-selection").textContent =
      `${count} selected · COUNT ${nums.length} · SUM ${Number(sum.toFixed(6))} · AVERAGE ${nums.length ? Number((sum / nums.length).toFixed(6)) : "—"}`;
  }
  function select(r, c, extend = false) {
    selected = [
      Math.max(0, Math.min(state.rows - 1, r)),
      Math.max(0, Math.min(state.columns - 1, c)),
    ];
    if (!extend) anchor = [...selected];
    if (!inputs[selected[0]]?.[selected[1]]) {
      for (let attempt = 0; attempt < 3; attempt++) {
        grid.scrollTop =
          rowScale() > 1
            ? Math.max(0, (selected[0] - 1) / (state.rows - 2)) *
              (8000083 - grid.clientHeight)
            : Math.max(0, selected[0] - 5) * 44;
        grid.scrollLeft =
          columnScale() > 1
            ? Math.max(0, (selected[1] - 1) / (state.columns - 2)) *
              (8000275 - grid.clientWidth)
            : Math.max(0, selected[1] - 3) * 180;
        render();
        if (inputs[selected[0]]?.[selected[1]]) break;
      }
    } else paint();
  }
  function render() {
    rendering = true;
    const scroll = [grid.scrollTop, grid.scrollLeft];
    const rStart = rowStart(),
      rEnd = state.rows > 80 ? Math.min(state.rows, rStart + 55) : state.rows;
    const cStart = columnStart(),
      cEnd =
        state.columns > 24
          ? Math.min(state.columns, cStart + 16)
          : state.columns;
    windowKey = rStart + ":" + cStart;
    const shownRows = [
      0,
      ...Array.from({ length: rEnd - rStart }, (_, i) => rStart + i),
    ];
    const shownCols = [
      0,
      ...Array.from({ length: cEnd - cStart }, (_, i) => cStart + i),
    ];
    grid.innerHTML = "";
    inputs = [];
    visibleInputs = [];
    const table = document.createElement("table");
    table.setAttribute("aria-label", "Flexible Excel-style worksheet");
    table.setAttribute("aria-rowcount", state.rows + 1);
    table.setAttribute("aria-colcount", state.columns + 1);
    table.style.tableLayout = "fixed";
    table.style.width =
      45 + 230 + ((state.columns - 1) * 180) / columnScale() + "px";
    const colgroup = document.createElement("colgroup");
    const addCol = (width) => {
      const col = document.createElement("col");
      col.style.width = width + "px";
      colgroup.append(col);
    };
    addCol(45);
    addCol(230);
    if (cStart > 1) addCol(columnGap(cStart - 1));
    for (let c = cStart; c < cEnd; c++) addCol(180);
    if (cEnd < state.columns) addCol(columnGap(state.columns - cEnd));
    table.append(colgroup);
    const spacerCell = (row, width, header = false) => {
      const cell = document.createElement(header ? "th" : "td");
      cell.className = "worksheet-spacer";
      cell.setAttribute("aria-hidden", "true");
      cell.style.width = width + "px";
      row.append(cell);
    };
    const head = table.createTHead().insertRow();
    head.append(document.createElement("th"));
    for (const c of shownCols) {
      if (c === cStart && cStart > 1)
        spacerCell(head, columnGap(cStart - 1), true);
      const th = document.createElement("th");
      th.scope = "col";
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = columnName(c);
      button.setAttribute("aria-label", "Select column " + columnName(c));
      button.onclick = () => {
        anchor = [0, c];
        selected = [state.rows - 1, c];
        paint();
        grid.focus();
      };
      th.append(button);
      head.append(th);
    }
    if (cEnd < state.columns)
      spacerCell(head, columnGap(state.columns - cEnd), true);
    const body = table.createTBody();
    function spacerRow(height) {
      const row = body.insertRow();
      row.setAttribute("aria-hidden", "true");
      row.className = "worksheet-spacer";
      const td = row.insertCell();
      td.colSpan =
        1 +
        shownCols.length +
        (cStart > 1 ? 1 : 0) +
        (cEnd < state.columns ? 1 : 0);
      td.style.height = height + "px";
    }
    for (const r of shownRows) {
      if (r === rStart && rStart > 1) spacerRow(rowGap(rStart - 1));
      const row = body.insertRow(),
        th = document.createElement("th");
      th.scope = "row";
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = r + 1;
      button.setAttribute("aria-label", "Select row " + (r + 1));
      button.onclick = () => {
        anchor = [r, 0];
        selected = [r, state.columns - 1];
        paint();
        grid.focus();
      };
      th.append(button);
      row.append(th);
      row.setAttribute("aria-rowindex", r + 2);
      inputs[r] = [];
      for (const c of shownCols) {
        if (c === cStart && cStart > 1) spacerCell(row, columnGap(cStart - 1));
        const input = document.createElement("input");
        input.setAttribute("aria-label", ref(r, c));
        input.autocomplete = "off";
        input.readOnly = !editable(r, c);
        if (
          config.expandable &&
          (r > config.studentCount || c > config.paperCount)
        )
          input.classList.add("working-cell");
        if (bound && c > 0 && r > 0 && !editable(r, c)) {
          input.classList.add("unavailable-cell");
          input.title = "No student/paper match in this class";
        }
        input.spellcheck = false;
        input.onpointerdown = (e) => {
          if (busy) return;
          select(r, c, e.shiftKey);
        };
        input.onfocus = () => {
          selected = [r, c];
          paint();
        };
        input.ondblclick = () => {
          if (!editable(r, c)) return;
          input.value = state.cells[ref(r, c)] || "";
          input.select();
        };
        input.onchange = () => change(() => set(r, c, input.value));
        input.onkeydown = (e) => navigate(e, r, c);
        const td = row.insertCell();
        td.append(input);
        if (bound && r === 0 && c === 0) {
          td.className = "name-heading";
          const picker = document.createElement("details");
          picker.className = "class-heading-picker";
          picker.innerHTML = `<summary aria-label="Choose class" title="Choose class">▾</summary><div class="class-picker-panel"><label>Class<select aria-label="Select class"><option value="">All students</option><option value="unassigned">Students without a class</option>${config.classes.map((cls) => `<option value="${esc(cls._id)}">${esc(cls.name)}</option>`).join("")}</select></label><p>Students and their marks load automatically.</p></div>`;
          const select = picker.querySelector("select");
          select.value = config.classId;
          select.onchange = async () => {
            const previous = config.classId;
            select.disabled = true;
            const success = await config.onClassChange(select.value);
            if (!success) {
              select.value = previous;
              select.disabled = false;
            }
          };
          td.append(picker);
          input.setAttribute("aria-label", "Name header");
        }
        inputs[r][c] = input;
        visibleInputs.push({ r, c, input });
      }
      if (cEnd < state.columns)
        spacerCell(row, columnGap(state.columns - cEnd));
    }
    if (rEnd < state.rows) spacerRow(rowGap(state.rows - rEnd));
    grid.append(table);
    grid.scrollTop = scroll[0];
    grid.scrollLeft = scroll[1];
    paint();
    rendering = false;
  }
  let scrollFrame;
  grid.addEventListener("scroll", () => {
    if (rendering || busy) return;
    cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(() => {
      const nextR = rowStart(),
        nextC = columnStart();
      if (windowKey === nextR + ":" + nextC) return;
      const active = document.activeElement,
        focused = visibleInputs.find((cell) => cell.input === active);
      if (focused) active.blur();
      const redraw = () => {
        render();
        if (focused) {
          const input = inputs[focused.r]?.[focused.c];
          if (input) input.focus({ preventScroll: true });
          else grid.focus({ preventScroll: true });
        }
      };
      if (busy) idle.then(redraw);
      else redraw();
    });
  });
  host.querySelector("#cell-address").onkeydown = (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    try {
      const [r, c] = coordinates(event.target.value);
      if (r >= state.rows || c >= state.columns) {
        if (!config.expandable) throw Error("Cell outside worksheet");
        change(() => {
          state.rows = Math.max(state.rows, r + 1);
          state.columns = Math.max(state.columns, c + 1);
        });
      }
      select(r, c);
      idle.then(() => {
        select(r, c);
        focusCell(r, c);
      });
    } catch (error) {
      message(error.message, true);
    }
  };
  function focusCell(r, c) {
    const input = inputs[r]?.[c];
    if (input) {
      input.focus({ preventScroll: true });
      input.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }
  function set(r, c, value) {
    if (!editable(r, c)) {
      if (value !== (state.cells[ref(r, c)] || ""))
        throw Error(
          "Student names and paper headers are protected. Paste marks starting at column B, row 2.",
        );
      return;
    }
    if (value.length > 1000)
      throw Error("Cell text is limited to 1,000 characters");
    const address = ref(r, c);
    if (value === "") delete state.cells[address];
    else state.cells[address] = value;
  }
  async function persist() {
    busy = true;
    dirty = true;
    message("Saving…");
    host.querySelectorAll("button,input").forEach((el) => (el.disabled = true));
    try {
      const result = config.save
        ? await config.save(state)
        : await api(
            "/admin/workbook",
            {
              rows: state.rows,
              columns: state.columns,
              cells: state.cells,
              revision: state.revision,
            },
            "PUT",
          );
      state.revision = result.revision;
      dirty = false;
      message("All changes saved");
      return true;
    } catch (error) {
      message(
        error.message +
          " Your worksheet is still open; retry saving before leaving.",
        true,
      );
      return false;
    } finally {
      busy = false;
      host
        .querySelectorAll("button,input")
        .forEach((el) => (el.disabled = false));
      paint();
    }
  }
  function change(fn) {
    if (busy) return idle;
    const before = snapshot();
    try {
      fn();
      if (
        (!config.expandable &&
          (state.rows * state.columns > 10000 ||
            state.rows > 500 ||
            state.columns > 100)) ||
        !Number.isSafeInteger(state.rows) ||
        !Number.isSafeInteger(state.columns) ||
        state.rows < 1 ||
        state.columns < 1
      )
        throw Error(
          "Keep between 1 and 500 rows, 1 and 100 columns, and at most 10,000 cells",
        );
      undo.push(before);
      if (undo.length > 50) undo.shift();
      redo = [];
      render();
      idle = persist();
    } catch (error) {
      Object.assign(state, before);
      render();
      message(error.message, true);
    }
    return idle;
  }
  function structure(axis, index, delta) {
    change(() => {
      const next = {};
      for (const [address, raw] of Object.entries(state.cells)) {
        const pos = coordinates(address);
        if (delta < 0 && pos[axis] === index) continue;
        if (pos[axis] >= index) pos[axis] += delta;
        const formula = raw.startsWith("=")
          ? raw.replace(
              /"(?:[^"]|"")*"|(\$?)([A-Z]+)(\$?)([1-9]\d*)/gi,
              (whole, ac, col, ar, row) => {
                if (whole.startsWith('"')) return whole;
                const p = coordinates(col + row);
                if (delta < 0 && p[axis] === index) return "#REF!";
                if (p[axis] >= index) p[axis] += delta;
                return ac + columnName(p[1]) + ar + (p[0] + 1);
              },
            )
          : raw;
        next[ref(...pos)] = formula;
      }
      state.cells = next;
      state[axis === 0 ? "rows" : "columns"] += delta;
      selected[axis] = Math.max(
        0,
        Math.min(selected[axis], state[axis === 0 ? "rows" : "columns"] - 1),
      );
      anchor = [...selected];
    });
  }
  function fill() {
    const [top, left, bottom, right] = bounds();
    if ((bottom - top + 1) * (right - left + 1) > 50000) {
      message(
        "Fill a smaller range at a time; the sheet can keep growing.",
        true,
      );
      return;
    }
    change(() => {
      for (const [r, c] of selection())
        if (r !== top && editable(r, c))
          set(r, c, shiftFormula(state.cells[ref(top, c)] || "", r - top, 0));
    });
  }
  function history(from, to) {
    if (busy || !from.length) return;
    to.push(snapshot());
    Object.assign(state, from.pop());
    selected = [0, 0];
    anchor = [0, 0];
    render();
    idle = persist();
  }
  function navigate(e, r, c) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && ["z", "y", "d"].includes(e.key.toLowerCase())) {
      e.preventDefault();
      if (e.key.toLowerCase() === "d") fill();
      else if (e.key.toLowerCase() === "y" || e.shiftKey) history(redo, undo);
      else history(undo, redo);
      return;
    }
    if (e.key === "Delete") {
      e.preventDefault();
      change(() =>
        Object.keys(state.cells)
          .map(coordinates)
          .filter(([r, c]) => {
            const [r1, c1, r2, c2] = bounds();
            return r >= r1 && r <= r2 && c >= c1 && c <= c2;
          })
          .filter(([r, c]) => editable(r, c))
          .forEach(([r, c]) => set(r, c, "")),
      );
      return;
    }
    if (e.key === "F2") {
      e.preventDefault();
      bar.focus();
      bar.select();
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
    if (!delta) return;
    if (
      e.key === "Tab" &&
      ((r === state.rows - 1 && c === state.columns - 1 && !e.shiftKey) ||
        (r === 0 && c === 0 && e.shiftKey))
    )
      return;
    e.preventDefault();
    let nr = r + delta[0],
      nc = c + delta[1];
    if (nc >= state.columns) {
      nc = 0;
      nr++;
    }
    if (nc < 0) {
      nc = state.columns - 1;
      nr--;
    }
    if (
      inputs[r]?.[c] &&
      inputs[r][c].value !==
        String(calculator(state.cells, state.rows, state.columns)(ref(r, c)))
    ) {
      inputs[r][c].blur();
      idle.then(() => {
        select(nr, nc);
        focusCell(...selected);
      });
    } else {
      select(nr, nc, e.shiftKey && e.key.startsWith("Arrow"));
      focusCell(...selected);
    }
  }
  grid.addEventListener("keydown", (event) => {
    if (event.target === grid) navigate(event, ...selected);
  });
  bar.onchange = () => change(() => set(...selected, bar.value));
  bar.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      bar.blur();
      idle.then(() => focusCell(...selected));
    }
  };
  host.querySelector(".workbook-ribbon").onclick = (e) => {
    const action = e.target.closest("button")?.dataset.action;
    if (!action || busy) return;
    if (action === "working-row") {
      change(() => {
        state.rows++;
      });
      idle.then(() => {
        select(state.rows - 1, 0);
        focusCell(...selected);
      });
    }
    if (action === "working-column") {
      change(() => {
        state.columns++;
      });
      idle.then(() => {
        select(0, state.columns - 1);
        focusCell(...selected);
      });
    }
    if (action === "add-row") {
      if (bound) config.addStudent?.();
      else structure(0, state.rows, 1);
    }
    if (action === "add-column") {
      if (bound) config.addPaper?.();
      else structure(1, state.columns, 1);
    }
    if (action === "insert-row") structure(0, selected[0], 1);
    if (action === "insert-column") structure(1, selected[1], 1);
    if (action === "delete-row" || action === "delete-column") {
      const axis = action === "delete-row" ? 0 : 1;
      if (
        confirm(
          "Delete the selected " +
            (axis === 0 ? "row" : "column") +
            " and its worksheet values? This can be undone.",
        )
      )
        structure(axis, selected[axis], -1);
    }
    if (action === "undo") history(undo, redo);
    if (action === "redo") history(redo, undo);
    if (action === "fill") fill();
    if (action === "retry") idle = persist();
    if (
      action === "import" &&
      confirm(
        "Replace this worksheet with a current marks snapshot? This does not change student results.",
      )
    )
      change(() => {
        state.cells = {};
        state.rows = Math.max(30, data.students.length + 1);
        state.columns = Math.max(12, data.papers.length + 1);
        set(0, 0, "Student");
        data.papers.forEach((p, c) => set(0, c + 1, p.name));
        data.students.forEach((s, r) => {
          set(r + 1, 0, s.name);
          data.papers.forEach((p, c) => {
            const m = data.marks.find(
              (m) => m.studentId === s._id && m.paperId === p._id,
            );
            if (m)
              set(
                r + 1,
                c + 1,
                m.status === "absent" ? "A" : String(m.value ?? ""),
              );
          });
        });
      });
  };
  grid.addEventListener("copy", (e) => {
    e.preventDefault();
    const [r1, c1, r2, c2] = bounds();
    if ((r2 - r1 + 1) * (c2 - c1 + 1) > 50000) {
      message(
        "Copy a smaller range at a time; the sheet can keep growing.",
        true,
      );
      return;
    }
    const calc = calculator(state.cells, state.rows, state.columns),
      lines = [];
    for (let r = r1; r <= r2; r++) {
      const row = [];
      for (let c = c1; c <= c2; c++) row.push(String(calc(ref(r, c))));
      lines.push(row.join("\t"));
    }
    e.clipboardData.setData("text/plain", lines.join("\n"));
    const raw = [];
    for (let r = r1; r <= r2; r++) {
      const row = [];
      for (let c = c1; c <= c2; c++) row.push(state.cells[ref(r, c)] || "");
      raw.push(row);
    }
    e.clipboardData.setData(
      "application/x-levelup-cells",
      JSON.stringify({ origin: [r1, c1], rows: raw }),
    );
    notify(
      "Copied. Worksheet pastes preserve formulas; pastes into student marks use calculated values.",
    );
  });
  grid.addEventListener("paste", (e) => {
    e.preventDefault();
    let lines = e.clipboardData
      .getData("text/plain")
      .replace(/\r/g, "")
      .replace(/\n$/, "")
      .split("\n")
      .map((x) => x.split("\t"));
    const internal = e.clipboardData.getData("application/x-levelup-cells");
    if (internal && internal.length < 1000000) {
      try {
        const copied = JSON.parse(internal);
        if (
          !Array.isArray(copied.origin) ||
          copied.origin.length !== 2 ||
          !copied.origin.every(Number.isInteger) ||
          !Array.isArray(copied.rows) ||
          !copied.rows.length ||
          (!config.expandable && copied.rows.length > 2000) ||
          !copied.rows.every(
            (row) =>
              Array.isArray(row) &&
              row.length > 0 &&
              (config.expandable || row.length <= 2000) &&
              row.every(
                (value) => typeof value === "string" && value.length <= 1000,
              ),
          )
        )
          throw Error();
        lines = copied.rows.map((row) =>
          row.map((raw) =>
            shiftFormula(
              raw,
              selected[0] - copied.origin[0],
              selected[1] - copied.origin[1],
            ),
          ),
        );
      } catch {
        message("Invalid worksheet clipboard data", true);
        return;
      }
    }
    if (
      !config.expandable &&
      lines.reduce((n, row) => n + row.length, 0) > 2000
    ) {
      message("Paste at most 2,000 cells at once", true);
      return;
    }
    change(() => {
      if (
        bound &&
        !config.expandable &&
        (selected[0] + lines.length > state.rows ||
          selected[1] + Math.max(...lines.map((row) => row.length)) >
            state.columns)
      )
        throw Error(
          "Paste exceeds this class worksheet. Add student rows or paper columns first.",
        );
      const height = selected[0] + lines.length,
        width = selected[1] + Math.max(...lines.map((x) => x.length));
      state.rows = Math.max(state.rows, height);
      state.columns = Math.max(state.columns, width);
      lines.forEach((row, dr) =>
        row.forEach((value, dc) =>
          set(selected[0] + dr, selected[1] + dc, value),
        ),
      );
    });
  });
  render();
  return {
    isBusy: () => busy,
    whenIdle: () => idle,
    hasUnsavedChanges: () => {
      if (busy || dirty || bar.value !== (state.cells[ref(...selected)] || ""))
        return true;
      const active = document.activeElement;
      if (!grid.contains(active) || active.tagName !== "INPUT") return false;
      const address = active.getAttribute("aria-label");
      return (
        active.value !== (state.cells[address] || "") &&
        active.value !==
          String(calculator(state.cells, state.rows, state.columns)(address))
      );
    },
  };
}
