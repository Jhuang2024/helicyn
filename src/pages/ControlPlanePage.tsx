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

  return (
    <div className="page page--control cp-root">
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
