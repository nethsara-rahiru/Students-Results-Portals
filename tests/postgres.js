import EmbeddedPostgres from "embedded-postgres";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
export const ADMIN = "11111111-1111-4111-8111-111111111111";
export const STUDENT = "22222222-2222-4222-8222-222222222222";
export const OTHER = "33333333-3333-4333-8333-333333333333";
export async function database(port = 55432) {
  const directory = await mkdtemp(join(tmpdir(), "levelup-postgres-"));
  const postgres = new EmbeddedPostgres({
    databaseDir: join(directory, "data"),
    user: "postgres",
    password: randomBytes(20).toString("hex"),
    port,
    persistent: false,
    postgresFlags: ["-k", directory],
    onLog: process.env.LEVELUP_PG_DEBUG ? console.error : () => {},
    onError: console.error,
  });
  let client;
  try {
    await postgres.initialise();
    await postgres.start();
    client = postgres.getPgClient();
    await client.connect();
    // Supabase supplies auth.users, auth.uid(), auth.jwt(), and these PostgREST roles.
    await client.query(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
      create schema auth;create table auth.users(id uuid primary key,email text,is_anonymous boolean not null default false);
      create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;`);
    await client.query(`create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      grant usage on schema auth to anon,authenticated;grant execute on all functions in schema auth to anon,authenticated;`);
    await client.query(
      await readFile(
        new URL(
          "../supabase/migrations/202611110001_levelup.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await client.query("insert into auth.users(id) values($1),($2),($3)", [
      ADMIN,
      STUDENT,
      OTHER,
    ]);
    await client.query(
      "insert into levelup_private.administrators(user_id) values($1)",
      [ADMIN],
    );
    return {
      client,
      async as(
        user,
        fn,
        { anonymous = user !== ADMIN, role = "authenticated" } = {},
      ) {
        const scoped = postgres.getPgClient();
        await scoped.connect();
        await scoped.query("begin");
        try {
          await scoped.query(
            `set local role ${role === "anon" ? "anon" : "authenticated"}`,
          );
          await scoped.query(
            "select set_config('request.jwt.claims',$1,true)",
            [JSON.stringify({ sub: user, is_anonymous: anonymous })],
          );
          const result = await fn(scoped);
          await scoped.query("commit");
          return result;
        } catch (e) {
          await scoped.query("rollback");
          throw e;
        } finally {
          await scoped.end();
        }
      },
      async close() {
        await client.end();
        await postgres.stop();
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await client?.end();
    try {
      if (postgres.process && postgres.process.exitCode === null)
        await postgres.stop();
    } catch {}
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

export async function call(db, user, name, args = {}, options = {}) {
  if (!/^levelup_[a-z_]+$/.test(name)) throw Error("Invalid RPC");
  const keys = Object.keys(args);
  const params = keys.map((k) =>
    ["data", "entries", "ids"].includes(k) ? JSON.stringify(args[k]) : args[k],
  );
  return db.as(
    user,
    async (c) =>
      (
        await c.query(
          `select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(",")}) as result`,
          params,
        )
      ).rows[0].result,
    options,
  );
}
