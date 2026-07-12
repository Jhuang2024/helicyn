import { useEffect, useState } from 'react';
import { Seo } from '@/components/common/Seo';
import { AuthGate } from '@/components/common/AuthGate';
import { getMyJobApplications, submitJobApplication } from '@/services/auth';

interface Role {
  key: string;
  title: string;
  desc: string;
  q1: string;
  q2: string;
  resumeLabel: string;
}

const ROLES: Role[] = [
  {
    key: 'cto',
    title: 'Chief Technology Officer',
    desc: 'Own the simulator, ML prototype, and technical roadmap end to end.',
    q1: "What's the most technically complex system or project you've built, and what was the hardest part?",
    q2: 'Why does treating ML as a coordination layer, rather than isolated optimization, interest you technically?',
    resumeLabel: 'Resume / GitHub / portfolio link',
  },
  {
    key: 'coo',
    title: 'Chief Operating Officer',
    desc: 'Keep a small team, its partners, and its timelines on track.',
    q1: 'Describe a time you kept a small team or project on track under ambiguity.',
    q2: 'How would you prioritize the first 90 days of operations at a 4-person, pre-seed startup?',
    resumeLabel: 'Resume / portfolio link',
  },
  {
    key: 'cmo',
    title: 'Chief Marketing Officer',
    desc: "Shape how Helicyn's coordination-first thesis reaches operators and partners.",
    q1: "Pitch Helicyn's positioning in three or four sentences, as if to a technical data center operator.",
    q2: "What's a growth or content channel you'd bet on first for a deep-tech, pre-commercial startup, and why?",
    resumeLabel: 'Resume / portfolio link',
  },
  {
    key: 'cfo',
    title: 'Chief Financial Officer',
    desc: 'Own the model, the runway, and the eventual pricing mechanics.',
    q1: "What's your experience with financial modeling, fundraising, or startup accounting?",
    q2: 'How would you think about runway and pricing for a pre-commercial company that only charges on verified savings later?',
    resumeLabel: 'Resume / portfolio link',
  },
];

function RoleForm({ role, applied }: { role: Role; applied: boolean }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (applied || done) {
    return (
      <div className="hirecard__already">
        <p style={{ color: 'var(--text-dim)' }}>
          You&apos;ve already applied for this role. We&apos;ll follow up by email.
        </p>
      </div>
    );
  }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    if (!fd.get('eligible')) {
      setError('Please confirm your UC Berkeley / SF Bay Area eligibility.');
      return;
    }
    setBusy(true);
    try {
      await submitJobApplication({
        role: role.key,
        full_name: fd.get('full_name'),
        email: fd.get('email'),
        linkedin: fd.get('linkedin'),
        resume_url: fd.get('resume_url'),
        availability: fd.get('availability'),
        q1: fd.get('q1'),
        q2: fd.get('q2'),
        eligible: true,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit your application.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="hireform" onSubmit={onSubmit} noValidate>
      <label className="field">
        <span className="field__label">Full name *</span>
        <input type="text" name="full_name" required />
      </label>
      <label className="field">
        <span className="field__label">Email *</span>
        <input type="email" name="email" required />
      </label>
      <label className="field">
        <span className="field__label">LinkedIn</span>
        <input type="url" name="linkedin" placeholder="https://linkedin.com/in/..." />
      </label>
      <label className="field">
        <span className="field__label">{role.resumeLabel}</span>
        <input type="url" name="resume_url" placeholder="https://" />
      </label>
      <label className="field">
        <span className="field__label">Availability</span>
        <input type="text" name="availability" placeholder="Hours/week and earliest start date" />
      </label>
      <label className="field">
        <span className="field__label">{role.q1} *</span>
        <textarea name="q1" required />
      </label>
      <label className="field">
        <span className="field__label">{role.q2} *</span>
        <textarea name="q2" required />
      </label>
      <label className="field--check">
        <input type="checkbox" name="eligible" required />
        <span>
          I&apos;m a current UC Berkeley student and based in the San Francisco Bay Area. *
        </span>
      </label>
      {error && (
        <p className="form-note err" role="alert">
          {error}
        </p>
      )}
      <button className="navlink navlink--cta" type="submit" disabled={busy}>
        {busy ? 'Submitting…' : `Apply for ${role.title}`} <span className="arr" aria-hidden="true">→</span>
      </button>
    </form>
  );
}

function CareersBoard() {
  const [applied, setApplied] = useState<Set<string>>(new Set());

  useEffect(() => {
    getMyJobApplications()
      .then((apps) => {
        const roles = new Set<string>();
        for (const a of apps as Array<{ role?: string }>) if (a.role) roles.add(a.role);
        setApplied(roles);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="hirecards">
      {ROLES.map((role) => (
        <details key={role.key} className="hirecard" data-role-card={role.key}>
          <summary className="hirecard__summary">
            <div>
              <span className="hirecard__role">{role.title}</span>
              <p className="hirecard__desc">{role.desc}</p>
            </div>
            <span className="hirecard__toggle" aria-hidden="true">
              +
            </span>
          </summary>
          <div className="hirecard__body">
            <RoleForm role={role} applied={applied.has(role.key)} />
          </div>
        </details>
      ))}
    </div>
  );
}

export default function CareersPage() {
  return (
    <div className="page page--careers">
      <Seo
        title="Helicyn · We're Hiring"
        description="Helicyn is hiring a founding CTO, COO, CMO, and CFO to build an AI coordination layer for data center energy. Open to UC Berkeley students in the Bay Area."
        canonicalPath="/careers"
        ogType="website"
        noindex
        twitterCard
      />
      <section className="section">
        <div className="wrap">
          <span className="eyebrow mono" data-reveal>
            We&apos;re hiring
          </span>
          <h1>Join the founding team</h1>
          <p style={{ color: 'var(--text-dim)', maxWidth: '60ch' }}>
            We&apos;re looking for a small founding team to help build Helicyn: a CTO, COO, CMO, and CFO.
            This round is open only to current UC Berkeley students based in the San Francisco Bay
            Area.
          </p>
          <div className="pagehead__meta">
            <span className="chip">UC Berkeley students</span>
            <span className="chip">SF Bay Area</span>
          </div>
          <AuthGate title="Sign in to apply">
            <CareersBoard />
          </AuthGate>
        </div>
      </section>
    </div>
  );
}
