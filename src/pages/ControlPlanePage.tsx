import { useEffect, useRef } from 'react';
import { Seo } from '@/components/common/Seo';
import { ControlPlaneShell } from '@/components/control-plane/shell/ControlPlaneShell';
import { useSimulationLoop } from '@/components/control-plane/useSimulationLoop';
import { useControlPlane } from '@/state/controlPlaneStore';
import '@/styles/control-plane.css';

const CONTROL_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Helicyn Control Plane',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  url: 'https://helicyn.com/control-plane',
  description:
    "Explore Helicyn's interactive control plane demo: simulated GPU workload placement, cooling risk, power demand, and carbon-aware scheduling.",
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  publisher: { '@type': 'Organization', name: 'Helicyn', url: 'https://helicyn.com/' },
} as const;

/**
 * The Control Plane operator environment. One canonical store owns the entire
 * simulation; the app shell (control bar, view navigation, canvas, inspector,
 * event stream) renders from it, and a single simulation loop advances the
 * shared clock while this page is mounted.
 */
export default function ControlPlanePage() {
  useSimulationLoop();
  const scenario = useControlPlane((state) => state.sim.scenario);
  const rootRef = useRef<HTMLDivElement>(null);
  const firstScenario = useRef(true);

  // Brief "recalculating" flash across instrument surfaces on scenario change.
  useEffect(() => {
    if (firstScenario.current) { firstScenario.current = false; return; }
    const root = rootRef.current;
    if (!root) return;
    root.classList.remove('is-recalculating');
    void root.offsetWidth;
    root.classList.add('is-recalculating');
    const timer = window.setTimeout(() => root.classList.remove('is-recalculating'), 900);
    return () => window.clearTimeout(timer);
  }, [scenario]);

  // Cursor-reactive instrument surfaces (disabled for touch / reduced motion).
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce), (hover: none), (pointer: coarse)').matches) return;
    const root = rootRef.current;
    if (!root) return;
    const selector = '.cp-metric, .cp-region, .cp-rec, .cp-deck, .cp-panel, .cp-queue__col, .cp-queue__list li, .cp-verify, .cp-lifecell, .cp-assume, .cp-trace, .cps-inspector, .cps-attention__rec';
    let frame = 0;
    let latest: PointerEvent | null = null;
    const paint = () => {
      frame = 0;
      const event = latest;
      if (!event || !(event.target instanceof Element)) return;
      const surface = event.target.closest<HTMLElement>(selector);
      if (!surface || !root.contains(surface)) return;
      const rect = surface.getBoundingClientRect();
      surface.style.setProperty('--cx', `${(((event.clientX - rect.left) / rect.width) * 100).toFixed(1)}%`);
      surface.style.setProperty('--cy', `${(((event.clientY - rect.top) / rect.height) * 100).toFixed(1)}%`);
    };
    const move = (event: PointerEvent) => {
      latest = event;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    root.addEventListener('pointermove', move, { passive: true });
    return () => {
      root.removeEventListener('pointermove', move);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={rootRef} className="page page--control cp-root">
      <Seo
        title="Helicyn Control Plane Demo | Data Center Optimization"
        description="Explore Helicyn's interactive control plane demo: simulated GPU workload placement, cooling risk, power demand, and carbon-aware scheduling."
        canonicalPath="/control-plane"
        ogType="website"
        twitterCard
        jsonLd={CONTROL_JSONLD}
      />
      <ControlPlaneShell />
    </div>
  );
}
