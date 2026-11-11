import { createClient } from "./vendor/supabase.js";
import { config } from "./config.js";
import { validateConfig } from "./config-validation.js";
let client;
const getClient = () =>
  (client ||= createClient(
    validateConfig(config).supabaseUrl,
    config.supabaseKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: "levelup.supabase.auth",
      },
    },
  ));
function failure(error) {
  const e = new Error(
    error.code === "23505"
      ? "This profile or class already exists. Give duplicate names a distinct label or class."
      : error.message || "Unable to reach Supabase",
  );
  e.status = error.code === "42501" ? 401 : error.code === "P0002" ? 404 : 400;
  return e;
}
async function rpc(name, args = {}) {
  const { data, error } = await getClient().rpc(name, args);
  if (error) throw failure(error);
  return data;
}
async function captchaToken() {
  if (!config.turnstileSiteKey) return undefined;
  const dialog = document.createElement("dialog");
  dialog.className = "panel stack";
  dialog.innerHTML =
    '<h2>A quick security check.</h2><p>Please complete the check to continue.</p><div id="captcha"></div>';
  document.body.append(dialog);
  dialog.showModal();
  if (!window.turnstile)
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.onload = resolve;
      script.onerror = () =>
        reject(Error("Unable to load the security check. Please retry."));
      document.head.append(script);
    });
  return new Promise((resolve, reject) => {
    const close = () => {
      dialog.close();
      dialog.remove();
    };
    dialog.addEventListener(
      "cancel",
      () => {
        close();
        reject(Error("Security check cancelled."));
      },
      { once: true },
    );
    window.turnstile.render(dialog.querySelector("#captcha"), {
      sitekey: config.turnstileSiteKey,
      callback: (token) => {
        close();
        resolve(token);
      },
      "error-callback": () => {
        close();
        reject(Error("The security check failed. Please retry."));
      },
    });
  });
}
export async function api(url, body, method = body ? "POST" : "GET") {
  if (url === "/session") {
    const {
      data: { session },
      error,
    } = await getClient().auth.getSession();
    if (error) throw failure(error);
    if (!session) {
      if (location.hash === "#admin")
        return { admin: false, accessMode: "name" };
      const captcha = await captchaToken();
      const { error } = await getClient().auth.signInAnonymously(
        captcha ? { options: { captchaToken: captcha } } : undefined,
      );
      if (error) throw failure(error);
    }
    return rpc("levelup_session");
  }
  if (url === "/login") {
    const { error } = await getClient().auth.signInWithPassword({
      email: body.username.trim(),
      password: body.password,
      options: { captchaToken: await captchaToken() },
    });
    if (error) throw new Error("Invalid email or password.");
    const session = await rpc("levelup_session");
    if (!session.admin) {
      await getClient().auth.signOut();
      throw new Error(
        "This account has not been authorized as a teacher. Ask the project owner to grant access.",
      );
    }
    return session;
  }
  if (url === "/logout") {
    const { error } = await getClient().auth.signOut();
    if (error) throw failure(error);
    return { ok: true };
  }
  if (url === "/admin/data") return rpc("levelup_admin_data");
  if (url === "/admin/audit") return rpc("levelup_admin_audit");
  if (url === "/admin/settings")
    return rpc("levelup_set_access_mode", { mode: body.mode });
  if (url === "/lookup") return rpc("levelup_lookup", { name: body.name });
  if (url === "/student/access") {
    const result = await rpc("levelup_unlock_student", {
      student_id: body.studentId,
      code: body.code,
    });
    if (!result.ok)
      throw Object.assign(new Error("Invalid profile or access code."), {
        status: 401,
      });
    return result;
  }
  if (url.startsWith("/results/"))
    return rpc("levelup_results", {
      student_id: url.slice("/results/".length),
    });
  if (url === "/admin/marks")
    return rpc("levelup_save_marks", { entries: body.entries || [body] });
  if (url === "/admin/paper-order")
    return rpc("levelup_reorder_papers", { ids: body.ids });
  const route = url.match(/^\/admin\/(students|classes|papers)(?:\/([^/]+))?$/);
  if (route && ["POST", "PATCH"].includes(method))
    return rpc(
      {
        students: "levelup_save_student",
        classes: "levelup_save_class",
        papers: "levelup_save_paper",
      }[route[1]],
      { data: body, record_id: route[2] || null },
    );
  throw new Error("Unknown application action");
}
