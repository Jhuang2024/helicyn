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
const authSubmitBtn = document.getElementById("authSubmitBtn");
const authLoading = document.getElementById("authLoading");
const authNotice = document.getElementById("authNotice");
const authEmailErr = document.getElementById("authEmailErr");
const authPasswordErr = document.getElementById("authPasswordErr");

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

function setNotice(kind, title, message) {
  if (!message) {
    authNotice.innerHTML = "";
    return;
  }
  const div = document.createElement("div");
  div.className = `authnotice authnotice--${kind}`;
  div.setAttribute("role", "alert");
  const titleEl = document.createElement("span");
  titleEl.className = "authnotice__title";
  titleEl.textContent = title;
  const bodyEl = document.createElement("p");
  bodyEl.textContent = message;
  div.append(titleEl, bodyEl);
  authNotice.innerHTML = "";
  authNotice.appendChild(div);
}

async function handleSubmit(e) {
  e.preventDefault();
  setNotice();
  authEmailErr.textContent = "";
  authPasswordErr.textContent = "";

  const email = authEmail.value.trim();
  if (!EMAIL_RE.test(email)) {
    authEmailErr.textContent = "Enter a valid email address.";
    return;
  }
  if (method === "password" && !authPassword.value) {
    authPasswordErr.textContent = "Password is required.";
    return;
  }

  authSubmitBtn.disabled = true;
  authLoading.hidden = false;
  try {
    if (method === "magic") {
      await signInWithMagicLink(email);
      setNotice(
        "ok",
        "Check your email",
        `A sign-in link was sent to ${email}. Open it on this device to finish signing in.`
      );
    } else if (mode === "signup") {
      await signUpWithPassword(email, authPassword.value);
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
