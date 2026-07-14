import { VERSION_LABEL } from '@/app/version';
import { AssumptionsPanel, DemonstratesPanel, ThesisPanel } from '../Summary';
import { HierarchyPanel } from '../DecisionTrace';

/**
 * Assumptions: model assumptions, scenario methodology, limitations, and the
 * framing copy that introduced the original Control Plane page: preserved
 * here so the simulation's scope is always explicit.
 */
export function AssumptionsView() {
  return (
    <div className="cps-view cps-view--assumptions">
      <div className="cp-panel">
        <div className="cp-panel__head"><h3>About this simulation</h3><span className="mono">Build {VERSION_LABEL}</span></div>
        <div className="cp-opbadge" role="note" aria-label="Operating mode">
          <span>Operator-in-the-loop</span>
          <span>Simulated telemetry</span>
          <span>Approval required</span>
        </div>
        <p className="cp-caption">
          Pick a scenario in the control bar. Every module in this application (topology, regions,
          recommendations, workloads, telemetry) updates from the same simulated fleet state.
        </p>
        <p className="cp-simnotice" role="note">
          <strong>Simulation notice:</strong> This control plane uses illustrative fleet data to
          demonstrate Helicyn&apos;s coordination logic. It does not represent live customer
          infrastructure or verified operational savings.
        </p>
      </div>

      <div className="cp-panel">
        <div className="cp-panel__head"><h3>Simulation assumptions</h3><span className="mono">What this demo does and does not model</span></div>
        <AssumptionsPanel />
      </div>

      <div className="cp-panel">
        <div className="cp-panel__head"><h3>From system to local: the decision hierarchy</h3><span className="mono">System level → local level</span></div>
        <p className="cp-caption">
          Each coordinated action descends through the same layers, starting from the work itself and
          ending at a verified local result.
        </p>
        <HierarchyPanel />
      </div>

      <div className="cp-panel">
        <div className="cp-panel__head"><h3>What the Control Plane demonstrates</h3><span className="mono">Coordinated, not isolated</span></div>
        <DemonstratesPanel />
      </div>

      <ThesisPanel />
    </div>
  );
}
