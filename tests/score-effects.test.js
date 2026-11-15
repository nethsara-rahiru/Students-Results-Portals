import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreProfile } from "../public/score-effects.js";

test("score bands use strict, inclusive and normalized boundaries", () => {
  for (const [value, band] of [
    [0, "under-10"],
    [9.99, "under-10"],
    [10, "under-20"],
    [19.99, "under-20"],
    [20, "standard"],
    [50, "standard"],
    [50.01, "burst"],
    [70, "burst"],
    [70.01, "gold"],
    [75, "gold"],
    [75.01, "celebration"],
    [90, "celebration"],
    [90.01, "distinction"],
    [100, "distinction"],
  ]) {
    assert.equal(scoreProfile(value, 100).band, band, String(value));
    assert.equal(scoreProfile(value / 2, 50).band, band, `${value}/2`);
  }
});
test("score effect flags accumulate only above their thresholds", () => {
  for (const value of [0, 10, 20, 50, 51, 70, 71, 75, 76, 90, 91, 100]) {
    const p = scoreProfile(value, 100);
    assert.equal(p.burst, value > 50);
    assert.equal(p.gold, value > 70);
    assert.equal(p.celebration, value > 75);
    assert.equal(p.distinction, value > 90);
  }
});
test("invalid result values cannot produce reveal profiles", () => {
  for (const [value, max] of [
    [-1, 100],
    [101, 100],
    [0, 0],
    [0, -1],
    [NaN, 100],
    [Infinity, 100],
    [1, Infinity],
    [1, NaN],
    ["50", 100],
  ])
    assert.throws(() => scoreProfile(value, max), RangeError);
});

test("reels keep visible motion until impact instead of easing into an idle tail", async () => {
  const { reelProgress } = await import("../public/reveal.js");
  assert.equal(reelProgress(0), 0);
  assert.equal(reelProgress(1), 1);
  assert.equal(reelProgress(-1), 0);
  assert.equal(reelProgress(2), 1);
  for (let i = 1; i <= 100; i++)
    assert.ok(reelProgress(i / 100) > reelProgress((i - 1) / 100));
  // Slow visible movement remains through landing without an idle wait.
  const beforeLanding = 40 * (1 - reelProgress(1 - 50 / 2900));
  assert.ok(beforeLanding > 0.02 && beforeLanding < 0.08);
  assert.ok(40 * (1 - reelProgress(1 - 200 / 2900)) > 0.2);
  const firstStep = reelProgress(0.01) - reelProgress(0);
  const lastStep = reelProgress(1) - reelProgress(0.99);
  assert.ok(firstStep > lastStep); // It still decelerates.
});

test("spinner launches fast and slows substantially over the final roll", async () => {
  const { reelProgress } = await import("../public/reveal.js");
  const opening = reelProgress(0.1) - reelProgress(0);
  const middle = reelProgress(0.6) - reelProgress(0.5);
  const landing = reelProgress(1) - reelProgress(0.9);
  assert.ok(
    opening > 0.18,
    "the opening tenth covers enough reel travel for a fast launch",
  );
  assert.ok(
    opening > 6 * landing,
    "the opening is over six times faster than the landing",
  );
  assert.ok(opening > middle && middle > landing);
});

test("the last portion keeps braking instead of flattening to constant speed", async () => {
  const { reelProgress } = await import("../public/reveal.js");
  const lateMiddle = reelProgress(0.8) - reelProgress(0.6);
  const finalRoll = reelProgress(1) - reelProgress(0.8);
  assert.ok(
    lateMiddle > 2 * finalRoll,
    "the final fifth is visibly slower than the preceding fifth",
  );
  let previous = Infinity;
  for (let i = 60; i < 100; i++) {
    const speed = reelProgress((i + 1) / 100) - reelProgress(i / 100);
    assert.ok(
      speed < previous,
      "speed must keep decreasing throughout braking",
    );
    previous = speed;
  }
});
