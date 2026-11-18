import { test, expect } from "@playwright/test";
const key = "exam-result-portal.browser-id";
async function admin(page) {
  await page.goto("/admin/login");
  await page.getByLabel("Username", { exact: true }).fill("teacher");
  await page.getByLabel("Password", { exact: true }).fill("browser-password");
  await page.getByRole("button", { name: /Sign in/ }).click();
  await expect(page.locator(".workbook-grid")).toBeVisible();
}
const call = (page, path, body, method) =>
  page.evaluate(
    async ({ path, body, method }) =>
      (await import("/client.js")).api(path, body, method),
    { path, body, method },
  );
async function setup(page, name, two = false) {
  const { id } = await call(page, "/admin/students", {
    name,
    label: "View testing",
    active: true,
  });
  const papers = [];
  for (const [index, value] of (two ? [70, 80] : [0]).entries()) {
    const paper = await call(page, "/admin/papers", {
      name: `${name} paper ${index + 1}`,
      max: 100,
      state: "published",
      subject: "Mathematics",
    });
    await call(
      page,
      "/admin/marks",
      { entries: [{ studentId: id, paperId: paper.id, value }] },
      "PUT",
    );
    papers.push({ id: paper.id, name: `${name} paper ${index + 1}`, value });
  }
  return { id, name, papers };
}
async function reader(browser, name, storageScript) {
  const context = await browser.newContext({
    baseURL: "http://localhost:3100",
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  if (storageScript) await context.addInitScript(storageScript);
  const page = await context.newPage();
  await page.goto("/");
  await page.getByLabel("Full name", { exact: true }).fill(name);
  await page.getByLabel("Full name", { exact: true }).press("Enter");
  await page.getByRole("button", { name: new RegExp(name + " ·") }).click();
  await page.getByRole("button", { name: /Discover my results/ }).click();
  return { context, page };
}
async function reveal(page, paper) {
  await page.getByRole("button", { name: new RegExp(paper.name) }).click();
  await expect(page.locator("#score")).toHaveAttribute(
    "aria-label",
    "Score " + paper.value,
  );
}
async function stats(page, student) {
  const data = await call(
    page,
    "/admin/result-views?search=" + encodeURIComponent(student.name),
  );
  return data.students.find((s) => s._id === student.id);
}
async function counts(page, student, visits, devices, reveals) {
  await expect
    .poll(async () => {
      const row = await stats(page, student);
      return [row?.visits, row?.browserCount, row?.reveals];
    })
    .toEqual([visits, devices, reveals]);
}

test("real reveals count per browser across replays/reloads; teacher can inspect and reset browser, student and all counts", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  await admin(page);
  const student = await setup(page, "Result View Student", true);
  const first = await reader(browser, student.name);
  let second;
  try {
    const originalId = await first.page.evaluate(
      (key) => localStorage.getItem(key),
      key,
    );
    expect(originalId).toMatch(/^[a-f0-9]{32}$/);
    await counts(page, student, 0, 0, 0); // Opening a paper is not viewing a mark.
    await reveal(first.page, student.papers[0]);
    await counts(page, student, 1, 1, 1);
    await first.page
      .getByRole("button", { name: "Replay this paper", exact: true })
      .click();
    await reveal(first.page, student.papers[0]);
    await counts(page, student, 1, 1, 2);
    await first.page.getByRole("button", { name: "Next paper" }).click();
    await reveal(first.page, student.papers[1]);
    await counts(page, student, 1, 1, 3);
    await first.page
      .getByRole("button", { name: "Replay journey", exact: true })
      .click();
    await reveal(first.page, student.papers[0]);
    await counts(page, student, 2, 1, 4);
    await first.page.reload();
    await expect(
      first.page.getByRole("heading", { name: /Welcome back/ }),
    ).toBeVisible();
    expect(
      await first.page.evaluate((key) => localStorage.getItem(key), key),
    ).toBe(originalId);
    await first.page
      .getByRole("button", { name: /Discover my results/ })
      .click();
    await reveal(first.page, student.papers[0]);
    await counts(page, student, 3, 1, 5);
    second = await reader(browser, student.name);
    const secondId = await second.page.evaluate(
      (key) => localStorage.getItem(key),
      key,
    );
    expect(secondId).not.toBe(originalId);
    await reveal(second.page, student.papers[0]);
    await counts(page, student, 4, 2, 6);
    await first.page.evaluate((key) => localStorage.removeItem(key), key);
    await first.page.reload();
    await expect(
      first.page.getByRole("heading", { name: /Welcome back/ }),
    ).toBeVisible();
    const changedId = await first.page.evaluate(
      (key) => localStorage.getItem(key),
      key,
    );
    expect(changedId).toMatch(/^[a-f0-9]{32}$/);
    expect(changedId).not.toBe(originalId);
    await first.page
      .getByRole("button", { name: /Discover my results/ })
      .click();
    await reveal(first.page, student.papers[0]);
    await counts(page, student, 5, 3, 7);
    await page.goto("/admin/views");
    await page
      .getByLabel("Search students", { exact: true })
      .fill(student.name);
    await expect(page.locator("#view-summary")).toContainText("1 student ·");
    await expect(page.locator("[data-view-student]")).toHaveCount(1);
    const row = page.locator(`[data-view-student="${student.id}"]`);
    await expect(row).toContainText("Viewed");
    await page.screenshot({
      path: "docs/screenshots/result-views.png",
      fullPage: true,
    });
    await row
      .getByRole("button", { name: "View browsers", exact: true })
      .click();
    const detail = page.getByRole("dialog", {
      name: "Browser activity · " + student.name,
      exact: true,
    });
    await expect(detail.locator(".view-browser")).toHaveCount(3);
    const oldBrowser = detail.locator(`[data-browser-id="${originalId}"]`);
    await expect(oldBrowser.locator(".view-browser-stats")).toContainText(
      "3 visits",
    );
    await page.screenshot({
      path: "docs/screenshots/result-view-browsers.png",
      fullPage: true,
    });
    await oldBrowser
      .getByRole("button", { name: "Reset browser count", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Reset view counts", exact: true })
      .getByRole("button", { name: "Reset counts", exact: true })
      .click();
    await counts(page, student, 2, 2, 2);
    await expect(oldBrowser.locator(".view-browser-stats")).toContainText(
      "0 visits",
    );
    await detail
      .getByRole("button", { name: "Close view details", exact: true })
      .click();
    await row
      .getByRole("button", { name: "Reset student count", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Reset view counts", exact: true })
      .getByRole("button", { name: "Reset counts", exact: true })
      .click();
    await counts(page, student, 0, 0, 0);
    expect(
      await first.page.evaluate((key) => localStorage.getItem(key), key),
    ).toBe(changedId);
    await first.page
      .getByRole("button", { name: "Replay this paper", exact: true })
      .click();
    await reveal(first.page, student.papers[0]);
    await counts(page, student, 1, 1, 1);
    await page
      .getByRole("button", { name: "Reset all view counts", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Reset view counts", exact: true })
      .getByRole("button", { name: "Reset counts", exact: true })
      .click();
    await counts(page, student, 0, 0, 0);
    const detailData = await call(page, "/admin/result-views/" + student.id);
    expect(detailData.browsers).toHaveLength(3);
  } finally {
    await first.context.close();
    await second?.context.close();
  }
});

test("tracking retries are idempotent and storage/network failure never blocks the result", async ({
  page,
  browser,
}) => {
  test.setTimeout(45000);
  await admin(page);
  const student = await setup(page, "Retry View Student");
  const visitor = await reader(browser, student.name, () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "exam-result-portal.browser-id")
        throw new DOMException("Storage unavailable", "SecurityError");
      return original.call(this, key, value);
    };
  });
  const sent = [];
  let attempts = 0;
  try {
    await visitor.page.route("**/api/result-views", async (route) => {
      sent.push(route.request().postDataJSON());
      if (++attempts === 1) {
        const response = await route.fetch();
        await route.fulfill({
          response,
          status: 503,
          json: { error: "Simulated lost acknowledgement" },
        });
      } else await route.continue();
    });
    await reveal(visitor.page, student.papers[0]);
    await expect(
      visitor.page.getByRole("button", {
        name: "View all results",
        exact: true,
      }),
    ).toBeVisible();
    await expect(visitor.page.locator("#error")).toHaveText("");
    await expect.poll(() => attempts).toBeGreaterThanOrEqual(2);
    await counts(page, student, 1, 1, 1);
    expect(sent[0].eventId).toBe(sent[1].eventId);
    expect(
      await visitor.page.evaluate((key) => localStorage.getItem(key), key),
    ).toBeNull();
    await visitor.page
      .getByRole("button", { name: "Replay journey", exact: true })
      .click();
    await reveal(visitor.page, student.papers[0]);
    await counts(page, student, 2, 1, 2);
    await visitor.page.unroute("**/api/result-views");
    let failures = 0;
    await visitor.page.route("**/api/result-views", (route) => {
      failures++;
      return route.fulfill({
        status: 503,
        json: { error: "Offline tracking" },
      });
    });
    await visitor.page
      .getByRole("button", { name: "Replay journey", exact: true })
      .click();
    await reveal(visitor.page, student.papers[0]);
    await expect.poll(() => failures, { timeout: 7000 }).toBe(3);
    await counts(page, student, 2, 1, 2);
    await expect(visitor.page.locator("#error")).toHaveText("");
  } finally {
    await visitor.context.unrouteAll({ behavior: "wait" });
    await visitor.context.close();
  }
});

test("a hidden result is recorded only when the completed reveal becomes visible", async ({
  page,
  browser,
}) => {
  await admin(page);
  const student = await setup(page, "Visibility View Student");
  const visitor = await reader(browser, student.name);
  try {
    await visitor.page.evaluate(() => {
      window.viewTestHidden = true;
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => window.viewTestHidden,
      });
    });
    await reveal(visitor.page, student.papers[0]);
    await visitor.page.waitForTimeout(200);
    await counts(page, student, 0, 0, 0);
    await visitor.page.evaluate(() => {
      window.viewTestHidden = false;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await counts(page, student, 1, 1, 1);
  } finally {
    await visitor.context.close();
  }
});
