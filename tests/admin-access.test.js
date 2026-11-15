import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mobileIdentity,
  restrictedAdminDevice,
} from "../public/admin-access.js";

test("mobile browser identities and client hints are restricted even with desktop widths", () => {
  for (const userAgent of [
    "Mozilla Android",
    "iPhone",
    "iPad",
    "iPod",
    "Windows Phone",
    "Opera Mini",
  ])
    assert.equal(restrictedAdminDevice({ userAgent, width: 1440 }), true);
  assert.equal(
    mobileIdentity({ userAgent: "X11 Linux x86_64", mobileHint: "?1" }),
    true,
  );
  assert.equal(
    mobileIdentity({ userAgent: "X11 Linux x86_64", platform: '"Android"' }),
    true,
  );
  assert.equal(
    mobileIdentity({ userAgent: "Windows NT 10.0", mobileHint: "?0" }),
    false,
  );
});
test("admin viewport boundary is 1024 pixels", () => {
  assert.equal(restrictedAdminDevice({ width: 1023 }), true);
  assert.equal(restrictedAdminDevice({ width: 1024 }), false);
  assert.equal(restrictedAdminDevice({ width: 1920 }), false);
});
test("desktop-mode phones and iPads are caught using touch and screen signals", () => {
  assert.equal(
    restrictedAdminDevice({
      userAgent: "X11 Linux x86_64",
      width: 1280,
      touchPoints: 1,
      coarsePointer: true,
      finePointer: false,
      screenWidth: 980,
    }),
    true,
  );
  assert.equal(
    restrictedAdminDevice({
      platform: "MacIntel",
      width: 1366,
      touchPoints: 5,
      finePointer: true,
      screenWidth: 1024,
    }),
    true,
  );
  assert.equal(
    restrictedAdminDevice({
      platform: "Linux",
      width: 1280,
      touchPoints: 1,
      finePointer: true,
      coarsePointer: false,
      screenWidth: 393,
    }),
    true,
  );
});
test("desktop and mouse-equipped touchscreen laptops remain supported", () => {
  assert.equal(
    restrictedAdminDevice({
      platform: "Win32",
      width: 1280,
      touchPoints: 10,
      coarsePointer: false,
      finePointer: true,
      screenWidth: 768,
    }),
    false,
  );
  assert.equal(
    restrictedAdminDevice({
      platform: "MacIntel",
      width: 1440,
      touchPoints: 0,
      finePointer: true,
      screenWidth: 900,
    }),
    false,
  );
});
