import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { database, ADMIN, STUDENT, OTHER, call } from "./postgres.js";
import { validateConfig } from "../public/config-validation.js";
let db, studentId, otherId, paperId, secondId, classId;
before(async () => {
  db = await database();
});
after(async () => {
  await db?.close();
});
test("browser config rejects private keys and accepts publishable/anon keys", () => {
  const url = "https://example.supabase.co";
  assert.throws(() =>
    validateConfig({ supabaseUrl: url, supabaseKey: "sb_secret_private" }),
  );
  const token = (role) =>
    "header." +
    Buffer.from(JSON.stringify({ role })).toString("base64url") +
    ".signature";
  assert.throws(() =>
    validateConfig({ supabaseUrl: url, supabaseKey: token("service_role") }),
  );
  assert.ok(validateConfig({ supabaseUrl: url, supabaseKey: token("anon") }));
  assert.ok(
    validateConfig({ supabaseUrl: url, supabaseKey: "sb_publishable_test" }),
  );
});
test("unauthenticated users and anonymous students cannot use teacher RPCs or raw tables", async () => {
  await assert.rejects(call(db, null, "levelup_session", {}, { role: "anon" }));
  await assert.rejects(
    call(db, STUDENT, "levelup_admin_data"),
    /Teacher access required/,
  );
  for (const table of [
    "levelup_students",
    "levelup_marks",
    "levelup_papers",
    "levelup_audit_logs",
  ])
    await assert.rejects(
      db.as(STUDENT, (c) => c.query(`select * from public.${table}`)),
      /permission denied/,
    );
  await assert.rejects(
    db.as(STUDENT, (c) =>
      c.query(
        "insert into levelup_private.administrators(user_id) values($1)",
        [STUDENT],
      ),
    ),
    /permission denied/,
  );
  const session = await call(db, ADMIN, "levelup_session");
  assert.equal(session.admin, true);
  assert.equal((await call(db, STUDENT, "levelup_session")).admin, false);
});
test("create class and duplicate students with unique profile labels", async () => {
  classId = (
    await call(db, ADMIN, "levelup_save_class", {
      data: { name: "Grade 10 A" },
    })
  ).id;
  studentId = (
    await call(db, ADMIN, "levelup_save_student", {
      data: {
        name: "Alex  Taylor",
        label: "10A · 01",
        classId,
        accessCode: "private-code-01",
      },
    })
  ).id;
  otherId = (
    await call(db, ADMIN, "levelup_save_student", {
      data: { name: "Alex Taylor", label: "10B · 02" },
    })
  ).id;
  assert.notEqual(studentId, otherId);
  await assert.rejects(
    call(db, ADMIN, "levelup_save_student", {
      data: { name: "Alex Taylor", label: "10B · 02" },
    }),
    /duplicate key/,
  );
  assert.equal(
    (await call(db, ADMIN, "levelup_admin_data")).students.length,
    2,
  );
});
test("submitted lookup normalizes exact names and offers bounded typo suggestions", async () => {
  const exact = await call(db, STUDENT, "levelup_lookup", {
    name: "  ALEX  TAYLOR  ",
  });
  assert.equal(exact.exact, true);
  assert.equal(exact.students.length, 2);
  assert.equal(exact.students[0].accessCodeHash, undefined);
  assert.equal(exact.students[0].classId, undefined);
  const similar = await call(db, STUDENT, "levelup_lookup", {
    name: "Aelx Taylr",
  });
  assert.equal(similar.exact, false);
  assert.ok(similar.students.length > 0 && similar.students.length <= 5);
  await assert.rejects(call(db, STUDENT, "levelup_lookup", { name: null }));
});
test("create ordered draft papers and validate metadata", async () => {
  paperId = (
    await call(db, ADMIN, "levelup_save_paper", {
      data: { name: "Paper 01", max: 100, subject: "Mathematics" },
    })
  ).id;
  secondId = (
    await call(db, ADMIN, "levelup_save_paper", {
      data: { name: "Paper 02", max: 50 },
    })
  ).id;
  const data = await call(db, ADMIN, "levelup_admin_data");
  assert.deepEqual(
    data.papers.map((p) => p._id),
    [paperId, secondId],
  );
  assert.equal(data.papers[0].state, "draft");
  await assert.rejects(
    call(db, ADMIN, "levelup_save_paper", { data: { name: "Bad", max: 1.5 } }),
  );
  await assert.rejects(
    call(db, ADMIN, "levelup_save_paper", {
      data: { name: "Bad", max: 10, date: "2026-99-99" },
    }),
  );
});
test("a failed bulk save rolls back marks AND audit records", async () => {
  const count = +(
    await db.client.query("select count(*) as n from public.levelup_audit_logs")
  ).rows[0].n;
  await assert.rejects(
    call(db, ADMIN, "levelup_save_marks", {
      entries: [
        { studentId, paperId, value: 60 },
        { studentId, paperId: secondId, value: 51 },
      ],
    }),
  );
  assert.equal(
    +(await db.client.query("select count(*) as n from public.levelup_marks"))
      .rows[0].n,
    0,
  );
  assert.equal(
    +(
      await db.client.query(
        "select count(*) as n from public.levelup_audit_logs",
      )
    ).rows[0].n,
    count,
  );
  await assert.rejects(
    call(db, ADMIN, "levelup_save_marks", {
      entries: [{ studentId, paperId, value: "=SUM(1,2)" }],
    }),
  );
  await assert.rejects(
    call(db, ADMIN, "levelup_save_marks", {
      entries: [{ studentId, paperId, value: 1.123 }],
    }),
  );
  await assert.rejects(
    call(db, ADMIN, "levelup_save_marks", {
      entries: [
        { studentId, paperId, value: 1 },
        { studentId, paperId, value: 2 },
      ],
    }),
  );
});
test("bulk marks preserve zero, decimals, blanks, absence and audit values", async () => {
  await call(db, ADMIN, "levelup_save_marks", {
    entries: [
      { studentId, paperId, value: 0 },
      { studentId, paperId: secondId, value: 42.25 },
      { studentId: otherId, paperId, value: null, status: "absent" },
      { studentId: otherId, paperId: secondId, value: null },
    ],
  });
  const data = await call(db, ADMIN, "levelup_admin_data");
  assert.equal(data.marks.length, 4);
  assert.ok(data.marks.some((m) => m.value === 0));
  assert.ok(data.marks.some((m) => m.status === "absent"));
  const logs = await call(db, ADMIN, "levelup_admin_audit");
  assert.ok(
    logs.some(
      (l) => l.entity === "levelup_marks" && l.changes.after.value === 0,
    ),
  );
  assert.ok(!JSON.stringify(logs).includes("private-code-01"));
});
test("publish/unpublish, class boundaries and student-only results are enforced", async () => {
  assert.equal(
    (await call(db, STUDENT, "levelup_results", { student_id: studentId }))
      .papers.length,
    0,
  );
  for (const [id, max, name] of [
    [paperId, 100, "Paper 01"],
    [secondId, 50, "Paper 02"],
  ])
    await call(db, ADMIN, "levelup_save_paper", {
      record_id: id,
      data: { name, max, state: "published" },
    });
  let r = await call(db, STUDENT, "levelup_results", { student_id: studentId });
  assert.deepEqual(
    r.papers.map((p) => p.value),
    [0, 42.25],
  );
  assert.equal(r.students, undefined);
  assert.equal(
    (await call(db, STUDENT, "levelup_results", { student_id: otherId })).papers
      .length,
    0,
  );
  await call(db, ADMIN, "levelup_reorder_papers", { ids: [secondId, paperId] });
  r = await call(db, STUDENT, "levelup_results", { student_id: studentId });
  assert.deepEqual(
    r.papers.map((p) => p.id),
    [secondId, paperId],
  );
  await call(db, ADMIN, "levelup_save_paper", {
    record_id: paperId,
    data: { name: "Paper 01", max: 100, state: "unpublished" },
  });
  assert.equal(
    (await call(db, STUDENT, "levelup_results", { student_id: studentId }))
      .papers.length,
    1,
  );
  await assert.rejects(
    call(db, ADMIN, "levelup_save_paper", {
      record_id: secondId,
      data: { name: "Paper 02", max: 10 },
    }),
  );
  const restricted = (
    await call(db, ADMIN, "levelup_save_paper", {
      data: { name: "Restricted class", max: 10, classId },
    })
  ).id;
  await assert.rejects(
    call(db, ADMIN, "levelup_save_marks", {
      entries: [{ studentId: otherId, paperId: restricted, value: 5 }],
    }),
  );
});
test("access-code grants bind to user and profile; null code is rejected", async () => {
  await call(db, ADMIN, "levelup_set_access_mode", { mode: "code" });
  await assert.rejects(
    call(db, STUDENT, "levelup_results", { student_id: studentId }),
    /access code/,
  );
  assert.equal(
    (
      await call(db, STUDENT, "levelup_unlock_student", {
        student_id: studentId,
        code: null,
      })
    ).ok,
    false,
  );
  assert.equal(
    (
      await call(db, STUDENT, "levelup_unlock_student", {
        student_id: studentId,
        code: "wrong-code",
      })
    ).ok,
    false,
  );
  assert.equal(
    (
      await call(db, STUDENT, "levelup_unlock_student", {
        student_id: studentId,
        code: "private-code-01",
      })
    ).ok,
    true,
  );
  assert.equal(
    (await call(db, STUDENT, "levelup_results", { student_id: studentId }))
      .papers.length,
    1,
  );
  await assert.rejects(
    call(db, STUDENT, "levelup_results", { student_id: otherId }),
  );
  await assert.rejects(
    call(db, OTHER, "levelup_results", { student_id: studentId }),
  );
  await call(db, ADMIN, "levelup_save_student", {
    record_id: studentId,
    data: {
      name: "Alex Taylor",
      label: "10A · 01",
      classId,
      accessCode: "replacement-code",
    },
  });
  await assert.rejects(
    call(db, STUDENT, "levelup_results", { student_id: studentId }),
  );
});
test("wrong access codes are throttled even though authentication fails", async () => {
  for (let i = 0; i < 15; i++)
    assert.equal(
      (
        await call(db, OTHER, "levelup_unlock_student", {
          student_id: studentId,
          code: "wrong-code",
        })
      ).ok,
      false,
    );
  await assert.rejects(
    call(db, OTHER, "levelup_unlock_student", {
      student_id: studentId,
      code: "replacement-code",
    }),
    /Too many requests/,
  );
});
test("lookup rate limit is persisted and inactive students are hidden", async () => {
  await call(db, ADMIN, "levelup_save_student", {
    record_id: otherId,
    data: { name: "Alex Taylor", label: "10B · 02", active: false },
  });
  const r = await call(db, OTHER, "levelup_lookup", { name: "Alex Taylor" });
  assert.equal(r.students.length, 1);
  for (let i = 0; i < 24; i++)
    await call(db, OTHER, "levelup_lookup", { name: "Unknown Name" });
  await assert.rejects(
    call(db, OTHER, "levelup_lookup", { name: "Unknown Name" }),
    /Too many requests/,
  );
});
test("legacy MongoDB identifiers can be imported without replacing them", async () => {
  const id = "abcdef0123456789abcdef01";
  await db.client.query(
    "insert into public.levelup_students(id,name,label) values($1,$2,$3)",
    [id, "Legacy Student", "legacy"],
  );
  await call(db, ADMIN, "levelup_set_access_mode", { mode: "name" });
  const result = await call(db, STUDENT, "levelup_lookup", {
    name: "Legacy Student",
  });
  assert.equal(result.students[0]._id, id);
});
test("all privileged functions have fixed search paths and no PUBLIC/anon execution", async () => {
  const functions = (
    await db.client.query(
      "select p.oid,proname,proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname like 'levelup_%' and prosecdef",
    )
  ).rows;
  assert.ok(functions.length >= 12);
  for (const f of functions) {
    assert.ok(f.proconfig.some((c) => c.startsWith("search_path=")));
    const privileges = (
      await db.client.query(
        "select has_function_privilege('anon',$1,'EXECUTE') allowed",
        [f.oid],
      )
    ).rows[0];
    assert.equal(privileges.allowed, false);
  }
  const tables = (
    await db.client.query(
      "select relname,relrowsecurity from pg_class where relname in ('levelup_students','levelup_marks','levelup_papers','levelup_classes','levelup_audit_logs')",
    )
  ).rows;
  assert.ok(tables.every((t) => t.relrowsecurity));
});
test("regular signed-in accounts are not teachers, and revoked teachers lose access immediately", async () => {
  await assert.rejects(
    call(db, OTHER, "levelup_admin_data", {}, { anonymous: false }),
    /Teacher access required/,
  );
  await db.client.query(
    "delete from levelup_private.administrators where user_id=$1",
    [ADMIN],
  );
  await assert.rejects(
    call(db, ADMIN, "levelup_admin_data"),
    /Teacher access required/,
  );
  await db.client.query(
    "insert into levelup_private.administrators(user_id) values($1)",
    [ADMIN],
  );
});
test("offline Mongo converter escapes names and imports stable IDs and zero safely", async () => {
  const { mkdtemp, writeFile, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { spawnSync } = await import("node:child_process");
  const directory = await mkdtemp(join(tmpdir(), "levelup-import-"));
  const sid = "abcdef0123456789abcdef02",
    pid = "abcdef0123456789abcdef03";
  try {
    await writeFile(
      join(directory, "students.json"),
      JSON.stringify([{ _id: { $oid: sid }, name: "O'Neil Learner" }]),
    );
    await writeFile(
      join(directory, "papers.json"),
      JSON.stringify([
        {
          _id: { $oid: pid },
          name: "Legacy zero paper",
          max: 100,
          published: true,
          order: 9,
        },
      ]),
    );
    await writeFile(
      join(directory, "marks.json"),
      JSON.stringify([
        { studentId: { $oid: sid }, paperId: { $oid: pid }, value: 0 },
      ]),
    );
    const result = spawnSync(
      "python3",
      [
        "scripts/convert-mongo-export.py",
        directory,
        "--output",
        join(directory, "import.sql"),
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    const sql = await readFile(join(directory, "import.sql"), "utf8");
    await db.client.query(sql);
    const student = (
      await db.client.query(
        "select name from public.levelup_students where id=$1",
        [sid],
      )
    ).rows[0];
    assert.equal(student.name, "O'Neil Learner");
    assert.equal(
      (await call(db, STUDENT, "levelup_results", { student_id: sid }))
        .papers[0].value,
      0,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
