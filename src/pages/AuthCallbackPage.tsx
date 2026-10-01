import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Seo } from '@/components/common/Seo';
import { getSession, resendSignupEmail, requestPasswordReset, signInWithMagicLink, updatePassword } from '@/services/auth';

import { initialAuthCallback } from '@/services/supabase';

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
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const isRecovery = initialAuthCallback.type === 'recovery';
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    async function finish() {
      try {
        if (initialAuthCallback.error) throw new Error('Invalid link');
        const session = await getSession(); // Supabase waits for URL/session initialization.
        if (cancelled) return;
        if (isRecovery && session) { setState('recovery'); return; }
        if (session) {
          setState('done');
          navigate(initialAuthCallback.returnTo, { replace: true });
          return;
        }
        throw new Error('Invalid link');
      } catch {
        if (!cancelled) {
          setState('error');
          setMessage('This link is invalid or has expired. Request a new link below.');
        }
      }
    }
    void finish();
    return () => { cancelled = true; };
  }, [navigate, isRecovery]);

  const onSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await updatePassword(password);
      setState('done');
      navigate(initialAuthCallback.returnTo, { replace: true });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not update password.');
    } finally { setBusy(false); }
  };

  const onResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (isRecovery) await requestPasswordReset(resendEmail.trim());
      else if (initialAuthCallback.type === 'magiclink') await signInWithMagicLink(resendEmail.trim());
      else await resendSignupEmail(resendEmail.trim());
      setSent(true);
      setMessage('A fresh email is on the way. Check your inbox.');
    } catch (err) {
      setSent(false);
      setMessage(err instanceof Error ? err.message : 'Could not resend the email.');
    } finally { setBusy(false); }
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
              {message !== 'Finishing sign-in…' && <p role="alert" className="form-note err">{message}</p>}
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
                <button className="navlink navlink--cta" type="submit" disabled={busy}>
                  Update password
                </button>
              </form>
            </>
          )}

          {state === 'error' && (
            <>
              <h1>Link problem</h1>
              <p className={sent ? "form-note ok" : "form-note err"} role={sent ? "status" : "alert"}>
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
                <button className="navlink navlink--cta" type="submit" disabled={busy}>
                  {isRecovery ? 'Send password reset link' : initialAuthCallback.type === 'magiclink' ? 'Send sign-in link' : 'Resend confirmation email'}
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
