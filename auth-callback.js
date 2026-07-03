// /auth-callback page logic: the single landing target for every
// Supabase Auth email link (signup confirmation, magic link). Supabase
// always redirects here (see auth.js's authCallbackUrl()), either with
// a session in the URL hash (success) or with #error=... params (an
// expired or already-used link). Either way this page turns that hash
// into a real UI instead of leaving the raw Supabase error exposed at
// the address bar, and never leaves the tokens/error sitting in the
// URL after it's done with them. See auth.js and docs/auth_setup.md.
import { checkClientReady, renderConfigError, getSession, resendSignupEmail, updatePassword } from "./auth.js";

const configNotice = document.getElementById("configNotice");
const callbackCard = document.getElementById("callbackCard");
const callbackNotice = document.getElementById("callbackNotice");
const callbackFoot = callbackCard.querySelector(".authcard__foot");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Captured synchronously, before any `await` -- the Supabase client's own
// detectSessionInUrl processes (and then strips) this same hash
// asynchronously as part of client init, so reading window.location.hash
// again later, after an `await`, can race it and find nothing left to
// parse. This copy is guaranteed to still hold the original value.
function parseHashParams(raw) {
  const stripped = raw.startsWith("#") ? raw.slice(1) : raw;
  return new URLSearchParams(stripped);
}
const initialHashParams = parseHashParams(window.location.hash);

function clearHash() {
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

function buildNotice(kind, title, message) {
  const div = document.createElement("div");
  div.className = `authnotice authnotice--${kind}`;
  div.setAttribute("role", "alert");
  const titleEl = document.createElement("span");
  titleEl.className = "authnotice__title";
  titleEl.textContent = title;
  const bodyEl = document.createElement("p");
  bodyEl.textContent = message;
  div.append(titleEl, bodyEl);
  return div;
}

function renderNotice(kind, title, message) {
  callbackNotice.innerHTML = "";
  callbackNotice.appendChild(buildNotice(kind, title, message));
}

function renderResendForm(message) {
  renderNotice("err", "Link expired or already used", message);

  const form = document.createElement("form");
  form.className = "formgrid";
  form.setAttribute("novalidate", "");

  const field = document.createElement("div");
  field.className = "formfield";
  const label = document.createElement("label");
  label.className = "formfield__label";
  label.htmlFor = "resendEmail";
  label.innerHTML = 'Email <span class="req">*</span>';
  const input = document.createElement("input");
  input.type = "email";
  input.id = "resendEmail";
  input.name = "email";
  input.autocomplete = "email";
  input.placeholder = "name@organization.com";
  input.required = true;
  const err = document.createElement("span");
  err.className = "formfield__err";
  err.id = "resendEmailErr";
  field.append(label, input, err);

  const submitRow = document.createElement("div");
  submitRow.className = "formsubmit";
  const btn = document.createElement("button");
  btn.className = "btn";
  btn.type = "submit";
  btn.innerHTML = 'Resend verification email <span class="arr" aria-hidden="true">→</span>';
  const loading = document.createElement("span");
  loading.className = "mono";
  loading.style.fontSize = "0.7rem";
  loading.style.color = "var(--text-faint)";
  loading.hidden = true;
  loading.innerHTML = 'Working<span class="loadingdots"></span>';
  submitRow.append(btn, loading);

  const resendNotice = document.createElement("div");

  form.append(field, submitRow, resendNotice);
  callbackCard.insertBefore(form, callbackFoot);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.textContent = "";
    const email = input.value.trim();
    if (!EMAIL_RE.test(email)) {
      err.textContent = "Enter a valid email address.";
      return;
    }
    btn.disabled = true;
    loading.hidden = false;
    resendNotice.innerHTML = "";
    try {
      await resendSignupEmail(email);
      resendNotice.innerHTML = "";
      resendNotice.appendChild(
        buildNotice("ok", "Sent", `A new verification link was sent to ${email}. It expires after a limited time, so open it as soon as it arrives.`)
      );
    } catch (sendErr) {
      resendNotice.innerHTML = "";
      resendNotice.appendChild(
        buildNotice("err", "Could not resend", (sendErr && sendErr.message) || String(sendErr))
      );
    } finally {
      btn.disabled = false;
      loading.hidden = true;
    }
  });
}

function renderSetPasswordForm() {
  renderNotice("info", "Choose a new password", "You're verified. Set a new password to finish resetting your account.");

  const form = document.createElement("form");
  form.className = "formgrid";
  form.setAttribute("novalidate", "");

  const field = document.createElement("div");
  field.className = "formfield";
  const label = document.createElement("label");
  label.className = "formfield__label";
  label.htmlFor = "newPassword";
  label.innerHTML = 'New password <span class="req">*</span>';
  const input = document.createElement("input");
  input.type = "password";
  input.id = "newPassword";
  input.name = "password";
  input.autocomplete = "new-password";
  input.placeholder = "••••••••";
  const err = document.createElement("span");
  err.className = "formfield__err";
  err.id = "newPasswordErr";
  field.append(label, input, err);

  const submitRow = document.createElement("div");
  submitRow.className = "formsubmit";
  const btn = document.createElement("button");
  btn.className = "btn";
  btn.type = "submit";
  btn.innerHTML = 'Set new password <span class="arr" aria-hidden="true">→</span>';
  const loading = document.createElement("span");
  loading.className = "mono";
  loading.style.fontSize = "0.7rem";
  loading.style.color = "var(--text-faint)";
  loading.hidden = true;
  loading.innerHTML = 'Working<span class="loadingdots"></span>';
  submitRow.append(btn, loading);

  const resultNotice = document.createElement("div");

  form.append(field, submitRow, resultNotice);
  callbackCard.insertBefore(form, callbackFoot);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.textContent = "";
    if (input.value.length < 8) {
      err.textContent = "Use at least 8 characters.";
      return;
    }
    btn.disabled = true;
    loading.hidden = false;
    resultNotice.innerHTML = "";
    try {
      await updatePassword(input.value);
      form.hidden = true;
      resultNotice.appendChild(buildNotice("ok", "Password updated", "Redirecting to the partner portal..."));
      setTimeout(() => {
        window.location.replace("partner-portal.html");
      }, 900);
    } catch (updateErr) {
      resultNotice.appendChild(
        buildNotice("err", "Could not update password", (updateErr && updateErr.message) || String(updateErr))
      );
    } finally {
      btn.disabled = false;
      loading.hidden = true;
    }
  });
}

async function run() {
  const status = await checkClientReady();
  if (!status.ready) {
    renderConfigError(configNotice, status.message);
    return;
  }

  if (initialHashParams.has("error")) {
    const code = initialHashParams.get("error_code") || "";
    clearHash();
    const message =
      code === "otp_expired"
        ? "This verification link has expired or was already used (some email apps pre-open links automatically, which can use it up before you click it). Enter your email below and we'll send a new one."
        : "This link is no longer valid. Enter your email below and we'll send a new one.";
    renderResendForm(message);
    return;
  }

  const isRecovery = initialHashParams.get("type") === "recovery";
  const session = await getSession().catch(() => null);
  clearHash();
  if (session && isRecovery) {
    renderSetPasswordForm();
  } else if (session) {
    renderNotice("ok", "Verified", `Signed in as ${session.user.email}. Redirecting to the partner portal...`);
    setTimeout(() => {
      window.location.replace("partner-portal.html");
    }, 900);
  } else {
    renderNotice(
      "info",
      "Nothing to confirm",
      "No pending verification was found for this link. If you just signed up, check your email for the confirmation link, or sign in below."
    );
  }
}

run();
