import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";
import { createApp } from "../server.js";
let mongo,
  client,
  db,
  app,
  admin,
  publicAgent,
  csrf,
  publicCsrf,
  studentId,
  otherId,
  paperId,
  secondId;
before(async () => {
  mongo = await MongoMemoryServer.create();
  client = await new MongoClient(mongo.getUri()).connect();
  db = client.db("test");
  app = await createApp({
    db,
    client,
    config: {
      secret: "test-secret-".repeat(5),
      username: "teacher",
      passwordHash: await bcrypt.hash("correct-password", 10),
    },
  });
  admin = request.agent(app);
  publicAgent = request.agent(app);
  csrf = (await admin.get("/api/session")).body.csrf;
  publicCsrf = (await publicAgent.get("/api/session")).body.csrf;
});
after(async () => {
  await client?.close();
  await mongo?.stop();
});
const write = (agent, url, body, method = "post", token = csrf) =>
  agent[method](url).set("X-CSRF-Token", token).send(body);
test("unauthorized API and CSRF rejection", async () => {
  assert.equal((await publicAgent.get("/api/admin/data")).status, 401);
  assert.equal((await admin.post("/api/login").send({})).status, 403);
  assert.equal((await publicAgent.get("/api/results/invalid")).status, 400);
});
test("secure login rotates token, rejects wrong password", async () => {
  assert.equal(
    (
      await write(admin, "/api/login", {
        username: "teacher",
        password: "wrong",
      })
    ).status,
    401,
  );
  const r = await write(admin, "/api/login", {
    username: "teacher",
    password: "correct-password",
  });
  assert.equal(r.status, 200);
  assert.notEqual(r.body.csrf, csrf);
  csrf = r.body.csrf;
  assert.equal((await admin.get("/api/admin/data")).status, 200);
  const cookie = r.headers["set-cookie"].join();
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
});
test("create classes, duplicate student names and safe profile labels", async () => {
  const cls = await write(admin, "/api/admin/classes", { name: "Grade 10 A" });
  assert.equal(cls.status, 200);
  const a = await write(admin, "/api/admin/students", {
    name: "Alex  Taylor",
    classId: cls.body.id,
    label: "10A · 01",
    accessCode: "private-code-01",
  });
  const b = await write(admin, "/api/admin/students", {
    name: "Alex Taylor",
    label: "10B · 02",
  });
  assert.equal(a.status, 200);
  studentId = a.body.id;
  otherId = b.body.id;
  assert.notEqual(studentId, otherId);
  const r = await write(
    publicAgent,
    "/api/lookup",
    { name: "  ALEX   TAYLOR  " },
    "post",
    publicCsrf,
  );
  assert.equal(r.body.exact, true);
  assert.equal(r.body.students.length, 2);
  assert.equal(r.body.students[0].accessCodeHash, undefined);
  assert.ok(r.body.students.every((s) => s.label));
});
test("similar lookup only through submitted POST, at most five names", async () => {
  assert.equal((await publicAgent.get("/api/lookup?name=Alex")).status, 404);
  const r = await write(
    publicAgent,
    "/api/lookup",
    { name: "Alex Taylo" },
    "post",
    publicCsrf,
  );
  assert.equal(r.body.exact, false);
  assert.equal(r.body.students.length, 2);
  assert.ok(r.body.students.length <= 5);
  const typo = await write(
    publicAgent,
    "/api/lookup",
    { name: "Aelx Taylr" },
    "post",
    publicCsrf,
  );
  assert.equal(typo.body.exact, false);
  assert.equal(typo.body.students.length, 2);
});
test("create draft papers and automatically include ordered data columns", async () => {
  const a = await write(admin, "/api/admin/papers", {
    name: "Paper 01",
    max: 100,
    subject: "Mathematics",
  });
  const b = await write(admin, "/api/admin/papers", {
    name: "Paper 02",
    max: 50,
  });
  assert.equal(a.status, 200);
  paperId = a.body.id;
  secondId = b.body.id;
  const r = await admin.get("/api/admin/data");
  assert.deepEqual(
    r.body.papers.map((p) => p._id),
    [paperId, secondId],
  );
  assert.equal(r.body.papers[0].state, "draft");
});
test("mark batch validation prevents partial invalid entry and formulas", async () => {
  let r = await write(
    admin,
    "/api/admin/marks",
    {
      entries: [
        { studentId, paperId, value: 60 },
        { studentId, paperId: secondId, value: 51 },
      ],
    },
    "put",
  );
  assert.equal(r.status, 400);
  assert.equal(await db.collection("marks").countDocuments(), 0);
  r = await write(
    admin,
    "/api/admin/marks",
    { entries: [{ studentId, paperId, value: "=SUM(1,2)" }] },
    "put",
  );
  assert.equal(r.status, 400);
});
test("bulk marks preserve zero, blanks, absence and decimal values", async () => {
  const r = await write(
    admin,
    "/api/admin/marks",
    {
      entries: [
        { studentId, paperId, value: 0 },
        { studentId, paperId: secondId, value: 42.25 },
        { studentId: otherId, paperId, value: null, status: "absent" },
        { studentId: otherId, paperId: secondId, value: null },
      ],
    },
    "put",
  );
  assert.equal(r.status, 200);
  const marks = await db.collection("marks").find().toArray();
  assert.equal(marks.length, 4);
  assert.ok(marks.some((m) => m.value === 0));
  assert.ok(marks.some((m) => m.status === "absent"));
  assert.ok(await db.collection("auditLogs").findOne({ action: "marks" }));
});
test("draft hidden, publish scoped results, order and unpublish", async () => {
  assert.equal(
    (await publicAgent.get("/api/results/" + studentId)).body.papers.length,
    0,
  );
  for (const [id, max, name] of [
    [paperId, 100, "Paper 01"],
    [secondId, 50, "Paper 02"],
  ])
    assert.equal(
      (
        await write(
          admin,
          "/api/admin/papers/" + id,
          { name, max, state: "published" },
          "patch",
        )
      ).status,
      200,
    );
  let r = await publicAgent.get("/api/results/" + studentId);
  assert.deepEqual(
    r.body.papers.map((p) => p.value),
    [0, 42.25],
  );
  assert.equal(r.body.students, undefined);
  assert.equal(
    (await publicAgent.get("/api/results/" + otherId)).body.papers.length,
    0,
  );
  assert.equal(
    (
      await write(
        admin,
        "/api/admin/paper-order",
        { ids: [secondId, paperId] },
        "put",
      )
    ).status,
    200,
  );
  r = await publicAgent.get("/api/results/" + studentId);
  assert.deepEqual(
    r.body.papers.map((p) => p.id),
    [secondId, paperId],
  );
  await write(
    admin,
    "/api/admin/papers/" + paperId,
    { name: "Paper 01", max: 100, state: "unpublished" },
    "patch",
  );
  assert.equal(
    (await publicAgent.get("/api/results/" + studentId)).body.papers.length,
    1,
  );
});
test("access-code mode binds authorization to one student", async () => {
  const codeApp = await createApp({
    db,
    client,
    config: { secret: "another-secret-".repeat(4), accessMode: "code" },
  });
  const agent = request.agent(codeApp);
  const token = (await agent.get("/api/session")).body.csrf;
  assert.equal((await agent.get("/api/results/" + studentId)).status, 401);
  assert.equal(
    (
      await write(
        agent,
        "/api/student/access",
        { studentId, code: "bad" },
        "post",
        token,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await write(
        agent,
        "/api/student/access",
        { studentId, code: "private-code-01" },
        "post",
        token,
      )
    ).status,
    200,
  );
  assert.equal((await agent.get("/api/results/" + studentId)).status, 200);
  assert.equal((await agent.get("/api/results/" + otherId)).status, 401);
});
test("deactivation blocks results and invalid object inputs do not query Mongo", async () => {
  await write(
    admin,
    "/api/admin/students/" + otherId,
    { name: "Alex Taylor", active: false },
    "patch",
  );
  assert.equal((await publicAgent.get("/api/results/" + otherId)).status, 404);
  assert.equal(
    (
      await write(
        publicAgent,
        "/api/lookup",
        { name: { $ne: null } },
        "post",
        publicCsrf,
      )
    ).status,
    400,
  );
});
test("class boundaries, paper edit validation and Mongo schema validation", async () => {
  const cls = (
    await write(admin, "/api/admin/classes", { name: "Private Class" })
  ).body.id;
  const p = (
    await write(admin, "/api/admin/papers", {
      name: "Class paper",
      max: 10,
      classId: cls,
      state: "published",
    })
  ).body.id;
  assert.equal(
    (
      await write(
        admin,
        "/api/admin/marks",
        { studentId, paperId: p, value: 3 },
        "put",
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await write(
        admin,
        "/api/admin/papers/" + secondId,
        { name: "Paper 02", max: 10, state: "published" },
        "patch",
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await write(admin, "/api/admin/papers", {
        name: "Bad date",
        max: 100,
        date: "2026-99-99",
      })
    ).status,
    400,
  );
  await assert.rejects(
    db
      .collection("marks")
      .insertOne({ studentId: "invalid", paperId: "invalid", value: -1 }),
  );
});
test("session persists in Mongo and logout revokes admin access", async () => {
  assert.ok(
    await db.collection("sessions").findOne({ session: { $regex: "teacher" } }),
  );
  assert.equal((await write(admin, "/api/logout", {})).status, 200);
  assert.equal((await admin.get("/api/admin/data")).status, 401);
});
test("name lookup is rate limited", async () => {
  let response;
  for (let i = 0; i < 26; i++)
    response = await write(
      publicAgent,
      "/api/lookup",
      { name: "Unknown Profile" },
      "post",
      publicCsrf,
    );
  assert.equal(response.status, 429);
  assert.ok(response.headers["ratelimit-policy"]);
});
test("existing MVP IDs and published data survive migration", async () => {
  const legacy = client.db("legacy");
  const { ObjectId } = await import("mongodb");
  const sid = new ObjectId(),
    pid = new ObjectId();
  await legacy
    .collection("students")
    .insertOne({ _id: sid, name: "Legacy Learner", nameKey: "legacy learner" });
  await legacy.collection("papers").insertOne({
    _id: pid,
    name: "Legacy Paper",
    max: 100,
    order: 1,
    published: true,
  });
  await legacy
    .collection("marks")
    .insertOne({ studentId: sid, paperId: pid, value: 78 });
  const legacyApp = await createApp({
    db: legacy,
    client,
    config: { secret: "legacy-secret-".repeat(4) },
  });
  const response = await request(legacyApp).get("/api/results/" + sid);
  assert.equal(response.status, 200);
  assert.equal(response.body.papers[0].id, String(pid));
  assert.equal(response.body.papers[0].value, 78);
});
