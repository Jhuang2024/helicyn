// Helicyn Supabase runtime config template.
//
// This site is static HTML/CSS/JS with no bundler, so there is no build
// step to inject environment variables into the browser bundle. Instead:
//
//   1. Copy this file to supabase-config.js (same folder).
//   2. Replace the two placeholder values below with your Supabase
//      project's URL and PUBLIC anon key (Project Settings -> API).
//   3. Never put the service role / secret key here -- this file is
//      loaded directly by the browser. The anon key is safe to expose
//      publicly; access to real data is controlled by Row Level Security
//      (RLS) policies in Supabase, not by keeping this key secret.
//
// supabase-config.js is gitignored (see .gitignore) so your real project
// values are never committed. See docs/auth_setup.md for full setup
// instructions, including the equivalent VITE_SUPABASE_URL /
// VITE_SUPABASE_ANON_KEY env var names if this site is ever moved to a
// bundler-based stack.
window.HELICYN_SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
window.HELICYN_SUPABASE_ANON_KEY = "YOUR-PUBLIC-ANON-KEY";
