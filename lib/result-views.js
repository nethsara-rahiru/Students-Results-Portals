import { z } from "zod";

const randomId = z.string().regex(/^[a-f0-9]{32}$/);
const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
const families = ["Chrome", "Edge", "Firefox", "Safari", "Opera", "Other"];
const family = (ua) =>
  /Edg(?:e|A|iOS)?\//i.test(ua)
    ? "Edge"
    : /OPR\/|Opera/i.test(ua)
      ? "Opera"
      : /Firefox|FxiOS/i.test(ua)
        ? "Firefox"
        : /Chrome|Chromium|CriOS/i.test(ua)
          ? "Chrome"
          : /Safari/i.test(ua)
            ? "Safari"
            : "Other";
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const resultViewSchema = {
  required: [
    "studentId",
    "paperId",
    "browserId",
    "visitId",
    "eventId",
    "viewedAt",
    "counted",
    "browserFamily",
  ],
  properties: {
    studentId: { bsonType: "objectId" },
    paperId: { bsonType: "objectId" },
    browserId: { bsonType: "string", pattern: "^[a-f0-9]{32}$" },
    visitId: { bsonType: "string", pattern: "^[a-f0-9]{32}$" },
    eventId: { bsonType: "string", pattern: "^[a-f0-9]{32}$" },
    viewedAt: { bsonType: "date" },
    counted: { bsonType: "bool" },
    browserFamily: { enum: families },
  },
};

const visitGroups = [
  {
    $group: {
      _id: { browserId: "$browserId", visitId: "$visitId" },
      reveals: { $sum: 1 },
      firstViewedAt: { $min: "$viewedAt" },
      lastViewedAt: { $max: "$viewedAt" },
    },
  },
  {
    $group: {
      _id: "$_id.browserId",
      visits: { $sum: 1 },
      reveals: { $sum: "$reveals" },
      firstViewedAt: { $min: "$firstViewedAt" },
      lastViewedAt: { $max: "$lastViewedAt" },
    },
  },
];

