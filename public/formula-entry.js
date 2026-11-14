// Formula editing UI only; evaluation remains in the restricted formula interpreter.
export const functions = [
  ["SUM", "Add numbers in cells or ranges"],
  ["AVERAGE", "Average numeric values"],
  ["MIN", "Find the lowest number"],
  ["MAX", "Find the highest number"],
  ["COUNT", "Count numeric values"],
  ["COUNTA", "Count non-empty values"],
  ["ROUND", "Round a number to decimal places"],
  ["ABS", "Return an absolute value"],
  ["IF", "Choose between two results"],
  ["AND", "Check every condition"],
  ["OR", "Check any condition"],
  ["NOT", "Reverse a logical value"],
];
export function suggestionsFor(value, caret = value.length) {
  if (!value.startsWith("=")) return [];
  let quoted = false;
  const prefix = value.slice(0, caret);
  for (let i = 0; i < prefix.length; i++)
    if (prefix[i] === '"') {
      if (quoted && prefix[i + 1] === '"') i++;
      else quoted = !quoted;
    }
  if (quoted) return [];
  const token = /(?:^=|[,(+\-*/^<>=])\s*([A-Z_]*)$/i.exec(
    value.slice(0, caret),
  );
  if (!token) return [];
  return functions.filter(([name]) => name.startsWith(token[1].toUpperCase()));
}
export function createFormulaEntry({
  host,
  bar,
  address,
  getRaw,
  getValue,
  commit,
  onDraft,
  canEdit,
  onCancel,
  getSelected,
}) {
  let edit = null,
    matches = [],
    active = 0,
    transfer = false;
  const panel = document.createElement("div");
  panel.className = "formula-suggestions";
  panel.id = "formula-function-list";
  panel.setAttribute("role", "listbox");
  panel.setAttribute("aria-label", "Formula functions");
  panel.hidden = true;
  const hint = document.createElement("p");
  hint.id = "formula-entry-help";
  hint.className = "formula-entry-help";
  hint.hidden = true;
  hint.setAttribute("role", "status");
  hint.textContent =
    "Click cells to insert references · Drag for a range · Enter to apply · Esc to cancel";
  host.querySelector(".formula-bar").after(panel, hint);
  function clearHighlights() {
    host
      .querySelectorAll(".reference-selected")
      .forEach((el) => el.classList.remove("reference-selected"));
  }
  function hide() {
    panel.hidden = true;
    matches = [];
    if (edit) {
      edit.input.removeAttribute("aria-activedescendant");
      edit.input.removeAttribute("aria-controls");
    }
  }
  function configure(input) {
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-describedby", hint.id);
    input.setAttribute("aria-controls", panel.id);
  }
  function begin(input, r, c) {
    if (!input.value.startsWith("=") || !canEdit(r, c)) return;
    if (!edit || edit.r !== r || edit.c !== c || edit.input !== input) {
      edit = {
        input,
        r,
        c,
        draft: input.value,
        reference: null,
        dragging: false,
      };
    }
    edit.draft = input.value;
    configure(input);
    hint.hidden = false;
  }
  function refresh() {
    if (!edit) return;
    const { input } = edit;
    edit.draft = input.value;
    onDraft?.(edit.draft);
    matches = suggestionsFor(
      input.value,
      input.selectionStart ?? input.value.length,
    );
    active = 0;
    panel.replaceChildren();
    panel.hidden = !matches.length;
    matches.forEach(([name, description], index) => {
      const option = document.createElement("div");
      option.setAttribute("role", "option");
      option.id = "formula-option-" + name;
      option.setAttribute("aria-selected", String(index === 0));
      const title = document.createElement("strong");
      title.textContent = name;
      const detail = document.createElement("span");
      detail.textContent = description;
      option.append(title, detail);
      option.onpointerdown = (event) => event.preventDefault();
      option.onclick = () => choose(index);
      panel.append(option);
    });
    if (matches.length)
      input.setAttribute("aria-activedescendant", panel.children[0].id);
    else input.removeAttribute("aria-activedescendant");
  }
  function inputChanged(input, r, c) {
    if (transfer) return;
    if (!input.value.startsWith("=")) {
      if (edit?.input === input) end();
      return;
    }
    begin(input, r, c);
    if (!edit) return;
    edit.reference = null;
    refresh();
  }
  function replace(start, end, text) {
    const input = edit.input;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    input.setSelectionRange(start + text.length, start + text.length);
    edit.draft = input.value;
    onDraft?.(edit.draft);
    input.focus({ preventScroll: true });
  }
  function choose(index) {
    if (!edit || !matches[index]) return;
    const input = edit.input,
      caret = input.selectionStart ?? input.value.length,
      token = /[A-Z_]*$/i.exec(input.value.slice(0, caret))[0];
    const name = matches[index][0],
      suffix = input.value[caret] === "(" ? name : name + "(";
    replace(caret - token.length, input.selectionEnd ?? caret, suffix);
    edit.reference = null;
    hide();
  }
  function end() {
    if (edit) {
      edit.input.removeAttribute("aria-activedescendant");
      edit.input.removeAttribute("aria-controls");
      edit.input.removeAttribute("aria-describedby");
    }
    hide();
    edit = null;
    hint.hidden = true;
    clearHighlights();
  }
  function changed(input, r, c) {
    if (transfer) return;
    if (edit?.input === input) {
      const value = input.value;
      end();
      commit(r, c, value);
      return;
    }
    commit(r, c, input.value);
  }
  function keydown(event, input, r, c) {
    if (
      !edit &&
      event.key === "=" &&
      input !== bar &&
      canEdit(r, c) &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      event.preventDefault();
      input.value = "=";
      inputChanged(input, r, c);
      return true;
    }
    if (!edit || edit.input !== input) return false;
    if (event.key === "Escape") {
      event.preventDefault();
      const old = edit;
      end();
      input.value =
        input === bar ? getRaw(old.r, old.c) : String(getValue(old.r, old.c));
      onCancel?.();
      return true;
    }
    if (!panel.hidden && ["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      active =
        (active + (event.key === "ArrowDown" ? 1 : -1) + matches.length) %
        matches.length;
      [...panel.children].forEach((option, i) =>
        option.setAttribute("aria-selected", String(i === active)),
      );
      input.setAttribute("aria-activedescendant", panel.children[active].id);
      panel.children[active].scrollIntoView({ block: "nearest" });
      return true;
    }
    if (!panel.hidden && ["Enter", "Tab"].includes(event.key)) {
      event.preventDefault();
      choose(active);
      return true;
    }
    if (["Enter", "Tab"].includes(event.key)) {
      hide();
      if (edit.draft === getRaw(edit.r, edit.c)) end();
      return false;
    }
    return true; // Keep native caret, text selection, deletion and text undo while editing.
  }
  function insertReference(r, c, event) {
    if (
      !edit ||
      !edit.draft.startsWith("=") ||
      edit.input === event.currentTarget
    )
      return false;
    event.preventDefault();
    const input = edit.input,
      previous = edit.reference,
      caret = input.selectionStart ?? input.value.length;
    const start = previous && caret === previous.end ? previous.start : caret,
      end =
        previous && caret === previous.end
          ? previous.end
          : (input.selectionEnd ?? caret);
    const value = address(r, c);
    replace(start, end, value);
    edit.reference = { start, end: start + value.length, r, c };
    edit.dragging = true;
    hide();
    highlight(r, c, r, c);
    document.addEventListener(
      "pointerup",
      () => {
        if (edit) edit.dragging = false;
      },
      { once: true },
    );
    return true;
  }
  function highlight(r1, c1, r2, c2) {
    clearHighlights();
    for (const input of host.querySelectorAll(
      ".workbook-grid input[data-formula-row]",
    )) {
      const r = Number(input.dataset.formulaRow),
        c = Number(input.dataset.formulaColumn);
      if (
        r >= Math.min(r1, r2) &&
        r <= Math.max(r1, r2) &&
        c >= Math.min(c1, c2) &&
        c <= Math.max(c1, c2)
      )
        input.classList.add("reference-selected");
    }
  }
  function pointerEnter(r, c, event) {
    if (!edit?.dragging || !(event.buttons & 1) || !edit.reference) return;
    const first = edit.reference,
      text =
        address(first.r, first.c) +
        (first.r === r && first.c === c ? "" : ":" + address(r, c));
    replace(first.start, first.end, text);
    edit.reference.end = first.start + text.length;
    highlight(first.r, first.c, r, c);
  }
  function moveToBar() {
    if (!edit || edit.input === bar) return;
    const old = edit.input,
      caret = old.selectionStart ?? edit.draft.length;
    transfer = true;
    bar.value = edit.draft;
    edit.input = bar;
    bar.readOnly = false;
    bar.focus({ preventScroll: true });
    bar.setSelectionRange(caret, caret);
    transfer = false;
    configure(bar);
  }
  function attach(input, r, c) {
    input.dataset.formulaRow = r;
    input.dataset.formulaColumn = c;
    input.oninput = () => inputChanged(input, r, c);
  }
  return {
    attach,
    changed,
    keydown,
    insertReference,
    pointerEnter,
    moveToBar,
    end,
    startBar: () => {
      const [r, c] = getSelected();
      begin(bar, r, c);
    },
    barInput: () => {
      const [r, c] = getSelected();
      inputChanged(bar, r, c);
    },
    draft: () => edit?.draft,
    editing: () => !!edit,
    owns: (input) => edit?.input === input,
    dirty: () => !!edit && edit.draft !== getRaw(edit.r, edit.c),
  };
}
