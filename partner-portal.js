// /partner-portal page logic: requires a real signed-in Supabase session.
// Shows only real account/application data -- no fake customer data,
// billing, telemetry, or deployments. See auth.js and docs/auth_setup.md.
import {
  checkClientReady,
  renderConfigError,
  getSession,
  onAuthStateChange,
  signOut,
  getMyFoundingPartnerApplication,
} from "./auth.js";

const configNotice = document.getElementById("configNotice");
const signInRequired = document.getElementById("signInRequired");
const portalView = document.getElementById("portalView");
const portalEmail = document.getElementById("portalEmail");
const portalSignOutBtn = document.getElementById("portalSignOutBtn");
const statusPill = document.getElementById("statusPill");
const applicationSummary = document.getElementById("applicationSummary");
const noApplication = document.getElementById("noApplication");

const STATUS_LABELS = {
  not_started: "Not started",
  submitted: "Submitted",
  reviewing: "Reviewing",
  accepted: "Accepted",
  waitlisted: "Waitlisted",
  declined: "Declined",
};

function renderStatusPill(status) {
  const key = status || "not_started";
  const label = STATUS_LABELS[key] || key;
  statusPill.innerHTML = "";
  const pill = document.createElement("span");
  pill.className = `statuspill statuspill--${key}`;
  const dot = document.createElement("span");
  dot.className = "d";
  dot.setAttribute("aria-hidden", "true");
  pill.append(dot, document.createTextNode(label));
  statusPill.appendChild(pill);
}

function renderApplication(app) {
  if (!app) {
    renderStatusPill("not_started");
    applicationSummary.hidden = true;
    noApplication.hidden = false;
    return;
  }
  renderStatusPill(app.status);
  applicationSummary.hidden = false;
  noApplication.hidden = true;
  applicationSummary.querySelector('[data-app="company_name"]').textContent = app.company_name || "—";
  applicationSummary.querySelector('[data-app="created_at"]').textContent = app.created_at
    ? new Date(app.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : "—";
  const interests = Array.isArray(app.founding_partner_interests) ? app.founding_partner_interests : [];
  applicationSummary.querySelector('[data-app="founding_partner_interests"]').textContent =
    interests.length > 0 ? interests.join(", ") : "—";
}

async function init() {
  const session = await getSession().catch(() => null);
  if (!session) {
    signInRequired.hidden = false;
    portalView.hidden = true;
    return;
  }

  signInRequired.hidden = true;
  portalView.hidden = false;
  portalEmail.textContent = session.user.email;

  try {
    const app = await getMyFoundingPartnerApplication();
    renderApplication(app);
  } catch (err) {
    renderStatusPill("not_started");
    applicationSummary.hidden = true;
    noApplication.hidden = false;
    noApplication.querySelector("p").textContent = `Could not load your application: ${err.message || err}`;
  }
}

async function start() {
  const status = await checkClientReady();
  if (!status.ready) {
    renderConfigError(configNotice, status.message);
    portalView.hidden = true;
    signInRequired.hidden = true;
    return;
  }
  portalSignOutBtn.addEventListener("click", async () => {
    await signOut();
    window.location.href = "login.html";
  });
  await onAuthStateChange(() => init());
  await init();
}

start();
