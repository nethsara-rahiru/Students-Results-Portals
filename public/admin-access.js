export const ADMIN_MIN_WIDTH = 1024;
export const DESKTOP_MESSAGE =
  "Use a desktop or laptop to access the teacher workspace.";

export function mobileIdentity({
  userAgent = "",
  platform = "",
  mobileHint = false,
} = {}) {
  return (
    mobileHint === true ||
    mobileHint === "?1" ||
    /android|iphone|ipad|ipod|mobile|windows phone|iemobile|blackberry|opera mini/i.test(
      userAgent,
    ) ||
    /android|ios/i.test(platform)
  );
}

export function restrictedAdminDevice(signals = {}) {
  if (mobileIdentity(signals)) return true;
  if (Number.isFinite(signals.width) && signals.width < ADMIN_MIN_WIDTH)
    return true;
  const touch = signals.touchPoints > 0;
  return (
    touch &&
    ((signals.coarsePointer && !signals.finePointer) ||
      (/mac/i.test(signals.platform || signals.userAgent || "") &&
        signals.touchPoints > 1) ||
      (signals.screenWidth > 0 && signals.screenWidth <= 600))
  );
}

export function browserAdminSignals() {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.userAgentData?.platform || navigator.platform,
    mobileHint: navigator.userAgentData?.mobile,
    width: window.innerWidth,
    touchPoints: navigator.maxTouchPoints || 0,
    coarsePointer: matchMedia("(pointer: coarse)").matches,
    finePointer: matchMedia("(any-pointer: fine)").matches,
    screenWidth: Math.min(screen.width, screen.height),
  };
}

export const desktopNotice = `<main id="admin-desktop-notice" class="admin-desktop-notice" aria-labelledby="desktop-required-title"><div class="desktop-notice-content"><a class="desktop-notice-brand" href="/">Exam Result Portal</a><span class="eyebrow">TEACHER WORKSPACE</span><h1 id="desktop-required-title" tabindex="-1">Desktop access required</h1><p>${DESKTOP_MESSAGE} The workspace needs a window at least 1024 pixels wide.</p><p>Phones and tablets remain unsupported when desktop mode is enabled.</p><a class="desktop-notice-return" href="/">View student results</a></div></main>`;

export function installAdminDesktopGuard() {
  if (!document.querySelector("#admin-desktop-notice"))
    document.body.insertAdjacentHTML("beforeend", desktopNotice);
  let blocked,
    started = false,
    forced = false;
  function check() {
    const next = forced || restrictedAdminDevice(browserAdminSignals());
    document.documentElement.toggleAttribute("data-admin-restricted", next);
    const app = document.querySelector("#app");
    if (app) app.inert = next;
    if (next && !blocked) {
      document
        .querySelectorAll("dialog[open]")
        .forEach((dialog) => dialog.close());
      document
        .querySelector("#desktop-required-title")
        ?.focus({ preventScroll: true });
    }
    if (blocked === true && !next && !started) location.reload();
    blocked = next;
  }
  check();
  window.addEventListener("resize", check);
  window.addEventListener("orientationchange", check);
  for (const query of [
    "(pointer: coarse)",
    "(any-pointer: fine)",
    "(max-width: 1023px)",
  ])
    matchMedia(query).addEventListener("change", check);
  return {
    get allowed() {
      return !blocked;
    },
    markStarted() {
      started = true;
    },
    block() {
      forced = !restrictedAdminDevice(browserAdminSignals());
      check();
    },
  };
}
