import { useEffect, useState } from 'react';
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
      <section className="authpage">
        <div className="wrap authpage__layout">
          <div className="authpage__intro">
            <a className="authpage__back mono" href="/">← Back to Helicyn</a>
            <div>
              <span className="eyebrow mono">Partner workspace</span>
              <h1>Operate with the full picture.</h1>
              <p>
                Secure access for founding partners to review applications, shared work, and account
                settings in one place.
              </p>
            </div>
            <div className="authpage__signals" aria-label="Workspace capabilities">
              <div><span className="authpage__signal" />Application status</div>
              <div><span className="authpage__signal" />Partner workspace</div>
              <div><span className="authpage__signal" />Account controls</div>
            </div>
            <p className="authpage__foot mono">Pre-commercial research preview · Authorized access only</p>
          </div>

          <div className="authform">
            <div className="authform__head">
              <span className="eyebrow mono">Secure access</span>
              <h2>{mode === 'signup' ? 'Create your account' : mode === 'magic' ? 'Email a sign-in link' : 'Welcome back'}</h2>
              <p>
                {mode === 'signup'
                  ? 'Set up access to the Helicyn partner workspace.'
                  : mode === 'magic'
                    ? 'No password needed. We will send a single-use link.'
                    : 'Sign in to continue to your partner workspace.'}
              </p>
            </div>

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
              <div className="authform__options">
                <label className="field field--check">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                  <span>Keep me signed in</span>
                </label>
                {mode === 'signin' && (
                  <button type="button" className="authform__link" onClick={onReset}>
                    Forgot password?
                  </button>
                )}
              </div>

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

              <button className="authform__submit" type="submit" disabled={busy}>
              {busy
                ? 'Working…'
                : mode === 'signin'
                  ? 'Sign in'
                  : mode === 'signup'
                    ? 'Create account'
                    : 'Send magic link'}
            </button>

            </form>
            <p className="authform__privacy">
              By continuing, you agree to use this workspace only for authorized partner activity.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
