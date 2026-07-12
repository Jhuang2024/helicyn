import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Seo } from '@/components/common/Seo';
import { useAuth } from '@/app/auth/AuthProvider';
import {
  CONFIG_ERROR_MESSAGE,
  isSupabaseConfigured,
  requestPasswordReset,
  setRememberMe,
  signInWithMagicLink,
  signInWithPassword,
  signUpWithPassword,
} from '@/services/auth';
import { useEffect } from 'react';

type Mode = 'signin' | 'signup' | 'magic';

function messageFor(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Something went wrong. Please try again.';
}

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  // Already signed in → straight to the portal.
  useEffect(() => {
    if (user) navigate('/partner-portal', { replace: true });
  }, [user, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!isSupabaseConfigured) {
      setError(CONFIG_ERROR_MESSAGE);
      return;
    }
    setBusy(true);
    setRememberMe(remember);
    try {
      if (mode === 'signin') {
        await signInWithPassword(email, password);
        navigate('/partner-portal');
      } else if (mode === 'signup') {
        await signUpWithPassword(email, password, { full_name: fullName });
        setNotice('Check your inbox to confirm your email, then sign in.');
      } else {
        await signInWithMagicLink(email);
        setNotice('Magic link sent. Check your inbox to finish signing in.');
      }
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  };

  const onReset = async () => {
    setError(null);
    setNotice(null);
    if (!email) {
      setError('Enter your email first, then request a reset link.');
      return;
    }
    try {
      await requestPasswordReset(email);
      setNotice('Password reset link sent. Check your inbox.');
    } catch (err) {
      setError(messageFor(err));
    }
  };

  return (
    <div className="page page--login">
      <Seo title="Helicyn · Login" canonicalPath="/login" noindex openGraph={false} />
      <section className="section">
        <div className="wrap authform">
          <span className="eyebrow mono" data-reveal>
            Partner access
          </span>
          <h1>Sign in to Helicyn</h1>
          <p style={{ color: 'var(--text-dim)', maxWidth: '52ch' }}>
            Access the founding-partner portal, your application status, and account settings. This
            is a pre-commercial research preview.
          </p>

          <div className="authform__tabs" role="tablist" aria-label="Authentication mode">
            {(['signin', 'signup', 'magic'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                className={'authform__tab' + (mode === m ? ' is-active' : '')}
                onClick={() => {
                  setMode(m);
                  setError(null);
                  setNotice(null);
                }}
              >
                {m === 'signin' ? 'Sign in' : m === 'signup' ? 'Create account' : 'Magic link'}
              </button>
            ))}
          </div>

          <form className="authform__form" onSubmit={onSubmit} noValidate>
            {mode === 'signup' && (
              <label className="field">
                <span className="field__label">Full name</span>
                <input
                  type="text"
                  name="full_name"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </label>
            )}
            <label className="field">
              <span className="field__label">Email</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {mode !== 'magic' && (
              <label className="field">
                <span className="field__label">Password</span>
                <input
                  type="password"
                  name="password"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            )}
            <label className="field field--check">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>Save login on this device</span>
            </label>

            {error && (
              <p className="form-note err" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="form-note ok" role="status">
                {notice}
              </p>
            )}

            <button className="navlink navlink--cta authform__submit" type="submit" disabled={busy}>
              {busy
                ? 'Working…'
                : mode === 'signin'
                  ? 'Sign in'
                  : mode === 'signup'
                    ? 'Create account'
                    : 'Send magic link'}
            </button>

            {mode === 'signin' && (
              <button type="button" className="authform__link" onClick={onReset}>
                Forgot password?
              </button>
            )}
          </form>
        </div>
      </section>
    </div>
  );
}
