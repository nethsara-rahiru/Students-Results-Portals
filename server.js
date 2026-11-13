import "dotenv/config";
import { pathToFileURL } from "node:url";
import { randomBytes, timingSafeEqual } from "node:crypto";
import express from "express";
import helmet from "helmet";
import session from "express-session";
import MongoStore from "connect-mongo";
import { MongoClient, ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";

export const clean = (s) =>
  String(s ?? "")
    .trim()
    .replace(/\s+/g, " ");
export const normalize = (s) => clean(s).toLowerCase();
const id = z.string().regex(/^[a-f\d]{24}$/i);
const text = z.string().transform(clean).pipe(z.string().min(1).max(120));
const studentSchema = z.object({
  name: text.pipe(z.string().min(2).max(100)),
  classId: id.nullable().default(null),
  active: z.boolean().default(true),
  label: z.string().max(80).default(""),
  accessCode: z.string().max(128).optional(),
});
const paperSchema = z.object({
  name: text,
  subject: z.string().max(80).default(""),
  grade: z.string().max(40).default(""),
  date: z
    .string()
    .refine(
      (s) =>
        s === "" ||
        (/^\d{4}-\d{2}-\d{2}$/.test(s) &&
          !Number.isNaN(Date.parse(s)) &&
          new Date(s).toISOString().slice(0, 10) === s),
      "Use a valid date",
    )
    .default(""),
  max: z.number().int().min(1).max(10000),
  classId: id.nullable().default(null),
  state: z.enum(["draft", "published", "unpublished"]).default("draft"),
});
const fail = (status, message) => Object.assign(new Error(message), { status });
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
const oid = (value) => new ObjectId(id.parse(value));

export async function createApp({ db, client, config = {} }) {
  const production = config.production ?? process.env.NODE_ENV === "production";
  const secret = config.secret || process.env.SESSION_SECRET;
  if (!secret || secret.length < 32)
    throw Error("SESSION_SECRET must contain at least 32 characters");
  const accessMode =
    config.accessMode || process.env.STUDENT_ACCESS_MODE || "name";
  if (!["name", "code"].includes(accessMode))
    throw Error("Invalid STUDENT_ACCESS_MODE");
  const schemas = {
    students: {
      required: ["_id", "name", "nameKey", "active"],
      properties: {
        name: { bsonType: "string" },
        nameKey: { bsonType: "string" },
        active: { bsonType: "bool" },
        classId: { bsonType: ["string", "null"] },
      },
    },
    classes: {
      required: ["name"],
      properties: { name: { bsonType: "string" } },
    },
    papers: {
      required: ["name", "max", "order", "state"],
      properties: {
        max: {
          bsonType: ["int", "double", "long"],
          minimum: 1,
          maximum: 10000,
        },
        state: { enum: ["draft", "published", "unpublished"] },
      },
    },
    marks: {
      required: ["studentId", "paperId", "value"],
      properties: {
        studentId: { bsonType: "objectId" },
        paperId: { bsonType: "objectId" },
        value: { bsonType: ["int", "long", "double", "null"], minimum: 0 },
        status: { enum: ["present", "absent"] },
      },
    },
    workbooks: {
      required: ["rows", "columns", "cells", "revision"],
      properties: {
        rows: { bsonType: ["int", "double"], minimum: 1, maximum: 500 },
        columns: { bsonType: ["int", "double"], minimum: 1, maximum: 100 },
        cells: { bsonType: "object" },
        revision: { bsonType: ["int", "double"], minimum: 0 },
      },
    },
    administrators: {
      required: ["username", "passwordHash"],
      properties: {
        username: { bsonType: "string" },
        passwordHash: { bsonType: "string" },
      },
    },
    auditLogs: {
      required: ["actor", "action", "entity", "createdAt"],
      properties: { createdAt: { bsonType: "date" } },
    },
  };
  const existing = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map(
      (c) => c.name,
    ),
  );
  for (const [name, schema] of Object.entries(schemas))
    if (!existing.has(name))
      await db.createCollection(name, {
        validator: { $jsonSchema: { bsonType: "object", ...schema } },
      });
  await Promise.all([
    db.collection("students").createIndex({ nameKey: 1, active: 1 }),
    db
      .collection("marks")
      .createIndex({ studentId: 1, paperId: 1 }, { unique: true }),
    db.collection("papers").createIndex({ order: 1 }),
    db
      .collection("administrators")
      .createIndex({ username: 1 }, { unique: true }),
    db.collection("classes").createIndex({ name: 1 }, { unique: true }),
    db.collection("auditLogs").createIndex({ createdAt: -1 }),
  ]);
  // Upgrade the original MVP without replacing stable IDs.
  await db
    .collection("students")
    .updateMany({ active: { $exists: false } }, { $set: { active: true } });
  await db
    .collection("papers")
    .updateMany(
      { state: { $exists: false }, published: true },
      { $set: { state: "published" } },
    );
  await db
    .collection("papers")
    .updateMany({ state: { $exists: false } }, { $set: { state: "draft" } });
  const username = config.username || process.env.ADMIN_USERNAME || "admin";
  const passwordHash = config.passwordHash || process.env.ADMIN_PASSWORD_HASH;
  if (passwordHash)
    await db
      .collection("administrators")
      .updateOne(
        { username },
        { $setOnInsert: { username, passwordHash, createdAt: new Date() } },
        { upsert: true },
      );
  const app = express();
  app.disable("x-powered-by");
  app.get(
    "/health",
    wrap(async (_req, res) => {
      await db.command({ ping: 1 });
      res.json({ ok: true });
    }),
  );
  if (production)
    app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 1));
  app.use(helmet());
  app.use(express.json({ limit: "512kb" }));
  const sessionStore = MongoStore.create({
    client,
    dbName: db.databaseName,
    collectionName: "sessions",
    ttl: 28800,
  });
  // Wait for the store/TTL index before serving requests or completing startup.
  await new Promise((resolve, reject) =>
    sessionStore.length((error) => (error ? reject(error) : resolve())),
  );
  app.use(
    session({
      name: "levelup.sid",
      secret,
      resave: false,
      saveUninitialized: false,
      store: sessionStore,
      cookie: {
        httpOnly: true,
        sameSite: "strict",
        secure: production,
        maxAge: 8 * 60 * 60 * 1000,
      },
    }),
  );
  const limiter = (limit, windowMs = 900000) =>
    rateLimit({
      windowMs,
      limit,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      handler: (_req, res) =>
        res
          .status(429)
          .json({ error: "Too many requests. Please try again later." }),
    });
  app.use("/api", limiter(1200));
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.get("/api/session", (req, res) => {
    req.session.csrf ||= randomBytes(32).toString("hex");
    res.json({
      admin: !!req.session.admin,
      csrf: req.session.csrf,
      accessMode,
    });
  });
  app.use("/api", (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const token = req.get("X-CSRF-Token") || "";
    const expected = req.session.csrf || "";
    if (
      !expected ||
      Buffer.byteLength(token) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
    )
      return next(fail(403, "Invalid CSRF token"));
    if (
      req.get("Origin") &&
      req.get("Origin") !== `${req.protocol}://${req.get("host")}`
    )
      return next(fail(403, "Invalid origin"));
    next();
  });
  const guard = (req, res, next) =>
    req.session.admin
      ? next()
      : next(fail(401, "Administrator login required"));
  const audit = (req, action, entity, changes) =>
    db.collection("auditLogs").insertOne({
      actor: req.session.admin,
      action,
      entity,
      changes,
      createdAt: new Date(),
    });
  app.post(
    "/api/login",
    limiter(10),
    wrap(async (req, res) => {
      const { username, password } = z
        .object({
          username: z.string().max(100),
          password: z.string().max(256),
        })
        .parse(req.body);
      const admin = await db.collection("administrators").findOne({ username });
      // Use the same costly comparison even for unknown usernames.
      const valid = await bcrypt.compare(
        password,
        admin?.passwordHash ||
          "$2a$12$XfBICb8dJf6eLEhTtjlMdOzII0S17uBvUbr2vIWcG7SCiI5Yj4y2W",
      );
      if (!admin || !valid) throw fail(401, "Invalid credentials");
      await new Promise((resolve, reject) =>
        req.session.regenerate((e) => (e ? reject(e) : resolve())),
      );
      req.session.admin = admin.username;
      req.session.csrf = randomBytes(32).toString("hex");
      await audit(req, "login", "administrator", {});
      res.json({ ok: true, csrf: req.session.csrf });
    }),
  );
  app.post(
    "/api/logout",
    guard,
    wrap(async (req, res) => {
      await new Promise((resolve, reject) =>
        req.session.destroy((e) => (e ? reject(e) : resolve())),
      );
      res.clearCookie("levelup.sid");
      res.json({ ok: true });
    }),
  );
  app.use("/api/admin", guard);
  app.get(
    "/api/admin/data",
    wrap(async (req, res) => {
      const [students, papers, marks, classes] = await Promise.all([
        db
          .collection("students")
          .find({}, { projection: { accessCodeHash: 0 } })
          .sort({ name: 1 })
          .toArray(),
        db.collection("papers").find().sort({ order: 1, _id: 1 }).toArray(),
        db.collection("marks").find().toArray(),
        db.collection("classes").find().sort({ name: 1 }).toArray(),
      ]);
      res.json({ students, papers, marks, classes });
    }),
  );
  app.get(
    "/api/admin/workbook",
    wrap(async (req, res) => {
      res.json(
        (await db.collection("workbooks").findOne({ _id: "workspace" })) || {
          _id: "workspace",
          rows: 30,
          columns: 12,
          cells: {},
          revision: 0,
        },
      );
    }),
  );
  app.put(
    "/api/admin/workbook",
    wrap(async (req, res) => {
      const workbook = z
        .object({
          rows: z.number().int().min(1).max(500),
          columns: z.number().int().min(1).max(100),
          revision: z.number().int().min(0),
          cells: z.record(
            z.string().regex(/^[A-Z]{1,2}[1-9]\d{0,2}$/),
            z.string().max(1000),
          ),
        })
        .parse(req.body);
      if (
        workbook.rows * workbook.columns > 10000 ||
        Object.keys(workbook.cells).length > 10000
      )
        throw fail(400, "Worksheet supports at most 10,000 cells");
      for (const ref of Object.keys(workbook.cells)) {
        const [, letters, row] = /^([A-Z]+)(\d+)$/.exec(ref);
        const col = [...letters].reduce(
          (n, c) => n * 26 + c.charCodeAt(0) - 64,
          0,
        );
        if (Number(row) > workbook.rows || col > workbook.columns)
          throw fail(400, "Cell outside worksheet bounds");
      }
      try {
        const result = await db.collection("workbooks").updateOne(
          { _id: "workspace", revision: workbook.revision },
          {
            $set: {
              ...workbook,
              revision: workbook.revision + 1,
              updatedAt: new Date(),
              updatedBy: req.session.admin,
            },
          },
          { upsert: workbook.revision === 0 },
        );
        if (!result.matchedCount && !result.upsertedCount)
          throw fail(
            409,
            "Workbook changed in another session. Reload before editing.",
          );
      } catch (error) {
        if (error.code === 11000)
          throw fail(
            409,
            "Workbook changed in another session. Reload before editing.",
          );
        throw error;
      }
      await audit(req, "save", "workbook", {
        rows: workbook.rows,
        columns: workbook.columns,
        cells: Object.keys(workbook.cells).length,
        revision: workbook.revision + 1,
      });
      res.json({ revision: workbook.revision + 1 });
    }),
  );
  app.get(
    "/api/admin/audit",
    wrap(async (req, res) =>
      res.json(
        await db
          .collection("auditLogs")
          .find()
          .sort({ createdAt: -1 })
          .limit(200)
          .toArray(),
      ),
    ),
  );
  async function checkClass(classId) {
    if (
      classId &&
      !(await db.collection("classes").findOne({ _id: oid(classId) }))
    )
      throw fail(400, "Unknown class");
  }
  for (const method of ["post", "patch"]) {
    const edit = method === "patch";
    app[method](
      "/api/admin/classes" + (edit ? "/:id" : ""),
      wrap(async (req, res) => {
        const data = z.object({ name: text }).parse(req.body);
        const _id = edit ? oid(req.params.id) : new ObjectId();
        if (edit && !(await db.collection("classes").findOne({ _id })))
          throw fail(404, "Class not found");
        await db
          .collection("classes")
          .updateOne({ _id }, { $set: data }, { upsert: !edit });
        await audit(req, edit ? "edit" : "create", "class", {
          id: _id,
          ...data,
        });
        res.json({ id: _id });
      }),
    );
    app[method](
      "/api/admin/students" + (edit ? "/:id" : ""),
      wrap(async (req, res) => {
        const data = studentSchema.parse(req.body);
        await checkClass(data.classId);
        const _id = edit ? oid(req.params.id) : new ObjectId();
        const before = edit
          ? await db.collection("students").findOne({ _id })
          : null;
        if (edit && !before) throw fail(404, "Student not found");
        const { accessCode, ...fields } = data;
        fields.nameKey = normalize(data.name);
        const ambiguous = await db.collection("students").findOne({
          _id: { $ne: _id },
          nameKey: fields.nameKey,
          label: data.label,
          classId: data.classId,
          active: true,
        });
        if (data.active && ambiguous)
          throw fail(
            409,
            "Duplicate profiles need a distinct profile label or class",
          );
        if (accessCode) {
          if (accessCode.length < 8)
            throw fail(400, "Access codes require at least 8 characters");
          fields.accessCodeHash = await bcrypt.hash(accessCode, 12);
        }
        await db
          .collection("students")
          .updateOne({ _id }, { $set: fields }, { upsert: !edit });
        await audit(req, edit ? "edit" : "create", "student", {
          id: _id,
          ...data,
          accessCode: accessCode ? "[changed]" : undefined,
        });
        res.json({ id: _id });
      }),
    );
    app[method](
      "/api/admin/papers" + (edit ? "/:id" : ""),
      wrap(async (req, res) => {
        const data = paperSchema.parse(req.body);
        await checkClass(data.classId);
        const _id = edit ? oid(req.params.id) : new ObjectId();
        const before = edit
          ? await db.collection("papers").findOne({ _id })
          : null;
        if (edit && !before) throw fail(404, "Paper not found");
        if (
          edit &&
          (await db
            .collection("marks")
            .findOne({ paperId: _id, value: { $gt: data.max } }))
        )
          throw fail(400, "Maximum is below an existing mark");
        const last = await db
          .collection("papers")
          .find()
          .sort({ order: -1 })
          .limit(1)
          .next();
        await db.collection("papers").updateOne(
          { _id },
          {
            $set: {
              ...data,
              order: before?.order ?? (last?.order ?? 0) + 1,
              updatedAt: new Date(),
            },
          },
          { upsert: !edit },
        );
        await audit(req, edit ? "edit" : "create", "paper", {
          id: _id,
          before,
          after: data,
        });
        res.json({ id: _id });
      }),
    );
  }
  app.put(
    "/api/admin/paper-order",
    wrap(async (req, res) => {
      const ids = z.array(id).max(1000).parse(req.body.ids);
      const count = await db.collection("papers").countDocuments();
      if (
        new Set(ids).size !== count ||
        ids.length !== count ||
        (await db
          .collection("papers")
          .countDocuments({ _id: { $in: ids.map(oid) } })) !== count
      )
        throw fail(400, "Provide every paper exactly once");
      if (ids.length)
        await db.collection("papers").bulkWrite(
          ids.map((value, order) => ({
            updateOne: {
              filter: { _id: oid(value) },
              update: { $set: { order } },
            },
          })),
        );
      await audit(req, "reorder", "papers", { ids });
      res.json({ ok: true });
    }),
  );
  app.put(
    "/api/admin/marks",
    wrap(async (req, res) => {
      const entry = z.object({
        studentId: id,
        paperId: id,
        value: z.number().finite().min(0).nullable().optional(),
        status: z.enum(["present", "absent"]).default("present"),
      });
      const entries = z
        .array(entry)
        .min(1)
        .max(2000)
        .parse(req.body.entries || [req.body]);
      const seen = new Set();
      const prepared = [];
      for (const e of entries) {
        const key = e.studentId + e.paperId;
        if (seen.has(key)) throw fail(400, "Duplicate cell in batch");
        seen.add(key);
        const [student, paper] = await Promise.all([
          db
            .collection("students")
            .findOne({ _id: oid(e.studentId), active: true }),
          db.collection("papers").findOne({ _id: oid(e.paperId) }),
        ]);
        if (!student || !paper)
          throw fail(400, "Unknown or inactive student or paper");
        if (paper.classId && String(student.classId) !== String(paper.classId))
          throw fail(400, "Student does not belong to this paper class");
        const value = e.status === "absent" ? null : (e.value ?? null);
        if (
          value !== null &&
          (value > paper.max ||
            Math.abs(Math.round(value * 100) - value * 100) > 1e-7)
        )
          throw fail(
            400,
            `Mark must be between 0 and ${paper.max}, with up to two decimals`,
          );
        const filter = { studentId: student._id, paperId: paper._id };
        const before = await db.collection("marks").findOne(filter);
        prepared.push({
          filter,
          before,
          after: {
            value,
            status: e.status,
            updatedAt: new Date(),
            updatedBy: req.session.admin,
          },
        });
      }
      // Validate the entire batch before any write. Serialize deployments to one writer for strict cross-request ordering.
      await db.collection("marks").bulkWrite(
        prepared.map((e) => ({
          updateOne: {
            filter: e.filter,
            update: { $set: e.after },
            upsert: true,
          },
        })),
        { ordered: true },
      );
      await audit(
        req,
        "marks",
        "marks",
        prepared.map((e) => ({
          studentId: e.filter.studentId,
          paperId: e.filter.paperId,
          before: e.before
            ? { value: e.before.value, status: e.before.status }
            : null,
          after: e.after,
        })),
      );
      res.json({ ok: true, count: prepared.length });
    }),
  );
  app.post(
    "/api/lookup",
    limiter(25),
    wrap(async (req, res) => {
      const { name } = z
        .object({ name: text.pipe(z.string().min(2)) })
        .parse(req.body);
      const key = normalize(name);
      const projection = { name: 1, label: 1, classId: 1 };
      let students = await db
        .collection("students")
        .find({ nameKey: key, active: true }, { projection })
        .limit(30)
        .toArray();
      const exact = students.length > 0;
      if (!exact) {
        const words = key.split(" ").filter((w) => w.length > 1);
        const grams = (value) =>
          new Set(
            Array.from({ length: Math.max(0, value.length - 1) }, (_, i) =>
              value.slice(i, i + 2),
            ),
          );
        const queryGrams = grams(key);
        const candidates = await db
          .collection("students")
          .find({ active: true }, { projection })
          .sort({ _id: 1 })
          .limit(2000)
          .toArray();
        students = candidates
          .map((student) => {
            const candidate = normalize(student.name),
              candidateGrams = grams(candidate);
            const overlap = [...queryGrams].filter((g) =>
              candidateGrams.has(g),
            ).length;
            const similarity =
              (2 * overlap) / (queryGrams.size + candidateGrams.size || 1);
            const wordsMatched = words.filter((w) =>
              candidate.includes(w),
            ).length;
            return {
              ...student,
              rank: similarity + wordsMatched * 0.15,
              similarity,
              wordsMatched,
            };
          })
          .filter((s) => s.similarity >= 0.35 || s.wordsMatched > 0)
          .sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name))
          .slice(0, 5);
      }
      const classes = await db.collection("classes").find().toArray();
      res.json({
        exact,
        students: students.map((s) => ({
          _id: s._id,
          name: s.name,
          label:
            s.label ||
            classes.find((c) => String(c._id) === s.classId)?.name ||
            "Ask your teacher for your profile label",
        })),
      });
    }),
  );
  app.post(
    "/api/student/access",
    limiter(15),
    wrap(async (req, res) => {
      const { studentId, code } = z
        .object({ studentId: id, code: z.string().max(128) })
        .parse(req.body);
      const student = await db
        .collection("students")
        .findOne({ _id: oid(studentId), active: true });
      if (
        !student?.accessCodeHash ||
        !(await bcrypt.compare(code, student.accessCodeHash))
      )
        throw fail(401, "Invalid profile or access code");
      req.session.studentId = studentId;
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/results/:id",
    limiter(120),
    wrap(async (req, res) => {
      const _id = oid(req.params.id);
      if (accessMode === "code" && req.session.studentId !== String(_id))
        throw fail(401, "Enter your student access code");
      const student = await db
        .collection("students")
        .findOne({ _id, active: true });
      if (!student) throw fail(404, "Profile unavailable");
      const papers = await db
        .collection("papers")
        .find({
          state: "published",
          $or: [
            { classId: null },
            { classId: { $exists: false } },
            ...(student.classId ? [{ classId: student.classId }] : []),
          ],
        })
        .sort({ order: 1, _id: 1 })
        .toArray();
      const marks = await db
        .collection("marks")
        .find({ studentId: _id, paperId: { $in: papers.map((p) => p._id) } })
        .toArray();
      res.json({
        student: student.name,
        papers: papers.flatMap((p) => {
          const m = marks.find((m) => String(m.paperId) === String(p._id));
          return m &&
            m.status !== "absent" &&
            typeof m.value === "number" &&
            m.value >= 0 &&
            m.value <= p.max
            ? [
                {
                  id: p._id,
                  name: p.name,
                  subject: p.subject || "",
                  date: p.date || "",
                  max: p.max,
                  value: m.value,
                },
              ]
            : [];
        }),
      });
    }),
  );
  app.use("/api", (_req, _res, next) =>
    next(fail(404, "API endpoint not found")),
  );
  const adminPages = new Set([
    "marks",
    "students",
    "papers",
    "classes",
    "performance",
    "history",
  ]);
  const adminPagePaths = new Set(
    [...adminPages].map((page) => "/admin/" + page),
  );
  app.get("/admin", (_req, res) =>
    res.set("Cache-Control", "no-store").redirect("/admin/marks"),
  );
  app.get("/admin/:page", (req, res) => {
    res.set("Cache-Control", "no-store");
    const page = req.params.page;
    if (page === "login") {
      if (req.session.admin) {
        const next = adminPagePaths.has(req.query.next)
          ? req.query.next
          : "/admin/marks";
        return res.redirect(next);
      }
    } else {
      if (!adminPages.has(page))
        return res.status(404).type("text").send("Admin page not found");
      if (!req.session.admin)
        return res.redirect(
          "/admin/login?next=" + encodeURIComponent("/admin/" + page),
        );
    }
    return res.sendFile(
      new URL("./views/admin/" + page + ".html", import.meta.url).pathname,
    );
  });
  app.use(express.static(new URL("./public", import.meta.url).pathname));
  app.get("/", (_req, res) =>
    res.sendFile(new URL("./public/index.html", import.meta.url).pathname),
  );
  app.use((error, req, res, _next) => {
    const status =
      error instanceof z.ZodError
        ? 400
        : error.code === 11000
          ? 409
          : error.status || (error.type === "entity.parse.failed" ? 400 : 500);
    if (status === 500) console.error("Request failed:", error.message);
    res.status(status).json({
      error:
        status === 500
          ? "Unexpected server error"
          : error instanceof z.ZodError
            ? "Invalid input: " +
              error.issues
                .map((i) => i.path.join(".") + " " + i.message)
                .join("; ")
            : error.code === 11000
              ? "This record already exists"
              : error.message,
    });
  });
  return app;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (!process.env.MONGODB_URI) throw Error("Set MONGODB_URI");
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const app = await createApp({
    client,
    db: client.db(process.env.MONGODB_DB || "levelup_results"),
  });
  const server = app.listen(
    process.env.PORT || 3000,
    process.env.HOST || "127.0.0.1",
    () =>
      console.log("LevelUp Results listening on " + (process.env.PORT || 3000)),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () =>
      server.close(async () => {
        await client.close();
        process.exit(0);
      }),
    );
}
