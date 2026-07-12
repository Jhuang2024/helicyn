import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Seo } from '@/components/common/Seo';
import { AuthGate } from '@/components/common/AuthGate';
import { useAuth } from '@/app/auth/AuthProvider';
import { signOut, updateProfile, uploadAvatar } from '@/services/auth';

function ProfileForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const meta = (user?.user_metadata ?? {}) as Record<string, string | boolean | undefined>;
  const [fullName, setFullName] = useState((meta.full_name as string) ?? '');
  const [jobTitle, setJobTitle] = useState((meta.job_title as string) ?? '');
  const [linkedin, setLinkedin] = useState((meta.linkedin_url as string) ?? '');
  const [newsletter, setNewsletter] = useState(Boolean(meta.newsletter_opt_in));
  const [avatar, setAvatar] = useState((meta.avatar_url as string) ?? '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAvatar((meta.avatar_url as string) ?? '');
  }, [meta.avatar_url]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (linkedin && !/^https?:\/\/(www\.)?linkedin\.com\//i.test(linkedin)) {
      setError('Enter a valid linkedin.com URL, or leave it blank.');
      return;
    }
    setBusy(true);
    try {
      await updateProfile({
        full_name: fullName,
        job_title: jobTitle,
        linkedin_url: linkedin,
        newsletter_opt_in: newsletter,
      });
      setNotice('Profile saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile.');
    } finally {
      setBusy(false);
    }
  };

  const onAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Avatar must be a PNG, JPEG, or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Avatar must be 5 MB or smaller.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await uploadAvatar(file);
      const url = (data.user?.user_metadata?.avatar_url as string) ?? '';
      if (url) setAvatar(url);
      setNotice('Profile picture updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload the picture.');
    } finally {
      setBusy(false);
    }
  };

  const onSignOut = async () => {
    try {
      await signOut();
    } catch {
      /* ignore */
    }
    navigate('/');
  };

  return (
    <form className="profile-form" onSubmit={onSave} noValidate>
      <div className="profile-avatar">
        <span className="profile-avatar__img" aria-hidden="true">
          {avatar ? <img src={avatar} alt="" /> : (user?.email ?? '?').slice(0, 1).toUpperCase()}
        </span>
        <label className="field">
          <span className="field__label">Profile picture (PNG, JPEG, WebP · max 5MB)</span>
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onAvatar} />
        </label>
      </div>

      <label className="field">
        <span className="field__label">Email</span>
        <input type="email" value={user?.email ?? ''} disabled />
      </label>
      <label className="field">
        <span className="field__label">Full name</span>
        <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">Job title</span>
        <input type="text" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">LinkedIn URL</span>
        <input
          type="url"
          value={linkedin}
          placeholder="https://linkedin.com/in/..."
          onChange={(e) => setLinkedin(e.target.value)}
        />
      </label>
      <label className="field--check">
        <input type="checkbox" checked={newsletter} onChange={(e) => setNewsletter(e.target.checked)} />
        <span>Send me occasional Helicyn updates</span>
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

      <div className="formsubmit">
        <button className="navlink navlink--cta" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>
        <button className="navlink" type="button" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </form>
  );
}

export default function ProfilePage() {
  return (
    <div className="page page--profile">
      <Seo title="Helicyn · Profile" canonicalPath="/profile" noindex openGraph={false} />
      <section className="section">
        <div className="wrap">
          <span className="eyebrow mono" data-reveal>
            Account
          </span>
          <h1>Your profile</h1>
          <AuthGate title="Sign in to manage your profile">
            <ProfileForm />
          </AuthGate>
        </div>
      </section>
    </div>
  );
}
