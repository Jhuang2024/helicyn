import { Suspense, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Nav } from './Nav';
import { Footer } from './Footer';
import { ScrollProgress } from './ScrollProgress';
import { SitePointerGlow } from '@/components/common/SitePointerGlow';

/** Resets scroll position on route change (except when navigating to an anchor). */
function useScrollRestoration() {
  const { pathname, hash } = useLocation();
  const previousPath = useRef(pathname);
  useEffect(() => {
    if (previousPath.current !== pathname) document.getElementById('main')?.focus({ preventScroll: true });
    previousPath.current = pathname;
    if (!hash) { window.scrollTo(0, 0); return; }
    let id: string;
    try { id = decodeURIComponent(hash.slice(1)); } catch { return; }
    const scrollToAnchor = () => {
      const target = document.getElementById(id);
      if (!target) return false;
      target.scrollIntoView({ behavior: 'auto', block: 'start' });
      return true;
    };
    if (scrollToAnchor()) return;
    // Lazy routes/report fetches can mount the anchor after the location changes.
    const observer = new MutationObserver(() => { if (scrollToAnchor()) observer.disconnect(); });
    observer.observe(document.getElementById('main') ?? document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname, hash]);
}

function RouteFallback() {
  return (
    <div className="route-fallback" role="status" aria-live="polite">
      <span className="route-fallback__spinner" aria-hidden="true" />
      <span className="mono">Loading…</span>
    </div>
  );
}

/**
 * The app shell shared by every route: skip link, pointer backdrop, scroll
 * progress, header, the routed page, and footer. The SitePointerGlow is mounted
 * here exactly once so a single global pointer listener serves all routes.
 */
export function Layout() {
  useScrollRestoration();
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SitePointerGlow />
      <ScrollProgress />
      <div className="app-shell">
        <Nav />
        <main id="main" className="app-main" tabIndex={-1}>
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </main>
        <Footer />
      </div>
    </>
  );
}
