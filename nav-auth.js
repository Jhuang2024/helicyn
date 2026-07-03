// Site-wide nav auth state: swaps the nav's "Login" link for a "Sign
// out" action wherever a real Supabase session exists, so signing out
// is reachable from any page, not just /login and /partner-portal.
// No-ops entirely if Supabase isn't configured or the page has no
// [data-nav-auth] link (e.g. /login and /partner-portal already
// manage their own sign-in/out state in-page).
import { checkClientReady, getSession, onAuthStateChange, signOut } from "./auth.js";

function render(link, session) {
  if (session) {
    link.textContent = "Sign out";
    link.href = "#";
    link.onclick = async (e) => {
      e.preventDefault();
      link.textContent = "Signing out...";
      await signOut().catch(() => {});
      window.location.href = "/";
    };
  } else {
    link.textContent = "Login";
    link.href = "login";
    link.onclick = null;
  }
}

async function start() {
  const link = document.querySelector("[data-nav-auth]");
  if (!link) return;
  const status = await checkClientReady();
  if (!status.ready) return;
  await onAuthStateChange((session) => render(link, session));
  const session = await getSession().catch(() => null);
  render(link, session);
}

start();
