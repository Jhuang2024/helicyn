import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Seo } from '@/components/common/Seo';
import { AuthGate } from '@/components/common/AuthGate';
import { useAuth } from '@/app/auth/AuthProvider';
import { getMyFoundingPartnerApplication, signOut } from '@/services/auth';

interface Application {
  company_name?: string;
  created_at?: string;
  founding_partner_interests?: string[];
}

const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not started',
  submitted: 'Submitted',
  under_review: 'Under review',
  accepted: 'Accepted',
  waitlisted: 'Waitlisted',
  declined: 'Declined',
};

function Portal() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [app, setApp] = useState<Application | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getMyFoundingPartnerApplication()
      .then((data) => setApp(data as Application | null))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const onSignOut = async () => {
    try {
      await signOut();
    } catch {
      /* ignore */
    }
    navigate('/login');
  };

  const status = app ? 'submitted' : 'not_started';

  return (
    <div className="portal-grid">
      <div className="portalcard">
        <h3>Account</h3>
        <p className="mono" style={{ color: 'var(--text-dim)' }}>
          {user?.email}
        </p>
        <div className="portalcard__actions">
          <Link className="navlink" to="/profile">
            Edit profile
          </Link>
          <button className="navlink" type="button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </div>

      <div className="portalcard">
        <h3>Application status</h3>
        {!loaded ? (
          <p className="mono">Loading…</p>
        ) : (
          <>
            <span className={'status-pill status-pill--' + status}>{STATUS_LABELS[status]}</span>
            {app ? (
              <ul className="portalcard__list">
                {app.company_name && <li>Company: {app.company_name}</li>}
                {app.created_at && <li>Submitted: {new Date(app.created_at).toLocaleDateString()}</li>}
                {app.founding_partner_interests && app.founding_partner_interests.length > 0 && (
                  <li>Interests: {app.founding_partner_interests.join(', ')}</li>
                )}
              </ul>
            ) : (
              <p style={{ color: 'var(--text-dim)' }}>
                You haven&apos;t submitted a founding-partner application yet.{' '}
                <Link to="/onboarding">Apply now →</Link>
              </p>
            )}
          </>
        )}
      </div>

      <div className="portalcard">
        <h3>Founding partner program</h3>
        <ul className="portalcard__list">
          <li>Early access to the coordination layer</li>
          <li>Direct product input and technical review</li>
          <li>Priority onboarding at launch</li>
          <li>Preferred, performance-based launch pricing</li>
        </ul>
      </div>

      <div className="portalcard">
        <h3>Product stages</h3>
        <ul className="portalcard__list">
          <li>Pre-commercial research preview (now)</li>
          <li>Platform subscription at launch</li>
          <li>Performance-based pricing after verified savings</li>
        </ul>
      </div>

      <div className="portalcard">
        <h3>Research</h3>
        <ul className="portalcard__list">
          <li>
            <Link to="/research">Thesis summary</Link>
          </li>
          <li>
            <Link to="/report">Technical report</Link>
          </li>
          <li>
            <Link to="/control-plane">Control Plane demo</Link>
          </li>
        </ul>
      </div>
    </div>
  );
}

export default function PartnerPortalPage() {
  return (
    <div className="page page--portal">
      <Seo title="Helicyn · Partner Portal" canonicalPath="/partner-portal" noindex openGraph={false} />
      <section className="section">
        <div className="wrap">
          <span className="eyebrow mono" data-reveal>
            Partner portal
          </span>
          <h1>Founding partner portal</h1>
          <AuthGate title="Sign in to view your portal">
            <Portal />
          </AuthGate>
        </div>
      </section>
    </div>
  );
}
