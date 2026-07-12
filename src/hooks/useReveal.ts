import { useEffect, useRef } from 'react';

/**
 * Scroll-reveal hook backed by IntersectionObserver.
 *
 * Adds `is-revealed` to the element when it scrolls into view. The CSS handles
 * the (clip-free) transition, so this only toggles a class. Reduced-motion is
 * handled in CSS. The observer is disconnected on unmount.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(once = true) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-revealed');
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            if (once) observer.unobserve(entry.target);
          } else if (!once) {
            entry.target.classList.remove('is-revealed');
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [once]);

  return ref;
}
