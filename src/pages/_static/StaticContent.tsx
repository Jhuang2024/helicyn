import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { enhanceStaticContent } from './enhanceStaticContent';

/** Extract the inner HTML of the <main> element from a full legacy page. */
export function extractMain(html: string): string {
  const match = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(html);
  return match ? match[1]! : html;
}

interface StaticContentProps {
  /** Inner HTML to render (already extracted to the <main> body). */
  html: string;
  className?: string;
}

/**
 * Renders a ported legacy page body verbatim and re-attaches every in-page
 * interaction through the shared enhancer (scroll reveals, arch-stack tabs,
 * magnetic buttons, tilt, count-up, internal-link SPA routing, email assembly,
 * contact form). The site-wide pointer backdrop and nav come from the shell, so
 * every static route: including /report: gets consistent motion without a
 * second implementation.
 */
export function StaticContent({ html, className }: StaticContentProps) {
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const reduce = usePrefersReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cleanup = enhanceStaticContent(el, { navigate, reduce });
    return cleanup;
  }, [navigate, reduce, html]);

  return (
    <div
      ref={ref}
      className={['static-content', className].filter(Boolean).join(' ')}
      // Content is our own trusted, build-time legacy markup: not user input.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
