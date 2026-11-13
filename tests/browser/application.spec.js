import { test, expect } from "@playwright/test";
async function identify(page, name) {
  await page.goto("/");
  await page.getByLabel("Full name", { exact: true }).fill(name);
  await page.getByLabel("Full name", { exact: true }).press("Enter");
  await page.getByRole("button", { name: new RegExp(name + " ·") }).click();
  await page.getByRole("button", { name: "Discover my results" }).click();
}
test("no suggestions before submission, multi-paper reveal and final celebration", async ({
  page,
}) => {
  let lookups = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/lookup")) lookups++;
  });
  await page.goto("/");
  await expect(page.locator("form, .panel, header, footer")).toHaveCount(0);
  await expect(page.getByLabel("Full name", { exact: true })).toBeVisible();
  await page.getByLabel("Full name", { exact: true }).fill("Maya Fernando");
  await page.waitForTimeout(150);
  expect(lookups).toBe(0);
  await page.screenshot({
    path: "docs/screenshots/welcome.png",
    fullPage: true,
  });
  await page.getByLabel("Full name", { exact: true }).press("Enter");
  await page.getByRole("button", { name: /Maya Fernando ·/ }).click();
  await page.getByRole("button", { name: "Discover my results" }).click();
  await expect(
    page.getByRole("button", { name: /Mathematics · Paper 01/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Mathematics · Paper 01/ }).click();
  await expect(page.locator("#score")).toHaveAttribute(
    "aria-label",
    "Score 64",
    { timeout: 6000 },
  );
  await expect(page.getByRole("table")).toHaveCount(0);
  await page.getByRole("button", { name: "Next paper" }).click();
  await page.getByRole("button", { name: /Mathematics · Paper 02/ }).click();
  await expect(page.locator("#score")).toHaveAttribute(
    "aria-label",
    "Score 42",
    { timeout: 6000 },
  );
  await expect(page.locator(".badge")).toBeVisible();
  await expect(page.locator(".confetti")).toHaveCount(40);
  await expect(page.locator("#message")).toContainText(
    "20.0 percentage points",
  );
  await page.screenshot({
    path: "docs/screenshots/final-result.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "View all results" }).click();
  await expect(page.locator(".result-row")).toHaveCount(2);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /Welcome back/ }),
  ).toBeVisible();
});
test("single paper zero reveal honors reduced motion and replay", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await identify(page, "Single Student");
  await page.getByRole("button", { name: /Mathematics · Paper 01/ }).click();
  await expect(page.locator("#score")).toHaveAttribute("aria-label", "Score 0");
  await expect(page.locator(".badge")).toBeVisible();
  await expect(page.locator(".confetti")).toHaveCount(0);
  await page.getByRole("button", { name: "Replay journey" }).click();
  await expect(
    page.getByRole("button", { name: /Click to reveal/ }),
  ).toBeVisible();
});
test("mobile layout and keyboard profile selection", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Full name", { exact: true }).focus();
  await page.keyboard.type("Maya Fernando");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /Maya Fernando ·/ }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: /Welcome back/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/screenshots/mobile.png",
    fullPage: true,
  });
});
test("teacher spreadsheet: navigation, paste, validation, fill, undo, search and management", async ({
  page,
}) => {
  await page.goto("/admin");
  await page.getByLabel("Username", { exact: true }).fill("teacher");
  await page.getByLabel("Password", { exact: true }).fill("browser-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  const cells = page.locator("td input");
  await expect(cells).toHaveCount(6);
  await cells.nth(0).fill("35");
  await page.keyboard.press("Tab");
  await expect(cells.nth(1)).toBeFocused();
  await expect(page.locator("#save-status")).toHaveText("All changes saved");
  await cells.nth(0).focus();
  await cells.nth(0).evaluate((el) => {
    const data = new DataTransfer();
    data.setData("text/plain", "20\t30\n40\t45");
    el.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(cells.nth(2)).toHaveValue("40");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(cells.nth(2)).toHaveValue("64");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(cells.nth(2)).toHaveValue("40");
  await cells.nth(0).focus();
  await page.keyboard.press("Shift+ArrowDown");
  await page.getByRole("button", { name: "Fill down" }).click();
  await expect(cells.nth(2)).toHaveValue("20");
  await cells.nth(1).fill("999");
  await page.keyboard.press("Tab");
  await expect(page.locator("#save-status")).toContainText("maximum");
  await expect(cells.nth(1)).toHaveValue("30");
  await cells.nth(1).fill("31");
  await page.keyboard.press("Tab");
  await expect(page.locator("#save-status")).toHaveText("All changes saved");
  await page.screenshot({ path: "docs/screenshots/admin.png", fullPage: true });
  await page.getByLabel("Find student").fill("Maya");
  await expect(cells).toHaveCount(2);
  await page.getByRole("button", { name: "Students", exact: true }).click();
  await page.getByRole("button", { name: "Add student" }).click();
  await page.getByLabel("Full name", { exact: true }).fill("New Student");
  await page.getByLabel("Profile label").fill("Group C");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("button", { name: "Students", exact: true }).click();
  await expect(page.getByText("New Student", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Papers", exact: true }).click();
  await page.getByRole("button", { name: "Create paper" }).click();
  await page.getByLabel("Paper name").fill("Draft Paper 03");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator("thead")).toContainText("Draft Paper 03");
});
test("teacher mobile workspace remains within viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin");
  await page.getByLabel("Username", { exact: true }).fill("teacher");
  await page.getByLabel("Password", { exact: true }).fill("browser-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator(".sheet")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator("td input").last().focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("td input").last()).not.toBeFocused();
});
