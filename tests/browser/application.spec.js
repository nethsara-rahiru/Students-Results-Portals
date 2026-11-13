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
  await expect(page.locator("#student-journey")).toHaveAttribute(
    "aria-busy",
    "false",
  );
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
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator("h1").click();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: "docs/screenshots/admin.png", fullPage: true });
  await page.getByLabel("Find student").fill("Maya");
  await expect(cells).toHaveCount(2);
  await page.getByRole("link", { name: "Students", exact: true }).click();
  await page.getByRole("button", { name: "Add student" }).click();
  await page.getByLabel("Full name", { exact: true }).fill("New Student");
  await page.getByLabel("Profile label").fill("Group C");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("link", { name: "Students", exact: true }).click();
  await expect(page.getByText("New Student", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Papers", exact: true }).click();
  await page.getByRole("button", { name: "Create paper" }).click();
  await page.getByLabel("Paper name").fill("Draft Paper 03");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/admin\/papers$/);
  await expect(page.getByText("Draft Paper 03", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Marks", exact: true }).click();
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

async function signIn(page, path = "/admin") {
  await page.goto(path);
  await page.getByLabel("Username", { exact: true }).fill("teacher");
  await page.getByLabel("Password", { exact: true }).fill("browser-password");
  await page.getByRole("button", { name: /Sign in/ }).click();
}
test("admin pages navigate as documents, refresh and history preserve the page, and logout protects deep links", async ({
  page,
}) => {
  await signIn(page, "/admin/students");
  await expect(page).toHaveURL(/\/admin\/students$/);
  await expect(page).toHaveTitle("Students · LevelUp Results");
  const navigations = [];
  page.on("request", (r) => {
    if (r.isNavigationRequest() && r.frame() === page.mainFrame())
      navigations.push(r.url());
  });
  for (const section of [
    "Papers",
    "Classes",
    "Performance",
    "History",
    "Marks",
  ]) {
    await page.getByRole("link", { name: section, exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp("/admin/" + section.toLowerCase() + "$"),
    );
    await expect(
      page.getByRole("link", { name: section, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page).toHaveTitle(section + " · LevelUp Results");
  }
  expect(navigations.length).toBeGreaterThanOrEqual(5);
  await page.reload();
  await expect(page.locator(".sheet")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/admin\/history$/);
  await expect(
    page.getByRole("heading", { name: "Change history" }),
  ).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/admin\/marks$/);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.goto("/admin/papers");
  await expect(page).toHaveURL(/\/admin\/login\?next=/);
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.locator(".dashboard")).toHaveCount(0);
});
test("leaving the marks page waits for an in-flight save and persists the edit", async ({
  page,
}) => {
  await signIn(page);
  await page.route("**/api/admin/marks", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.continue();
  });
  const cell = page.locator("td input").first();
  await cell.fill("27");
  await page.getByRole("link", { name: "Students", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/students$/);
  await page.getByRole("link", { name: "Marks", exact: true }).click();
  await expect(page.locator("td input").first()).toHaveValue("27");
});
test("ambient background follows the new palette and respects reduced motion", async ({
  page,
}) => {
  await page.goto("/");
  const palette = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return [
      s.getPropertyValue("--primary-start").trim(),
      s.getPropertyValue("--primary-end").trim(),
    ];
  });
  expect(palette).toEqual(["#159ed4", "#9d59eb"]);
  const layer = page.locator(".ambient-background span").first();
  await expect(layer).toHaveCSS("animation-name", "ambient-float");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(layer).toHaveCSS("animation-name", "none");
});
test("a failed marks save keeps the teacher on the page until they retry", async ({
  page,
}) => {
  await signIn(page);
  await page.route("**/api/admin/marks", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Temporary save failure" }),
    });
  });
  const cell = page.locator("td input").first();
  await cell.fill("29");
  await page.getByRole("link", { name: "Students", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Please retry before leaving",
  );
  await expect(page).toHaveURL(/\/admin\/marks$/);
  await expect(page.locator("#save-status")).toHaveText(
    "Temporary save failure",
  );
  await page.unroute("**/api/admin/marks");
  await cell.fill("29");
  await page.getByRole("link", { name: "Students", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/students$/);
  await page.getByRole("link", { name: "Marks", exact: true }).click();
  await expect(page.locator("td input").first()).toHaveValue("29");
});
test("one graphic and title transform continuously through both papers, summary and replay", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#student-journey").waitFor();
  const same = await page.evaluateHandle(() => ({
    root: document.querySelector("#student-journey"),
    core: document.querySelector("#journey-core"),
    title: document.querySelector("#journey-title"),
    score: document.querySelector("#score"),
    input: document.querySelector("#student-name"),
  }));
  const assertSame = async () =>
    expect(
      await page.evaluate(
        (nodes) =>
          Object.entries(nodes).every(
            ([key, node]) =>
              node ===
              document.querySelector(
                {
                  root: "#student-journey",
                  core: "#journey-core",
                  title: "#journey-title",
                  score: "#score",
                  input: "#student-name",
                }[key],
              ),
          ),
        same,
      ),
    ).toBe(true);
  await page.getByLabel("Full name", { exact: true }).fill("Maya Fernando");
  await page.getByLabel("Full name", { exact: true }).press("Enter");
  await page.getByRole("button", { name: /Maya Fernando ·/ }).click();
  await expect
    .poll(() =>
      page
        .locator("#journey-core")
        .evaluate((core) =>
          core
            .getAnimations()
            .some(
              (a) =>
                a.playState === "running" &&
                a.effect
                  .getKeyframes()
                  .some((k) => k.transform && k.transform !== "none"),
            ),
        ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Discover my results" }).waitFor();
  await assertSame();
  const underline = await page.locator(".core-outline").getAttribute("d");
  const response = page.waitForResponse((r) =>
    r.url().includes("/api/results/"),
  );
  await page.getByRole("button", { name: "Discover my results" }).click();
  const data = await (await response).json();
  await expect(page.locator("#paper")).toBeEnabled();
  await assertSame();
  expect(await page.locator(".core-outline").getAttribute("d")).not.toBe(
    underline,
  );
  for (let index = 0; index < data.papers.length; index++) {
    await page
      .getByRole("button", {
        name: new RegExp(
          data.papers[index].name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        ),
      })
      .click();
    await page
      .getByRole("button", { name: "Skip animation", exact: true })
      .click();
    await expect(page.locator("#score")).toHaveAttribute(
      "aria-label",
      "Score " + data.papers[index].value,
    );
    await assertSame();
    if (index < data.papers.length - 1)
      await page.getByRole("button", { name: "Next paper" }).click();
  }
  await page.getByRole("button", { name: "View all results" }).click();
  await expect(
    page.getByRole("heading", { name: "Your progress." }),
  ).toBeVisible();
  await assertSame();
  await expect(page.locator(".result-row")).toHaveCount(data.papers.length);
  await page.getByRole("button", { name: "Replay my journey" }).click();
  await expect(page.locator("#paper")).toBeEnabled();
  await assertSame();
});
test("motion can be skipped or reduced mid-flight without stale spinner callbacks", async ({
  page,
}) => {
  await identify(page, "Single Student");
  await page.getByRole("button", { name: /Mathematics · Paper 01/ }).click();
  await page
    .getByRole("button", { name: "Skip transition", exact: true })
    .click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("#score")).toHaveAttribute("aria-label", "Score 0");
  await expect(
    page.getByRole("button", { name: "View all results" }),
  ).toBeEnabled();
  await expect(page.locator(".confetti")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Replay journey", exact: true })
    .click();
  await page.getByRole("button", { name: /Mathematics · Paper 01/ }).click();
  await expect(page.locator("#score")).toHaveAttribute("aria-label", "Score 0");
  await expect(page.locator("#score")).toHaveAttribute("data-complete", "true");
});
test("results remain functional without requesting WebGL or rendering orbital artwork", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.webglRequests = 0;
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === "webgl" || type === "experimental-webgl") {
        window.webglRequests++;
        return null;
      }
      return original.call(this, type, ...args);
    };
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await identify(page, "Single Student");
  await page.getByRole("button", { name: /Mathematics · Paper 01/ }).click();
  await expect(page.locator("#score")).toHaveAttribute("aria-label", "Score 0");
  expect(await page.evaluate(() => window.webglRequests)).toBe(0);
  await expect(
    page.locator(
      "#journey-core canvas,#journey-core circle,#journey-core ellipse,.core-emblem,.core-satellites",
    ),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "View all results" }).click();
  await expect(page.locator(".result-row")).toHaveCount(1);
});
test("the welcome and score screens use open typography without a circular frame", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByLabel("Full name", { exact: true }).fill("Single Student");
  await page.getByLabel("Full name", { exact: true }).press("Enter");
  await page.getByRole("button", { name: /Single Student ·/ }).click();
  await expect(page.locator("#student-journey")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  expect(
    (await page.locator("#journey-core").boundingBox()).height,
  ).toBeLessThanOrEqual(2);
  await expect(
    page.locator(".core-canvas,.core-emblem,.core-satellites"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Discover my results" }).click();
  await page.getByRole("button", { name: /Mathematics · Paper 01/ }).click();
  await expect(page.locator("#score")).toHaveAttribute("aria-label", "Score 0");
  await expect(
    page.locator(".core-accent circle,.core-accent ellipse"),
  ).toHaveCount(0);
});
test("the persistent input supports confidential access codes before revealing results", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("http://localhost:3101/");
  const input = await page.locator("#student-name").elementHandle();
  await page.getByLabel("Full name", { exact: true }).fill("Maya Fernando");
  const lookup = page.waitForResponse((r) => r.url().endsWith("/api/lookup"));
  await page.getByLabel("Full name", { exact: true }).press("Enter");
  const profile = (await (await lookup).json()).students[0];
  expect(
    (
      await page.request.get("http://localhost:3101/api/results/" + profile._id)
    ).status(),
  ).toBe(401);
  await page.getByRole("button", { name: /Maya Fernando ·/ }).click();
  expect(
    await input.evaluate(
      (node) =>
        node === document.querySelector("#student-name") &&
        node.type === "password",
    ),
  ).toBe(true);
  await page.getByLabel("Your teacher’s access code").fill("wrong-code");
  await page.getByRole("button", { name: "Open my results" }).click();
  await expect(page.locator("#error")).toContainText("Invalid");
  await page
    .getByLabel("Your teacher’s access code")
    .fill("student-secret-code");
  await page.getByRole("button", { name: "Open my results" }).click();
  await page.getByRole("button", { name: "Discover my results" }).click();
  await page.getByRole("button", { name: /Mathematics · Paper 01/ }).click();
  await expect(page.locator("#score")).toHaveAttribute("data-complete", "true");
});
test("mobile high-precision scores and long paper titles stay readable through summary", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/results/*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        student: "Maya Fernando",
        papers: [
          {
            id: "precision",
            name: "Advanced Mathematics — End of Term Comprehensive Assessment",
            subject: "Mathematics",
            max: 10000,
            value: 9999.99,
          },
        ],
      }),
    }),
  );
  await identify(page, "Maya Fernando");
  await page.getByRole("button", { name: /Advanced Mathematics/ }).click();
  await expect(page.locator("#score")).toHaveAttribute(
    "aria-label",
    "Score 9999.99",
  );
  const bounds = await page.evaluate(() => {
    const score = document.querySelector("#score").getBoundingClientRect(),
      core = document.querySelector("#journey-core").getBoundingClientRect(),
      title = document.querySelector("#journey-title").getBoundingClientRect();
    return {
      fits:
        score.left >= 0 && score.right <= innerWidth && title.bottom < core.top,
      horizontal: document.documentElement.scrollWidth <= innerWidth,
    };
  });
  expect(bounds).toEqual({ fits: true, horizontal: true });
  await page.getByRole("button", { name: "View all results" }).click();
  await expect(page.locator(".result-row")).toContainText("9999.99");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("admin directories filter, empty states recover, and dialogs support keyboard cancellation", async ({
  page,
}) => {
  await signIn(page, "/admin/students");
  await expect(
    page.getByRole("heading", { name: "Student directory" }),
  ).toBeVisible();
  const initialCount = await page.locator(".management-row").count();
  const search = page.getByLabel("Search students", { exact: true });
  await search.fill("Maya");
  await expect(page.locator(".management-row:visible")).toHaveCount(1);
  await search.fill("no-such-student");
  await expect(page.getByText("Nothing here yet")).toBeVisible();
  await search.fill("");
  await page
    .getByRole("combobox", { name: "Student status", exact: true })
    .selectOption("inactive");
  await expect(page.locator(".management-row:visible")).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Student status", exact: true })
    .selectOption("");
  await expect(page.locator(".management-row:visible")).toHaveCount(
    initialCount,
  );
  await page
    .getByRole("button", { name: "+ Add student", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Add student", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: "Papers", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Publication status", exact: true })
    .selectOption("published");
  await expect(page.locator(".management-row:visible")).toHaveCount(2);
  await page.screenshot({
    path: "docs/screenshots/admin-papers.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("link", { name: "Students", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "Workspace sections" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "docs/screenshots/admin-mobile.png",
    fullPage: true,
  });
});

test("admin performance and history remain searchable and class dialogs can be cancelled", async ({
  page,
}) => {
  await signIn(page, "/admin/performance");
  await expect(
    page.getByRole("heading", { name: "Performance overview" }),
  ).toBeVisible();
  const average = page.getByRole("meter", {
    name: "Maya Fernando average percentage",
  });
  const percentage = Number(await average.getAttribute("value"));
  expect(percentage).toBeGreaterThanOrEqual(0);
  expect(percentage).toBeLessThanOrEqual(100);
  await page.getByLabel("Search performance", { exact: true }).fill("Maya");
  await expect(page.locator(".management-row:visible")).toHaveCount(1);
  await page.getByRole("link", { name: "History", exact: true }).click();
  await page
    .getByLabel("Search history", { exact: true })
    .fill("no-such-audit-event");
  await expect(page.locator("#audit details:visible")).toHaveCount(0);
  await page.getByRole("link", { name: "Classes", exact: true }).click();
  await page.getByRole("button", { name: "Create class" }).click();
  await expect(
    page.getByRole("dialog", { name: "Create class" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Excel-style worksheet saves formulas, recalculates, inserts rows and columns, pastes and reloads", async ({
  page,
}) => {
  await signIn(page);
  await page
    .getByRole("button", { name: "Flexible worksheet", exact: true })
    .click();
  const host = page.locator("#flexible-workspace");
  const formula = page.getByRole("textbox", {
    name: "Cell formula or value",
    exact: true,
  });
  const saved = () =>
    expect(host.locator(".workbook-status")).toHaveText("All changes saved");
  async function edit(address, value) {
    await host.getByRole("textbox", { name: address, exact: true }).click();
    await formula.fill(value);
    await formula.press("Enter");
    await saved();
  }
  await edit("A1", "20");
  await edit("B1", "=SUM(A1,5)");
  await expect(
    host.getByRole("textbox", { name: "B1", exact: true }),
  ).toHaveValue("25");
  await edit("A1", "30");
  await expect(
    host.getByRole("textbox", { name: "B1", exact: true }),
  ).toHaveValue("35");
  await host.getByRole("textbox", { name: "A1", exact: true }).click();
  await host
    .getByRole("button", { name: "Insert row above", exact: true })
    .click();
  await saved();
  await expect(
    host.getByRole("textbox", { name: "B2", exact: true }),
  ).toHaveValue("35");
  await host.getByRole("textbox", { name: "B2", exact: true }).click();
  await expect(formula).toHaveValue("=SUM(A2,5)");
  await host.getByRole("button", { name: "Add column", exact: true }).click();
  await saved();
  await expect(host.locator("thead th")).toHaveCount(14);
  await host.getByRole("button", { name: "Undo", exact: true }).click();
  await saved();
  await expect(host.locator("thead th")).toHaveCount(13);
  await host.getByRole("button", { name: "Redo", exact: true }).click();
  await saved();
  await expect(host.locator("thead th")).toHaveCount(14);
  const a3 = host.getByRole("textbox", { name: "A3", exact: true });
  await a3.click();
  await a3.evaluate((el) => {
    const data = new DataTransfer();
    data.setData("text/plain", "10\t20\n30\t40");
    el.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await saved();
  await edit("C3", "=AVERAGE(A3:B4)");
  await expect(
    host.getByRole("textbox", { name: "C3", exact: true }),
  ).toHaveValue("25");
  await host.getByRole("textbox", { name: "B2", exact: true }).click();
  const clipboard = await host
    .getByRole("textbox", { name: "B2", exact: true })
    .evaluate((el) => {
      const data = new DataTransfer();
      el.dispatchEvent(
        new ClipboardEvent("copy", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      );
      return Object.fromEntries(
        [...data.types].map((type) => [type, data.getData(type)]),
      );
    });
  await host.getByRole("textbox", { name: "B5", exact: true }).click();
  await host
    .getByRole("textbox", { name: "B5", exact: true })
    .evaluate((el, clipboard) => {
      const data = new DataTransfer();
      for (const [type, value] of Object.entries(clipboard))
        data.setData(type, value);
      el.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      );
    }, clipboard);
  await saved();
  await expect(
    host.getByRole("textbox", { name: "B5", exact: true }),
  ).toHaveValue("5");
  await host.getByRole("textbox", { name: "B5", exact: true }).click();
  await expect(formula).toHaveValue("=SUM(A5,5)");
  await host
    .getByRole("textbox", { name: "B5", exact: true })
    .press("Shift+ArrowDown");
  await host.getByRole("button", { name: "Fill down", exact: true }).click();
  await saved();
  await expect(
    host.getByRole("textbox", { name: "B6", exact: true }),
  ).toHaveValue("5");
  await host.getByRole("textbox", { name: "A1", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await host.getByRole("button", { name: "Delete row", exact: true }).click();
  await saved();
  await expect(
    host.getByRole("textbox", { name: "B1", exact: true }),
  ).toHaveValue("35");
  await host.getByRole("button", { name: "Undo", exact: true }).click();
  await saved();
  await page.reload();
  await page
    .getByRole("button", { name: "Flexible worksheet", exact: true })
    .click();
  await expect(
    host.getByRole("textbox", { name: "C3", exact: true }),
  ).toHaveValue("25");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "docs/screenshots/worksheet.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page
    .getByRole("button", { name: "Student marks", exact: true })
    .click();
  const first = page.locator("#marks-workspace td input").first();
  await first.fill("=SUM(10,15)");
  await first.press("Tab");
  await expect(page.locator("#save-status")).toHaveText("All changes saved");
  await expect(first).toHaveValue("25");
});

test("worksheet failed saves block navigation and retry without losing edits", async ({
  page,
}) => {
  await signIn(page);
  await page
    .getByRole("button", { name: "Flexible worksheet", exact: true })
    .click();
  await page.route("**/api/admin/workbook", (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Temporary workbook save failure" }),
        })
      : route.continue(),
  );
  const host = page.locator("#flexible-workspace");
  await host.getByRole("textbox", { name: "D10", exact: true }).click();
  const formula = page.getByRole("textbox", {
    name: "Cell formula or value",
    exact: true,
  });
  await formula.fill("=SUM(10,20)");
  await formula.press("Enter");
  await expect(host.locator(".workbook-status")).toContainText(
    "Temporary workbook save failure",
  );
  await page.getByRole("link", { name: "Students", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/marks$/);
  await expect(
    host.getByRole("textbox", { name: "D10", exact: true }),
  ).toHaveValue("30");
  await page.unroute("**/api/admin/workbook");
  await host.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(host.locator(".workbook-status")).toHaveText(
    "All changes saved",
  );
  await page.getByRole("link", { name: "Students", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/students$/);
});
