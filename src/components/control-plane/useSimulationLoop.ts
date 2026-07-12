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

  useEffect(() => {
    let id = 0;
    const start = () => {
      if (id) return;
      id = window.setInterval(() => {
        // Advance by 1s of wall time; the engine multiplies by clock.speed and
        // ignores the tick when paused.
        tick(1);
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
  }, [tick]);
}
