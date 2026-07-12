import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Seo } from '@/components/common/Seo';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { enhanceStaticContent } from './_static/enhanceStaticContent';
import { REPORT_JSONLD } from './seo-data';

/**
 * The long-form technical report. Its body (extracted to a static asset to keep
 * it out of the JS bundle) is fetched on demand and enhanced with the SAME
 * shared interaction system as the rest of the site — the site-wide pointer
 * backdrop comes from the shell, and scroll reveals run through the shared
 * enhancer — so /report no longer feels like an older version of the site.
 * Figures keep their white backing for legibility.
 */
export default function ReportPage() {
  const ref = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const navigate = useNavigate();
  const reduce = usePrefersReducedMotion();

  useEffect(() => {
    let cancelled = false;
    fetch('/report-body.html')
      .then((r) => {
        if (!r.ok) throw new Error('report unavailable');
        return r.text();
      })
      .then((text) => {
        if (!cancelled) setHtml(text);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !html) return;
    const cleanup = enhanceStaticContent(el, { navigate, reduce });
    return cleanup;
  }, [html, navigate, reduce]);

  return (
    <div className="page page--report">
      <Seo
        title="Helicyn Thesis | ML for Data Center Energy Coordination"
        description="Helicyn's technical report: a hierarchical coordination framework for AI data center energy, evaluated across seven scheduling policies and six scenarios."
        canonicalPath="/report"
        ogType="article"
        jsonLd={REPORT_JSONLD}
      />
      {!html && !error && (
        <div className="route-fallback" role="status" aria-live="polite">
          <span className="route-fallback__spinner" aria-hidden="true" />
          <span className="mono">Loading report…</span>
        </div>
      )}
      {error && (
        <div className="notfound">
          <h1>Report unavailable</h1>
          <p style={{ color: 'var(--text-dim)' }}>
            The report could not be loaded. You can{' '}
            <a href="/helicyn-report.pdf">download the PDF</a> instead.
          </p>
        </div>
      )}
      {html && (
        <div
          ref={ref}
          className="static-content report-static"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}
