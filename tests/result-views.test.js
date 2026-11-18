import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, ObjectId } from "mongodb";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { createApp } from "../server.js";
let mongo,
  client,
  db,
  app,
  teacher,
  reader,
  token,
  csrf,
  student,
  other,
  inactive,
  paper,
  second,
  draft,
  wrongClass,
  absent,
  blank,
  cls;
const key = () => randomBytes(16).toString("hex");
const write = (agent, url, body, csrfToken = token) =>
  agent.post(url).set("X-CSRF-Token", csrfToken).send(body);
const event = (overrides = {}) => ({
  studentId: String(student),
  paperId: String(paper),
  browserId: key(),
  visitId: key(),
  eventId: key(),
  ...overrides,
});
const track = (body) => write(reader, "/api/result-views", body, csrf);
const row = async (id = student) =>
  (await teacher.get("/api/admin/result-views")).body.students.find(
    (s) => s._id === String(id),
  );
before(async () => {
  mongo = await MongoMemoryServer.create();
  client = await new MongoClient(mongo.getUri()).connect();
  db = client.db("view-tests");
  app = await createApp({
    db,
    client,
    config: {
      secret: "view-tests-secret-".repeat(4),
      username: "teacher",
      passwordHash: await bcrypt.hash("view-password", 10),
      production: false,
    },
  });
  teacher = request.agent(app);
  reader = request.agent(app);
  token = (await teacher.get("/api/session")).body.csrf;
  token = (
    await write(teacher, "/api/login", {
      username: "teacher",
      password: "view-password",
    })
  ).body.csrf;
  csrf = (await reader.get("/api/session")).body.csrf;
  student = new ObjectId();
  other = new ObjectId();
  inactive = new ObjectId();
  cls = String(new ObjectId());
  await db
    .collection("classes")
    .insertOne({ _id: new ObjectId(cls), name: "View class" });
  await db.collection("students").insertMany([
    {
      _id: student,
      name: "Same Student",
      nameKey: "same student",
      label: "01",
      classId: cls,
      active: true,
      accessCodeHash: await bcrypt.hash("private-view-code", 10),
    },
    {
      _id: other,
      name: "Same Student",
      nameKey: "same student",
      label: "02",
      active: true,
    },
    {
      _id: inactive,
      name: "Inactive Student",
      nameKey: "inactive student",
      active: false,
    },
  ]);
  [paper, second, draft, wrongClass, absent, blank] = Array.from(
    { length: 6 },
    () => new ObjectId(),
  );
  await db.collection("papers").insertMany([
    { _id: paper, name: "Zero paper", max: 100, state: "published", order: 0 },
    {
      _id: second,
      name: "Second paper",
      max: 50,
      state: "published",
      order: 1,
    },
    { _id: draft, name: "Draft paper", max: 100, state: "draft", order: 2 },
    {
      _id: wrongClass,
      name: "Another class",
      classId: String(new ObjectId()),
      max: 100,
      state: "published",
      order: 3,
    },
    {
      _id: absent,
      name: "Absent paper",
      max: 100,
      state: "published",
      order: 4,
    },
    { _id: blank, name: "Blank paper", max: 100, state: "published", order: 5 },
  ]);
  await db.collection("marks").insertMany([
    { studentId: student, paperId: paper, value: 0, status: "present" },
    { studentId: student, paperId: second, value: 40, status: "present" },
    { studentId: student, paperId: draft, value: 50, status: "present" },
    { studentId: student, paperId: wrongClass, value: 50, status: "present" },
    { studentId: student, paperId: absent, value: null, status: "absent" },
    { studentId: student, paperId: blank, value: null, status: "present" },
    { studentId: other, paperId: paper, value: 30, status: "present" },
    { studentId: inactive, paperId: paper, value: 50, status: "present" },
  ]);
});
after(async () => {
  await client?.close();
  await mongo?.stop();
});

