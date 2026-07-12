// /onboarding page logic: requires a real signed-in session, then writes
// a real row to founding_partner_applications (Supabase). No fake
// success on a failed submission. See auth.js and docs/auth_setup.md.
import {
  checkClientReady,
  renderConfigError,
  getSession,
  onAuthStateChange,
  submitFoundingPartnerApplication,
  getMyFoundingPartnerApplication,
} from "./auth.js";

const configNotice = document.getElementById("configNotice");
const authGate = document.getElementById("authGate");
const alreadySubmitted = document.getElementById("alreadySubmitted");
const successView = document.getElementById("successView");
const form = document.getElementById("onboardingForm");
const submitBtn = document.getElementById("submitBtn");
const submitLoading = document.getElementById("submitLoading");
const submitNotice = document.getElementById("submitNotice");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clearErrors() {
  form.querySelectorAll("[data-err-for]").forEach((el) => {
    el.textContent = "";
    const wrap = el.closest(".formfield, .checkfield");
    if (wrap) wrap.classList.remove("formfield--invalid");
  });
}

function setErr(field, message) {
  const el = form.querySelector(`[data-err-for="${field}"]`);
  if (!el) return;
  el.textContent = message;
  const wrap = el.closest(".formfield, .checkfield") || el.previousElementSibling;
  if (wrap && wrap.classList) {
    wrap.classList.remove("formfield--invalid");
    void wrap.offsetWidth; // restart the shake animation even if already invalid
    wrap.classList.add("formfield--invalid");
  }
}

function setNotice(kind, title, message) {
  if (!message) {
    submitNotice.innerHTML = "";
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
  submitNotice.innerHTML = "";
  submitNotice.appendChild(div);
}

function validate(fields) {
  clearErrors();
  let ok = true;
  if (!fields.company_name.trim()) {
    setErr("company_name", "Company name is required.");
    ok = false;
  }
  if (!fields.name.trim()) {
    setErr("name", "Name is required.");
    ok = false;
  }
  if (!EMAIL_RE.test(fields.email.trim())) {
    setErr("email", "Enter a valid email address.");
    ok = false;
  }
  if (!fields.consent_precommercial) {
    setErr("consent_precommercial", "This confirmation is required to submit an application.");
    ok = false;
  }
  return ok;
}

function collectFields() {
  const data = new FormData(form);
  return {
    company_name: (data.get("company_name") || "").toString(),
    website: (data.get("website") || "").toString() || null,
    industry: (data.get("industry") || "").toString() || null,
    company_size: (data.get("company_size") || "").toString() || null,
    region: (data.get("region") || "").toString() || null,
    name: (data.get("name") || "").toString(),
    email: (data.get("email") || "").toString(),
    role_title: (data.get("role_title") || "").toString() || null,
    linkedin: (data.get("linkedin") || "").toString() || null,
    relationship_to_data_centers: (data.get("relationship_to_data_centers") || "").toString() || null,
    infrastructure_scale: (data.get("infrastructure_scale") || "").toString() || null,
    primary_concern: (data.get("primary_concern") || "").toString() || null,
    founding_partner_interests: data.getAll("founding_partner_interests").map(String),
    message: (data.get("message") || "").toString() || null,
    consent_precommercial: data.get("consent_precommercial") === "on",
  };
}

async function handleSubmit(e) {
  e.preventDefault();
  setNotice();
  const fields = collectFields();
  if (!validate(fields)) return;

  submitBtn.disabled = true;
  submitLoading.hidden = false;
  try {
    await submitFoundingPartnerApplication(fields);
    form.hidden = true;
    successView.hidden = false;
  } catch (err) {
    setNotice("err", "Submission failed", err.message || String(err));
  } finally {
    submitBtn.disabled = false;
    submitLoading.hidden = true;
  }
}

async function init() {
  const session = await getSession().catch(() => null);
  if (!session) {
    authGate.hidden = false;
    form.hidden = true;
    return;
  }

  const emailField = document.getElementById("email");
  const nameField = document.getElementById("name");
  const roleTitleField = document.getElementById("role_title");
  const linkedinField = document.getElementById("linkedin");
  const meta = session.user.user_metadata || {};
  if (!emailField.value) emailField.value = session.user.email || "";
  if (!nameField.value) nameField.value = meta.full_name || "";
  if (!roleTitleField.value) roleTitleField.value = meta.job_title || "";
  if (!linkedinField.value) linkedinField.value = meta.linkedin_url || "";

  const existing = await getMyFoundingPartnerApplication().catch(() => null);
  if (existing) {
    alreadySubmitted.hidden = false;
    form.hidden = true;
    return;
  }

  authGate.hidden = true;
  form.hidden = false;
}

async function start() {
  const status = await checkClientReady();
  if (!status.ready) {
    renderConfigError(configNotice, status.message);
    form.hidden = true;
    return;
  }
  form.addEventListener("submit", handleSubmit);
  await onAuthStateChange(() => init());
  await init();
}

start();
