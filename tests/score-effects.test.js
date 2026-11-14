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
  // Even the shortest reel still has a whole digit to travel 200ms before
  // landing on a final paper, rather than already displaying its final digit.
  assert.ok(40 * (1 - reelProgress(1 - 200 / 2900)) > 1);
  assert.ok(40 * (1 - reelProgress(1 - 50 / 2900)) > 0.24);
  const firstStep = reelProgress(0.01) - reelProgress(0);
  const lastStep = reelProgress(1) - reelProgress(0.99);
  assert.ok(firstStep > lastStep); // It still decelerates.
});
