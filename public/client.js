import {
  browserAdminSignals,
  restrictedAdminDevice,
  DESKTOP_MESSAGE,
} from "./admin-access.js";
export const app = document.querySelector("#app");
export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let csrfToken = "";
export async function api(
  url,
  body,
  method = body ? "POST" : "GET",
  { keepalive = false } = {},
) {
  const adminRequest = url === "/login" || /^\/admin(?:\/|$)/.test(url);
  const unsupported =
    adminRequest && restrictedAdminDevice(browserAdminSignals());
  if (unsupported) {
    const error = new Error(DESKTOP_MESSAGE);
    error.status = 403;
    error.code = "DESKTOP_REQUIRED";
    throw error;
  }
  const response = await fetch("/api" + url, {
    ...(keepalive ? { keepalive: true } : {}),
    method,
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
      ...(adminRequest
        ? {
            "X-Admin-Device": "desktop",
            "X-Admin-Viewport-Width": String(innerWidth),
          }
        : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || "Request failed");
    error.status = response.status;
    error.code = data.code;
    throw error;
  }
  if (data.csrf) csrfToken = data.csrf;
  return data;
}
export const btn = (label, action, className = "") => {
  const b = document.createElement("button");
  b.textContent = label;
  b.className = className;
  b.onclick = action;
  return b;
};
const brand =
  '<a class="brand" href="/" aria-label="Exam Result Portal home"><span class="brand-mark"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M5 18 18 5M6 5h12v12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span> Exam Result Portal</a>';
export function shell(content, admin = false) {
  app.innerHTML = `<header class="site-header">${brand}<span class="eyebrow">${admin ? "TEACHER WORKSPACE" : "YOUR NEXT CHAPTER"}</span></header>${content}<footer>Exam Result Portal <span>Small steps. Meaningful progress.</span></footer>`;
  document.querySelector("main")?.setAttribute("tabindex", "-1");
  document.querySelector("main")?.focus({ preventScroll: true });
}

export function notify(message) {
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
