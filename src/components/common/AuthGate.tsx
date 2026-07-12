import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/auth/AuthProvider';

/**
 * Client-side auth gate. Mirrors the legacy inline gates (no redirect): while
 * loading it shows nothing, signed-out users see a sign-in prompt, and signed-in
 * users see the gated content.
 */
export function AuthGate({ children, title }: { children: ReactNode; title?: string }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="route-fallback" role="status" aria-live="polite">
        <span className="route-fallback__spinner" aria-hidden="true" />
        <span className="mono">Checking your session…</span>
      </div>
    );
  }

  if (!user) {
    return (
      <section className="section">
        <div className="wrap authgate">
          <span className="eyebrow mono">Sign in required</span>
          <h2>{title ?? 'Please sign in'}</h2>
          <p style={{ color: 'var(--text-dim)', maxWidth: '54ch' }}>
            You need a Helicyn account to view this page. Sign in or create one to continue.
          </p>
          <div className="authgate__actions">
            <Link className="navlink navlink--cta" to="/login">
              Sign in <span className="arr" aria-hidden="true">↗</span>
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return <>{children}</>;
}
