import { useEffect, useRef } from 'react';

/**
 * Scroll-reveal hook. Adds `is-revealed` when the element scrolls into view,
 * using getBoundingClientRect on scroll (robust across layouts where
 * IntersectionObserver proved unreliable). A safety timeout guarantees content
 * is never left hidden, and reduced-motion reveals immediately. The scroll
 * listener and timer are cleaned up on unmount.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      el.classList.add('is-revealed', 'is-visible');
      return;
    }

    let ticking = false;
    const reveal = () => {
      el.classList.add('is-revealed', 'is-visible');
      cleanup();
    };
    const check = () => {
      ticking = false;
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const r = el.getBoundingClientRect();
      if (r.top < vh * 0.92 && r.bottom > -80) reveal();
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(check);
      }
    };
    const safety = window.setTimeout(reveal, 2500);
    const cleanup = () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      window.clearTimeout(safety);
    };

    check();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return cleanup;
  }, []);

  return ref;
}
