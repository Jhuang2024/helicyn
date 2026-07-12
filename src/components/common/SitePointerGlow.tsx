import { usePointerGlow } from '@/hooks/usePointerGlow';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/**
 * The single site-wide cursor backdrop. Rendered once in the app shell so it
 * follows the pointer across every route — including /report — with exactly one
 * global listener. Purely decorative: aria-hidden and pointer-events:none.
 */
export function SitePointerGlow() {
  const reduced = usePrefersReducedMotion();
  usePointerGlow(!reduced);
  return <div className="site-pointer-glow" aria-hidden="true" />;
}
