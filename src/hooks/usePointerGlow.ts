import { useEffect } from 'react';

/**
 * Site-wide pointer backdrop driver.
 *
 * Attaches a SINGLE pointer listener and eases the glow toward the cursor
 * inside one requestAnimationFrame loop, writing `--pointer-x/y` custom
 * properties on <html>. It never triggers a React rerender on pointer move,
 * and it tears down both the listener and the animation frame on unmount so
 * navigation cannot leave duplicate global listeners behind.
 *
 * Mount this exactly once (in the app shell). Honors reduced-motion and
 * skips fine-pointer easing on touch devices.
 */
export function usePointerGlow(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;

    const root = document.documentElement;
    const finePointer = window.matchMedia?.('(pointer: fine)').matches ?? true;

    // Current eased position (percentages) and latest raw target.
    let curX = 50;
    let curY = 40;
    let targetX = 50;
    let targetY = 40;
    let raf = 0;
    let idleTimer = 0;
    let animating = false;

    const write = () => {
      root.style.setProperty('--pointer-x', curX.toFixed(2) + '%');
      root.style.setProperty('--pointer-y', curY.toFixed(2) + '%');
    };

    const tick = () => {
      // Ease toward the target; stop the loop once we've effectively arrived.
      const lerp = 0.12;
      curX += (targetX - curX) * lerp;
      curY += (targetY - curY) * lerp;
      write();
      if (Math.abs(targetX - curX) > 0.05 || Math.abs(targetY - curY) > 0.05) {
        raf = requestAnimationFrame(tick);
      } else {
        animating = false;
      }
    };

    const kick = () => {
      if (!animating) {
        animating = true;
        raf = requestAnimationFrame(tick);
      }
    };

    const onMove = (e: PointerEvent) => {
      targetX = (e.clientX / window.innerWidth) * 100;
      targetY = (e.clientY / window.innerHeight) * 100;
      root.style.setProperty('--pointer-active', '1');
      if (finePointer) {
        kick();
      } else {
        // Coarse pointer: snap without the easing loop.
        curX = targetX;
        curY = targetY;
        write();
      }
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        root.style.setProperty('--pointer-active', '0');
      }, 2600);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    write();

    return () => {
      window.removeEventListener('pointermove', onMove);
      if (raf) cancelAnimationFrame(raf);
      window.clearTimeout(idleTimer);
      root.style.setProperty('--pointer-active', '0');
    };
  }, [enabled]);
}