test("view reports/reset are private and reading results does not count a view", async () => {
  assert.equal((await reader.get("/api/admin/result-views")).status, 401);
  assert.equal(
    (
      await write(
        reader,
        "/api/admin/result-views/reset",
        { scope: "all" },
        csrf,
      )
    ).status,
    401,
  );
  assert.equal(
    (await teacher.post("/api/admin/result-views/reset").send({ scope: "all" }))
      .status,
    403,
  );
  assert.equal(
    (await reader.post("/api/result-views").send(event())).status,
    403,
  );
  assert.equal((await reader.get("/api/result-views")).status, 404);
  assert.equal((await reader.get("/api/results/" + student)).status, 200);
  const status = await row();
  assert.equal(status.visits, 0);
  assert.equal(status.reveals, 0);
  assert.equal(status.lastViewedAt, null);
});

test("views are idempotent under concurrent retries and visits are separate from paper reveals", async () => {
  const body = event();
  const responses = await Promise.all(
    Array.from({ length: 8 }, () => track(body)),
  );
  responses.forEach((r) => {
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: true });
  });
  assert.equal(await db.collection("resultViews").countDocuments(), 1);
  assert.equal((await row()).visits, 1);
  await track({ ...body, paperId: String(second), eventId: key() });
  await track({ ...body, paperId: String(second), eventId: key() }); // same-paper replay
  let status = await row();
  assert.equal(status.visits, 1);
  assert.equal(status.reveals, 3);
  assert.equal(status.browserCount, 1);
  await track({ ...body, visitId: key(), eventId: key() });
  await track({ ...body, browserId: key(), visitId: key(), eventId: key() });
  status = await row();
  assert.equal(status.visits, 3);
  assert.equal(status.browserCount, 2);
  assert.equal(status.reveals, 5);
  const details = (await teacher.get("/api/admin/result-views/" + student))
    .body;
  assert.equal(details.browsers.length, 2);
  const browser = details.browsers.find((b) => b.browserId === body.browserId);
  assert.equal(browser.visits, 2);
  assert.equal(browser.reveals, 4);
  assert.deepEqual(
    browser.papers.map((p) => [p.name, p.reveals]),
    [
      ["Zero paper", 2],
      ["Second paper", 2],
    ],
  );
  assert.equal(details.student.accessCodeHash, undefined);
});

test("tracking rejects malformed, absent, blank, unpublished, wrong-class and inactive results", async () => {
  for (const overrides of [
    { studentId: "invalid" },
    { browserId: "not-random" },
    { eventId: "x".repeat(1000) },
    { visitId: { $ne: null } },
    { paperId: String(paper), value: 99 },
  ])
    assert.equal((await track(event(overrides))).status, 400);
  for (const paperId of [draft, wrongClass, absent, blank, new ObjectId()])
    assert.equal(
      (await track(event({ paperId: String(paperId) }))).status,
      404,
    );
  try {
    for (const value of [NaN, Infinity, -1, 101, "=SUM(1,2)"]) {
      await db
        .collection("marks")
        .updateOne(
          { studentId: student, paperId: paper },
          { $set: { value } },
          { bypassDocumentValidation: true },
        );
      assert.equal((await track(event())).status, 404);
    }
  } finally {
    await db
      .collection("marks")
      .updateOne(
        { studentId: student, paperId: paper },
        { $set: { value: 0 } },
      );
  }
  assert.equal(
    (await track(event({ studentId: String(inactive) }))).status,
    404,
  );
  assert.equal(
    (await track(event({ studentId: String(new ObjectId()) }))).status,
    404,
  );
  await db
    .collection("papers")
    .updateOne({ _id: second }, { $set: { state: "unpublished" } });
  assert.equal((await track(event({ paperId: String(second) }))).status, 404);
  await db
    .collection("papers")
    .updateOne({ _id: second }, { $set: { state: "published" } });
  assert.equal(
    (await reader.get("/api/admin/result-views/" + student)).status,
    401,
  );
  assert.equal(
    (await teacher.get("/api/admin/result-views").set("Sec-CH-UA-Mobile", "?1"))
      .status,
    403,
  );
});

