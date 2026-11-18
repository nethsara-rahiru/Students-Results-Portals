import { api } from "./client.js";
export const BROWSER_ID_KEY = "exam-result-portal.browser-id";
const validId = /^[a-f0-9]{32}$/;
let temporaryBrowserId;
export function randomViewId() {
  // getRandomValues works on the direct HTTP deployment too; randomUUID does not.
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
export function browserViewId() {
  try {
    const saved = localStorage.getItem(BROWSER_ID_KEY);
    if (saved && validId.test(saved)) return saved;
    const id = randomViewId();
    localStorage.setItem(BROWSER_ID_KEY, id);
    return id;
  } catch {
    return (temporaryBrowserId ||= randomViewId());
  }
}
export class ResultViewTracker {
  constructor(isCurrent) {
    this.isCurrent = isCurrent;
    this.timers = new Set();
    this.onVisible = () => this.record();
    document.addEventListener("visibilitychange", this.onVisible);
    try {
      browserViewId();
    } catch {
      /* Tracking must not prevent results loading. */
    }
  }
  startVisit() {
    try {
      this.visitId = randomViewId();
    } catch {
      this.visitId = null;
    }
  }
  prepare(studentId, paperId) {
    cancelAnimationFrame(this.frame);
    try {
      this.current = {
        body: {
          studentId,
          paperId,
          browserId: browserViewId(),
          visitId: this.visitId,
          eventId: randomViewId(),
        },
        sent: false,
      };
    } catch {
      this.current = null;
    }
  }
  record() {
    const event = this.current;
    if (
      this.disposed ||
      !event ||
      !event.body.visitId ||
      event.sent ||
      document.hidden ||
      !this.isCurrent()
    )
      return;
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      if (
        this.disposed ||
        this.current !== event ||
        event.sent ||
        document.hidden ||
        !this.isCurrent()
      )
        return;
      event.sent = true;
      this.send(event.body, 0);
    });
  }
  async send(body, attempt) {
    try {
      await api("/result-views", body, "POST", { keepalive: true });
    } catch (error) {
      if (this.disposed || attempt >= 2 || (error.status && error.status < 500))
        return;
      const timer = setTimeout(
        () => {
          this.timers.delete(timer);
          this.send(body, attempt + 1);
        },
        attempt === 0 ? 1000 : 3000,
      );
      this.timers.add(timer);
    }
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    document.removeEventListener("visibilitychange", this.onVisible);
  }
}
