// Site-wide nav auth state: wherever a real Supabase session exists,
// replaces the nav's "Login" link with an avatar + dropdown (profile,
// partner portal, sign out) built entirely here, so no page's static
// markup needs its own copy. No-ops entirely if Supabase isn't
// configured or the page has no [data-nav-auth] link (e.g. /login and
// /partner-portal already manage their own sign-in/out state in-page).
import { checkClientReady, getSession, onAuthStateChange, signOut } from "./auth.js";

function initials(session) {
  const fullName = ((session.user.user_metadata || {}).full_name || "").trim();
  if (fullName) {
    const parts = fullName.split(/\s+/).filter(Boolean);
    const letters = (parts[0][0] || "") + (parts[1] ? parts[1][0] : "");
    return letters.toUpperCase();
  }
  return (session.user.email || "?")[0].toUpperCase();
}

function buildProfileMenu(session) {
  const wrap = document.createElement("div");
  wrap.className = "profilemenu";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "profilemenu__trigger";
  trigger.setAttribute("aria-haspopup", "true");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", "Account menu");
  const avatar = document.createElement("span");
  avatar.className = "profilemenu__avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = initials(session);
  trigger.appendChild(avatar);

  const panel = document.createElement("div");
  panel.className = "profilemenu__panel";
  panel.hidden = true;

  const who = document.createElement("div");
  who.className = "profilemenu__who";
  const nameEl = document.createElement("span");
  nameEl.className = "profilemenu__name";
  nameEl.textContent = (session.user.user_metadata || {}).full_name || "Your account";
  const emailEl = document.createElement("span");
  emailEl.className = "profilemenu__email";
  emailEl.textContent = session.user.email || "";
  who.append(nameEl, emailEl);

  const profileLink = document.createElement("a");
  profileLink.className = "profilemenu__link";
  profileLink.href = "profile";
  profileLink.textContent = "Profile & account";

  const portalLink = document.createElement("a");
  portalLink.className = "profilemenu__link";
  portalLink.href = "partner-portal";
  portalLink.textContent = "Partner portal";

  const signOutBtn = document.createElement("button");
  signOutBtn.type = "button";
  signOutBtn.className = "profilemenu__link";
  signOutBtn.textContent = "Sign out";
  signOutBtn.addEventListener("click", async () => {
    signOutBtn.textContent = "Signing out...";
    await signOut().catch(() => {});
    window.location.href = "/";
  });

  panel.append(who, profileLink, portalLink, signOutBtn);
  wrap.append(trigger, panel);

  function closePanel() {
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    trigger.setAttribute("aria-expanded", String(willOpen));
  });
  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) closePanel();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePanel();
  });

  return wrap;
}

function render(link, session) {
  const existingMenu = link.parentElement ? link.parentElement.querySelector(".profilemenu") : null;
  if (existingMenu) existingMenu.remove();

  if (session) {
    link.style.display = "none";
    link.insertAdjacentElement("afterend", buildProfileMenu(session));
  } else {
    link.style.display = "";
    link.textContent = "Login";
    link.href = "login";
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
