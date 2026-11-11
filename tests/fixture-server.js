// Test-only Auth/PostgREST transport. Authorization/data operations execute the real SQL migration.
// This is NOT shipped in the Pages artifact and is not a replacement for hosted Supabase Auth.
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { database, call, ADMIN } from "./postgres.js";
const db = await database(55433);
const root = resolve("public");
const prefix = "/Students-Results-Portals/";
const tokens = new Map();
async function issue(userId, anonymous) {
  const user = {
    id: userId,
    email: anonymous ? undefined : "teacher@example.test",
    aud: "authenticated",
    role: "authenticated",
    is_anonymous: anonymous,
    app_metadata: { provider: anonymous ? "anonymous" : "email" },
    user_metadata: {},
    identities: [],
    created_at: new Date().toISOString(),
  };
  await db.client.query(
    "insert into auth.users(id) values($1) on conflict do nothing",
    [userId],
  );
  const payload = {
    sub: userId,
    aud: "authenticated",
    role: "authenticated",
    is_anonymous: anonymous,
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const token =
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ) +
    "." +
    Buffer.from(JSON.stringify(payload)).toString("base64url") +
    ".test-signature";
  const session = {
    access_token: token,
    refresh_token: randomUUID(),
    token_type: "bearer",
    expires_in: 3600,
    expires_at: payload.exp,
    user,
  };
  tokens.set(token, session);
  return session;
}
let maya, daniel, single, p1, p2;
for (const name of ["Maya Fernando", "Daniel Perera", "Single Student"]) {
  const { id } = await call(db, ADMIN, "levelup_save_student", {
    data: {
      name,
      label:
        name === "Single Student"
          ? ""
          : "Grade 10 · " + (name.startsWith("Maya") ? "01" : "02"),
    },
  });
  if (name.startsWith("Maya")) maya = id;
  else if (name.startsWith("Daniel")) daniel = id;
  else single = id;
}
p1 = (
  await call(db, ADMIN, "levelup_save_paper", {
    data: {
      name: "Mathematics · Paper 01",
      subject: "Mathematics",
      max: 100,
      state: "published",
    },
  })
).id;
p2 = (
  await call(db, ADMIN, "levelup_save_paper", {
    data: {
      name: "Mathematics · Paper 02",
      subject: "Mathematics",
      max: 50,
      state: "published",
    },
  })
).id;
await call(db, ADMIN, "levelup_save_marks", {
  entries: [
    { studentId: maya, paperId: p1, value: 64 },
    { studentId: maya, paperId: p2, value: 42 },
    { studentId: single, paperId: p1, value: 0 },
  ],
});
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:3100");
  const json = (status, data) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
  };
  try {
    let body = {};
    if (req.method === "POST") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      body = JSON.parse(raw || "{}");
    }
    if (url.pathname.startsWith("/supabase/")) {
      const session = tokens.get(
        req.headers.authorization?.replace(/^Bearer /, ""),
      );
      if (url.pathname === "/supabase/auth/v1/signup")
        return json(200, await issue(randomUUID(), true));
      if (url.pathname === "/supabase/auth/v1/token") {
        if (
          body.email === "teacher@example.test" &&
          body.password === "browser-password"
        )
          return json(200, await issue(ADMIN, false));
        return json(400, {
          error: "invalid_grant",
          error_description: "Invalid login credentials",
        });
      }
      if (url.pathname === "/supabase/auth/v1/user")
        return session
          ? json(200, session.user)
          : json(401, { message: "Invalid JWT" });
      if (url.pathname === "/supabase/auth/v1/logout") {
        if (session) tokens.delete(session.access_token);
        res.writeHead(204);
        return res.end();
      }
      if (url.pathname.startsWith("/supabase/rest/v1/rpc/")) {
        if (!session)
          return json(401, { code: "42501", message: "Invalid JWT" });
        const name = url.pathname.split("/").at(-1);
        return json(
          200,
          await call(db, session.user.id, name, body, {
            anonymous: session.user.is_anonymous,
          }),
        );
      }
      return json(404, { message: "Unknown fixture endpoint" });
    }
    if (!url.pathname.startsWith(prefix))
      return json(404, { error: "Static project subpath required" });
    let path = decodeURIComponent(url.pathname.slice(prefix.length));
    if (!path) path = "index.html";
    if (path === "config.js") {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      return res.end(
        `export const config={supabaseUrl:'http://localhost:3100/supabase',supabaseKey:'sb_publishable_browser_fixture'};`,
      );
    }
    const file = resolve(root, path);
    if (!file.startsWith(root + "/")) return json(403, { error: "Forbidden" });
    const mime = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".png": "image/png",
    };
    if (!(await stat(file)).isFile()) return json(404, { error: "Not found" });
    res.writeHead(200, {
      "Content-Type": mime[extname(file)] || "application/octet-stream",
    });
    res.end(await readFile(file));
  } catch (error) {
    json(error.code === "42501" ? 403 : error.code === "ENOENT" ? 404 : 400, {
      code: error.code || "P0001",
      message: error.message,
    });
  }
});
server.listen(3100, () => console.log("Static project-path fixture on 3100"));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(async () => {
      await db.close();
      process.exit(0);
    }),
  );
