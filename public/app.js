import { animateScore, motivation, celebrate } from "./reveal.js";
import { api, app, esc, btn, shell as renderShell } from "./client.js";
let sessionInfo, studentProfile, finishSpin;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function shell(content) {
  finishSpin = null;
  renderShell(content);
}
function home() {
  finishSpin = null;
  app.innerHTML = `<main class="name-entry" aria-labelledby="name-prompt"><div class="name-entry-content"><label id="name-prompt" class="name-prompt" for="student-name">What’s your full name?</label><input id="student-name" name="name" aria-label="Full name" placeholder="Type your full name and press Enter" maxlength="100" minlength="2" required autocomplete="name" enterkeyhint="go"><div id="suggest" class="stack" aria-live="polite" aria-busy="false"></div></div></main>`;
  const input = document.querySelector("#student-name");
  const target = document.querySelector("#suggest");
  let searching = false;
  input.oninput = () => {
    input.setCustomValidity("");
    target.replaceChildren();
  };
  input.onkeydown = async (e) => {
    if (e.key !== "Enter" || e.isComposing || searching) return;
    e.preventDefault();
    const name = input.value.trim().replace(/\s+/g, " ");
    input.setCustomValidity(
      name.length < 2 ? "Please enter your full name." : "",
    );
    if (!input.reportValidity()) return;
    searching = true;
    input.readOnly = true;
    target.setAttribute("aria-busy", "true");
    target.textContent = "Finding your profile…";
    try {
      const result = await api("/lookup", { name });
      target.innerHTML = `<p>${result.exact ? "Is this your profile?" : "No exact match. Select your profile below."}</p>`;
      if (!result.students.length)
        target.textContent =
          "No matching profiles. Please contact your teacher.";
      for (const s of result.students) {
        target.append(
          btn(`${s.name} · ${s.label}`, () => choose(s), "profile-card"),
        );
      }
      if (result.students.length) {
        const privacy = document.createElement("p");
        privacy.className = "privacy";
        privacy.textContent =
          sessionInfo.accessMode === "code"
            ? "Your teacher’s access code is required to view results."
            : "Name-based access shares published results with anyone who knows your name. It does not verify identity.";
        target.append(privacy);
      }
    } catch (error) {
      target.textContent = error.message;
    } finally {
      searching = false;
      input.readOnly = false;
      target.setAttribute("aria-busy", "false");
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
try {
  sessionInfo = await api("/session");
  let student;
  try {
    student = JSON.parse(localStorage.getItem("levelup.student"));
  } catch {
    localStorage.removeItem("levelup.student");
  }
  if (student?._id && /^[a-f\d]{24}$/i.test(student._id)) welcome(student);
  else home();
} catch (error) {
  app.innerHTML =
    '<main class="center"><h1>We couldn’t connect.</h1><p>Please refresh the page to try again.</p></main>';
}
