import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { BrandMark } from './BrandMark';
import { LiveClock } from './LiveClock';
import { CommandPalette } from './CommandPalette';
import { useTheme } from '@/app/theme/ThemeProvider';
import { useAuth } from '@/app/auth/AuthProvider';
import { signOut } from '@/services/auth';

const LINKS = [
  { to: '/research', label: 'Research' },
  { to: '/patch-notes', label: 'Patch notes' },
  { to: '/partners', label: 'Founding Partners' },
  { to: '/careers', label: 'Careers' },
];

/**
 * Site header: brand, mobile toggle, live clock, command palette, theme toggle,
 * primary links, and the auth-dependent Login / profile control. One nav is
 * used across every route for cross-page consistency.
 */
export function Nav() {
  const toggleRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const closePalette = useCallback(() => setCmdkOpen(false), []);
  const [open, setOpen] = useState(false);
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  const avatarUrl = (user?.user_metadata as Record<string, string | undefined> | undefined)
    ?.avatar_url;
  const location = useLocation();
  const navigate = useNavigate();

  // Close the mobile menu on route change.
  useEffect(() => {
    setOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  // Sticky nav "scrolled" state.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Ctrl/Cmd-K opens the palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdkOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open && !menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (menuOpen) accountRef.current?.querySelector('button')?.focus();
        else toggleRef.current?.focus();
        setMenuOpen(false); setOpen(false);
      }
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuOpen && !accountRef.current?.contains(target)) setMenuOpen(false);
      if (open && !navRef.current?.contains(target) && !toggleRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onPointer); };
  }, [open, menuOpen]);

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/');
    } catch { setSignOutError('Could not sign out. Please try again.'); }
  };

  return (
    <header className={'nav' + (scrolled ? ' scrolled' : '')} data-screen-label="nav">
      <Link className="brand" to="/" aria-label="Helicyn home">
        <BrandMark />
        <span className="brand__name">Helicyn</span>
      </Link>

      <button
        ref={toggleRef}
        className="navtoggle"
        type="button"
        aria-expanded={open}
        aria-controls="navmenu"
        aria-label="Toggle menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="navtoggle__bar" />
        <span className="navtoggle__bar" />
        <span className="navtoggle__bar" />
      </button>

      <nav ref={navRef} className={'nav__right' + (open ? ' is-open' : '')} id="navmenu">
        <span className="nav__meta">
          <span className="statusdot" aria-hidden="true" />
          <LiveClock />
        </span>

        <button
          type="button"
          className="navcmdk"
          aria-label="Search (Ctrl+K)"
          onClick={() => setCmdkOpen(true)}
        >
          <svg className="navcmdk__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
            <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span className="navcmdk__lbl">Search</span>
        </button>

        <button
          type="button"
          className="navcmdk themetoggle"
          aria-pressed={theme === 'light'}
          aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
          onClick={toggleTheme}
        >
          <svg className="themetoggle__icon themetoggle__sun" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
            <path
              d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          <svg className="themetoggle__icon themetoggle__moon" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
        </button>

        {LINKS.map((l) => (
          <NavLink key={l.to} className="navlink" to={l.to}>
            {l.label}
          </NavLink>
        ))}
        <NavLink className="navlink" to="/control-plane">
          <span className="lbl-full">Control plane</span>
          <span className="lbl-short">Demo</span>
        </NavLink>

        {user ? (
          <div className="navprofile" ref={accountRef}>
            <button
              type="button"
              className="navprofile__btn"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span className="navprofile__avatar" aria-hidden="true">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" />
                ) : (
                  (user.email ?? '?').slice(0, 1).toUpperCase()
                )}
              </span>
              <span className="navprofile__label">Account</span>
            </button>
            {menuOpen && (
              <div className="navprofile__menu" role="menu">
                <Link role="menuitem" to="/profile">
                  Profile
                </Link>
                <Link role="menuitem" to="/partner-portal">
                  Partner Portal
                </Link>
                <button role="menuitem" type="button" onClick={handleSignOut}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        ) : (
          <NavLink className="navlink" to="/login">
            Login
          </NavLink>
        )}

        <NavLink className="navlink navlink--cta" to="/onboarding">
          <span className="lbl-full">Apply as partner</span>
          <span className="lbl-short">Apply</span> <span className="arr" aria-hidden="true">↗</span>
        </NavLink>
      </nav>

      {signOutError && <p className="form-note err" role="alert">{signOutError}</p>}
      <CommandPalette open={cmdkOpen} onClose={closePalette} />
    </header>
  );
}
