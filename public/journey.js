import { api, esc } from "./client.js";
import { animateScore, motivation, celebrate } from "./reveal.js";
import { JourneyGraphics, coreArtwork } from "./journey-graphics.js";

// Mounted once: the title, graphic, input, score and controls retain their DOM
// identity through the whole student journey. Layout changes use real FLIP transforms.
export class StudentJourney {
  constructor(host, session) {
    this.host = host;
    this.session = session;
    this.media = matchMedia("(prefers-reduced-motion: reduce)");
    this.state = "identify";
    this.animations = [];
    this.busy = false;
    this.profile = null;
    this.data = null;
    this.index = 0;
    host.innerHTML = `<main id="student-journey" class="student-journey" data-state="identify" aria-labelledby="journey-title">
      <div class="journey-top" hidden><a href="/" class="journey-brand" aria-label="LevelUp Results home"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18 18 5M6 5h12v12"/></svg>LevelUp <span>Results</span></a><span id="journey-step"></span><button id="skip-transition" class="journey-link" hidden>Skip transition</button></div>
      <div class="journey-world" aria-hidden="true"><svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="world-line"><stop stop-color="#159ed4" stop-opacity="0"/><stop offset=".5" stop-color="#91b8ee" stop-opacity=".25"/><stop offset="1" stop-color="#9d59eb" stop-opacity="0"/></linearGradient></defs><g fill="none" stroke="url(#world-line)" stroke-width=".6"><path d="M0 640h1200M0 700h1200M0 780h1200M600 500 0 800M600 500 200 800M600 500 400 800M600 500 600 800M600 500 800 800M600 500 1000 800M600 500 1200 800"/><path d="M24 120h130m-130 0v130m1152-130h-130m130 0v130M24 680v-80m0 80h80m1072 0h-80m80 0v-80"/></g></svg></div>
      <p id="journey-kicker" class="journey-kicker" hidden></p>
      <h1 id="journey-title" class="journey-title"><span id="journey-heading">What’s your full name?</span><span id="journey-name" hidden></span></h1>
      <p id="journey-subtitle" class="journey-subtitle" hidden></p>
      <div id="identity-fields" class="journey-entry"><input id="student-name" name="name" aria-label="Full name" placeholder="Type your full name and press Enter" maxlength="100" minlength="2" required autocomplete="name" enterkeyhint="go"><div id="suggest" class="stack" aria-live="polite" aria-busy="false"></div></div>
      <div id="journey-core" class="journey-core" aria-hidden="true">${coreArtwork}<span class="core-coordinate" aria-hidden="true">LEVELUP / PROGRESS</span><div id="score" class="journey-score" role="img" aria-label="Score" aria-hidden="true"></div><span id="core-max" class="core-max" hidden></span><button id="paper" class="core-trigger" aria-labelledby="journey-title core-callout" hidden><span id="core-callout">Click to reveal your result →</span></button></div>
      <div id="message" class="journey-message" aria-live="polite"><div id="achievement" class="journey-achievement badge" hidden><svg viewBox="0 0 150 38" aria-hidden="true"><path d="m4 34 8-8-5-8m5 8 10-2m-5-4 7-7-4-7m4 7 9-1M146 34l-8-8 5-8m-5 8-10-2m5-4-7-7 4-7m-4 7-9-1"/><path d="m64 28 22-22m-18 0h18v18"/></svg><span>CHAPTER COMPLETE</span></div><p id="motivation"></p></div>
      <p id="error" class="journey-error" role="status"></p>
      <div id="actions" class="journey-actions" hidden><button id="primary-action"></button><button id="secondary-action" class="secondary" hidden></button><button id="skip-score" class="journey-link" hidden>Skip animation</button></div>
      <section id="journey-summary" class="journey-summary" aria-label="All published results" hidden><div id="result-list"></div></section>
      <ol id="journey-progress" class="journey-progress" aria-label="Paper progress" hidden></ol>
      <div class="journey-bottom" hidden><span id="journey-phase">A LITTLE EFFORT. A NEW LEVEL.</span><span>LEVELUP RESULTS <i></i></span></div>
    </main>`;
    this.root = host.querySelector("main");
    const node = (id) => host.querySelector("#" + id);
    this.nodes = Object.fromEntries(
      [
        "journey-title",
        "journey-heading",
        "journey-name",
        "journey-kicker",
        "journey-subtitle",
        "identity-fields",
        "student-name",
        "suggest",
        "journey-core",
        "score",
        "core-max",
        "paper",
        "message",
        "achievement",
        "motivation",
        "error",
        "actions",
        "primary-action",
        "secondary-action",
        "skip-score",
        "skip-transition",
        "journey-summary",
        "result-list",
        "journey-progress",
        "journey-step",
        "journey-phase",
      ].map((id) => [id, node(id)]),
    );
    this.core = node("journey-core");
    this.title = node("journey-title");
    this.input = node("student-name");
    this.graphics = new JourneyGraphics(this.core, this.media);
    this.input.addEventListener("input", () => {
      this.input.setCustomValidity("");
      node("suggest").replaceChildren();
      node("error").textContent = "";
      this.layout();
    });
    this.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.isComposing) {
        event.preventDefault();
        if (!this.busy) this.state === "access" ? this.unlock() : this.lookup();
      }
    });
    node("primary-action").onclick = () => this.primary?.();
    node("secondary-action").onclick = () => this.secondary?.();
    node("paper").onclick = () => this.reveal();
    node("skip-score").onclick = () => this.finishSpin?.();
    node("skip-transition").onclick = () => this.finishMotion();
    this.onResize = () => {
      this.finishMotion();
      this.layout();
      this.graphics.resize();
      this.graphics.draw();
      this.graphics.setActive(!["identify", "access"].includes(this.state));
    };
    window.addEventListener("resize", this.onResize);
    this.onPreference = () => {
      if (this.media.matches) {
        this.finishMotion();
        this.finishSpin?.();
      }
      this.layout();
    };
    this.media.addEventListener("change", this.onPreference);
    window.addEventListener("pagehide", (event) => {
      if (!event.persisted) this.dispose();
    });
    this.layout();
    document.fonts?.ready.then(() => {
      if (!this.disposed) this.onResize();
    });
  }
  node(id) {
    return this.nodes[id];
  }
  text(id, value) {
    this.node(id).textContent = value;
  }
  show(id, visible = true) {
    this.node(id).hidden = !visible;
  }
  heading(label, name = "") {
    this.text("journey-heading", label);
    this.text("journey-name", name);
    this.show("journey-name", !!name);
  }
  actions(primary, label, secondary, secondaryLabel) {
    this.primary = primary;
    this.secondary = secondary;
    this.text("primary-action", label || "");
    this.text("secondary-action", secondaryLabel || "");
    this.show("primary-action", !!primary);
    this.show("secondary-action", !!secondary);
    this.show("actions", !!primary || !!secondary || this.state === "reveal");
  }
  lock(value) {
    this.busy = value;
    this.root.setAttribute("aria-busy", String(value));
    this.input.readOnly = value;
    for (const id of [
      "primary-action",
      "secondary-action",
      "paper",
      "skip-score",
    ])
      this.node(id).disabled = value;
  }
  pose(element, x, y, width) {
    Object.assign(element.style, {
      left: x + "px",
      top: y + "px",
      width: width + "px",
    });
  }
  layout() {
    const width = this.root.clientWidth,
      mobile = width < 760,
      pad = mobile ? 24 : Math.max(40, width * 0.07),
      base = Math.max(innerHeight, this.state === "identify" ? 0 : 720),
      centerWidth = Math.min(width - pad * 2, 760);
    const title = this.title,
      subtitle = this.node("journey-subtitle"),
      fields = this.node("identity-fields"),
      actions = this.node("actions"),
      message = this.node("message"),
      error = this.node("error"),
      summary = this.node("journey-summary");
    let titleX = pad,
      titleY = 94,
      titleWidth = width - pad * 2,
      coreX,
      coreY,
      coreWidth,
      coreHeight,
      actionsY = 0,
      footerY = base - 40;
    if (this.state === "identify" || this.state === "access") {
      titleWidth = Math.min(width - 48, this.state === "access" ? 680 : 720);
      titleX = (width - titleWidth) / 2;
      titleY = Math.max(
        120,
        innerHeight * 0.5 - (this.state === "access" ? 165 : 100),
      );
    } else if (this.state === "welcome") {
      titleWidth = mobile ? width - 48 : Math.min(width * 0.46, 650);
      titleX = mobile ? 24 : pad;
      titleY = mobile ? 108 : Math.max(155, base * 0.28);
    } else if (this.state === "summary") {
      titleWidth = mobile ? width - 150 : Math.min(700, width - 300);
      titleX = mobile ? 24 : Math.max(pad, (width - 820) / 2);
      titleY = 105;
    } else {
      titleX = (width - centerWidth) / 2;
      titleWidth = centerWidth;
      titleY = 94;
    }
    this.pose(title, titleX, titleY, titleWidth);
    const titleBottom = titleY + title.offsetHeight;
    const kicker = this.node("journey-kicker");
    this.pose(kicker, titleX, titleY - 31, titleWidth);
    if (this.state === "identify" || this.state === "access") {
      const fieldWidth = Math.min(width - 48, 620),
        fieldX = (width - fieldWidth) / 2;
      this.pose(fields, fieldX, titleBottom + 26, fieldWidth);
      coreWidth = fieldWidth * 1.16;
      coreHeight = 2;
      coreX = (width - coreWidth) / 2;
      coreY = titleBottom + 83;
      actionsY = titleBottom + 112;
      this.pose(error, fieldX, actionsY, fieldWidth);
      if (error.textContent) actionsY += error.offsetHeight + 15;
      this.pose(actions, fieldX, actionsY, fieldWidth);
      footerY = Math.max(
        base - 40,
        titleBottom + fields.offsetHeight + 75,
        actionsY + actions.offsetHeight + 60,
      );
    } else if (this.state === "welcome") {
      coreWidth = mobile
        ? Math.min(width - 72, 330)
        : Math.min(width * 0.42, 510);
      coreHeight = coreWidth;
      coreX = mobile ? (width - coreWidth) / 2 : width * 0.73 - coreWidth / 2;
      coreY = mobile
        ? titleBottom + 34
        : Math.max(120, (base - coreHeight) / 2);
      const subtitleY = mobile ? coreY + coreHeight + 12 : titleBottom + 23;
      this.pose(subtitle, titleX, subtitleY, titleWidth);
      actionsY = Math.max(
        subtitleY + subtitle.offsetHeight + 26,
        mobile ? 0 : base * 0.71,
      );
      this.pose(error, titleX, actionsY, titleWidth);
      if (error.textContent) actionsY += error.offsetHeight + 16;
      this.pose(actions, titleX, actionsY, titleWidth);
      footerY = Math.max(
        base - 36,
        actionsY + actions.offsetHeight + 72,
        coreY + coreHeight + 72,
      );
    } else if (this.state === "summary") {
      coreWidth = mobile ? 104 : 152;
      coreHeight = coreWidth;
      coreX = width - titleX - coreWidth;
      coreY = 90;
      this.pose(
        subtitle,
        titleX,
        Math.max(titleBottom + 18, coreY + coreHeight + 12),
        Math.min(width - pad * 2, 780),
      );
      const listWidth = Math.min(width - 48, 780),
        listX = (width - listWidth) / 2,
        listY = parseFloat(subtitle.style.top) + subtitle.offsetHeight + 30;
      this.pose(summary, listX, listY, listWidth);
      actionsY = listY + summary.offsetHeight + 28;
      this.pose(actions, listX, actionsY, listWidth);
      footerY = Math.max(base - 36, actionsY + actions.offsetHeight + 70);
    } else {
      const paper = this.state === "paper";
      coreWidth = paper
        ? Math.min(width - 48, 650)
        : Math.min(
            width - 48,
            Math.max(270, Math.min(430, base - titleBottom - 242)),
          );
      coreHeight = paper
        ? Math.min(360, Math.max(275, base - titleBottom - 205))
        : coreWidth;
      coreX = (width - coreWidth) / 2;
      coreY = titleBottom + (paper ? 28 : 20);
      if (paper) {
        this.pose(subtitle, pad, coreY + coreHeight + 23, width - pad * 2);
        footerY = Math.max(
          base - 36,
          coreY + coreHeight + subtitle.offsetHeight + 80,
        );
      } else {
        const messageWidth = Math.min(width - 48, 640);
        this.pose(
          message,
          (width - messageWidth) / 2,
          coreY + coreHeight + 6,
          messageWidth,
        );
        actionsY = coreY + coreHeight + message.offsetHeight + 27;
        this.pose(actions, pad, actionsY, width - pad * 2);
        footerY = Math.max(base - 36, actionsY + actions.offsetHeight + 72);
      }
    }
    Object.assign(this.core.style, {
      left: coreX + "px",
      top: coreY + "px",
      width: coreWidth + "px",
      height: coreHeight + "px",
    });
    const mark = this.data?.papers[this.index]?.value ?? 0;
    this.node("score").style.fontSize =
      Math.min(
        coreWidth * 0.34,
        (coreWidth * 0.7) / (String(mark).length * 0.58),
      ) + "px";
    const progress = this.node("journey-progress");
    Object.assign(progress.style, {
      top: footerY - 30 + "px",
      left: pad + "px",
      width: width - pad * 2 + "px",
    });
    const bottom = this.root.querySelector(".journey-bottom");
    Object.assign(bottom.style, {
      top: footerY + "px",
      left: pad + "px",
      width: width - pad * 2 + "px",
    });
    this.root.style.minHeight =
      (this.state === "identify"
        ? Math.max(innerHeight, titleBottom + fields.offsetHeight + 80)
        : footerY + 40) + "px";
  }
  finishMotion() {
    for (const animation of this.animations) {
      try {
        animation.finish();
      } catch {
        animation.cancel();
      }
    }
    this.graphics.finish();
  }
  async transition(state, update) {
    if (this.disposed) return;
    this.finishMotion();
    const elements = [
      this.core,
      this.title,
      this.node("journey-subtitle"),
      this.node("actions"),
    ];
    const before = elements.map((e) =>
      e.hidden ? null : e.getBoundingClientRect(),
    );
    this.lock(true);
    this.state = state;
    this.root.dataset.state = state;
    this.node("error").textContent = "";
    this.show("message", state === "reveal");
    this.show("identity-fields", state === "identify" || state === "access");
    this.show("paper", state === "paper");
    this.show("journey-summary", state === "summary");
    this.show("core-max", state === "paper" || state === "reveal");
    this.show("journey-kicker", state !== "identify");
    this.show(
      "journey-subtitle",
      state === "welcome" || state === "paper" || state === "summary",
    );
    this.show("skip-score", false);
    this.show("journey-progress", state === "paper" || state === "reveal");
    for (const e of this.root.querySelectorAll(".journey-top,.journey-bottom"))
      e.hidden = state === "identify";
    this.core.setAttribute(
      "aria-hidden",
      String(state !== "paper" && state !== "reveal"),
    );
    this.node("score").setAttribute("aria-hidden", String(state !== "reveal"));
    update?.();
    this.layout();
    if (state !== "identify" && state !== "access")
      this.graphics.morph(
        state === "paper" ? 1 : 0,
        this.root.dataset.final === "true" ? 0.65 : 0,
        this.media.matches ? 0 : 900,
      );
    this.animations = [];
    if (!this.media.matches) {
      elements.forEach((element, i) => {
        const from = before[i],
          to = element.getBoundingClientRect();
        if (!from || element.hidden || from.width < 1 || from.height < 1)
          return;
        const sx = from.width / to.width,
          sy =
            i === 0
              ? from.height / to.height
              : Math.min(from.width / to.width, from.height / to.height);
        this.animations.push(
          element.animate(
            [
              {
                transform: `translate(${from.left - to.left}px,${from.top - to.top}px) scale(${sx},${sy})`,
              },
              { transform: "translate(0px,0px) scale(1,1)" },
            ],
            {
              duration: i === 0 ? 900 : 780,
              easing: "cubic-bezier(.2,.78,.18,1)",
              fill: "none",
            },
          ),
        );
      });
      this.show("skip-transition", this.animations.length > 0);
      await Promise.all(this.animations.map((a) => a.finished.catch(() => {})));
    }
    this.animations = [];
    this.show("skip-transition", false);
    this.lock(false);
    if (state === "identify" || state === "access") {
      this.graphics.finish();
      this.graphics.setActive(false);
    } else {
      this.graphics.setActive(true);
      this.title.setAttribute("tabindex", "-1");
      this.title.focus({ preventScroll: true });
    }
  }
  identify() {
    this.profile = null;
    this.input.type = "text";
    this.input.name = "name";
    this.input.value = "";
    this.input.minLength = 2;
    this.input.maxLength = 100;
    this.input.autocomplete = "name";
    this.input.setAttribute("aria-label", "Full name");
    this.input.placeholder = "Type your full name and press Enter";
    return this.transition("identify", () => {
      this.heading("What’s your full name?");
      this.node("suggest").replaceChildren();
      this.actions(null);
    });
  }
  async lookup() {
    if (this.state !== "identify" || this.busy) return;
    const name = this.input.value.trim().replace(/\s+/g, " ");
    this.input.setCustomValidity(
      name.length < 2 ? "Please enter your full name." : "",
    );
    if (!this.input.reportValidity()) return;
    this.lock(true);
    const target = this.node("suggest");
    target.textContent = "Finding your profile…";
    target.setAttribute("aria-busy", "true");
    try {
      const result = await api("/lookup", { name });
      target.replaceChildren();
      const title = document.createElement("p");
      title.textContent = result.exact
        ? "Is this your profile?"
        : "No exact match. Select your profile below.";
      target.append(title);
      if (!result.students.length)
        title.textContent =
          "No matching profiles. Please contact your teacher.";
      for (const student of result.students) {
        const button = document.createElement("button");
        button.className = "profile-card";
        button.textContent = `${student.name} · ${student.label}`;
        button.onclick = () => this.choose(student);
        target.append(button);
      }
      if (result.students.length) {
        const privacy = document.createElement("p");
        privacy.className = "privacy";
        privacy.textContent =
          this.session.accessMode === "code"
            ? "Your teacher’s access code is required to view results."
            : "Name-based access shares published results with anyone who knows your name. It does not verify identity.";
        target.append(privacy);
      }
    } catch (error) {
      target.textContent = error.message;
    } finally {
      this.lock(false);
      target.setAttribute("aria-busy", "false");
      this.layout();
    }
  }
  async choose(profile) {
    if (this.busy) return;
    this.profile = profile;
    if (this.session.accessMode === "code") return this.access();
    localStorage.setItem("levelup.student", JSON.stringify(profile));
    return this.welcome(profile);
  }
  async access() {
    this.input.type = "password";
    this.input.name = "code";
    this.input.value = "";
    this.input.minLength = 8;
    this.input.maxLength = 128;
    this.input.autocomplete = "off";
    this.input.setAttribute("aria-label", "Your teacher’s access code");
    this.input.placeholder = "Enter your teacher’s access code";
    this.node("suggest").replaceChildren();
    await this.transition("access", () => {
      this.heading("Welcome,", this.profile.name);
      this.text("journey-kicker", "STUDENT ACCESS");
      this.actions(() => this.unlock(), "Open my results →");
    });
    this.input.focus({ preventScroll: true });
  }
  async unlock() {
    if (this.busy || !this.input.reportValidity()) return;
    this.lock(true);
    try {
      await api("/student/access", {
        studentId: this.profile._id,
        code: this.input.value,
      });
      localStorage.setItem("levelup.student", JSON.stringify(this.profile));
      this.input.value = "";
      this.lock(false);
      await this.welcome(this.profile);
    } catch (error) {
      this.text("error", error.message);
      this.lock(false);
      this.layout();
    }
  }
  welcome(profile) {
    this.profile = profile;
    return this.transition("welcome", () => {
      this.root.dataset.final = "false";
      this.heading("Welcome back,", profile.name + ".");
      this.text("journey-kicker", "THIS CHAPTER BELONGS TO YOU");
      this.text(
        "journey-subtitle",
        "A new perspective on the work you’ve put in. Ready to see how far you’ve come?",
      );
      this.text("journey-step", "YOUR RESULTS JOURNEY");
      this.actions(() => this.discover(), "Discover my results →");
      this.text("journey-phase", "YOUR EFFORT. YOUR NEXT LEVEL.");
    });
  }
  async discover() {
    if (this.busy) return;
    this.lock(true);
    try {
      this.data = await api("/results/" + this.profile._id);
      if (!this.data.papers.length) {
        this.text(
          "error",
          "Your teacher has not published any results for you yet.",
        );
        this.lock(false);
        this.layout();
        return;
      }
      this.node("journey-progress").replaceChildren(
        ...this.data.papers.map((_, i) => {
          const item = document.createElement("li");
          item.className = "dot";
          item.setAttribute("aria-label", "Paper " + (i + 1));
          return item;
        }),
      );
      this.node("result-list").replaceChildren(
        ...this.data.papers.map((p) => {
          const row = document.createElement("div");
          row.className = "result-row";
          row.innerHTML = `<div><strong>${esc(p.name)}</strong><small>${esc(p.subject)}</small></div><div><strong>${p.value} <span>/ ${p.max}</span></strong><small>${((100 * p.value) / p.max).toFixed(1)}%</small></div>`;
          return row;
        }),
      );
      this.lock(false);
      await this.paper(0);
    } catch (error) {
      this.lock(false);
      if (error.status === 401) return this.access();
      this.text("error", error.message);
      if (error.status === 404) {
        localStorage.removeItem("levelup.student");
        this.actions(() => this.identify(), "Find my profile");
      }
      this.layout();
    }
  }
  progress(index) {
    for (const [i, item] of [
      ...this.node("journey-progress").children,
    ].entries()) {
      item.classList.toggle("on", i === index);
      if (i === index) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    }
  }
  paper(index) {
    this.finishSpin?.cancel?.();
    this.index = index;
    const p = this.data.papers[index];
    this.root.dataset.final = "false";
    return this.transition("paper", () => {
      this.heading(p.name);
      this.text("journey-kicker", p.subject || "YOUR NEXT MILESTONE");
      this.text("journey-subtitle", "Take a breath. You’ve put in the work.");
      this.text(
        "journey-step",
        `PAPER ${String(index + 1).padStart(2, "0")} / ${String(this.data.papers.length).padStart(2, "0")}`,
      );
      this.text("core-max", p.max + " POSSIBLE MARKS");
      this.text("journey-phase", "CLICK THE PAPER TO BEGIN");
      this.actions(null);
      this.progress(index);
    });
  }
  async reveal() {
    if (this.busy || this.state !== "paper") return;
    const p = this.data.papers[this.index],
      last = this.index === this.data.papers.length - 1;
    this.root.dataset.final = String(last);
    this.root.dataset.complete = "false";
    this.node("score").removeAttribute("data-complete");
    let motionReady = false,
      scoreFinished = false;
    await this.transition("reveal", () => {
      this.heading(p.name);
      this.text(
        "journey-kicker",
        last ? "THE FINAL CHAPTER" : "YOUR PROGRESS, IN FOCUS",
      );
      this.text("core-max", "OUT OF " + p.max);
      this.show("achievement", false);
      this.text("motivation", "A moment for the effort behind this number.");
      this.text("journey-phase", "EVERY MARK TELLS A STORY");
      this.actions(null);
      this.show("actions", true);
      this.show("skip-score", true);
      this.finishSpin = animateScore(this.node("score"), p.value, {
        reduced: this.media.matches,
        duration: last ? 2900 : 2500,
        onFinish: () => {
          if (motionReady) this.complete(last);
          else scoreFinished = true;
        },
      });
    });
    motionReady = true;
    if (scoreFinished) this.complete(last);
  }
  complete(last) {
    if (this.disposed) return;
    const focusNext = document.activeElement === this.node("skip-score");
    this.root.dataset.complete = "true";
    this.show("skip-score", false);
    this.show("achievement", last);
    this.text(
      "motivation",
      `${this.data.student}, ${motivation(this.data.papers, this.index).replace(/^Your/, "your")}`,
    );
    this.actions(
      last ? () => this.summary() : () => this.paper(this.index + 1),
      last ? "View all results" : "Next paper →",
      last ? () => this.paper(0) : () => this.paper(this.index),
      last ? "Replay journey" : "Replay this paper",
    );
    this.text(
      "journey-phase",
      last
        ? "ONE CHAPTER COMPLETE. MORE TO COME."
        : "ONE STEP FORWARD. KEEP GOING.",
    );
    if (last) {
      this.graphics.morph(0, 1, this.media.matches ? 0 : 1200);
      celebrate(this.root, this.media.matches);
      if (!this.media.matches)
        for (const path of this.node("achievement").querySelectorAll("path")) {
          path.setAttribute("pathLength", "100");
          path.style.strokeDasharray = "100";
          this.animations.push(
            path.animate([{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], {
              duration: 1200,
              easing: "cubic-bezier(.2,.75,.25,1)",
            }),
          );
        }
    }
    this.layout();
    if (focusNext) this.node("primary-action").focus({ preventScroll: true });
    if (last && !this.media.matches)
      this.animations.push(
        this.core.animate(
          [
            { transform: "scale(1)" },
            { transform: "scale(1.045)" },
            { transform: "scale(1)" },
          ],
          { duration: 950, easing: "cubic-bezier(.2,.75,.25,1)" },
        ),
      );
  }
  summary() {
    return this.transition("summary", () => {
      this.heading("Your progress.");
      this.text("journey-kicker", "THE BIGGER PICTURE");
      this.text(
        "journey-subtitle",
        this.data.student + ", keep showing up for your next chapter.",
      );
      this.text("journey-step", "JOURNEY COMPLETE");
      this.actions(() => this.paper(0), "Replay my journey");
      this.text("journey-phase", "SMALL STEPS. MEANINGFUL PROGRESS.");
    });
  }
  dispose() {
    this.disposed = true;
    this.finishSpin?.cancel?.();
    this.finishMotion();
    this.graphics.dispose();
    window.removeEventListener("resize", this.onResize);
    this.media.removeEventListener("change", this.onPreference);
  }
}
