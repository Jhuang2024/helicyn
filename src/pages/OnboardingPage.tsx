import { useEffect, useState } from 'react';
import { Seo } from '@/components/common/Seo';
import { AuthGate } from '@/components/common/AuthGate';
import { CustomSelect } from '@/components/common/CustomSelect';
import {
  getMyFoundingPartnerApplication,
  submitFoundingPartnerApplication,
} from '@/services/auth';

const RELATIONSHIP_OPTIONS = [
  { value: '', label: 'Select one' },
  { value: 'operator', label: 'Operator' },
  { value: 'cloud_platform_team', label: 'Cloud / platform team' },
  { value: 'ai_infrastructure_team', label: 'AI infrastructure team' },
  { value: 'energy_cooling_vendor', label: 'Energy / cooling vendor' },
  { value: 'investor_advisor', label: 'Investor / advisor' },
  { value: 'researcher', label: 'Researcher' },
  { value: 'other', label: 'Other' },
] as const;

const SCALE_OPTIONS = [
  { value: '', label: 'Select one' },
  { value: 'exploratory_research', label: 'Exploratory / research' },
  { value: 'single_site', label: 'Single site' },
  { value: 'multi_site', label: 'Multi-site' },
  { value: 'cloud_hybrid', label: 'Cloud / hybrid' },
  { value: 'large_fleet', label: 'Large fleet' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
] as const;

const CONCERN_OPTIONS = [
  { value: '', label: 'Select one' },
  { value: 'energy_cost', label: 'Energy cost' },
  { value: 'carbon_intensity', label: 'Carbon intensity' },
  { value: 'cooling_thermal_constraints', label: 'Cooling / thermal constraints' },
  { value: 'gpu_utilization', label: 'GPU utilization' },
  { value: 'workload_placement', label: 'Workload placement' },
  { value: 'peak_power', label: 'Peak power' },
  { value: 'research_collaboration', label: 'Research collaboration' },
  { value: 'other', label: 'Other' },
] as const;

const INTERESTS = [
  ['early_access', 'Early access'],
  ['technical_review', 'Technical review'],
  ['product_feedback', 'Product feedback'],
  ['pilot_later', 'Pilot later'],
  ['research_collaboration', 'Research collaboration'],
  ['pricing_founding_partner_terms', 'Pricing / founding partner terms'],
] as const;

function OnboardingForm() {
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);

  useEffect(() => {
    getMyFoundingPartnerApplication()
      .then((app) => {
        if (app) setAlreadySubmitted(true);
      })
      .catch(() => {});
  }, []);

  const toggleInterest = (v: string) =>
    setInterests((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    if (!fd.get('consent_precommercial')) {
      setError('Please confirm you understand Helicyn is a pre-commercial research project.');
      return;
    }
    const payload = {
      company_name: fd.get('company_name'),
      website: fd.get('website'),
      industry: fd.get('industry'),
      company_size: fd.get('company_size'),
      region: fd.get('region'),
      name: fd.get('name'),
      email: fd.get('email'),
      role_title: fd.get('role_title'),
      linkedin: fd.get('linkedin'),
      relationship_to_data_centers: fd.get('relationship_to_data_centers'),
      infrastructure_scale: fd.get('infrastructure_scale'),
      primary_concern: fd.get('primary_concern'),
      founding_partner_interests: interests,
      message: fd.get('message'),
      consent_precommercial: true,
    };
    setBusy(true);
    try {
      await submitFoundingPartnerApplication(payload);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit your application.');
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <div className="authnotice authnotice--ok">
        <h2>Application received</h2>
        <p>Thanks. Your founding-partner application is in. We&apos;ll follow up with next steps.</p>
      </div>
    );
  }

  return (
    <>
      {alreadySubmitted && (
        <div className="authnotice authnotice--ok" style={{ marginBottom: '2rem' }}>
          You&apos;ve already submitted a founding-partner application. Submitting again will add a new
          entry.
        </div>
      )}
      <form className="onboarding-form" onSubmit={onSubmit} noValidate>
        <fieldset className="formsection">
          <legend className="eyebrow">Company</legend>
          <label className="field">
            <span className="field__label">Company name *</span>
            <input type="text" name="company_name" required />
          </label>
          <label className="field">
            <span className="field__label">Website</span>
            <input type="url" name="website" placeholder="https://" />
          </label>
          <label className="field">
            <span className="field__label">Industry</span>
            <input type="text" name="industry" />
          </label>
          <label className="field">
            <span className="field__label">Company size</span>
            <input type="text" name="company_size" placeholder="e.g. 50-200" />
          </label>
          <label className="field">
            <span className="field__label">Region</span>
            <input type="text" name="region" />
          </label>
        </fieldset>

        <fieldset className="formsection">
          <legend className="eyebrow">Contact</legend>
          <label className="field">
            <span className="field__label">Name *</span>
            <input type="text" name="name" required />
          </label>
          <label className="field">
            <span className="field__label">Email *</span>
            <input type="email" name="email" required />
          </label>
          <label className="field">
            <span className="field__label">Role / title</span>
            <input type="text" name="role_title" />
          </label>
          <label className="field">
            <span className="field__label">LinkedIn</span>
            <input type="url" name="linkedin" placeholder="https://linkedin.com/in/..." />
          </label>
        </fieldset>

        <fieldset className="formsection">
          <legend className="eyebrow">Infrastructure</legend>
          <div className="field">
            <span className="field__label" id="relationship-label">Relationship to data centers</span>
            <CustomSelect
              name="relationship_to_data_centers"
              options={RELATIONSHIP_OPTIONS}
              ariaLabelledBy="relationship-label"
            />
          </div>
          <div className="field">
            <span className="field__label" id="scale-label">Infrastructure scale</span>
            <CustomSelect
              name="infrastructure_scale"
              options={SCALE_OPTIONS}
              ariaLabelledBy="scale-label"
            />
          </div>
          <div className="field">
            <span className="field__label" id="concern-label">Primary concern</span>
            <CustomSelect
              name="primary_concern"
              options={CONCERN_OPTIONS}
              ariaLabelledBy="concern-label"
            />
          </div>
        </fieldset>

        <fieldset className="formsection">
          <legend className="eyebrow">Interests</legend>
          <div className="checkgroup">
            {INTERESTS.map(([v, l]) => (
              <label key={v} className="field--check">
                <input
                  type="checkbox"
                  name="founding_partner_interests"
                  value={v}
                  checked={interests.includes(v)}
                  onChange={() => toggleInterest(v)}
                />
                <span>{l}</span>
              </label>
            ))}
          </div>
          <label className="field">
            <span className="field__label">Message</span>
            <textarea name="message" placeholder="Anything else we should know?" />
          </label>
        </fieldset>

        <fieldset className="formsection">
          <legend className="eyebrow">Consent</legend>
          <label className="field--check">
            <input type="checkbox" name="consent_precommercial" required />
            <span>
              I understand Helicyn is currently a pre-commercial research/prototype project. *
            </span>
          </label>
        </fieldset>

        {error && (
          <p className="form-note err" role="alert">
            {error}
          </p>
        )}

        <div className="formsubmit">
          <button className="navlink navlink--cta" type="submit" disabled={busy}>
            {busy ? 'Submitting…' : 'Submit application'} <span className="arr" aria-hidden="true">→</span>
          </button>
        </div>
      </form>
    </>
  );
}

export default function OnboardingPage() {
  return (
    <div className="page page--onboarding">
      <Seo
        title="Helicyn · Founding Partner Application"
        description="Apply to become a Helicyn founding partner: early access to an AI coordination layer for GPU workloads and data center energy, plus launch pricing."
        canonicalPath="/onboarding"
        ogType="website"
      />
      <section className="section">
        <div className="wrap">
          <span className="eyebrow mono" data-reveal>
            Founding partner application
          </span>
          <h1>Apply as a founding partner</h1>
          <p style={{ color: 'var(--text-dim)', maxWidth: '58ch' }}>
            Founding partners get early access, direct product input, priority onboarding, and
            preferred launch pricing when Helicyn launches. Submit your interest and we&apos;ll follow up
            with next steps.
          </p>
          <AuthGate title="Sign in to apply">
            <OnboardingForm />
          </AuthGate>
        </div>
      </section>
    </div>
  );
}
