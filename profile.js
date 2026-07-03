// /profile page logic: view and edit the account fields captured at
// sign-up (full name, job title, newsletter preference). Requires a
// real signed-in Supabase session; writes go straight to the user's
// own auth profile via updateProfile() in auth.js. See auth.js and
// docs/auth_setup.md.
import {
  checkClientReady,
  renderConfigError,
  getSession,
  onAuthStateChange,
  updateProfile,
  signOut,
} from "./auth.js";

const configNotice = document.getElementById("configNotice");
const signInRequired = document.getElementById("signInRequired");
const profileView = document.getElementById("profileView");
const profileForm = document.getElementById("profileForm");
const profileEmail = document.getElementById("profileEmail");
const profileFullName = document.getElementById("profileFullName");
const profileJobTitle = document.getElementById("profileJobTitle");
const profileLinkedin = document.getElementById("profileLinkedin");
const profileLinkedinErr = document.getElementById("profileLinkedinErr");
const profileNewsletter = document.getElementById("profileNewsletter");
const profileSaveBtn = document.getElementById("profileSaveBtn");
const profileLoading = document.getElementById("profileLoading");
const profileNotice = document.getElementById("profileNotice");
const profileSignOutBtn = document.getElementById("profileSignOutBtn");

function setNotice(kind, title, message) {
  profileNotice.innerHTML = "";
  if (!message) return;
  const div = document.createElement("div");
  div.className = `authnotice authnotice--${kind}`;
  div.setAttribute("role", "alert");
  const titleEl = document.createElement("span");
  titleEl.className = "authnotice__title";
  titleEl.textContent = title;
  const bodyEl = document.createElement("p");
  bodyEl.textContent = message;
  div.append(titleEl, bodyEl);
  profileNotice.appendChild(div);
}

function fillForm(session) {
  const meta = session.user.user_metadata || {};
  profileEmail.value = session.user.email || "";
  profileFullName.value = meta.full_name || "";
  profileJobTitle.value = meta.job_title || "";
  profileLinkedin.value = meta.linkedin_url || "";
  profileNewsletter.checked = meta.newsletter_opt_in !== false;
}

function normalizeLinkedinUrl(raw) {
  const value = raw.trim();
  if (!value) return { ok: true, value: "" };
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  let parsed;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false };
  }
  if (!/(^|\.)linkedin\.com$/i.test(parsed.hostname)) return { ok: false };
  return { ok: true, value: parsed.href };
}

async function handleSubmit(e) {
  e.preventDefault();
  setNotice();
  profileLinkedinErr.textContent = "";

  const linkedin = normalizeLinkedinUrl(profileLinkedin.value);
  if (!linkedin.ok) {
    profileLinkedinErr.textContent = "Enter a valid linkedin.com URL, or leave it blank.";
    profileLinkedin.focus();
    return;
  }

  profileSaveBtn.disabled = true;
  profileLoading.hidden = false;
  try {
    await updateProfile({
      full_name: profileFullName.value.trim(),
      job_title: profileJobTitle.value.trim(),
      linkedin_url: linkedin.value,
      newsletter_opt_in: profileNewsletter.checked,
    });
    profileLinkedin.value = linkedin.value;
    setNotice("ok", "Saved", "Your profile has been updated.");
  } catch (err) {
    setNotice("err", "Could not save changes", err.message || String(err));
  } finally {
    profileSaveBtn.disabled = false;
    profileLoading.hidden = true;
  }
}

async function init() {
  const session = await getSession().catch(() => null);
  if (!session) {
    signInRequired.hidden = false;
    profileView.hidden = true;
    return;
  }
  signInRequired.hidden = true;
  profileView.hidden = false;
  fillForm(session);
}

async function start() {
  const status = await checkClientReady();
  if (!status.ready) {
    renderConfigError(configNotice, status.message);
    profileView.hidden = true;
    signInRequired.hidden = true;
    return;
  }
  profileForm.addEventListener("submit", handleSubmit);
  profileSignOutBtn.addEventListener("click", async () => {
    await signOut();
    window.location.href = "/";
  });
  await onAuthStateChange(() => init());
  await init();
}

start();