test("duplicate-name students remain separate and reports filter/paginate safely", async () => {
  const shared = await db
    .collection("resultViews")
    .findOne({ studentId: student });
  await track(event({ studentId: String(other), browserId: shared.browserId }));
  assert.equal((await row(other)).visits, 1);
  const query = await teacher.get(
    "/api/admin/result-views?search=Same%20Student&pageSize=1",
  );
  assert.equal(query.body.total, 2);
  assert.equal(query.body.students.length, 1);
  const next = await teacher.get(
    "/api/admin/result-views?search=Same%20Student&pageSize=1&page=2",
  );
  assert.notEqual(query.body.students[0]._id, next.body.students[0]._id);
  assert.equal(
    (await teacher.get("/api/admin/result-views?classId=" + cls)).body.total,
    1,
  );
  assert.equal(
    (await teacher.get("/api/admin/result-views?status=unviewed")).body.total,
    1,
  );
  assert.equal(
    (await teacher.get("/api/admin/result-views?search=%5B.*%5D")).body.total,
    0,
  );
  assert.equal(
    (await teacher.get("/api/admin/result-views?page=-1")).status,
    400,
  );
  assert.equal(
    (await teacher.get("/api/admin/result-views?classId[ne]=null")).status,
    400,
  );
});

test("browser, student and global resets are audited and retries cannot restore cleared events", async () => {
  const original = await db
    .collection("resultViews")
    .findOne({ studentId: student });
  const body = {
    studentId: String(student),
    paperId: String(original.paperId),
    browserId: original.browserId,
    visitId: original.visitId,
    eventId: original.eventId,
  };
  const beforeMarks = await db.collection("marks").find().toArray();
  const reset = await write(teacher, "/api/admin/result-views/reset", {
    scope: "browser",
    studentId: String(student),
    browserId: original.browserId,
  });
  assert.equal(reset.status, 200);
  assert.ok(reset.body.clearedEvents > 0);
  assert.equal((await track(body)).status, 200);
  assert.equal((await row()).visits, 1); // only the other browser remains
  let details = (await teacher.get("/api/admin/result-views/" + student)).body;
  assert.equal(
    details.browsers.find((b) => b.browserId === original.browserId).visits,
    0,
  );
  assert.equal(details.browsers.length, 2); // IDs are retained, not reset/deleted
  await track({ ...body, eventId: key(), visitId: key() });
  assert.equal((await row()).visits, 2);
  await write(teacher, "/api/admin/result-views/reset", {
    scope: "student",
    studentId: String(student),
  });
  assert.equal((await row()).visits, 0);
  assert.equal((await row(other)).visits, 1);
  assert.equal(
    (await write(teacher, "/api/admin/result-views/reset", { scope: "all" }))
      .status,
    200,
  );
  assert.equal((await row(other)).visits, 0);
  assert.equal(
    await db
      .collection("auditLogs")
      .countDocuments({ action: "result-view-reset" }),
    3,
  );
  assert.deepEqual(await db.collection("marks").find().toArray(), beforeMarks);
  assert.equal(
    (
      await write(teacher, "/api/admin/result-views/reset", {
        scope: "browser",
        studentId: String(student),
        browserId: "bad",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await write(teacher, "/api/admin/result-views/reset", {
        scope: "student",
        studentId: String(new ObjectId()),
      })
    ).status,
    404,
  );
});

test("access-code mode requires the matching student grant for view recording", async () => {
  const secured = await createApp({
    db,
    client,
    config: {
      secret: "view-secure-secret-".repeat(4),
      production: false,
      accessMode: "code",
    },
  });
  const agent = request.agent(secured),
    accessToken = (await agent.get("/api/session")).body.csrf;
  const body = event();
  assert.equal(
    (await write(agent, "/api/result-views", body, accessToken)).status,
    401,
  );
  assert.equal(
    (
      await write(
        agent,
        "/api/student/access",
        { studentId: String(student), code: "wrong" },
        accessToken,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await write(
        agent,
        "/api/student/access",
        { studentId: String(student), code: "private-view-code" },
        accessToken,
      )
    ).status,
    200,
  );
  assert.equal(
    (await write(agent, "/api/result-views", body, accessToken)).status,
    200,
  );
  assert.equal(
    (
      await write(
        agent,
        "/api/result-views",
        event({ studentId: String(other) }),
        accessToken,
      )
    ).status,
    401,
  );
  await db
    .collection("students")
    .updateOne({ _id: student }, { $set: { active: false } });
  assert.equal(
    (await write(agent, "/api/result-views", event(), accessToken)).status,
    404,
  );
});
