import { useEffect } from 'react';
import { useControlPlane } from '@/state/controlPlaneStore';

/**
 * Drives the shared simulation clock while the Control Plane is mounted.
 *
 * A single interval advances the clock once per second; the engine scales the
 * delta by the clock's speed. Nonessential work pauses when the tab is hidden
 * (Page Visibility) and stops entirely on unmount, so navigating away from the
 * Control Plane leaves no running loop, listener, or leak behind.
 */
export function useSimulationLoop(): void {
  const tick = useControlPlane((s) => s.tick);
  const ambientEvent = useControlPlane((s) => s.ambientEvent);

  useEffect(() => {
    let id = 0;
    let wallTicks = 0;
    let last = performance.now();
    const start = () => {
      if (id) return;
      last = performance.now();
      id = window.setInterval(() => {
        const now = performance.now();
        const elapsed = Math.max(0.25, Math.min(5, (now - last) / 1000));
        last = now;
        tick(elapsed);
        wallTicks += 1;
        if (wallTicks % 7 === 0) ambientEvent();
      }, 1000);
    };
    const stop = () => {
      if (id) {
        window.clearInterval(id);
        id = 0;
      }
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [ambientEvent, tick]);
}
