import { celebrate } from "./reveal.js";

export function scoreProfile(value, max) {
  if (
    !Number.isFinite(value) ||
    !Number.isFinite(max) ||
    max <= 0 ||
    value < 0 ||
    value > max
  )
    throw RangeError("A score must be between zero and its positive maximum");
  const percentage = (value / max) * 100;
  const band =
    percentage < 10
      ? "under-10"
      : percentage < 20
        ? "under-20"
        : percentage > 90
          ? "distinction"
          : percentage > 75
            ? "celebration"
            : percentage > 70
              ? "gold"
              : percentage > 50
                ? "burst"
                : "standard";
  return {
    percentage,
    band,
    burst: percentage > 50,
    gold: percentage > 70,
    celebration: percentage > 75,
    distinction: percentage > 90,
  };
}

// Persistent visual layers: only their colour/intensity changes between papers.
// No rings, screen shake, flashing sequence or canvas is used.
export class ScoreEffects {
  constructor(root, score, media) {
    this.root = root;
    this.score = score;
    this.media = media;
    this.animations = [];
    this.layer = document.createElement("div");
    this.layer.className = "score-atmosphere";
    this.layer.setAttribute("aria-hidden", "true");
    this.layer.innerHTML =
      '<div class="score-wash score-wash-red"></div><div class="score-wash score-wash-gold"></div><div class="score-sweep"></div><div class="score-burst"></div>';
    this.rays = Array.from({ length: 18 }, (_, index) => {
      const ray = document.createElement("i");
      ray.className = "score-ray";
      ray.dataset.angle = index * 20 + 8;
      this.layer.querySelector(".score-burst").append(ray);
      return ray;
    });
    root.querySelector(".journey-world").after(this.layer);
    this.clear();
  }
  stop() {
    for (const animation of this.animations) animation.cancel();
    this.animations = [];
    this.confettiCleanup?.();
    this.confettiCleanup = null;
  }
  clear() {
    this.stop();
    this.profile = null;
    this.completed = false;
    delete this.root.dataset.scoreBand;
    delete this.root.dataset.scoreEffect;
    delete this.root.dataset.scoreCelebration;
    this.root.dataset.complete = "false";
  }
  prepare(value, max, last) {
    this.clear();
    this.profile = scoreProfile(value, max);
    this.last = last;
    this.root.dataset.scoreBand = this.profile.band;
  }
  settle({ skip = false } = {}) {
    if (!this.profile || this.completed) return;
    this.completed = true;
    const p = this.profile,
      reduced = this.media.matches || skip;
    this.root.dataset.scoreEffect = p.burst ? "burst" : "gentle";
    this.root.dataset.scoreCelebration = String(p.celebration || this.last);
    if (reduced) return;
    if (p.burst) {
      const box = this.score.getBoundingClientRect(),
        root = this.root.getBoundingClientRect(),
        burst = this.layer.querySelector(".score-burst");
      burst.style.left = box.left + box.width / 2 - root.left + "px";
      burst.style.top = box.top + box.height / 2 - root.top + "px";
      const strength = this.last ? 1.2 : 1;
      for (const [index, ray] of this.rays.entries()) {
        const angle = ray.dataset.angle,
          distance = (100 + (index % 4) * 24) * strength;
        this.animations.push(
          ray.animate(
            [
              {
                opacity: 0,
                transform: `rotate(${angle}deg) translateY(-30px) scaleY(.2)`,
              },
              {
                opacity: 0.85,
                offset: 0.15,
                transform: `rotate(${angle}deg) translateY(-50px) scaleY(1)`,
              },
              {
                opacity: 0,
                transform: `rotate(${angle}deg) translateY(-${distance}px) scaleY(.3)`,
              },
            ],
            {
              duration: 850 + (index % 3) * 90,
              easing: "cubic-bezier(.15,.65,.25,1)",
            },
          ),
        );
      }
      this.animations.push(
        this.score.animate(
          [
            { transform: "translate(-50%,-50%) scale(1)" },
            {
              transform: `translate(-50%,-50%) scale(${this.last ? 1.09 : 1.055})`,
              offset: 0.35,
            },
            { transform: "translate(-50%,-50%) scale(1)" },
          ],
          { duration: 850, easing: "cubic-bezier(.2,.7,.2,1)" },
        ),
      );
    }
    if (p.gold || this.last) {
      const sweep = this.layer.querySelector(".score-sweep");
      this.animations.push(
        sweep.animate(
          [
            { opacity: 0, transform: "translateX(-20%) skewX(-12deg)" },
            { opacity: p.gold ? 0.65 : 0.3, offset: 0.4 },
            { opacity: 0, transform: "translateX(20%) skewX(-12deg)" },
          ],
          { duration: this.last ? 1600 : 1100, easing: "ease-out" },
        ),
      );
    }
    if (p.celebration || this.last) {
      const count = this.last
        ? p.distinction
          ? 80
          : p.celebration
            ? 64
            : 40
        : p.distinction
          ? 24
          : 16;
      this.confettiCleanup = celebrate(this.root, false, {
        count,
        colors: p.gold
          ? ["#e9d7a6", "#f6ebc6", "#c7a0f4", "#85d0ed"]
          : undefined,
      });
    }
  }
  reduce() {
    this.stop();
  }
  dispose() {
    this.clear();
    this.layer.remove();
  }
}
