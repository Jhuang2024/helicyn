import { Suspense, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Nav } from './Nav';
import { Footer } from './Footer';
import { ScrollProgress } from './ScrollProgress';
import { SitePointerGlow } from '@/components/common/SitePointerGlow';

/** Resets scroll position on route change (except when navigating to an anchor). */
function useScrollRestoration() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        el.scrollIntoView({ behavior: 'auto', block: 'start' });
        return;
      }
    }
    window.scrollTo(0, 0);
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
