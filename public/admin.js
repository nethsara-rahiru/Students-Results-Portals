import { mountSheet } from "./sheet.js";
import { api, app, esc, btn, shell, notify } from "./client.js";
let sessionInfo, sheet;
const pageTitles = {
  marks: "Marks",
  students: "Students",
  papers: "Papers",
  classes: "Classes",
  performance: "Performance",
  history: "History",
};
const pagePaths = new Set(
  Object.keys(pageTitles).map((page) => "/admin/" + page),
);
function loginDestination() {
  const next = new URLSearchParams(location.search).get("next");
  return pagePaths.has(next) ? next : "/admin/marks";
}
function requireLogin() {
  location.replace(
    "/admin/login?next=" + encodeURIComponent(location.pathname),
  );
}
function login() {
  shell(
    `<main class="center"><form id="login" class="panel stack"><p class="eyebrow">TEACHER WORKSPACE</p><h1>Welcome back.</h1><p class="muted">A clear view of every student’s progress.</p><label for="username">Username</label><input id="username" name="username" autocomplete="username" required><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required><button>Sign in →</button><p id="error" role="alert"></p></form></main>`,
    true,
  );
  document.querySelector("#login").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api("/login", {
        username: e.target.elements.username.value,
        password: e.target.elements.password.value,
      });
      location.assign(loginDestination());
    } catch (e) {
      document.querySelector("#error").textContent = e.message;
    }
  };
}
function field(label, name, value = "", type = "text", extra = "") {
  return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
}
function options(classes, selected) {
  return (
    `<option value="">All students / no class</option>` +
    classes
      .map(
        (c) =>
          `<option value="${c._id}" ${selected === c._id ? "selected" : ""}>${esc(c.name)}</option>`,
      )
      .join("")
  );
}
function dialog(title, fields, onSubmit) {
  const d = document.createElement("dialog");
  d.innerHTML = `<form class="stack"><div class="top"><h2>${title}</h2><button type="button" class="secondary" id="close-dialog" aria-label="Close dialog">×</button></div>${fields}<p class="form-error" role="alert"></p><button>Save changes</button></form>`;
  document.body.append(d);
  d.querySelector("#close-dialog").onclick = () => d.close();
  d.addEventListener("close", () => d.remove());
  d.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    try {
      if (sheet?.isBusy() && !(await sheet.whenIdle()))
        throw Error(
          "The previous marks edit could not be saved. Please retry it first.",
        );
      await onSubmit(Object.fromEntries(new FormData(e.target)));
      d.close();
      location.reload();
    } catch (e) {
      d.querySelector(".form-error").textContent = e.message;
    }
  };
  d.showModal();
}
async function admin() {
  const data = await api("/admin/data");
  const page = document.body.dataset.adminPage;
  sheet = null;
  shell(
    `<main class="dashboard"><div class="top dashboard-title"><div><p class="eyebrow">TEACHER WORKSPACE</p><h1>${pageTitles[page]}</h1></div><button class="secondary" id="logout">Sign out</button></div><div class="stats"><article><span>Active students</span><strong>${data.students.filter((s) => s.active).length}</strong></article><article><span>Papers</span><strong>${data.papers.length}</strong></article><article><span>Published</span><strong>${data.papers.filter((p) => p.state === "published").length}</strong></article><article><span>Classes</span><strong>${data.classes.length}</strong></article></div><nav class="admin-nav" aria-label="Workspace sections">${Object.entries(
      pageTitles,
    )
      .map(
        ([key, title]) =>
          `<a href="/admin/${key}" class="secondary ${key === page ? "active" : ""}" ${key === page ? 'aria-current="page"' : ""}>${title}</a>`,
      )
      .join(
        "",
      )}</nav><section class="panel workspace"><div id="workspace"></div></section></main>`,
    true,
  );
  document.querySelector("#logout").onclick = async () => {
    document.activeElement?.blur();
    if (sheet?.isBusy() && !(await sheet.whenIdle())) {
      notify("Please retry your marks save before signing out.");
      return;
    }
    await api("/logout", {});
    location.replace("/admin/login");
  };
  const area = document.querySelector("#workspace");
  document.querySelectorAll(".admin-nav a, .site-header a").forEach((link) => {
    link.addEventListener("click", async (event) => {
      if (
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      document.activeElement?.blur();
      if (!sheet?.isBusy()) return;
      event.preventDefault();
      if (await sheet.whenIdle()) location.assign(link.href);
      else
        notify(
          "Your latest change could not be saved. Please retry before leaving.",
        );
    });
  });
  function studentForm(s) {
    dialog(
      s ? "Edit student" : "Add student",
      field(
        "Full name",
        "name",
        s?.name || "",
        "text",
        'required maxlength="100"',
      ) +
        field(
          "Profile label (distinguishes duplicate names)",
          "label",
          s?.label || "",
        ) +
        `<label>Class<select name="classId">${options(data.classes, s?.classId)}</select></label><label>Status<select name="active"><option value="true">Active</option><option value="false" ${s?.active === false ? "selected" : ""}>Inactive</option></select></label>` +
        field(
          "New access code (optional, 8+ characters)",
          "accessCode",
          "",
          "password",
          'autocomplete="new-password"',
        ),
      (f) =>
        api(
          "/admin/students" + (s ? "/" + s._id : ""),
          { ...f, active: f.active === "true", classId: f.classId || null },
          s ? "PATCH" : "POST",
        ),
    );
  }
  function paperForm(p) {
    dialog(
      p ? "Edit paper" : "Create paper",
      field("Paper name", "name", p?.name || "", "text", "required") +
        `<div class="form-grid">${field("Subject", "subject", p?.subject || "")}${field("Grade", "grade", p?.grade || "")}${field("Paper date", "date", p?.date || "", "date")}${field("Maximum marks", "max", p?.max || 100, "number", 'min="1" max="10000" required')}</div><label>Class<select name="classId">${options(data.classes, p?.classId)}</select></label><label>Publication status<select name="state">${["draft", "published", "unpublished"].map((s) => `<option ${s === (p?.state || "draft") ? "selected" : ""}>${s}</option>`).join("")}</select></label><p class="privacy">Publishing makes entered marks accessible in the configured student access mode. Verify marks before publishing.</p>`,
      (f) =>
        api(
          "/admin/papers" + (p ? "/" + p._id : ""),
          { ...f, max: Number(f.max), classId: f.classId || null },
          p ? "PATCH" : "POST",
        ),
    );
  }
  async function render() {
    if (page === "marks") {
      area.innerHTML = `<div class="top"><div><h2>Marks studio</h2><p class="muted">One clear view. Every paper, in reveal order.</p></div><button id="add-paper">+ Create paper</button></div><div class="toolbar"><label class="search">Find student<input id="search" type="search" placeholder="Search by name"></label><label>Class<select id="class-filter">${options(data.classes, null)}</select></label><label>Sort<select id="sort"><option value="asc">Name A–Z</option><option value="desc">Name Z–A</option></select></label><button id="undo" class="secondary">Undo</button><button id="redo" class="secondary">Redo</button><button id="fill" class="secondary">Fill down</button></div><p class="sheet-help">Shift + arrows selects a range · Tab / Enter navigates · Copy / paste from Excel · Ctrl/⌘ + D fills down · Delete clears · A = absent · Blank = no result</p><p id="save-status" role="status">All changes saved</p><div id="sheet" class="sheet" tabindex="0" aria-label="Scrollable marks editor"></div>`;
      document.querySelector("#add-paper").onclick = () => paperForm();
      const draw = () => {
        if (sheet?.isBusy()) return;
        area.querySelector(".sheet-calculations")?.remove();
        const q = document.querySelector("#search").value.toLowerCase(),
          cls = document.querySelector("#class-filter").value;
        const students = data.students
          .filter(
            (s) =>
              s.active &&
              s.name.toLowerCase().includes(q) &&
              (!cls || s.classId === cls),
          )
          .sort(
            (a, b) =>
              (document.querySelector("#sort").value === "desc" ? -1 : 1) *
              a.name.localeCompare(b.name),
          );
        const papers = data.papers.filter(
          (p) => !cls || !p.classId || p.classId === cls,
        );
        sheet = mountSheet(document.querySelector("#sheet"), {
          students,
          papers,
          marks: data.marks,
          save: async (entries) => {
            await api("/admin/marks", { entries }, "PUT");
            for (const e of entries) {
              let m = data.marks.find(
                (m) => m.studentId === e.studentId && m.paperId === e.paperId,
              );
              if (m) Object.assign(m, e);
              else data.marks.push({ ...e });
            }
          },
          onStatus: (s, err) => {
            const status = document.querySelector("#save-status");
            if (status) {
              status.textContent = s;
              status.classList.toggle("error", !!err);
            }
          },
        });
      };
      for (const selector of ["#search", "#class-filter", "#sort"])
        document
          .querySelector(selector)
          .addEventListener(selector === "#search" ? "input" : "change", draw);
      draw();
      for (const action of ["undo", "redo", "fill"])
        document.querySelector("#" + action).onclick = () => sheet[action]();
    } else if (page === "students") {
      area.innerHTML =
        '<div class="top"><h2>Student directory</h2><button id="add">+ Add student</button></div><div class="management-list"></div>';
      area.querySelector("#add").onclick = () => studentForm();
      for (const s of data.students) {
        const row = document.createElement("div");
        row.className = "management-row";
        row.innerHTML = `<div><strong>${esc(s.name)}</strong><small>${esc(s.label)} · ${esc(data.classes.find((c) => c._id === s.classId)?.name || "No class")} · ${s.active ? "Active" : "Inactive"}</small></div>`;
        row.append(btn("Edit profile", () => studentForm(s), "secondary"));
        area.querySelector(".management-list").append(row);
      }
    } else if (page === "papers") {
      area.innerHTML =
        '<div class="top"><h2>Papers & publishing</h2><button id="add">+ Create paper</button></div><p class="muted">This order controls spreadsheet columns and the student reveal. Only published papers are visible to students.</p><div class="management-list"></div>';
      area.querySelector("#add").onclick = () => paperForm();
      data.papers.forEach((p, i) => {
        const row = document.createElement("div");
        row.className = "management-row";
        row.innerHTML = `<div><span class="status-tag ${p.state}">${esc(p.state)}</span><strong>${esc(p.name)}</strong><small>${esc(p.subject)} · ${esc(p.grade)} · ${esc(p.date)} · / ${p.max}</small></div>`;
        row.append(btn("Edit / publish", () => paperForm(p), "secondary"));
        const up = btn(
          "Move left",
          async () => {
            const ids = data.papers.map((p) => p._id);
            [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
            try {
              await api("/admin/paper-order", { ids }, "PUT");
              location.reload();
            } catch (e) {
              notify(e.message);
            }
          },
          "secondary",
        );
        up.disabled = i === 0;
        row.append(up);
        area.querySelector(".management-list").append(row);
      });
    } else if (page === "classes") {
      area.innerHTML =
        '<div class="top"><h2>Classes</h2><button id="add">+ Create class</button></div><div class="management-list"></div>';
      const edit = (c) =>
        dialog(
          c ? "Edit class" : "Create class",
          field("Class name", "name", c?.name || "", "text", "required"),
          (f) =>
            api(
              "/admin/classes" + (c ? "/" + c._id : ""),
              f,
              c ? "PATCH" : "POST",
            ),
        );
      area.querySelector("#add").onclick = () => edit();
      for (const c of data.classes) {
        const row = document.createElement("div");
        row.className = "management-row";
        row.innerHTML = `<strong>${esc(c.name)}</strong><span>${data.students.filter((s) => s.classId === c._id && s.active).length} active students</span>`;
        row.append(btn("Edit class", () => edit(c), "secondary"));
        area.querySelector(".management-list").append(row);
      }
    } else if (page === "performance") {
      area.innerHTML =
        '<h2>Performance overview</h2><p class="muted">Percentages normalize different maximum marks. Absent and blank entries are excluded.</p><div class="management-list"></div>';
      for (const s of data.students) {
        const results = data.papers.flatMap((p) => {
          const m = data.marks.find(
            (m) => m.studentId === s._id && m.paperId === p._id,
          );
          return m && m.status !== "absent" && typeof m.value === "number"
            ? [(100 * m.value) / p.max]
            : [];
        });
        const row = document.createElement("div");
        row.className = "management-row";
        row.innerHTML = `<strong>${esc(s.name)}</strong><span>${results.length} results · ${results.length ? (results.reduce((a, b) => a + b, 0) / results.length).toFixed(1) + "% average" : "No entered marks"}</span>`;
        area.querySelector(".management-list").append(row);
      }
    } else {
      area.innerHTML =
        '<h2>Change history</h2><p class="muted">Latest 200 events. Marks include the previous and new value.</p><div id="audit" class="audit-list">Loading…</div>';
      try {
        const logs = await api("/admin/audit");
        document.querySelector("#audit").innerHTML =
          logs
            .map(
              (l) =>
                `<details><summary>${esc(new Date(l.createdAt).toLocaleString())} · ${esc(l.actor)} · ${esc(l.action)} ${esc(l.entity)}</summary><pre>${esc(JSON.stringify(l.changes, null, 2))}</pre></details>`,
            )
            .join("") || "No changes yet.";
      } catch (e) {
        document.querySelector("#audit").textContent = e.message;
      }
    }
  }
  await render();
}

window.addEventListener("beforeunload", (event) => {
  if (sheet?.hasUnsavedChanges()) {
    event.preventDefault();
    event.returnValue = "";
  }
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) location.reload();
});
try {
  sessionInfo = await api("/session");
  if (document.body.dataset.adminPage === "login") {
    if (sessionInfo.admin) location.replace(loginDestination());
    else login();
  } else if (!sessionInfo.admin) requireLogin();
  else await admin();
} catch (error) {
  if (error.status === 401) requireLogin();
  else
    app.innerHTML = `<main class="center"><section class="panel stack"><h1>Unable to load this page.</h1><p role="alert">${esc(error.message)}</p><button id="retry">Try again</button></section></main>`;
  document
    .querySelector("#retry")
    ?.addEventListener("click", () => location.reload());
}
