// One non-circular accent: a straight underline opens into the paper frame,
// then closes back into a line beneath the score. No canvas or orbital artwork.
export const coreArtwork = `<svg class="core-accent" viewBox="0 0 600 600" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="paper-accent" gradientUnits="userSpaceOnUse" x1="30" y1="0" x2="570" y2="0"><stop stop-color="#159ED4"/><stop offset="1" stop-color="#9D59EB"/></linearGradient></defs><path class="core-fill" fill="#b4e7fc" fill-opacity=".025"/><path class="core-outline" fill="none" stroke="url(#paper-accent)" stroke-width="1.25" vector-effect="non-scaling-stroke"/></svg>`;
export class JourneyAccent {
  constructor(core, media) {
    this.core = core;
    this.media = media;
    this.shape = 0;
    this.target = 0;
    this.frame = 0;
    this.paths = [
      core.querySelector(".core-fill"),
      core.querySelector(".core-outline"),
    ];
    this.draw();
  }
  draw() {
    const top = 560 - 520 * this.shape,
      r = 12 * this.shape;
    const d = `M${30 + r},${top}H${570 - r}Q570,${top} 570,${top + r}V${560 - r}Q570,560 ${570 - r},560H${30 + r}Q30,560 30,${560 - r}V${top + r}Q30,${top} ${30 + r},${top}Z`;
    for (const path of this.paths) path.setAttribute("d", d);
  }
  morph(shape, duration = 900) {
    cancelAnimationFrame(this.frame);
    this.target = shape;
    if (this.media.matches || !duration) {
      this.finish();
      return;
    }
    const start = this.shape,
      began = performance.now();
    const step = (now) => {
      const progress = Math.min(1, (now - began) / duration);
      this.shape = start + (shape - start) * (1 - Math.pow(1 - progress, 3));
      this.draw();
      if (progress < 1) this.frame = requestAnimationFrame(step);
      else this.frame = 0;
    };
    this.frame = requestAnimationFrame(step);
  }
  finish() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.shape = this.target;
    this.draw();
  }
  dispose() {
    cancelAnimationFrame(this.frame);
  }
}
