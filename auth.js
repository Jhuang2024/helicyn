// Helicyn auth module: thin wrapper around Supabase Auth + the
// founding_partner_applications table. Real sign up / sign in / sign out
// / session persistence -- no fake users, no manually stored passwords.
//
// Loaded as an ES module (`<script type="module" src="auth.js">`) after
// supabase-config.js. Every exported action first calls
// `checkClientReady()`, which distinguishes two real failure modes
// instead of silently doing nothing:
//   - "config": supabase-config.js is missing/placeholder (see
//     docs/auth_setup.md) -- expected until a real project is wired up.
//   - "load-error": config looks real but the Supabase client library
//     itself failed to load over the network (e.g. an ad blocker or
//     firewall blocking the CDN import) -- a genuine runtime failure,
//     reported as such rather than mistaken for a config problem.
const SUPABASE_URL = window.HELICYN_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = window.HELICYN_SUPABASE_ANON_KEY || "";
const SUPABASE_JS_CDN_URL = "https://esm.sh/@supabase/supabase-js@2";

function looksConfigured(url, key) {
  return Boolean(
    url &&
      key &&
      !url.includes("YOUR-PROJECT") &&
      !key.includes("YOUR-PUBLIC") &&
      /^https:\/\/.+\.supabase\.co/.test(url)
  );
}

export const isSupabaseConfigured = looksConfigured(SUPABASE_URL, SUPABASE_ANON_KEY);

export const CONFIG_ERROR_MESSAGE =
  "Supabase is not configured for this deployment. Copy supabase-config.example.js to " +
  "supabase-config.js and add your project URL + public anon key (see docs/auth_setup.md). " +
  "No account or application data can be created until this is set up.";

export const LOAD_ERROR_MESSAGE =
  "The Supabase client library could not be loaded (network or CDN issue). Check your " +
  "connection, disable any script blocker for this site, and reload. See docs/auth_setup.md.";

class ConfigError extends Error {
  constructor() {
    super(CONFIG_ERROR_MESSAGE);
    this.name = "ConfigError";
  }
}

class ClientLoadError extends Error {
  constructor(cause) {
    super(LOAD_ERROR_MESSAGE);
    this.name = "ClientLoadError";
    this.cause = cause;
  }
}

let _client = null;
let _clientLoadError = null;
let _initPromise = null;

async function initClient() {
  if (!isSupabaseConfigured) return null;
  if (_client) return _client;
  if (!_initPromise) {
    _initPromise = import(SUPABASE_JS_CDN_URL)
      .then(({ createClient }) => {
        _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        });
        return _client;
      })
      .catch((err) => {
        _clientLoadError = err;
        return null;
      });
  }
  return _initPromise;
}

// Call this once on page load to decide what to render before wiring up
// any form: { ready: true } | { ready: false, reason: "config" | "load-error", message }
export async function checkClientReady() {
  if (!isSupabaseConfigured) return { ready: false, reason: "config", message: CONFIG_ERROR_MESSAGE };
  const client = await initClient();
  if (!client) return { ready: false, reason: "load-error", message: LOAD_ERROR_MESSAGE };
  return { ready: true };
}

async function requireClient() {
  const client = await initClient();
  if (!client) {
    throw isSupabaseConfigured ? new ClientLoadError(_clientLoadError) : new ConfigError();
  }
  return client;
}

// ---- session / auth actions -------------------------------------------

export async function getSession() {
  const client = await requireClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function onAuthStateChange(callback) {
  const client = await initClient();
  if (!client) return { unsubscribe() {} };
  const { data } = client.auth.onAuthStateChange((_event, session) => callback(session));
  return data.subscription;
}

export async function signUpWithPassword(email, password) {
  const client = await requireClient();
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signInWithPassword(email, password) {
  const client = await requireClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signInWithMagicLink(email) {
  const client = await requireClient();
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + "/partner-portal.html" },
  });
  if (error) throw error;
}

export async function signOut() {
  const client = await requireClient();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

// ---- founding partner applications -------------------------------------

const APPLICATIONS_TABLE = "founding_partner_applications";

export async function submitFoundingPartnerApplication(fields) {
  const client = await requireClient();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData.session;
  if (!session) throw new Error("You must be signed in to submit a founding partner application.");

  const { data, error } = await client
    .from(APPLICATIONS_TABLE)
    .insert({ ...fields, user_id: session.user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getMyFoundingPartnerApplication() {
  const client = await requireClient();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData.session;
  if (!session) return null;

  const { data, error } = await client
    .from(APPLICATIONS_TABLE)
    .select("*")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ---- shared UI helper ---------------------------------------------------

export function renderConfigError(container, message) {
  if (!container) return;
  const div = document.createElement("div");
  div.className = "authnotice authnotice--err";
  div.setAttribute("role", "alert");
  const titleEl = document.createElement("span");
  titleEl.className = "authnotice__title";
  titleEl.textContent = "Setup required";
  const bodyEl = document.createElement("p");
  bodyEl.textContent = message || CONFIG_ERROR_MESSAGE;
  div.append(titleEl, bodyEl);
  container.innerHTML = "";
  container.appendChild(div);
}
