import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Seo } from '@/components/common/Seo';
import { getSession, resendSignupEmail, updatePassword } from '@/services/auth';

type State = 'working' | 'recovery' | 'error' | 'done';

/**
 * Single callback endpoint for email confirmation, magic-link, and password
 * recovery links. Supabase establishes the session from the URL; we then either
 * show a set-new-password form (recovery) or continue into the portal.
 */
export default function AuthCallbackPage() {
  const [state, setState] = useState<State>('working');
  const [message, setMessage] = useState<string>('Finishing sign-in…');
  const [password, setPassword] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const isRecovery =
      window.location.hash.includes('type=recovery') ||
      new URLSearchParams(window.location.search).get('type') === 'recovery';

    // Give the Supabase client a moment to detect the session from the URL.
    const id = window.setTimeout(async () => {
      try {
        const session = await getSession();
        if (isRecovery && session) {
          setState('recovery');
          return;
        }
        if (session) {
          setState('done');
          navigate('/partner-portal', { replace: true });
          return;
        }
        setState('error');
        setMessage(
          'This link is invalid or has expired (it may have already been used). Request a new one below.',
        );
      } catch {
        setState('error');
        setMessage('We could not complete sign-in. Request a new link below.');
      }
    }, 600);
    return () => window.clearTimeout(id);
  }, [navigate]);

  const onSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updatePassword(password);
      setState('done');
      navigate('/partner-portal', { replace: true });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not update password.');
      setState('error');
    }
  };

  const onResend = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await resendSignupEmail(resendEmail);
      setMessage('A fresh confirmation email is on the way. Check your inbox.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not resend the email.');
    }
  };

  return (
    <div className="page page--authcallback">
      <Seo title="Helicyn · Signing in" canonicalPath="/auth-callback" noindex openGraph={false} />
      <section className="section">
        <div className="wrap authform">
          {state === 'working' && (
            <>
              <span className="route-fallback__spinner" aria-hidden="true" />
              <p className="mono">{message}</p>
            </>
          )}

          {state === 'recovery' && (
            <>
              <h1>Set a new password</h1>
              <form className="authform__form" onSubmit={onSetPassword}>
                <label className="field">
                  <span className="field__label">New password</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <button className="navlink navlink--cta" type="submit">
                  Update password
                </button>
              </form>
            </>
          )}

          {state === 'error' && (
            <>
              <h1>Link problem</h1>
              <p className="form-note err" role="alert">
                {message}
              </p>
              <form className="authform__form" onSubmit={onResend}>
                <label className="field">
                  <span className="field__label">Email</span>
                  <input
                    type="email"
                    required
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                  />
                </label>
                <button className="navlink navlink--cta" type="submit">
                  Resend confirmation email
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
