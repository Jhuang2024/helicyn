import { Seo } from '@/components/common/Seo';
import { StatusHeader } from '@/components/control-plane/StatusHeader';
import { Toolbar } from '@/components/control-plane/Toolbar';
import { MetricCards } from '@/components/control-plane/MetricCards';
import { Topology } from '@/components/control-plane/Topology';
import { RegionInfrastructure } from '@/components/control-plane/RegionInfrastructure';
import { Recommendations, SimulationControls } from '@/components/control-plane/Recommendations';
import { OperatorQueue, Verification } from '@/components/control-plane/OperatorQueue';
import { Workloads } from '@/components/control-plane/Workloads';
import { DecisionTrace } from '@/components/control-plane/DecisionTrace';
import { Telemetry } from '@/components/control-plane/Telemetry';
import { Summary } from '@/components/control-plane/Summary';
import { useSimulationLoop } from '@/components/control-plane/useSimulationLoop';
import { ExportImport } from '@/components/control-plane/ExportImport';
import '@/styles/control-plane.css';
import { useControlPlane } from '@/state/controlPlaneStore';

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
 * The Control Plane operator environment. Every module reads from and writes to
 * one authoritative store, so the scenario selector, region selection, control
 * changes, and approvals stay synchronized across the whole page. A single
 * simulation loop advances the shared clock while this page is mounted.
 */
export default function ControlPlanePage() {
  useSimulationLoop();
  const scenario = useControlPlane((state) => state.sim.scenario);
  const rootRef = useRef<HTMLDivElement>(null);
  const firstScenario = useRef(true);
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
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce), (hover: none), (pointer: coarse)').matches) return;
    const root = rootRef.current;
    if (!root) return;
    const selector = '.cp-metric, .cp-region, .cp-rec, .cp-deck, .cp-panel, .cp-queue__col, .cp-queue__list li, .cp-verify, .cp-lifecell, .cp-assume, .cp-trace, .cp-feed';
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

      <StatusHeader />

      <div className="cp-body">
        <section className="demo-section" aria-label="Scenario and optimization">
          <Toolbar />
          <ExportImport />
        </section>

        <MetricCards />

        <section className="demo-section demo-section--line" id="topology" aria-label="Regional coordination">
          <div className="cp-modhead">
            <span className="cp-modhead__tick mono">02</span>
            <h2>Regional coordination</h2>
            <span className="cp-modhead__note mono">5 regions · carbon-aware routing</span>
          </div>
          <p className="cp-caption">
            Workload routing across constrained and underutilized regions. Each data center is a node
            in a larger system, not an island.
          </p>
          <Topology />
        </section>

        <RegionInfrastructure />

        <section className="demo-section demo-section--line" id="recommendations" aria-label="Optimization">
          <div className="cp-split">
            <Recommendations />
            <SimulationControls />
          </div>
        </section>

        <section className="demo-section demo-section--line" aria-label="Operator queue and verification">
          <div className="cp-split">
            <OperatorQueue />
            <Verification />
          </div>
        </section>

        <Workloads />
        <DecisionTrace />
        <Telemetry />
        <Summary />
      </div>
    </div>
  );
}
import { useEffect, useRef } from 'react';
