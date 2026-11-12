import { mountSheet } from "./sheet.js";
import { animateScore, motivation, celebrate } from "./reveal.js";
const app = document.querySelector("#app");
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let sessionInfo, studentProfile, finishSpin, sheet;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
async function api(url, body, method = body ? "POST" : "GET") {
  const response = await fetch("/api" + url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": sessionInfo?.csrf || "",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || "Request failed");
    error.status = response.status;
    throw error;
  }
  return data;
}
const btn = (label, action, className = "") => {
  const b = document.createElement("button");
  b.textContent = label;
  b.className = className;
  b.onclick = action;
  return b;
};
const brand =
  '<a class="brand" href="/" aria-label="LevelUp Results home"><span class="brand-mark"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M5 18 18 5M6 5h12v12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span> LevelUp<span class="brand-light">Results</span></a>';
function shell(content, admin = false) {
  finishSpin = null;
  app.innerHTML = `<header class="site-header">${brand}<span class="eyebrow">${admin ? "TEACHER WORKSPACE" : "YOUR NEXT CHAPTER"}</span></header>${content}<footer>LevelUp Results <span>Small steps. Meaningful progress.</span></footer>`;
  document.querySelector("main")?.setAttribute("tabindex", "-1");
  document.querySelector("main")?.focus({ preventScroll: true });
}
function home() {
  shell(
    `<main class="welcome"><section class="welcome-copy"><div class="eyebrow pill">A LITTLE EFFORT. A NEW LEVEL.</div><h1>Your effort.<br>Your progress.<br><span>Your next level.</span></h1><p class="lead">Behind every result is a story of learning.<br>Let’s discover your next chapter.</p><div class="journey-preview"><span>01 &nbsp; Find your profile</span><span>02 &nbsp; Unlock your results</span><span>03 &nbsp; Keep growing</span></div></section><section class="panel identity"><div class="mini-icon">✦</div><p class="eyebrow">WELCOME TO LEVELUP</p><h2>Let’s find you.</h2><p class="muted">Enter the full name your teacher has registered.</p><form id="find" class="stack"><label for="student-name">Full name</label><input id="student-name" name="name" placeholder="Your full name" maxlength="100" minlength="2" required autocomplete="name"><button>Find my profile <span>→</span></button></form><div id="suggest" class="stack" aria-live="polite"></div><p class="privacy">${sessionInfo.accessMode === "code" ? "Your teacher’s access code is required to view results." : "Name-based access shares published results with anyone who knows your name. It does not verify identity."}</p></section></main>`,
  );
  document.querySelector("#find").onsubmit = async (e) => {
    e.preventDefault();
    const target = document.querySelector("#suggest");
    target.textContent = "Finding your profile…";
    try {
      const result = await api("/lookup", {
        name: e.target.elements.name.value,
      });
      target.innerHTML = `<p>${result.exact ? "Is this your profile?" : "No exact match. Select your profile below."}</p>`;
      if (!result.students.length)
        target.textContent =
          "No matching profiles. Please contact your teacher.";
      for (const s of result.students) {
        const b = btn(
          `${s.name} · ${s.label}`,
          () => choose(s),
          "profile-card",
        );
        target.append(b);
      }
    } catch (e) {
      target.textContent = e.message;
    }
  };
}
async function choose(s) {
  studentProfile = s;
  if (sessionInfo.accessMode === "code") return accessCode(s);
  localStorage.setItem("levelup.student", JSON.stringify(s));
  welcome(s);
}
function accessCode(s) {
  shell(
    `<main class="center"><section class="panel stack"><p class="eyebrow">STUDENT ACCESS</p><h1>Welcome, ${esc(s.name)}</h1><form id="access" class="stack"><label for="code">Your teacher’s access code</label><input id="code" name="code" type="password" minlength="8" required autocomplete="off"><button>Open my results →</button><p id="error" role="alert"></p></form></section></main>`,
  );
  document.querySelector("#access").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api("/student/access", {
        studentId: s._id,
        code: e.target.elements.code.value,
      });
      localStorage.setItem("levelup.student", JSON.stringify(s));
      welcome(s);
    } catch (e) {
      document.querySelector("#error").textContent = e.message;
    }
  };
}
function welcome(s) {
  studentProfile = s;
  shell(
    `<main class="center"><section class="welcome-back appear"><div class="orb"><svg viewBox="0 0 24 24" width="50" height="50" aria-hidden="true"><path d="M5 18 18 5M6 5h12v12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div><p class="eyebrow">THIS MOMENT IS YOURS</p><h1>Welcome back,<br><span>${esc(s.name)}.</span></h1><p class="lead">A new chapter of progress is ready for you.</p><button id="start">Discover my results →</button><p id="error" role="status"></p><p class="privacy">This browser remembers your profile for convenience.<br>Browser storage is not an identity lock.</p></section></main>`,
  );
  document.querySelector("#start").onclick = async () => {
    try {
      const data = await api("/results/" + s._id);
      if (!data.papers.length) {
        document.querySelector("#error").textContent =
          "Your teacher has not published any results for you yet.";
        return;
      }
      paperIntro(data, 0);
    } catch (e) {
      if (e.status === 401) return accessCode(s);
      document.querySelector("#error").textContent = e.message;
      if (e.status === 404) {
        localStorage.removeItem("levelup.student");
        document.querySelector("#error").append(btn("Find my profile", home));
      }
    }
  };
}
function paperIntro(data, index) {
  const p = data.papers[index];
  shell(
    `<main class="center paper-intro appear"><p class="eyebrow">PAPER ${String(index + 1).padStart(2, "0")} / ${String(data.papers.length).padStart(2, "0")}</p><button class="paper-card" id="paper"><span class="paper-symbol">✧</span><small>${esc(p.subject || "YOUR NEXT CHALLENGE")}</small><h1>${esc(p.name)}</h1><span>${p.max} possible marks</span><strong>Click to reveal your result →</strong></button><p class="muted">Take a breath. You’ve put in the work.</p></main>`,
  );
  document.querySelector("#paper").onclick = () => reveal(data, index);
}
function reveal(data, index) {
  const p = data.papers[index],
    last = index === data.papers.length - 1;
  shell(
    `<main class="reveal ${last ? "final" : ""}"><p class="eyebrow">${last ? "THE FINAL CHAPTER" : "YOUR PROGRESS, REVEALED"} · ${index + 1} / ${data.papers.length}</p><h1>${esc(p.name)}</h1><div id="score" class="score" role="img"></div><p class="out-of">OUT OF ${p.max}</p><div id="message" aria-live="polite"></div><div id="actions" class="row"></div><div class="dots">${data.papers.map((_, i) => `<i class="dot ${i === index ? "on" : ""}"></i>`).join("")}</div></main>`,
  );
  const actions = document.querySelector("#actions");
  finishSpin = animateScore(document.querySelector("#score"), p.value, {
    reduced: reduced(),
    onFinish: () => {
      document.querySelector("#message").innerHTML =
        `${last ? '<div class="badge appear">✦ CHAPTER COMPLETE</div>' : ""}<p class="motivation">${esc(data.student)}, ${esc(motivation(data.papers, index))}</p>`;
      actions.replaceChildren(
        btn(last ? "View all results" : "Next paper →", () =>
          last ? summary(data) : paperIntro(data, index + 1),
        ),
        btn(
          last ? "Replay journey" : "Replay this paper",
          () => (last ? paperIntro(data, 0) : reveal(data, index)),
          "secondary",
        ),
      );
      if (last) celebrate(document.querySelector(".reveal"), reduced());
    },
  });
  actions.append(btn("Skip animation", () => finishSpin?.(), "secondary"));
}
function summary(data) {
  shell(
    `<main class="center"><section class="panel results-summary stack"><p class="eyebrow">THE BIGGER PICTURE</p><h1>Your progress.</h1><p class="lead">${esc(data.student)}, keep showing up for your next chapter.</p>${data.papers.map((p) => `<div class="result-row"><div><strong>${esc(p.name)}</strong><small>${esc(p.subject)}</small></div><div><strong>${p.value} <span>/ ${p.max}</span></strong><small>${((100 * p.value) / p.max).toFixed(1)}%</small></div></div>`).join("")}<button id="replay">Replay my journey ↗</button></section></main>`,
  );
  document.querySelector("#replay").onclick = () => paperIntro(data, 0);
}
function login() {
  shell(
    `<main class="center"><form id="login" class="panel stack"><p class="eyebrow">TEACHER WORKSPACE</p><h1>Welcome back.</h1><p class="muted">A clear view of every student’s progress.</p><label for="username">Username</label><input id="username" name="username" autocomplete="username" required><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required><button>Sign in →</button><p id="error" role="alert"></p></form></main>`,
    true,
  );
  document.querySelector("#login").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const result = await api("/login", {
        username: e.target.elements.username.value,
        password: e.target.elements.password.value,
      });
      sessionInfo.csrf = result.csrf;
      sessionInfo.admin = true;
      admin();
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
      await onSubmit(Object.fromEntries(new FormData(e.target)));
      d.close();
      await admin();
    } catch (e) {
      d.querySelector(".form-error").textContent = e.message;
    }
  };
  d.showModal();
}
async function admin() {
  if (!sessionInfo.admin) return login();
  const data = await api("/admin/data");
  let tab = "marks";
  shell(
    `<main class="dashboard"><div class="top dashboard-title"><div><p class="eyebrow">TEACHER WORKSPACE</p><h1>A little clarity.<br><span>A lot of progress.</span></h1></div><button class="secondary" id="logout">Sign out</button></div><div class="stats"><article><span>Active students</span><strong>${data.students.filter((s) => s.active).length}</strong></article><article><span>Papers</span><strong>${data.papers.length}</strong></article><article><span>Published</span><strong>${data.papers.filter((p) => p.state === "published").length}</strong></article><article><span>Classes</span><strong>${data.classes.length}</strong></article></div><nav class="tabs" aria-label="Workspace sections">${["marks", "students", "papers", "classes", "performance", "history"].map((t) => `<button data-tab="${t}" class="secondary">${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}</nav><section class="panel workspace"><div id="workspace"></div></section></main>`,
    true,
  );
  document.querySelector("#logout").onclick = async () => {
    await api("/logout", {});
    sessionInfo = await api("/session");
    login();
  };
  const area = document.querySelector("#workspace");
  const changeTab = (t) => {
    if (sheet?.isBusy()) {
      return;
    }
    tab = t;
    sheet = null;
    document.querySelectorAll("[data-tab]").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === t);
      b.setAttribute("aria-current", b.dataset.tab === t ? "page" : "false");
    });
    render();
  };
  document
    .querySelectorAll("[data-tab]")
    .forEach((b) => (b.onclick = () => changeTab(b.dataset.tab)));
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
    if (tab === "marks") {
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
    } else if (tab === "students") {
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
    } else if (tab === "papers") {
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
              admin();
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
    } else if (tab === "classes") {
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
    } else if (tab === "performance") {
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
  changeTab("marks");
}
function notify(message) {
  const t = document.createElement("div");
  t.className = "toast";
  t.setAttribute("role", "alert");
  t.textContent = message;
  document.body.append(t);
  setTimeout(() => t.remove(), 6000);
}
window.addEventListener("unhandledrejection", (e) => {
  e.preventDefault();
  notify(e.reason?.message || "Unable to complete the request");
});
try {
  sessionInfo = await api("/session");
  if (location.pathname === "/admin") {
    await admin();
  } else {
    let s;
    try {
      s = JSON.parse(localStorage.getItem("levelup.student"));
    } catch {
      localStorage.removeItem("levelup.student");
    }
    if (s?._id && /^[a-f\d]{24}$/i.test(s._id)) welcome(s);
    else home();
  }
} catch (e) {
  app.innerHTML =
    '<main class="center"><h1>We couldn’t connect.</h1><p>Please refresh the page to try again.</p></main>';
}
