// /careers page logic: requires a signed-in session, autofills name/email/
// LinkedIn from the profile, then writes a row to job_applications
// (Supabase) per role. See auth.js and docs/auth_setup.md.
import {
  checkClientReady,
  renderConfigError,
  getSession,
  onAuthStateChange,
  submitJobApplication,
  getMyJobApplications,
} from "./auth.js";

const ROLES = ["cto", "coo", "cmo", "cfo"];
const configNotice = document.getElementById("configNotice");
const authGate = document.getElementById("authGate");

// Animated accordion: native <details> snaps open with no transition, so
// this intercepts the toggle and animates height with the Web Animations
// API instead, closing every other card at the same time (single-open
// accordion), while still degrading to plain <details> if JS fails.
function initAccordion() {
  const cards = Array.from(document.querySelectorAll(".hirecard"));
  cards.forEach((card) => {
    const summary = card.querySelector(".hirecard__summary");
    const body = card.querySelector(".hirecard__body");
    summary.addEventListener("click", (e) => {
      e.preventDefault();
      const isOpen = card.open;
      cards.forEach((other) => {
        if (other !== card && other.open) collapse(other);
      });
      if (isOpen) collapse(card);
      else expand(card, body);
    });
  });

  function expand(card, body) {
    card.open = true;
    card.classList.add("pcard-beam");
    const target = body.scrollHeight;
    body.style.overflow = "hidden";
    const anim = body.animate([{ height: "0px" }, { height: `${target}px` }], {
      duration: 260,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    });
    anim.onfinish = () => { body.style.overflow = ""; body.style.height = ""; };
  }

  function collapse(card) {
    card.classList.remove("pcard-beam");
    const body = card.querySelector(".hirecard__body");
    const start = body.scrollHeight;
    body.style.overflow = "hidden";
    const anim = body.animate([{ height: `${start}px` }, { height: "0px" }], {
      duration: 200,
      easing: "cubic-bezier(0.4, 0, 1, 1)",
    });
    anim.onfinish = () => { card.open = false; body.style.overflow = ""; body.style.height = ""; };
  }
}
const rolesWrap = document.getElementById("rolesWrap");

function setNotice(container, kind, title, message) {
  if (!message) {
    container.innerHTML = "";
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
  container.innerHTML = "";
  container.appendChild(div);
}

function collectFields(form, role) {
  const data = new FormData(form);
  return {
    role,
    full_name: (data.get("full_name") || "").toString(),
    email: (data.get("email") || "").toString(),
    linkedin: (data.get("linkedin") || "").toString() || null,
    resume_url: (data.get("resume_url") || "").toString() || null,
    availability: (data.get("availability") || "").toString() || null,
    is_berkeley_student: data.get("eligible") === "on",
    is_sf_based: data.get("eligible") === "on",
    answers: {
      q1: (data.get("q1") || "").toString(),
      q2: (data.get("q2") || "").toString(),
    },
  };
}

function handleSubmit(form, role) {
  return async (e) => {
    e.preventDefault();
    const loading = form.querySelector(".hireform__loading");
    const notice = form.querySelector(".hireform__notice");
    setNotice(notice);

    const fields = collectFields(form, role);
    if (!fields.is_berkeley_student || !fields.is_sf_based) {
      setNotice(notice, "err", "Not eligible", "This round is only open to current UC Berkeley students based in the San Francisco Bay Area.");
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    loading.hidden = false;
    try {
      await submitJobApplication(fields);
      const card = form.closest(".hirecard");
      form.hidden = true;
      card.querySelector(`#${role}_already`).hidden = false;
    } catch (err) {
      setNotice(notice, "err", "Submission failed", err.message || String(err));
    } finally {
      submitBtn.disabled = false;
      loading.hidden = true;
    }
  };
}

async function init() {
  const session = await getSession().catch(() => null);
  if (!session) {
    authGate.hidden = false;
    rolesWrap.hidden = true;
    return;
  }

  const meta = session.user.user_metadata || {};
  ROLES.forEach((role) => {
    const form = document.getElementById(`${role}_form`);
    if (!form) return;
    const nameField = form.querySelector(`#${role}_full_name`);
    const emailField = form.querySelector(`#${role}_email`);
    const linkedinField = form.querySelector(`#${role}_linkedin`);
    if (nameField && !nameField.value) nameField.value = meta.full_name || "";
    if (emailField && !emailField.value) emailField.value = session.user.email || "";
    if (linkedinField && !linkedinField.value) linkedinField.value = meta.linkedin_url || "";
  });

  const existing = await getMyJobApplications().catch(() => []);
  const appliedRoles = new Set(existing.map((a) => a.role));
  ROLES.forEach((role) => {
    const form = document.getElementById(`${role}_form`);
    const already = document.getElementById(`${role}_already`);
    if (!form || !already) return;
    if (appliedRoles.has(role)) {
      form.hidden = true;
      already.hidden = false;
    } else {
      form.hidden = false;
      already.hidden = true;
    }
  });

  authGate.hidden = true;
  rolesWrap.hidden = false;
}

async function start() {
  const status = await checkClientReady();
  if (!status.ready) {
    renderConfigError(configNotice, status.message);
    rolesWrap.hidden = true;
    return;
  }
  ROLES.forEach((role) => {
    const form = document.getElementById(`${role}_form`);
    if (form) form.addEventListener("submit", handleSubmit(form, role));
  });
  initAccordion();
  await onAuthStateChange(() => init());
  await init();
}

start();