export async function registerResultViews({
  app,
  db,
  guard,
  wrap,
  fail,
  oid,
  limiter,
  audit,
  resultStudent,
  normalize,
}) {
  const events = db.collection("resultViews");
  await events.createIndex({ studentId: 1, eventId: 1 }, { unique: true });
  await events.createIndex({ studentId: 1, counted: 1, viewedAt: -1 });
  await events.createIndex({ counted: 1, viewedAt: -1 });

  app.post(
    "/api/result-views",
    limiter(600),
    wrap(async (req, res) => {
      const body = z
        .object({
          studentId: objectId,
          paperId: objectId,
          browserId: randomId,
          visitId: randomId,
          eventId: randomId,
        })
        .strict()
        .parse(req.body);
      const student = await resultStudent(req, body.studentId);
      const paper = await db.collection("papers").findOne({
        _id: oid(body.paperId),
        state: "published",
        $or: [
          { classId: null },
          { classId: { $exists: false } },
          ...(student.classId ? [{ classId: student.classId }] : []),
        ],
      });
      const mark =
        paper &&
        (await db
          .collection("marks")
          .findOne({ studentId: student._id, paperId: paper._id }));
      if (
        !mark ||
        mark.status === "absent" ||
        typeof mark.value !== "number" ||
        !Number.isFinite(mark.value) ||
        mark.value < 0 ||
        mark.value > paper.max
      )
        throw fail(404, "Result unavailable");
      const record = {
        ...body,
        studentId: student._id,
        paperId: paper._id,
        viewedAt: new Date(),
        counted: true,
        browserFamily: family(req.get("User-Agent") || ""),
      };
      try {
        await events.updateOne(
          { studentId: student._id, eventId: body.eventId },
          { $setOnInsert: record },
          { upsert: true },
        );
      } catch (error) {
        // Concurrent retries can race on the unique index; the canonical event
        // already exists and must not become another view (or undo a reset).
        if (error.code !== 11000) throw error;
      }
      res.json({ ok: true });
    }),
  );

  app.get(
    "/api/admin/result-views",
    guard,
    wrap(async (req, res) => {
      const query = z
        .object({
          search: z.string().trim().max(100).default(""),
          classId: z
            .union([z.literal("all"), z.literal("unassigned"), objectId])
            .default("all"),
          status: z.enum(["all", "viewed", "unviewed"]).default("all"),
          page: z.coerce.number().int().min(1).max(1000000).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(25),
        })
        .parse(req.query);
      const match = {};
      if (query.search)
        match.nameKey = { $regex: escapeRegex(normalize(query.search)) };
      if (query.classId === "unassigned")
        match.$or = [{ classId: null }, { classId: { $exists: false } }];
      else if (query.classId !== "all") match.classId = query.classId;
      const pipeline = [
        { $match: match },
        {
          $lookup: {
            from: "resultViews",
            let: { student: "$_id" },
            pipeline: [
              {
                $match: {
                  counted: true,
                  $expr: { $eq: ["$studentId", "$$student"] },
                },
              },
              ...visitGroups,
              {
                $group: {
                  _id: null,
                  visits: { $sum: "$visits" },
                  reveals: { $sum: "$reveals" },
                  browserCount: { $sum: 1 },
                  lastViewedAt: { $max: "$lastViewedAt" },
                },
              },
            ],
            as: "activity",
          },
        },
        {
          $set: {
            visits: { $ifNull: [{ $first: "$activity.visits" }, 0] },
            reveals: { $ifNull: [{ $first: "$activity.reveals" }, 0] },
            browserCount: {
              $ifNull: [{ $first: "$activity.browserCount" }, 0],
            },
            lastViewedAt: {
              $ifNull: [{ $first: "$activity.lastViewedAt" }, null],
            },
          },
        },
      ];
      if (query.status !== "all")
        pipeline.push({
          $match: { visits: query.status === "viewed" ? { $gt: 0 } : 0 },
        });
      pipeline.push({
        $facet: {
          students: [
            { $sort: { nameKey: 1, _id: 1 } },
            { $skip: (query.page - 1) * query.pageSize },
            { $limit: query.pageSize },
            {
              $project: {
                name: 1,
                label: 1,
                classId: 1,
                active: 1,
                visits: 1,
                reveals: 1,
                browserCount: 1,
                lastViewedAt: 1,
              },
            },
          ],
          meta: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                viewed: { $sum: { $cond: [{ $gt: ["$visits", 0] }, 1, 0] } },
              },
            },
          ],
        },
      });

      const [result] = await db
        .collection("students")
        .aggregate(pipeline, { allowDiskUse: true })
        .toArray();
      const meta = result?.meta[0] || { total: 0, viewed: 0 };
      res.json({
        students: result?.students || [],
        total: meta.total,
        viewed: meta.viewed,
        unviewed: meta.total - meta.viewed,
        page: query.page,
        pageSize: query.pageSize,
      });
    }),
  );

  app.get(
    "/api/admin/result-views/:studentId",
    guard,
    wrap(async (req, res) => {
      const studentId = oid(req.params.studentId);
      const student = await db
        .collection("students")
        .findOne(
          { _id: studentId },
          { projection: { name: 1, label: 1, classId: 1, active: 1 } },
        );
      if (!student) throw fail(404, "Student not found");
      const [known, active, papers] = await Promise.all([
        events
          .aggregate([
            { $match: { studentId } },
            { $sort: { viewedAt: 1, _id: 1 } },
            {
              $group: {
                _id: "$browserId",
                browserFamily: { $last: "$browserFamily" },
                firstSeenAt: { $min: "$viewedAt" },
                lastSeenAt: { $max: "$viewedAt" },
              },
            },
            { $sort: { lastSeenAt: -1, _id: 1 } },
          ])
          .toArray(),
        events
          .aggregate([{ $match: { studentId, counted: true } }, ...visitGroups])
          .toArray(),
        events
          .aggregate([
            { $match: { studentId, counted: true } },
            {
              $group: {
                _id: { browserId: "$browserId", paperId: "$paperId" },
                reveals: { $sum: 1 },
                lastViewedAt: { $max: "$viewedAt" },
              },
            },
            {
              $lookup: {
                from: "papers",
                localField: "_id.paperId",
                foreignField: "_id",
                as: "paper",
              },
            },
            {
              $project: {
                _id: 0,
                browserId: "$_id.browserId",
                paperId: "$_id.paperId",
                reveals: 1,
                lastViewedAt: 1,
                name: { $ifNull: [{ $first: "$paper.name" }, "Removed paper"] },
                order: { $ifNull: [{ $first: "$paper.order" }, 1000000000] },
              },
            },
            { $sort: { order: 1, paperId: 1 } },
          ])
          .toArray(),
      ]);
      const stats = new Map(active.map((row) => [row._id, row]));
      res.json({
        student,
        browsers: known.map((row) => ({
          browserId: row._id,
          browserFamily: row.browserFamily,
          firstSeenAt: row.firstSeenAt,
          lastSeenAt: row.lastSeenAt,
          visits: stats.get(row._id)?.visits || 0,
          reveals: stats.get(row._id)?.reveals || 0,
          lastViewedAt: stats.get(row._id)?.lastViewedAt || null,
          papers: papers
            .filter((p) => p.browserId === row._id)
            .map(({ browserId, order, ...paper }) => paper),
        })),
      });
    }),
  );

  app.post(
    "/api/admin/result-views/reset",
    guard,
    wrap(async (req, res) => {
      const body = z
        .discriminatedUnion("scope", [
          z.object({ scope: z.literal("all") }).strict(),
          z
            .object({ scope: z.literal("student"), studentId: objectId })
            .strict(),
          z
            .object({
              scope: z.literal("browser"),
              studentId: objectId,
              browserId: randomId,
            })
            .strict(),
        ])
        .parse(req.body);
      const cutoff = new Date();
      const filter = { counted: true, viewedAt: { $lte: cutoff } };
      if (body.studentId) {
        filter.studentId = oid(body.studentId);
        if (
          !(await db
            .collection("students")
            .findOne({ _id: filter.studentId }, { projection: { _id: 1 } }))
        )
          throw fail(404, "Student not found");
      }
      if (body.scope === "browser") filter.browserId = body.browserId;
      const result = await events.updateMany(filter, {
        $set: { counted: false, resetAt: cutoff },
      });
      await audit(req, "result-view-reset", "resultViews", {
        ...body,
        clearedEvents: result.modifiedCount,
        cutoff,
      });
      res.json({ ok: true, clearedEvents: result.modifiedCount });
    }),
  );
}
