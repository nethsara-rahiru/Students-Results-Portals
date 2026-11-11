export function validateConfig(config) {
  if (!config?.supabaseUrl || !config?.supabaseKey)
    throw new Error(
      "Supabase is not configured. Set the project URL and publishable key in config.js.",
    );
  const url = new URL(config.supabaseUrl);
  if (
    url.username ||
    url.password ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname))
    )
  )
    throw new Error("Use an HTTPS Supabase project URL, without credentials.");
  const key = config.supabaseKey;
  if (key.startsWith("sb_publishable_")) return config;
  if (key.startsWith("sb_secret_"))
    throw new Error(
      "A secret key cannot be used in a public website. Use the publishable key.",
    );
  try {
    const payload = JSON.parse(
      atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    if (payload.role === "anon") return config;
  } catch {
    /* A malformed or privileged key must fail closed. */
  }
  throw new Error(
    "Use a Supabase publishable or legacy anon key; never a service-role key.",
  );
}
