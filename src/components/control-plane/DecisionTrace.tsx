import { SCN } from '@/simulation';
import { useControlPlane } from '@/state/controlPlaneStore';

const HIERARCHY: [string, string, string][] = [
  ['1', 'Workload', 'Which jobs can move, hold, or defer'],
  ['2', 'Region', 'Where capacity, carbon, and price align'],
  ['3', 'Facility', 'Which data center absorbs the work'],
  ['4', 'Zone', 'Which thermal zone holds headroom'],
  ['5', 'Cooling action', 'Setpoints and sequencing, locally'],
  ['6', 'Verified result', 'Confirm savings and SLA'],
];

/**
 * The inspectable decision trace: an auditable chain (detected → reasoning →
 * response → verified) driven by the active scenario: concise operational
 * factors, not hidden chain-of-thought. Shown in the inspector so the "why"
 * always travels with the entity being inspected.
 */
export function TracePanel() {
  const scenario = useControlPlane((s) => s.sim.scenario);
  const trace = SCN[scenario].trace;

  return (
    <div className="cp-trace" id="cp-trace">
      <div className="cp-trace__head">
        <span className="cp-trace__action mono">{trace.action}</span>
        <span className="cp-trace__tag mono">Decision trace</span>
      </div>
      <div className="cp-trace__block">
        <span className="cp-trace__k mono">Detected</span>
        <p dangerouslySetInnerHTML={{ __html: trace.detected }} />
      </div>
      <div className="cp-trace__block">
        <span className="cp-trace__k mono">Reasoning</span>
        <p dangerouslySetInnerHTML={{ __html: trace.reasoning }} />
      </div>
      <div className="cp-trace__block">
        <span className="cp-trace__k mono">Response</span>
        <p dangerouslySetInnerHTML={{ __html: trace.response }} />
      </div>
      <div className="cp-trace__block">
        <span className="cp-trace__k mono">Verified result</span>
        <p dangerouslySetInnerHTML={{ __html: trace.verified }} />
      </div>
    </div>
  );
}

/** From system to local: the decision hierarchy (animated by the shared clock). */
export function HierarchyPanel() {
  const seconds = useControlPlane((s) => s.sim.clock.seconds);
  return (
    <div className="cp-hier">
      <span className="cp-hier__axis mono">System level</span>
      <ol className="cp-hier__steps">
        {HIERARCHY.map(([n, name, desc], i) => {
          const active = Math.floor(seconds / 4) % HIERARCHY.length === i;
          return (
            <li key={n} className={'cp-hier__step' + (i === HIERARCHY.length - 1 ? ' cp-hier__step--verify' : '') + (active ? ' is-active' : '')}>
              <span className="cp-hier__n mono">{n}</span>
              <span className="cp-hier__name">{name}</span>
              <span className="cp-hier__desc">{desc}</span>
            </li>
          );
        })}
      </ol>
      <span className="cp-hier__axis mono">Local level</span>
    </div>
  );
}
