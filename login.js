// /login page logic: real Supabase auth (password or magic link), no
// fake users, no manually stored passwords. See auth.js and
// docs/auth_setup.md.
import {
  checkClientReady,
  renderConfigError,
  getSession,
  onAuthStateChange,
  signUpWithPassword,
  signInWithPassword,
  signInWithMagicLink,
  signOut,
  requestPasswordReset,
  setRememberMe,
} from "./auth.js";

const configNotice = document.getElementById("configNotice");
const authView = document.getElementById("authView");
const signedInView = document.getElementById("signedInView");
const signedInEmail = document.getElementById("signedInEmail");
const signOutBtn = document.getElementById("signOutBtn");
const authForm = document.getElementById("authForm");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authPasswordField = document.getElementById("authPasswordField");
const authSignupFields = document.getElementById("authSignupFields");
const authFullName = document.getElementById("authFullName");
const authJobTitle = document.getElementById("authJobTitle");
const authSignupExtras = document.getElementById("authSignupExtras");
const authNewsletter = document.getElementById("authNewsletter");
const authTerms = document.getElementById("authTerms");
const authTermsErr = document.getElementById("authTermsErr");
const authRememberMe = document.getElementById("authRememberMe");
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
const forgotPasswordNotice = document.getElementById("forgotPasswordNotice");
const authSubmitBtn = document.getElementById("authSubmitBtn");
const authLoading = document.getElementById("authLoading");
const authNotice = document.getElementById("authNotice");
const authEmailErr = document.getElementById("authEmailErr");
const authPasswordErr = document.getElementById("authPasswordErr");
const authFullNameErr = document.getElementById("authFullNameErr");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let mode = "signin"; // "signin" | "signup"
let method = "password"; // "password" | "magic"

function updateSubmitLabel() {
  if (method === "magic") {
    authSubmitBtn.innerHTML = 'Send magic link <span class="arr" aria-hidden="true">→</span>';
  } else {
    authSubmitBtn.innerHTML =
      (mode === "signup" ? "Sign up" : "Sign in") + ' <span class="arr" aria-hidden="true">→</span>';
  }
}

document.querySelectorAll("[data-auth-tab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    mode = btn.dataset.authTab;
    document.querySelectorAll("[data-auth-tab]").forEach((b) => {
      b.classList.toggle("is-active", b === btn);
      b.setAttribute("aria-selected", b === btn ? "true" : "false");
    });
    authSignupFields.hidden = mode !== "signup";
    authSignupExtras.hidden = mode !== "signup";
    forgotPasswordBtn.hidden = mode !== "signin";
    forgotPasswordNotice.innerHTML = "";
    authFullNameErr.textContent = "";
    authTermsErr.textContent = "";
    clearFieldInvalid(authFullName);
    updateSubmitLabel();
  });
});

document.querySelectorAll("[data-auth-method]").forEach((btn) => {
  btn.addEventListener("click", () => {
    method = btn.dataset.authMethod;
    document.querySelectorAll("[data-auth-method]").forEach((b) => b.classList.toggle("is-active", b === btn));
    authPasswordField.hidden = method === "magic";
    updateSubmitLabel();
  });
});

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

function setNotice(kind, title, message) {
  authNotice.innerHTML = "";
  if (!message) return;
  authNotice.appendChild(buildNotice(kind, title, message));
}

forgotPasswordBtn.addEventListener("click", async () => {
  forgotPasswordNotice.innerHTML = "";
  authEmailErr.textContent = "";
  clearFieldInvalid(authEmail);
  const email = authEmail.value.trim();
  if (!EMAIL_RE.test(email)) {
    markInvalid(authEmail, authEmailErr, "Enter a valid email address to reset your password.");
    return;
  }
  forgotPasswordBtn.disabled = true;
  try {
    await requestPasswordReset(email);
    forgotPasswordNotice.appendChild(
      buildNotice("ok", "Check your email", `A password reset link was sent to ${email}.`)
    );
  } catch (err) {
    forgotPasswordNotice.appendChild(
      buildNotice("err", "Could not send reset email", err.message || String(err))
    );
  } finally {
    forgotPasswordBtn.disabled = false;
  }
});

function markInvalid(input, errEl, message) {
  errEl.textContent = message;
  const wrap = input.closest(".formfield");
  if (!wrap) return;
  wrap.classList.remove("formfield--invalid");
  void wrap.offsetWidth; // restart the shake animation even if already invalid
  wrap.classList.add("formfield--invalid");
}

function clearFieldInvalid(input) {
  const wrap = input.closest(".formfield");
  if (wrap) wrap.classList.remove("formfield--invalid");
}

async function handleSubmit(e) {
  e.preventDefault();
  setNotice();
  authEmailErr.textContent = "";
  authPasswordErr.textContent = "";
  authFullNameErr.textContent = "";
  authTermsErr.textContent = "";
  clearFieldInvalid(authEmail);
  clearFieldInvalid(authPassword);
  clearFieldInvalid(authFullName);

  const email = authEmail.value.trim();
  if (!EMAIL_RE.test(email)) {
    markInvalid(authEmail, authEmailErr, "Enter a valid email address.");
    return;
  }
  if (method === "password" && !authPassword.value) {
    markInvalid(authPassword, authPasswordErr, "Password is required.");
    return;
  }
  if (mode === "signup" && !authFullName.value.trim()) {
    markInvalid(authFullName, authFullNameErr, "Full name is required.");
    return;
  }
  if (mode === "signup" && !authTerms.checked) {
    authTermsErr.textContent = "You must agree to the Terms and Conditions to create an account.";
    authTerms.focus();
    return;
  }
  const profile =
    mode === "signup"
      ? {
          full_name: authFullName.value.trim(),
          job_title: authJobTitle.value.trim(),
          newsletter_opt_in: authNewsletter.checked,
          terms_accepted_at: new Date().toISOString(),
        }
      : undefined;

  setRememberMe(authRememberMe.checked);

  authSubmitBtn.disabled = true;
  authLoading.hidden = false;
  try {
    if (method === "magic") {
      await signInWithMagicLink(email, profile);
      setNotice(
        "ok",
        "Check your email",
        `A sign-in link was sent to ${email}. Open it on this device to finish signing in.`
      );
    } else if (mode === "signup") {
      await signUpWithPassword(email, authPassword.value, profile);
      setNotice("ok", "Account created", "Check your email to confirm your account, then sign in.");
    } else {
      await signInWithPassword(email, authPassword.value);
      setNotice("ok", "Signed in", "Redirecting to the partner portal...");
      window.location.href = "partner-portal.html";
    }
  } catch (err) {
    setNotice("err", "Could not complete request", err.message || String(err));
  } finally {
    authSubmitBtn.disabled = false;
    authLoading.hidden = true;
  }
}

async function refreshSessionView() {
  const session = await getSession().catch(() => null);
  if (session) {
    signedInView.hidden = false;
    authView.hidden = true;
    signedInEmail.textContent = session.user.email;
  } else {
    signedInView.hidden = true;
    authView.hidden = false;
  }
}

async function init() {
  updateSubmitLabel();
  const status = await checkClientReady();
  if (!status.ready) {
    renderConfigError(configNotice, status.message);
    authView.querySelectorAll("input, button, select, textarea").forEach((el) => {
      el.disabled = true;
    });
    return;
  }
  authForm.addEventListener("submit", handleSubmit);
  signOutBtn.addEventListener("click", async () => {
    await signOut();
    await refreshSessionView();
  });
  await onAuthStateChange(() => refreshSessionView());
  await refreshSessionView();
}

init();
