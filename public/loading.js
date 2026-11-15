const text = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );

export function loadingScreen({
  title = "Getting things ready",
  description = "A moment while we open your results portal.",
  compact = false,
  workspace = false,
} = {}) {
  return `<section class="portal-loader${compact ? " portal-loader--compact" : ""}" role="status" aria-live="polite" aria-atomic="true" aria-label="${text(title)}"><div class="portal-loader-content"><div class="portal-loader-art" aria-hidden="true"><svg viewBox="0 0 64 72" fill="none"><path class="loader-paper" d="M13 5h25l13 13v48H13V5Z"/><path class="loader-fold" d="M38 5v14h13"/><path class="loader-line" d="M22 31h20M22 40h14M22 49h17"/><path class="loader-ascent" d="m34 57 9-9m-9 0h9v9"/></svg><span class="loader-spark"></span></div>${compact ? "" : `<p class="portal-loader-brand">Exam Result Portal</p><p class="portal-loader-kicker">${workspace ? "TEACHER WORKSPACE" : "STUDENT RESULTS"}</p>`}<p class="portal-loader-title">${text(title)}</p><p class="portal-loader-description">${text(description)}</p><div class="portal-loader-track" aria-hidden="true"><span></span></div><span class="portal-loader-caption" aria-hidden="true">ONE MOMENT</span></div></section>`;
}

export function inlineLoading(label) {
  return `<span class="inline-loading"><span class="loading-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>${text(label)}</span></span>`;
}
