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
  await expect(page).toHaveTitle("Exam Result Portal");
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
  await expect(page.locator(".confetti")).toHaveCount(64);
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
  await page.screenshot({ path: "docs/screenshots/name-entry-mobile.png" });
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
test("teacher worksheet: named headers, mark entry, paste, fill, undo, validation and management", async ({
  page,
}) => {
  await signIn(page);
  await expect(
    page.getByRole("button", { name: "Student marks", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Name header", exact: true }),
  ).toHaveValue("Name");
  const cell = (address) =>
    page.getByRole("textbox", { name: address, exact: true });
  const saved = () =>
    expect(page.locator(".workbook-status")).toHaveText("All changes saved");
  await expect(cell("B1")).toHaveValue("Mathematics · Paper 01");
  await expect(cell("A2")).toHaveValue(/Daniel Perera/);
  await expect(cell("A2")).toHaveAttribute("readonly", "");
  await cell("B2").fill("35");
  await cell("B2").press("Tab");
  await saved();
  await cell("B2").click();
  await cell("B2").evaluate((el) => {
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
  await saved();
  await expect(cell("B3")).toHaveValue("40");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await saved();
  await expect(cell("B3")).toHaveValue("64");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await saved();
  await expect(cell("B3")).toHaveValue("40");
  await cell("B2").click();
  await cell("B2").press("Shift+ArrowDown");
  await page.getByRole("button", { name: "Fill down", exact: true }).click();
  await saved();
  await expect(cell("B3")).toHaveValue("20");
  await cell("C2").fill("999");
  await cell("C2").press("Tab");
  await expect(page.locator(".workbook-status")).toContainText("0–50");
  await cell("C2").fill("31");
  await cell("C2").press("Tab");
  await saved();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator("#app h1").click();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: "docs/screenshots/admin.png", fullPage: true });
  await page
    .getByRole("button", { name: "Add student row", exact: true })
    .click();
  await page.getByLabel("Full name", { exact: true }).fill("New Student");
  await page.getByLabel("Profile label").fill("Group C");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(cell("A4")).toHaveValue(/New Student/);
  await page.getByRole("button", { name: "Add column", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("#flexible-workspace")).toHaveAttribute(
    "data-paper-count",
    "3",
  );
  await cell("D1").fill("Draft Paper 03");
  await cell("D1").press("Enter");
  await saved();
  await expect(cell("D1")).toHaveValue("Draft Paper 03");
});
test("small admin screens show a desktop notice before any private requests", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let calls = 0;
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/")) calls++;
  });
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Desktop access required" }),
  ).toBeVisible();
  await expect(page.getByLabel("Username", { exact: true })).toHaveCount(0);
  await expect(page.locator(".sheet")).toHaveCount(0);
  expect(calls).toBe(0);
  await page.screenshot({ path: "docs/screenshots/admin-mobile-blocked.png" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
  await expect(page).toHaveTitle("Teacher Login · Exam Result Portal");
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
  await expect(page).toHaveTitle("Students · Exam Result Portal");
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
    await expect(page).toHaveTitle(section + " · Exam Result Portal");
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
  const cell = page.getByRole("textbox", { name: "B2", exact: true });
  await cell.fill("27");
  await page.getByRole("link", { name: "Students", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/students$/);
  await page.getByRole("link", { name: "Marks", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "B2", exact: true }),
  ).toHaveValue("27");
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
  const cell = page.getByRole("textbox", { name: "B2", exact: true });
  await cell.fill("29");
  await page.getByRole("link", { name: "Students", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Please retry before leaving",
  );
  await expect(page).toHaveURL(/\/admin\/marks$/);
  await expect(page.locator(".workbook-status")).toContainText(
    "Temporary save failure",
  );
  await page.getByLabel("Choose class", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Select class", exact: true })
    .selectOption("unassigned");
  await expect(
    page.getByRole("combobox", { name: "Select class", exact: true }),
  ).toHaveValue("");
  await page.getByLabel("Choose class", { exact: true }).click();

  await page.unroute("**/api/admin/marks");
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(page.locator(".workbook-status")).toHaveText(
    "All changes saved",
  );
  await page.getByRole("link", { name: "Students", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/students$/);
  await page.getByRole("link", { name: "Marks", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "B2", exact: true }),
  ).toHaveValue("29");
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
  await expect(
    page.getByRole("heading", { name: "Desktop access required" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Workspace sections" }),
  ).toBeHidden();
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

test("one marks worksheet persists live formulas and protects names/headers", async ({
  page,
}) => {
  await signIn(page);
  const cell = (address) =>
    page.getByRole("textbox", { name: address, exact: true });
  const saved = () =>
    expect(page.locator(".workbook-status")).toHaveText("All changes saved");
  await cell("B2").fill("20");
  await cell("B2").press("Tab");
  await saved();
  await cell("C2").fill("=SUM(B2,5)");
  await cell("C2").press("Tab");
  await saved();
  await expect(cell("C2")).toHaveValue("25");
  await cell("B2").fill("30");
  await cell("B2").press("Tab");
  await saved();
  await expect(cell("C2")).toHaveValue("35");
  await page.reload();
  await expect(cell("C2")).toHaveValue("35");
  await cell("C2").click();
  await expect(
    page.getByRole("textbox", { name: "Cell formula or value", exact: true }),
  ).toHaveValue("=SUM(B2,5)");
  await expect(cell("B1")).not.toHaveAttribute("readonly", "");
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
});

test("Name header class dropdown autofills roster, paper headers and actual marks by stable IDs", async ({
  page,
}) => {
  await signIn(page);
  await expect(
    page.getByRole("textbox", { name: "Name header", exact: true }),
  ).toBeVisible();
  const call = (url, body, method) =>
    page.evaluate(
      async ({ url, body, method }) =>
        (await import("/client.js")).api(url, body, method),
      { url, body, method },
    );
  const a = await call("/admin/classes", { name: "Worksheet Class A" }),
    b = await call("/admin/classes", { name: "Worksheet Class B" });
  const one = await call("/admin/students", {
      name: "Same Name",
      label: "Class A · 01",
      classId: a.id,
    }),
    two = await call("/admin/students", {
      name: "Same Name",
      label: "Class B · 02",
      classId: b.id,
    });
  const paper = await call("/admin/papers", {
    name: "Class A Paper",
    max: 100,
    classId: a.id,
    state: "draft",
  });
  await call(
    "/admin/marks",
    { entries: [{ studentId: one.id, paperId: paper.id, value: 0 }] },
    "PUT",
  );
  await page.reload();
  await page.getByLabel("Choose class", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Select class", exact: true })
    .selectOption(a.id);
  const cell = (address) =>
    page.getByRole("textbox", { name: address, exact: true });
  await expect(cell("A2")).toHaveValue("Same Name · Class A · 01");
  await expect(cell("A3")).toHaveValue("");
  const headers = await page
    .locator("tbody tr:first-child td input")
    .evaluateAll((inputs) => inputs.map((i) => i.value));
  const col = headers.indexOf("Class A Paper");
  expect(col).toBeGreaterThan(0);
  const mark = page.locator("tbody tr").nth(1).locator("td input").nth(col);
  await expect(mark).toHaveValue("0");
  await mark.fill("73");
  await mark.press("Tab");
  await expect(page.locator(".workbook-status")).toHaveText(
    "All changes saved",
  );
  const data = await call("/admin/data");
  expect(
    data.marks.find((m) => m.studentId === one.id && m.paperId === paper.id)
      .value,
  ).toBe(73);
  expect(
    data.marks.find((m) => m.studentId === two.id && m.paperId === paper.id),
  ).toBeUndefined();
  await page.getByLabel("Choose class", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Select class", exact: true })
    .selectOption(b.id);
  await expect(cell("A2")).toHaveValue("Same Name · Class B · 02");
  expect(
    await page
      .locator("tbody tr:first-child td input")
      .evaluateAll((inputs) => inputs.map((i) => i.value)),
  ).not.toContain("Class A Paper");
  await page.reload();
  await expect(cell("A2")).toHaveValue("Same Name · Class B · 02");
  await page.getByLabel("Choose class", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Select class", exact: true })
    .selectOption(a.id);
  await expect(
    page.locator("tbody tr").nth(1).locator("td input").nth(col),
  ).toHaveValue("73");
  await page
    .getByRole("button", { name: "Add student row", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("combobox", { name: "Class", exact: true }),
  ).toHaveValue(a.id);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const count = Number(
    await page.locator("#flexible-workspace").getAttribute("data-paper-count"),
  );
  await page.getByRole("button", { name: "Add column", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("#flexible-workspace")).toHaveAttribute(
    "data-paper-count",
    String(count + 1),
  );
  const created = (await call("/admin/data")).papers.at(-1);
  expect(created.classId).toBe(a.id);
  expect(created.state).toBe("draft");
  const empty = await call("/admin/classes", { name: "Worksheet Empty Class" });
  await page.reload();
  await page.getByLabel("Choose class", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Select class", exact: true })
    .selectOption(empty.id);
  await expect(
    page.getByText(
      "No active students in this class. Add a student row or use the blank working rows below.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(cell("A2")).toHaveValue("");
  await page.getByLabel("Choose class", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Select class", exact: true })
    .selectOption(a.id);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "docs/screenshots/class-worksheet.png",
    fullPage: true,
  });
  await page.getByLabel("Choose class", { exact: true }).click();
  await page.screenshot({
    path: "docs/screenshots/class-picker.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Desktop access required" }),
  ).toBeVisible();
  await expect(page.locator("#app")).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(cell("A2")).toBeVisible();
  await expect(page.locator("#admin-desktop-notice")).toBeHidden();
});

test("large rosters load without a cap and render a bounded window", async ({
  page,
}) => {
  const classId = "123456789012345678901234";
  await page.route("**/api/admin/data", async (route) => {
    const response = await route.fetch(),
      data = await response.json();
    data.classes = [{ _id: classId, name: "Small class" }];
    data.students = Array.from({ length: 501 }, (_, i) => ({
      _id: (i + 1).toString(16).padStart(24, "0"),
      name: "Roster student " + String(i).padStart(3, "0"),
      active: true,
      classId: i === 0 ? classId : null,
    }));
    data.marks = [];
    await route.fulfill({ response, json: data });
  });
  await signIn(page);
  await expect(
    page.getByRole("textbox", { name: "A2", exact: true }),
  ).toHaveValue("Roster student 000");
  expect(await page.locator(".workbook-grid input").count()).toBeLessThan(1000);
  const jump = page.getByRole("textbox", { name: "Go to cell", exact: true });
  await jump.fill("A502");
  await jump.press("Enter");
  await expect(
    page.getByRole("textbox", { name: "A502", exact: true }),
  ).toHaveValue("Roster student 500");
  await jump.fill("A1");
  await jump.press("Enter");
  await page.getByLabel("Choose class", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Select class", exact: true })
    .selectOption(classId);
  await expect(
    page.getByRole("textbox", { name: "A2", exact: true }),
  ).toHaveValue("Roster student 000");
  await expect(
    page.getByRole("textbox", { name: "A3", exact: true }),
  ).toHaveValue("");
});

test("working rows and columns expand, save, reload, and feed actual mark formulas", async ({
  page,
}) => {
  await signIn(page);
  await expect(
    page.getByRole("textbox", { name: "Name header", exact: true }),
  ).toBeVisible();
  const saved = () =>
    expect(page.locator(".workbook-status")).toHaveText("All changes saved");
  const jump = async (address) => {
    const box = page.getByRole("textbox", { name: "Go to cell", exact: true });
    await box.fill(address);
    await box.press("Enter");
    await saved();
    await expect(
      page.getByRole("textbox", { name: address, exact: true }),
    ).toBeVisible();
  };
  const table = page.getByRole("table", {
    name: "Flexible Excel-style worksheet",
    exact: true,
  });
  const rows = Number(await table.getAttribute("aria-rowcount")),
    columns = Number(await table.getAttribute("aria-colcount"));
  await page.getByRole("button", { name: "Add row", exact: true }).click();
  await saved();
  await expect(table).toHaveAttribute("aria-rowcount", String(rows + 1));
  await page
    .getByRole("button", { name: "Add blank column", exact: true })
    .click();
  await saved();
  await expect(table).toHaveAttribute("aria-colcount", String(columns + 1));
  await jump("DW650");
  const distant = page.getByRole("textbox", { name: "DW650", exact: true });
  await distant.fill("30");
  await distant.press("Tab");
  await saved();
  expect(await page.locator(".workbook-grid input").count()).toBeLessThan(1100);
  await jump("B2");
  const mark = page.getByRole("textbox", { name: "B2", exact: true });
  await mark.fill("=DW650");
  await mark.press("Tab");
  await saved();
  await expect(mark).toHaveValue("30");
  await page.reload();
  await jump("DW650");
  await expect(distant).toHaveValue("30");
  await distant.fill("25");
  await distant.press("Tab");
  await saved();
  await jump("B2");
  await expect(mark).toHaveValue("25");
  await jump("DW1");
  const header = page.getByRole("textbox", { name: "DW1", exact: true });
  await header.fill("Practice calculations");
  await header.press("Tab");
  await saved();
  await page.reload();
  await jump("DW1");
  await expect(header).toHaveValue("Practice calculations");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await jump("DW650");
  await page.locator("#app h1").click();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: "docs/screenshots/expandable-worksheet.png",
    fullPage: true,
  });
});

test("large TSV paste grows the sheet and saves working values in batches", async ({
  page,
}) => {
  await signIn(page);
  const box = page.getByRole("textbox", { name: "Go to cell", exact: true });
  await box.fill("AA20");
  await box.press("Enter");
  await expect(page.locator(".workbook-status")).toHaveText(
    "All changes saved",
  );
  const start = page.getByRole("textbox", { name: "AA20", exact: true });
  await expect(start).toBeVisible();
  await start.evaluate((el) => {
    const data = new DataTransfer();
    data.setData(
      "text/plain",
      Array.from({ length: 3000 }, (_, i) => String(i)).join("\n"),
    );
    el.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(page.locator(".workbook-status")).toHaveText(
    "All changes saved",
    { timeout: 15000 },
  );
  await box.fill("AA3019");
  await box.press("Enter");
  await expect(
    page.getByRole("textbox", { name: "AA3019", exact: true }),
  ).toHaveValue("2999");
  await page.reload();
  await box.fill("AA3019");
  await box.press("Enter");
  await expect(
    page.getByRole("textbox", { name: "AA3019", exact: true }),
  ).toHaveValue("2999");
  expect(await page.locator(".workbook-grid input").count()).toBeLessThan(1100);
});

test("very distant cells remain editable without rendering the full sheet", async ({
  page,
}) => {
  await signIn(page);
  await expect(
    page.getByRole("textbox", { name: "Name header", exact: true }),
  ).toBeVisible();
  const address = await page.evaluate(
    async () => (await import("/formulas.js")).columnName(200000) + "2000000",
  );
  const box = page.getByRole("textbox", { name: "Go to cell", exact: true });
  await box.fill(address);
  await box.press("Enter");
  await expect(page.locator(".workbook-status")).toHaveText(
    "All changes saved",
  );
  const cell = page.getByRole("textbox", { name: address, exact: true });
  await expect(cell).toBeVisible();
  await expect(cell).toBeFocused();
  await expect
    .poll(() =>
      cell.evaluate((el) => {
        const cell = el.getBoundingClientRect(),
          grid = el.closest(".workbook-grid").getBoundingClientRect();
        return (
          cell.top >= grid.top &&
          cell.bottom <= grid.bottom + 1 &&
          cell.left >= grid.left &&
          cell.right <= grid.right + 1
        );
      }),
    )
    .toBeTruthy();
  await cell.fill("Distant working note");
  await cell.press("Tab");
  await expect(page.locator(".workbook-status")).toHaveText(
    "All changes saved",
  );
  expect(await page.locator(".workbook-grid input").count()).toBeLessThan(1100);
  await page.reload();
  await box.fill(address);
  await box.press("Enter");
  await expect(cell).toHaveValue("Distant working note");
});

async function firstWorkingCell(page) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(
    page.getByRole("textbox", { name: "Name header", exact: true }),
  ).toBeVisible();
  for (const [address, value] of [
    ["B2", "20"],
    ["C2", "30"],
  ]) {
    const cell = page.getByRole("textbox", { name: address, exact: true });
    if ((await cell.inputValue()) === "") {
      await cell.fill(value);
      await cell.press("Tab");
      await expect(page.locator(".workbook-status")).toHaveText(
        "All changes saved",
      );
    }
  }
  const info = await page.evaluate(async () => {
    const data = await (await import("/client.js")).api("/admin/data");
    return {
      column: (await import("/formulas.js")).columnName(data.papers.length + 1),
      student: data.students
        .filter((s) => s.active)
        .sort(
          (a, b) =>
            a.name.localeCompare(b.name, "en") || a._id.localeCompare(b._id),
        )[0]._id,
    };
  });
  const address = info.column + "2",
    box = page.getByRole("textbox", { name: "Go to cell", exact: true });
  await box.fill(address);
  await box.press("Enter");
  await expect(
    page.getByRole("textbox", { name: address, exact: true }),
  ).toBeVisible();
  return { ...info, address };
}

test("formula entry suggests functions and inserts clicked cell references without saving the draft", async ({
  page,
}) => {
  await signIn(page);
  const { address } = await firstWorkingCell(page),
    editor = page.getByRole("textbox", { name: address, exact: true }),
    bar = page.getByRole("textbox", {
      name: "Cell formula or value",
      exact: true,
    });
  const expected =
    (Number(
      await page.getByRole("textbox", { name: "B2", exact: true }).inputValue(),
    ) +
      Number(
        await page
          .getByRole("textbox", { name: "C2", exact: true })
          .inputValue(),
      )) /
    2;
  await editor.press("=");
  await expect(
    page.getByRole("listbox", { name: "Formula functions" }),
  ).toBeVisible();
  await editor.pressSequentially("av");
  await expect(page.getByRole("option", { name: /^AVERAGE/ })).toBeVisible();
  await editor.press("Tab");
  await expect(editor).toHaveValue("=AVERAGE(");
  let writes = 0;
  page.on("request", (request) => {
    if (request.method() === "PUT" && request.url().includes("/api/admin/"))
      writes++;
  });
  await page
    .locator(".workbook-grid")
    .evaluate((grid) => (grid.scrollLeft = 0));
  await page.getByRole("textbox", { name: "B2", exact: true }).click();
  await expect(bar).toHaveValue("=AVERAGE(B2");
  await page.locator("input:focus").pressSequentially(":");
  await page.getByRole("textbox", { name: "C2", exact: true }).click();
  await expect(bar).toHaveValue("=AVERAGE(B2:C2");
  await expect(bar).toHaveValue("=AVERAGE(B2:C2");
  expect(writes).toBe(0);
  await page.locator("input:focus").pressSequentially(")");
  await page.locator("input:focus").press("Enter");
  await expect(page.locator(".workbook-status")).toHaveText(
    "All changes saved",
  );
  await expect(editor).toHaveValue(String(expected));
  await page.setViewportSize({ width: 1440, height: 1000 });
  const target = page.getByRole("textbox", { name: "Go to cell", exact: true });
  await target.fill(address);
  await target.press("Enter");
  await expect(editor).toBeFocused();
  await bar.click();
  await bar.press("End");
  await bar.pressSequentially("+");
  await expect(
    page.getByRole("listbox", { name: "Formula functions" }),
  ).toBeVisible();
  await page.locator("#app h1").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "docs/screenshots/formula-functions.png",
    fullPage: true,
  });
  await bar.press("Escape");
});

test("a saved average column converts to a published paper and recalculates for student results", async ({
  page,
}) => {
  await signIn(page);
  const { address, column, student } = await firstWorkingCell(page);
  const editor = page.getByRole("textbox", { name: address, exact: true });
  await editor.fill("=ROUND(AVERAGE(B2:C2),2)");
  await editor.press("Enter");
  await expect(page.locator(".workbook-status")).toHaveText(
    "All changes saved",
  );
  const expected = Number(await editor.inputValue());
  const box = page.getByRole("textbox", { name: "Go to cell", exact: true });
  await box.fill(column + "1");
  await box.press("Enter");
  const header = page.getByRole("textbox", { name: column + "1", exact: true });
  await header.fill("Calculated final average");
  await header.press("Enter");
  await expect(page.locator(".workbook-status")).toHaveText(
    "All changes saved",
  );
  await page
    .getByRole("button", {
      name: "Settings for column " + column,
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog", { name: "Edit paper" })).toBeVisible();
  await page
    .getByRole("combobox", { name: "Publication status", exact: true })
    .selectOption("published");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(header).toHaveValue("Calculated final average");
  await expect(header).not.toHaveAttribute("readonly", "");
  await expect(editor).toHaveValue(String(expected));
  const results = await (
    await page.request.get("/api/results/" + student)
  ).json();
  expect(results.papers.at(-1).name).toBe("Calculated final average");
  expect(results.papers.at(-1).value).toBe(expected);
  expect(results.papers.at(-1).formula).toBeUndefined();
  const parent = page.getByRole("textbox", { name: "B2", exact: true });
  await parent.fill("40");
  await parent.press("Tab");
  await expect(page.locator(".workbook-status")).toHaveText(
    "All changes saved",
  );
  const updated =
    (Number(await parent.inputValue()) +
      Number(
        await page
          .getByRole("textbox", { name: "C2", exact: true })
          .inputValue(),
      )) /
    2;
  await expect(editor).toHaveValue(String(updated));
  await page.reload();
  await expect(editor).toHaveValue(String(updated));
  const live = await (await page.request.get("/api/results/" + student)).json();
  expect(live.papers.at(-1).value).toBe(updated);
  const studentPage = await page.context().newPage();
  await studentPage.emulateMedia({ reducedMotion: "reduce" });
  await studentPage.goto("/");
  await studentPage.getByLabel("Full name", { exact: true }).fill(live.student);
  await studentPage.getByLabel("Full name", { exact: true }).press("Enter");
  await studentPage
    .getByRole("button", { name: new RegExp(live.student + " ·") })
    .click();
  await studentPage
    .getByRole("button", { name: "Discover my results" })
    .click();
  for (let index = 0; index < live.papers.length; index++) {
    const paper = live.papers[index];
    await studentPage
      .getByRole("button", { name: new RegExp(paper.name) })
      .click();
    await expect(studentPage.locator("#score")).toHaveAttribute(
      "aria-label",
      "Score " + paper.value,
    );
    if (index < live.papers.length - 1)
      await studentPage.getByRole("button", { name: "Next paper" }).click();
  }
  await expect(studentPage.locator(".badge")).toBeVisible();
  await studentPage.screenshot({
    path: "docs/screenshots/calculated-student-result.png",
    fullPage: true,
  });
  await studentPage.close();

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator("#app h1").click();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: "docs/screenshots/calculated-paper.png",
    fullPage: true,
  });
});

test("Add column inserts an automatic paper with editable heading and no creation form", async ({
  page,
}) => {
  await signIn(page);
  await firstWorkingCell(page);
  const before = await page.evaluate(async () =>
    (await import("/client.js")).api("/admin/data"),
  );
  await page.getByRole("button", { name: "Add column", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("#flexible-workspace")).toHaveAttribute(
    "data-paper-count",
    String(before.papers.length + 1),
  );
  const info = await page.evaluate(
    async (ids) => {
      const data = await (await import("/client.js")).api("/admin/data"),
        paper = data.papers.find((p) => !ids.includes(p._id));
      return {
        column: (await import("/formulas.js")).columnName(
          data.papers.indexOf(paper) + 1,
        ),
        paper: paper._id,
        student: data.students
          .filter((s) => s.active)
          .sort(
            (a, b) =>
              a.name.localeCompare(b.name, "en") || a._id.localeCompare(b._id),
          )[0]._id,
      };
    },
    before.papers.map((p) => p._id),
  );
  const box = page.getByRole("textbox", { name: "Go to cell", exact: true });
  await box.fill(info.column + "1");
  await box.press("Enter");
  const header = page.getByRole("textbox", {
    name: info.column + "1",
    exact: true,
  });
  await header.fill("Manually added average");
  await header.press("Enter");
  await expect(page.locator(".workbook-status")).toHaveText(
    "All changes saved",
  );
  await box.fill(info.column + "2");
  await box.press("Enter");
  const cell = page.getByRole("textbox", {
    name: info.column + "2",
    exact: true,
  });
  await cell.fill("=ROUND(AVERAGE(B2:C2),2)");
  await cell.press("Enter");
  await expect(page.locator(".workbook-status")).toHaveText(
    "All changes saved",
  );
  expect(
    (
      await (await page.request.get("/api/results/" + info.student)).json()
    ).papers.some((p) => p.id === info.paper),
  ).toBeFalsy();
  await page.getByRole("link", { name: "Papers", exact: true }).click();
  const row = page
    .locator(".management-row")
    .filter({ hasText: "Manually added average" });
  await row.getByRole("button", { name: "Edit / publish" }).click();
  await page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Publication status", exact: true })
    .selectOption("published");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (
      await (await page.request.get("/api/results/" + info.student)).json()
    ).papers.some((p) => p.id === info.paper),
  ).toBeTruthy();
});

test("bare equals and formula-bar editing support point-and-click references and Escape cancellation", async ({
  page,
}) => {
  await signIn(page);
  const { address } = await firstWorkingCell(page),
    editor = page.getByRole("textbox", { name: address, exact: true }),
    bar = page.getByRole("textbox", {
      name: "Cell formula or value",
      exact: true,
    });
  await editor.press("=");
  await page
    .locator(".workbook-grid")
    .evaluate((grid) => (grid.scrollLeft = 0));
  await page.getByRole("textbox", { name: "B2", exact: true }).click();
  await expect(bar).toHaveValue("=B2");
  await page.locator("input:focus").press("Escape");
  await editor.click();
  await bar.click();
  await bar.fill("=SU");
  await expect(page.getByRole("option", { name: /^SUM / })).toBeVisible();
  await bar.press("Enter");
  await expect(bar).toHaveValue("=SUM(");
  await page
    .locator(".workbook-grid")
    .evaluate((grid) => (grid.scrollLeft = 0));
  await page.getByRole("textbox", { name: "B2", exact: true }).click();
  await bar.pressSequentially(",");
  await page.getByRole("textbox", { name: "C2", exact: true }).click();
  await bar.pressSequentially(")");
  await expect(bar).toHaveValue("=SUM(B2,C2)");
  const expected =
    Number(
      await page.getByRole("textbox", { name: "B2", exact: true }).inputValue(),
    ) +
    Number(
      await page.getByRole("textbox", { name: "C2", exact: true }).inputValue(),
    );
  await bar.press("Enter");
  await expect(page.locator(".workbook-status")).toHaveText(
    "All changes saved",
  );
  await expect(editor).toHaveValue(String(expected));
  await editor.click();
  await bar.click();
  await bar.fill("=AVERAGE(");
  await bar.press("Escape");
  await expect(bar).toHaveValue("=SUM(B2,C2)");
  await page.reload();
  await expect(editor).toHaveValue(String(expected));
});

test("automatic column maximum can be corrected in optional settings without losing saved inputs", async ({
  page,
}) => {
  await signIn(page);
  const { address, column } = await firstWorkingCell(page),
    editor = page.getByRole("textbox", { name: address, exact: true });
  await editor.fill("150");
  await editor.press("Enter");
  await expect(page.locator(".workbook-status")).toContainText(
    "between 0 and 100",
  );
  await page
    .getByRole("button", { name: "Settings for column " + column, exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Column settings" }),
  ).toBeVisible();
  await page.getByLabel("Maximum marks", { exact: true }).fill("200");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(editor).toHaveValue("150");
  await expect(page.locator(".workbook-status")).toHaveText(
    "All changes saved",
  );
  const stored = await page.evaluate(async () =>
    (await import("/client.js")).api("/admin/data"),
  );
  const paper = stored.papers.at(-1);
  expect(paper.max).toBe(200);
  expect(paper.state).toBe("draft");
  expect(
    stored.marks.some(
      (mark) => mark.paperId === paper._id && mark.value === 150,
    ),
  ).toBeTruthy();
});

test("score ranges change the persistent atmosphere, burst, gold and final celebration", async ({
  page,
}) => {
  test.setTimeout(60000);
  const values = [9, 15, 60, 72, 40],
    maxima = [100, 100, 100, 100, 50];
  await page.route("**/api/results/*", (route) =>
    route.fulfill({
      json: {
        student: "Single Student",
        papers: values.map((value, i) => ({
          id: `range-${i}`,
          name: `Range paper ${i + 1}`,
          subject: "Mathematics",
          value,
          max: maxima[i],
        })),
      },
    }),
  );
  await identify(page, "Single Student");
  await page.evaluate(
    () =>
      (window.originalAtmosphere = document.querySelector(".score-atmosphere")),
  );
  const root = page.locator(".student-journey");
  for (const [i, band] of [
    "under-10",
    "under-20",
    "burst",
    "gold",
    "celebration",
  ].entries()) {
    await page
      .getByRole("button", { name: new RegExp(`Range paper ${i + 1}`) })
      .click();
    await expect(root).toHaveAttribute("data-score-band", band);
    await expect(page.locator("#score")).toHaveAttribute(
      "aria-label",
      `Score ${values[i]}`,
      { timeout: 7000 },
    );
    await expect(root).toHaveAttribute("data-complete", "true");
    await expect(root).toHaveAttribute(
      "data-score-effect",
      i < 2 ? "gentle" : "burst",
    );
    if (i < 2)
      await expect(page.locator(".score-wash-red")).toHaveCSS(
        "opacity",
        i === 0 ? "0.92" : "0.48",
      );
    if (i === 2)
      expect(
        await page
          .locator(".score-ray")
          .evaluateAll((nodes) =>
            nodes.some((n) =>
              n.getAnimations().some((a) => a.playState === "running"),
            ),
          ),
      ).toBe(true);
    if (i >= 3)
      await expect(page.locator("#score")).toHaveCSS(
        "color",
        "rgb(233, 215, 166)",
      );
    await expect(page.locator(".confetti")).toHaveCount(i === 4 ? 64 : 0);
    expect(
      await page.evaluate(
        () =>
          window.originalAtmosphere ===
          document.querySelector(".score-atmosphere"),
      ),
    ).toBe(true);
    await page.screenshot({ path: `docs/screenshots/score-${band}.png` });
    if (i < 4) await page.getByRole("button", { name: "Next paper" }).click();
  }
  await page.getByRole("button", { name: "Replay journey" }).click();
  await expect(root).not.toHaveAttribute("data-score-band", /.+/);
  await expect(page.locator(".confetti")).toHaveCount(0);
});

test("a final low score gets a larger completion celebration and clears previous gold", async ({
  page,
}) => {
  await page.route("**/api/results/*", (route) =>
    route.fulfill({
      json: {
        student: "Single Student",
        papers: [
          { id: "high", name: "High paper", max: 100, value: 95 },
          { id: "low", name: "Low paper", max: 100, value: 5 },
        ],
      },
    }),
  );
  await identify(page, "Single Student");
  await page.getByRole("button", { name: /High paper/ }).click();
  await expect(page.locator(".confetti")).toHaveCount(24, { timeout: 7000 });
  await page.getByRole("button", { name: "Next paper" }).click();
  await page.getByRole("button", { name: /Low paper/ }).click();
  await expect(page.locator("#score")).toHaveAttribute(
    "aria-label",
    "Score 5",
    { timeout: 7000 },
  );
  await expect(page.locator(".confetti")).toHaveCount(40);
  await expect(page.locator("#score")).toHaveCSS("color", "rgb(212, 239, 255)");
  await expect(page.locator("#message")).not.toContainText(
    /fail|poor|personal best/i,
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".confetti")).toHaveCount(0);
  expect(
    await page
      .locator(".score-ray")
      .evaluateAll((nodes) =>
        nodes.every((n) => n.getAnimations().length === 0),
      ),
  ).toBe(true);
});

test("reduced motion and Skip keep high-score effects static and exact", async ({
  page,
}) => {
  await page.route("**/api/results/*", (route) =>
    route.fulfill({
      json: {
        student: "Single Student",
        papers: [{ id: "high", name: "High paper", max: 50, value: 40 }],
      },
    }),
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await identify(page, "Single Student");
  await page.getByRole("button", { name: /High paper/ }).click();
  await expect(page.locator("#score")).toHaveAttribute(
    "aria-label",
    "Score 40",
  );
  await expect(page.locator("#score")).toHaveCSS("color", "rgb(233, 215, 166)");
  await expect(page.locator(".confetti")).toHaveCount(0);
  await page.getByRole("button", { name: "Replay journey" }).click();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: /High paper/ }).click();
  await page.getByRole("button", { name: /Skip animation/ }).click();
  await expect(page.locator("#score")).toHaveAttribute(
    "aria-label",
    "Score 40",
  );
  await expect(page.locator(".confetti")).toHaveCount(0);
  expect(
    await page
      .locator(".score-ray")
      .evaluateAll((nodes) =>
        nodes.every((n) => n.getAnimations().length === 0),
      ),
  ).toBe(true);
});

test("spinner colours develop gradually and the glass blast expands beyond the viewport", async ({
  page,
}) => {
  await page.route("**/api/results/*", (route) =>
    route.fulfill({
      json: {
        student: "Single Student",
        papers: [{ id: "glass", name: "Glass reveal", max: 100, value: 85 }],
      },
    }),
  );
  await identify(page, "Single Student");
  await page.getByRole("button", { name: /Glass reveal/ }).click();
  await expect
    .poll(() =>
      page
        .locator(".score-wash-gold")
        .evaluate(
          (n) =>
            n.getAnimations().filter((a) => !(a instanceof CSSTransition))
              .length,
        ),
    )
    .toBeGreaterThan(0);
  const progression = await page.locator(".score-wash-gold").evaluate((n) => {
    const a = n.getAnimations().find((a) => !(a instanceof CSSTransition)),
      now = a.currentTime,
      duration = a.effect.getTiming().duration;
    a.pause();
    a.currentTime = duration * 0.2;
    const early = Number(getComputedStyle(n).opacity);
    a.currentTime = duration * 0.7;
    const later = Number(getComputedStyle(n).opacity);
    a.currentTime = now;
    a.play();
    return { early, later };
  });
  expect(progression.early).toBeLessThan(0.1);
  expect(progression.later).toBeGreaterThan(progression.early + 0.2);
  await expect(page.locator(".student-journey")).toHaveAttribute(
    "data-complete",
    "false",
  );
  await expect(page.locator("#score")).toHaveAttribute(
    "aria-label",
    "Score 85",
    { timeout: 7000 },
  );
  await expect(page.locator("#score")).toHaveCSS("color", "rgb(233, 215, 166)");
  const glass = page.locator(".score-glass").first();
  await expect
    .poll(() => glass.evaluate((n) => n.getAnimations().length))
    .toBeGreaterThan(0);
  const size = await glass.evaluate(async (n) => {
    const a = n.getAnimations()[0];
    await a.ready;
    a.pause();
    await a.ready;
    a.currentTime = a.effect.getTiming().duration * 0.18;
    return {
      width:
        parseFloat(getComputedStyle(n).width) *
        Number(
          getComputedStyle(n.parentElement).getPropertyValue("--blast-scale"),
        ),
      view: innerWidth,
      opacity: Number(getComputedStyle(n).opacity),
    };
  });
  expect(size.width).toBeGreaterThan(size.view);
  expect(size.opacity).toBeGreaterThan(0.2);
  await page.screenshot({ path: "docs/screenshots/glass-blast.png" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() => glass.evaluate((n) => n.getAnimations().length))
    .toBe(0);
  await expect(glass).toBeHidden();
  await page.getByRole("button", { name: "Replay journey" }).click();
  await expect(page.locator(".student-journey")).not.toHaveAttribute(
    "data-score-band",
    /.+/,
  );
});

test("the final reel movement, glass blast and number pop share one completion frame", async ({
  page,
}) => {
  test.setTimeout(30000);
  await page.route("**/api/results/*", (route) =>
    route.fulfill({
      json: {
        student: "Single Student",
        papers: [
          { id: "sync-a", name: "Sync paper one", max: 100, value: 60 },
          { id: "sync-b", name: "Sync paper two", max: 100, value: 85 },
        ],
      },
    }),
  );
  await identify(page, "Single Student");
  await page.evaluate(() => {
    window.revealTiming = [];
    const original = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      if (this.matches(".score-glass:not(.score-glass-echo),#score"))
        window.revealTiming.push({
          kind: this.id === "score" ? "pop" : "blast",
          at: performance.now(),
          frames: args[0],
          options: args[1],
        });
      return original.apply(this, args);
    };
    const score = document.querySelector("#score");
    new MutationObserver((records) => {
      if (
        records.some((r) => r.attributeName === "data-complete") &&
        score.dataset.complete === "true"
      )
        window.revealTiming.push({ kind: "stop", at: performance.now() });
    }).observe(score, { attributes: true });
  });
  for (const [index, value] of [60, 85].entries()) {
    await page.evaluate(() => {
      window.revealTiming = [];
      window.lastReelChange = 0;
      let previous;
      const watch = () => {
        const score = document.querySelector("#score"),
          strip = score.querySelector(".digit-strip");
        const y = strip
          ? new DOMMatrix(getComputedStyle(strip).transform).m42
          : 0;
        if (previous !== undefined && Math.abs(y - previous) > 0.1)
          window.lastReelChange = performance.now();
        previous = y;
        if (score.dataset.complete !== "true") requestAnimationFrame(watch);
      };
      // The old completion flag is cleared by reveal before sampling starts.
      window.watchReel = watch;
    });
    await page
      .getByRole("button", {
        name: new RegExp(index === 0 ? "Sync paper one" : "Sync paper two"),
      })
      .click();
    await page.evaluate(() => requestAnimationFrame(window.watchReel));
    await expect(page.locator("#score")).toHaveAttribute(
      "aria-label",
      `Score ${value}`,
      { timeout: 6000 },
    );
    const timing = await page.evaluate(() => ({
      events: window.revealTiming,
      lastChange: window.lastReelChange,
    }));
    const stop = timing.events.find((e) => e.kind === "stop"),
      blast = timing.events.find((e) => e.kind === "blast"),
      pop = timing.events.find((e) => e.kind === "pop");
    expect(Math.abs(blast.at - stop.at)).toBeLessThan(40);
    expect(Math.abs(pop.at - blast.at)).toBeLessThan(20);
    expect(stop.at - timing.lastChange).toBeLessThan(100);
    expect(blast.options.delay).toBe(0);
    expect(blast.frames[0].opacity).toBeGreaterThan(0);
    expect(pop.frames[1].transform).toContain(index === 0 ? "1.22" : "1.28");
    await expect(page.locator(".score-glass").first()).toBeVisible();
    if (index === 0)
      await page.getByRole("button", { name: "Next paper" }).click();
  }
});

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
]) {
  test(`visible reel landing and first painted glass impact stay together at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.route("**/api/results/*", (route) =>
      route.fulfill({
        json: {
          student: "Single Student",
          papers: [
            { id: "paint-impact", name: "Painted impact", max: 100, value: 85 },
          ],
        },
      }),
    );
    await identify(page, "Single Student");
    await page.evaluate(() => {
      window.impactFrames = [];
      const watch = () => {
        const score = document.querySelector("#score"),
          strip = score.querySelector(".digit-strip");
        if (strip) {
          const glass = document.querySelector(".score-glass"),
            style = getComputedStyle(glass);
          const frame = {
            time: performance.now(),
            remaining:
              (score.dataset.complete === "true" ? 0 : 48) +
              new DOMMatrix(getComputedStyle(strip).transform).m42 /
                parseFloat(getComputedStyle(strip).fontSize),
            done: score.dataset.complete === "true",
            opacity: Number(style.opacity),
            scale: new DOMMatrix(style.transform).a,
          };
          window.impactFrames.push(frame);
          if (frame.done) return;
        }
        requestAnimationFrame(watch);
      };
      requestAnimationFrame(watch);
    });
    await page.getByRole("button", { name: /Painted impact/ }).click();
    await page.waitForFunction(
      () => window.impactFrames.some((f) => f.done),
      null,
      { polling: "raf", timeout: 7000 },
    );
    const frames = await page.evaluate(() => window.impactFrames);
    const impact = frames.find((f) => f.done);
    const speed = (samples) =>
      (samples[0].remaining - samples.at(-1).remaining) /
      (samples.at(-1).time - samples[0].time);
    const early = frames.filter(
      (f) => f.time - frames[0].time >= 100 && f.time - frames[0].time <= 500,
    );
    const late = frames.filter(
      (f) => impact.time - f.time >= 300 && impact.time - f.time <= 700,
    );
    expect(early.length).toBeGreaterThan(2);
    expect(late.length).toBeGreaterThan(2);
    expect(speed(early)).toBeGreaterThan(speed(late) * 2.5);
    const braking = frames.filter(
      (f) => impact.time - f.time >= 700 && impact.time - f.time <= 1100,
    );
    const approach = frames.filter(
      (f) => impact.time - f.time >= 150 && impact.time - f.time <= 450,
    );
    expect(braking.length).toBeGreaterThan(2);
    expect(approach.length).toBeGreaterThan(2);
    expect(speed(braking)).toBeGreaterThan(speed(approach) * 1.7);
    const before = frames.filter(
      (f) => impact.time - f.time >= 180 && impact.time - f.time <= 230,
    );
    expect(before.length).toBeGreaterThan(0);
    // The slower final approach must still move, with no idle wait for impact.
    expect(Math.min(...before.map((f) => f.remaining))).toBeGreaterThan(0.03);
    expect(Math.abs(impact.remaining)).toBeLessThan(0.01);
    const previous = frames[frames.indexOf(impact) - 1];
    expect(impact.time - previous.time).toBeLessThan(100);
    expect(
      await page.locator("#score .digit-strip").evaluateAll((nodes) =>
        nodes.map((n) => ({
          count: n.childElementCount,
          text: n.textContent,
        })),
      ),
    ).toEqual([
      { count: 1, text: "8" },
      { count: 1, text: "5" },
    ]);
    expect(impact.opacity).toBeGreaterThanOrEqual(0.5);
    expect(impact.scale).toBeGreaterThanOrEqual(0.2);
    await expect(page.locator("#score")).toHaveAttribute(
      "aria-label",
      "Score 85",
    );
    await page.screenshot({
      path: `docs/screenshots/impact-${viewport.width}.png`,
    });
    await expect(page.locator(".score-glass").first()).toHaveCSS(
      "opacity",
      "0",
      { timeout: 3500 },
    );
  });
}

for (const device of [
  {
    name: "phone",
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36",
    viewport: { width: 393, height: 852 },
    screen: { width: 393, height: 852 },
    isMobile: true,
    hasTouch: true,
  },
  {
    name: "phone in desktop mode",
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    screen: { width: 393, height: 852 },
    isMobile: false,
    hasTouch: true,
  },
  {
    name: "iPad in desktop mode",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
    viewport: { width: 1366, height: 1024 },
    screen: { width: 1024, height: 1366 },
    isMobile: false,
    hasTouch: true,
  },
]) {
  test(`admin is restricted on ${device.name} while student results remain usable`, async ({
    browser,
  }) => {
    const { name, ...options } = device;
    const context = await browser.newContext({
      ...options,
      baseURL: "http://localhost:3100",
    });
    const page = await context.newPage();
    let privateCalls = 0;
    page.on("request", (request) => {
      if (
        new URL(request.url()).pathname.startsWith("/api/admin") ||
        new URL(request.url()).pathname === "/api/login"
      )
        privateCalls++;
    });
    try {
      for (const path of [
        "/admin/login",
        "/admin/marks",
        "/admin/students",
        "/admin/classes",
        "/admin/papers",
        "/admin/performance",
        "/admin/history",
      ]) {
        await page.goto(path);
        await expect(
          page.getByRole("heading", { name: "Desktop access required" }),
        ).toBeVisible();
        await expect(page.getByLabel("Username", { exact: true })).toHaveCount(
          0,
        );
        await expect(page.locator(".admin-sidebar")).toHaveCount(0);
      }
      expect(privateCalls).toBe(0);
      await page.screenshot({
        path: `docs/screenshots/admin-${name.replaceAll(" ", "-")}.png`,
      });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await identify(page, "Single Student");
      await expect(
        page.getByRole("link", { name: "Exam Result Portal home" }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: /Mathematics · Paper 01/ })
        .click();
      await expect(page.locator("#score")).toHaveAttribute(
        "aria-label",
        "Score 0",
      );
    } finally {
      await context.close();
    }
  });
}

test("resizing an authenticated workspace blocks interaction and preserves its saved state", async ({
  page,
}) => {
  await signIn(page, "/admin/students");
  await expect(
    page.getByRole("heading", { name: "Student directory" }),
  ).toBeVisible();
  await page.getByLabel("Search students", { exact: true }).fill("Maya");
  await page
    .getByRole("button", { name: "+ Add student", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.setViewportSize({ width: 1023, height: 800 });
  await expect(
    page.getByRole("heading", { name: "Desktop access required" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator("#app")).toHaveAttribute("inert", "");
  const denied = await page.evaluate(async () => {
    try {
      await (await import("/client.js")).api("/admin/data");
      return null;
    } catch (e) {
      return { status: e.status, code: e.code };
    }
  });
  expect(denied).toEqual({ status: 403, code: "DESKTOP_REQUIRED" });
  await page.setViewportSize({ width: 1024, height: 800 });
  await expect(
    page.getByRole("heading", { name: "Student directory" }),
  ).toBeVisible();
  await expect(page.getByLabel("Search students", { exact: true })).toHaveValue(
    "Maya",
  );
  await expect(page.locator("#admin-desktop-notice")).toBeHidden();
});

test("non-local HTTP loads student and teacher assets without HTTPS upgrades", async ({
  playwright,
}) => {
  const browser = await playwright.chromium.launch();
  const context = await browser.newContext({
    baseURL: "http://exam-portal.test:3100",
    viewport: { width: 1280, height: 800 },
  });
  // Keep the browser on an untrustworthy, non-local HTTP origin while
  // forwarding actual Express responses from the isolated local fixture.
  await context.route("**://exam-portal.test:3100/**", async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({
      url: "http://127.0.0.1:3100" + url.pathname + url.search,
      headers: { ...route.request().headers(), host: url.host },
      maxRedirects: 0,
    });
    await route.fulfill({ response });
  });
  const page = await context.newPage();
  const upgraded = [],
    failures = [],
    consoleErrors = [],
    loaded = new Set();
  page.on("request", (request) => {
    if (request.url().startsWith("https://exam-portal.test"))
      upgraded.push(request.url());
  });
  page.on("requestfailed", (request) =>
    failures.push(`${request.url()}: ${request.failure()?.errorText}`),
  );
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() === 200) loaded.add(new URL(response.url()).pathname);
  });
  try {
    const response = await page.goto("/");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-security-policy"]).not.toContain(
      "upgrade-insecure-requests",
    );
    expect(response.headers()["strict-transport-security"]).toBeUndefined();
    expect(response.headers()["cross-origin-opener-policy"]).toBeUndefined();
    expect(await page.evaluate(() => isSecureContext)).toBe(false);
    await expect(page.getByLabel("Full name", { exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator(".journey-title")).toHaveCSS(
      "font-family",
      /Manrope/,
    );
    for (const asset of [
      "/app.js",
      "/client.js",
      "/journey.js",
      "/style.css",
      "/journey.css",
      "/assets/manrope-latin-variable.woff2",
    ])
      expect(loaded.has(asset), asset).toBe(true);
    await page.getByLabel("Full name", { exact: true }).fill("Single Student");
    await page.getByLabel("Full name", { exact: true }).press("Enter");
    await expect(
      page.getByRole("button", { name: /Single Student ·/ }),
    ).toBeVisible();
    await signIn(page, "/admin/login");
    await expect(page.locator(".workbook-grid")).toBeVisible();
    await expect(page.locator(".workbook-status")).toHaveText(
      "All changes saved",
    );
    expect(loaded.has("/admin.js")).toBe(true);
    expect(loaded.has("/admin.css")).toBe(true);
    const cookie = (await context.cookies()).find(
      (cookie) => cookie.name === "levelup.sid",
    );
    expect(cookie).toMatchObject({
      secure: false,
      httpOnly: true,
      sameSite: "Strict",
    });
    expect(upgraded).toEqual([]);
    expect(failures).toEqual([]);
    expect(
      consoleErrors.filter((message) =>
        /ERR_SSL_PROTOCOL_ERROR|Cross-Origin-Opener-Policy.*ignored/i.test(
          message,
        ),
      ),
    ).toEqual([]);
  } finally {
    await context.unrouteAll({ behavior: "wait" });
    await context.close();
    await browser.close();
  }
});

test("student loading screen is themed, responsive, reduced-motion friendly and leaves on readiness", async ({
  page,
}) => {
  let releaseSession, releaseLookup, releaseResults;
  const sessionReady = new Promise((resolve) => (releaseSession = resolve));
  const lookupReady = new Promise((resolve) => (releaseLookup = resolve));
  const resultsReady = new Promise((resolve) => (releaseResults = resolve));
  let resultCalls = 0;
  await page.route("**/api/results/*", async (route) => {
    await resultsReady;
    if (++resultCalls === 1)
      await route.fulfill({ json: { student: "Single Student", papers: [] } });
    else await route.continue();
  });
  await page.route("**/api/session", async (route) => {
    await sessionReady;
    await route.continue();
  });
  await page.route("**/api/lookup", async (route) => {
    await lookupReady;
    await route.continue();
  });
  try {
    await page.goto("/", { waitUntil: "commit" });
    const loader = page.getByRole("status", {
      name: "Getting things ready",
      exact: true,
    });
    await expect(loader).toBeVisible();
    await expect(loader).toContainText("Exam Result Portal");
    await expect(loader).toHaveAttribute("aria-live", "polite");
    await page.screenshot({ path: "docs/screenshots/loading-student.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(".portal-loader-track > span")).toHaveCSS(
      "animation-name",
      "none",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: "docs/screenshots/loading-mobile.png" });
    releaseSession();
    await expect(page.getByLabel("Full name", { exact: true })).toBeVisible();
    await expect(loader).toHaveCount(0);
    await page.getByLabel("Full name", { exact: true }).fill("Single Student");
    await page.getByLabel("Full name", { exact: true }).press("Enter");
    await expect(page.locator(".inline-loading")).toContainText(
      "Finding your profile",
    );
    await expect(page.locator("#suggest")).toHaveAttribute("aria-busy", "true");
    releaseLookup();
    await expect(
      page.getByRole("button", { name: /Single Student ·/ }),
    ).toBeVisible();
    await expect(page.locator(".inline-loading")).toHaveCount(0);
    await page.getByRole("button", { name: /Single Student ·/ }).click();
    await page.getByRole("button", { name: /Discover my results/ }).click();
    await expect(page.locator(".inline-loading")).toContainText(
      "Loading your results",
    );
    releaseResults();
    await expect(
      page.getByText(
        "Your teacher has not published any results for you yet.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Discover my results/ }),
    ).toBeEnabled();
    await expect(page.locator(".inline-loading")).toHaveCount(0);
    await page.getByRole("button", { name: /Discover my results/ }).click();
    await expect(
      page.getByRole("button", { name: /Click to reveal/ }),
    ).toBeVisible();
  } finally {
    releaseSession();
    releaseLookup();
    releaseResults();
  }
});

test("teacher startup, sign-in, worksheet and history show styled loading states until data arrives", async ({
  page,
}) => {
  let releaseSession, releaseLogin, releaseWorksheet, releaseAudit;
  const pendingSession = new Promise((resolve) => (releaseSession = resolve));
  const pendingLogin = new Promise((resolve) => (releaseLogin = resolve));
  const pendingWorksheet = new Promise(
    (resolve) => (releaseWorksheet = resolve),
  );
  const pendingAudit = new Promise((resolve) => (releaseAudit = resolve));
  await page.route("**/api/session", async (route) => {
    await pendingSession;
    await route.continue();
  });
  await page.route("**/api/login", async (route) => {
    await pendingLogin;
    await route.continue();
  });
  await page.route("**/api/admin/worksheet-space/*", async (route) => {
    await pendingWorksheet;
    await route.continue();
  });
  await page.route("**/api/admin/audit", async (route) => {
    await pendingAudit;
    await route.continue();
  });
  try {
    await page.goto("/admin/login", { waitUntil: "commit" });
    const startup = page.getByRole("status", {
      name: "Preparing your workspace",
      exact: true,
    });
    await expect(startup).toBeVisible();
    await expect(startup).toContainText("TEACHER WORKSPACE");
    await page.screenshot({ path: "docs/screenshots/loading-admin.png" });
    releaseSession();
    await page.getByLabel("Username", { exact: true }).fill("teacher");
    await page.getByLabel("Password", { exact: true }).fill("browser-password");
    await page.getByRole("button", { name: /Sign in/ }).click();
    await expect(
      page.getByRole("button", { name: "Signing in…", exact: true }),
    ).toBeDisabled();
    await expect(page.locator("button .loading-dots")).toBeVisible();
    releaseLogin();
    const worksheet = page.getByRole("status", {
      name: "Opening your worksheet",
      exact: true,
    });
    await expect(worksheet).toBeVisible();
    await page.screenshot({ path: "docs/screenshots/loading-worksheet.png" });
    releaseWorksheet();
    await expect(page.locator(".workbook-grid")).toBeVisible();
    await expect(page.locator(".portal-loader")).toHaveCount(0);
    await page.getByRole("link", { name: "History", exact: true }).click();
    const history = page.getByRole("status", {
      name: "Loading change history",
      exact: true,
    });
    await expect(history).toBeVisible();
    await page.screenshot({ path: "docs/screenshots/loading-history.png" });
    releaseAudit();
    await expect(page.getByLabel("Search history")).toBeVisible();
    await expect(history).toHaveCount(0);
  } finally {
    releaseSession();
    releaseLogin();
    releaseWorksheet();
    releaseAudit();
  }
});

test("startup errors replace the loader and teacher retry recovers", async ({
  page,
}) => {
  await page.route("**/api/session", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Service temporarily unavailable" },
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "We couldn’t connect." }),
  ).toBeVisible();
  await expect(page.locator(".portal-loader")).toHaveCount(0);
  await page.goto("/admin/login");
  await expect(
    page.getByRole("heading", { name: "Unable to load this page." }),
  ).toBeVisible();
  await expect(page.locator(".portal-loader")).toHaveCount(0);
  await page.unroute("**/api/session");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
  await expect(page.locator(".portal-loader")).toHaveCount(0);
});
