import { api, esc, notify } from "./client.js";
import { loadingScreen } from "./loading.js";
const date = (value) => (value ? new Date(value).toLocaleString() : "—");

export async function mountResultViews(host, { classes = [] } = {}) {
  host.innerHTML = `<div class="top"><div><h2>Result view activity</h2><p class="muted">A visit starts when a score is revealed. Full replays and later visits count again; individual paper replays add to paper reveals.</p></div><button id="views-refresh" class="secondary">Refresh activity</button></div><p class="view-privacy">Browser IDs are stored in localStorage. A shared browser can represent several people; clearing storage or using another browser creates a new ID.</p><div class="view-filters"><label>Search students<input id="view-search" type="search" placeholder="Find a student by name"></label><label>Class<select id="view-class"><option value="all">All classes</option><option value="unassigned">Unassigned</option>${classes.map((c) => `<option value="${esc(c._id)}">${esc(c.name)}</option>`).join("")}</select></label><label>View status<select id="view-status"><option value="all">All students</option><option value="viewed">Viewed</option><option value="unviewed">No recorded views</option></select></label><button id="views-reset-all" class="secondary">Reset all view counts</button></div><p id="view-summary" role="status"></p><div id="view-rows"></div><div class="view-pagination"><button id="views-previous" class="secondary">Previous page</button><span id="view-page"></span><button id="views-next" class="secondary">Next page</button></div>`;
  let dialogSerial = 0;
  let page = 1,
    request = 0,
    debounce;
  const rows = host.querySelector("#view-rows"),
    summary = host.querySelector("#view-summary");
  function modal(title) {
    const dialog = document.createElement("dialog"),
      titleId = "view-dialog-title-" + ++dialogSerial;
    dialog.className = "view-dialog";
    dialog.innerHTML = `<div class="stack"><div class="top"><h2 id="${titleId}">${esc(title)}</h2><button class="secondary" aria-label="Close view details">Close</button></div><div class="view-dialog-body"></div></div>`;
    dialog.setAttribute("aria-labelledby", titleId);
    dialog.querySelector("button").onclick = () => dialog.close();
    dialog.addEventListener("close", () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
    return dialog;
  }
  async function reset(scope, student, onReset) {
    const studentLabel = student
      ? `${student.name} (${student.label ? student.label + " · " : ""}ID ${student._id})`
      : "";
    const label =
      scope.scope === "all"
        ? "all students, including those hidden by filters"
        : scope.scope === "browser"
          ? `${studentLabel} in Browser ${scope.browserId.slice(0, 12)}`
          : studentLabel;
    const dialog = modal("Reset view counts");
    const body = dialog.querySelector(".view-dialog-body");
    body.innerHTML = `<p>Reset recorded visits and paper reveal counts for <strong>${esc(label)}</strong>?</p><p class="muted">The reset is logged in change history. Existing browser IDs and results are retained.</p><p class="form-error" role="alert"></p><div class="dialog-actions"><button class="secondary" id="view-reset-cancel">Cancel</button><button id="view-reset-confirm">Reset counts</button></div>`;
    body.querySelector("#view-reset-cancel").onclick = () => dialog.close();
    body.querySelector("#view-reset-confirm").onclick = async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "Resetting…";
      try {
        await api("/admin/result-views/reset", scope);
        dialog.close();
        await load();
        await onReset?.();
        notify("View counts reset.");
      } catch (error) {
        body.querySelector("[role=alert]").textContent = error.message;
        button.disabled = false;
        button.textContent = "Reset counts";
      }
    };
  }
  async function browserDetails(student, dialog) {
    const body = dialog.querySelector(".view-dialog-body");
    body.innerHTML = loadingScreen({
      title: "Loading browser activity",
      description: "Fetching recorded visits and paper reveals.",
      compact: true,
    });
    try {
      const data = await api("/admin/result-views/" + student._id);
      body.innerHTML = `<p class="muted">${esc(student.label || "Student ID " + student._id)} · ${data.browsers.length} known browser IDs. Browser IDs remain listed after a reset.</p><div class="view-browsers">${data.browsers.map((b) => `<section class="view-browser" data-browser-id="${b.browserId}"><div class="top"><h3>${esc(b.browserFamily)} · Browser ${b.browserId.slice(0, 12)}</h3><button class="secondary" data-reset-browser="${b.browserId}" ${b.visits ? "" : "disabled"}>Reset browser count</button></div><code>${b.browserId}</code><div class="view-browser-stats"><span><strong>${b.visits}</strong> visits</span><span><strong>${b.reveals}</strong> paper reveals</span></div><p class="muted">First recorded: ${esc(date(b.firstSeenAt))}<br>Last seen: ${esc(date(b.lastSeenAt))}<br>Last view since reset: ${esc(date(b.lastViewedAt))}</p>${b.papers.length ? `<div class="view-table-scroll"><table><caption class="view-table-caption">Paper reveals in this browser</caption><thead><tr><th>Paper</th><th>Times revealed</th><th>Last revealed</th></tr></thead><tbody>${b.papers.map((p) => `<tr><th scope="row">${esc(p.name)}</th><td>${p.reveals}</td><td>${esc(date(p.lastViewedAt))}</td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">No recorded views since the last reset.</p>'}</section>`).join("") || '<div class="empty-state">No browser views have been recorded for this student.</div>'}</div>`;
      body.querySelectorAll("[data-reset-browser]").forEach(
        (button) =>
          (button.onclick = () =>
            reset(
              {
                scope: "browser",
                studentId: student._id,
                browserId: button.dataset.resetBrowser,
              },
              student,
              () => browserDetails(student, dialog),
            )),
      );
    } catch (error) {
      body.innerHTML = `<p role="alert">${esc(error.message)}</p>`;
    }
  }
  async function load() {
    const current = ++request;
    const query = new URLSearchParams({
      search: host.querySelector("#view-search").value,
      classId: host.querySelector("#view-class").value,
      status: host.querySelector("#view-status").value,
      page: String(page),
    });
    rows.innerHTML = loadingScreen({
      title: "Loading result activity",
      description: "Checking recorded student visits.",
      compact: true,
    });
    summary.textContent = "Loading activity…";
    try {
      const data = await api("/admin/result-views?" + query);
      if (current !== request) return;
      const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
      if (page > pages) {
        page = pages;
        return load();
      }
      summary.textContent = `${data.total} ${data.total === 1 ? "student" : "students"} · ${data.viewed} viewed · ${data.unviewed} with no recorded views`;
      rows.innerHTML = data.students.length
        ? `<div class="view-table-scroll"><table class="view-activity-table"><caption class="view-table-caption">Student result visits since the last applicable reset</caption><thead><tr><th>Student</th><th>Class</th><th>Status</th><th>Visits</th><th>Browsers with views</th><th>Last viewed</th><th>Actions</th></tr></thead><tbody>${data.students.map((student) => `<tr data-view-student="${student._id}"><th scope="row">${esc(student.name)}<small>${esc(student.label || "")}${student.active ? "" : " · Inactive"}</small><small>ID ${student._id}</small></th><td>${esc(classes.find((c) => c._id === student.classId)?.name || "Unassigned")}</td><td><span class="view-status ${student.visits ? "view-status--seen" : ""}">${student.visits ? "Viewed" : "No recorded views"}</span></td><td>${student.visits}</td><td>${student.browserCount}</td><td>${esc(date(student.lastViewedAt))}</td><td><div class="view-row-actions"><button class="secondary" data-view-browsers="${student._id}">View browsers</button><button class="secondary" data-reset-student="${student._id}" ${student.visits ? "" : "disabled"}>Reset student count</button></div></td></tr>`).join("")}</tbody></table></div>`
        : '<div class="empty-state"><strong>No matching students</strong><p>Try another name, class or view status.</p></div>';
      host.querySelector("#view-page").textContent = `Page ${page} of ${pages}`;
      host.querySelector("#views-previous").disabled = page <= 1;
      host.querySelector("#views-next").disabled = page >= pages;
      rows.querySelectorAll("[data-view-browsers]").forEach(
        (button) =>
          (button.onclick = () => {
            const student = data.students.find(
              (s) => s._id === button.dataset.viewBrowsers,
            );
            browserDetails(
              student,
              modal("Browser activity · " + student.name),
            );
          }),
      );
      rows.querySelectorAll("[data-reset-student]").forEach(
        (button) =>
          (button.onclick = () => {
            const student = data.students.find(
              (s) => s._id === button.dataset.resetStudent,
            );
            reset({ scope: "student", studentId: student._id }, student);
          }),
      );
    } catch (error) {
      if (current !== request) return;
      summary.textContent = "Activity could not be loaded.";
      rows.innerHTML = `<p role="alert">${esc(error.message)}</p>`;
    }
  }
  host.querySelector("#view-search").addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      page = 1;
      load();
    }, 250);
  });
  for (const id of ["#view-class", "#view-status"])
    host.querySelector(id).onchange = () => {
      page = 1;
      load();
    };
  host.querySelector("#views-refresh").onclick = () => load();
  host.querySelector("#views-reset-all").onclick = () =>
    reset({ scope: "all" });
  host.querySelector("#views-previous").onclick = () => {
    page--;
    load();
  };
  host.querySelector("#views-next").onclick = () => {
    page++;
    load();
  };
  await load();
}
