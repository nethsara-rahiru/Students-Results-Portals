export function animateScore(
  host,
  value,
  { reduced = false, onFinish = () => {}, duration = 3200 } = {},
) {
  let stopped = false;
  const digits = String(value).split("");
  host.replaceChildren();
  host.setAttribute("aria-label", "Revealing score");
  const strips = digits.map((char) => {
    const slot = document.createElement("span");
    slot.className = "digit-slot";
    if (char === ".") {
      slot.textContent = ".";
      host.append(slot);
      return null;
    }
    const strip = document.createElement("span");
    strip.className = "digit-strip";
    strip.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 51; i++) {
      const n = document.createElement("span");
      n.textContent = i % 10;
      strip.append(n);
    }
    slot.append(strip);
    host.append(slot);
    return { strip, target: 40 + Number(char) };
  });
  let timer;
  const finish = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    strips.forEach((s) => {
      if (s) {
        s.strip.style.transition = "none";
        s.strip.style.transform = `translateY(-${s.target}em)`;
      }
    });
    host.setAttribute("aria-label", `Score ${value}`);
    host.dataset.complete = "true";
    onFinish();
  };
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (stopped) return;
      strips.forEach((s, i) => {
        if (s) {
          s.strip.style.transition = `transform ${reduced ? 0 : duration + i * 90}ms cubic-bezier(.12,.65,.15,1)`;
          s.strip.style.transform = `translateY(-${s.target}em)`;
        }
      });
    }),
  );
  timer = setTimeout(finish, reduced ? 0 : duration + digits.length * 90 + 30);
  return finish;
}
export function motivation(papers, index) {
  const p = papers[index];
  if (index > 0) {
    const prev = papers[index - 1],
      delta = (p.value / p.max - prev.value / prev.max) * 100;
    if (delta >= 0.05)
      return `Your score rose by ${delta.toFixed(1)} percentage points from the previous paper. Keep building on that progress.`;
  }
  return p.value / p.max >= 0.8
    ? "Your preparation is showing. Keep nurturing your curiosity."
    : "Every step gives you something to build on. Keep practising, and ask for support when you need it.";
}
export function celebrate(host, reduced) {
  if (reduced) return;
  const colors = ["#768CF9", "#9577F8", "#e9c982", "#9cdecf"];
  for (let i = 0; i < 40; i++) {
    const bit = document.createElement("i");
    bit.className = "confetti";
    bit.style.left = `${(i * 37) % 100}%`;
    bit.style.background = colors[i % 4];
    bit.style.animationDelay = `${(i % 8) * 0.08}s`;
    bit.style.setProperty("--drift", `${(i % 2 ? 1 : -1) * (20 + i)}px`);
    host.append(bit);
  }
  setTimeout(
    () => host.querySelectorAll(".confetti").forEach((x) => x.remove()),
    5000,
  );
}
