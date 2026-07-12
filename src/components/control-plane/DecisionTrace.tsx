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
 * Coordination events, the inspectable decision trace, and the decision
 * hierarchy. The trace is an auditable event chain (detected → reasoning →
 * response → verified) driven by the active scenario — concise operational
 * factors, not hidden chain-of-thought.
 */
export function DecisionTrace() {
  const scenario = useControlPlane((s) => s.sim.scenario);
  const events = useControlPlane((s) => s.sim.events);
  const trace = SCN[scenario].trace;

  return (
    <>
      <section className="demo-section demo-section--line" aria-label="Coordination reasoning">
        <div className="cp-modhead">
          <span className="cp-modhead__tick mono">07</span>
          <h2>How it was coordinated</h2>
          <span className="cp-modhead__note mono">Detect → reason → act → verify → save</span>
        </div>
        <p className="cp-caption">Reasoning and decision traces behind each coordinated action.</p>

        <div className="cp-reason">
          <div className="cp-feed">
            <div className="cp-feed__head">
              <h3>Coordination events</h3>
              <span className="cp-feed__tag mono">Simulated</span>
            </div>
            <ul className="cp-feed__list">
              {events.map((e, i) => (
                <li key={i} className={'cp-feed__item cp-feed__item--' + e.type}>
                  {e.time && <span className="cp-feed__time mono">{e.time}</span>}
                  <span className="cp-feed__type mono">{e.type.toUpperCase()}</span>
                  <span className="cp-feed__text" dangerouslySetInnerHTML={{ __html: e.text }} />
                </li>
              ))}
            </ul>
          </div>

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
        </div>
      </section>

      <section className="demo-section demo-section--line" aria-label="Decision hierarchy">
        <div className="cp-modhead">
          <span className="cp-modhead__tick mono">·</span>
          <h2>From system to local: the decision hierarchy</h2>
          <span className="cp-modhead__note mono">System level → local level</span>
        </div>
        <p className="cp-caption">
          Each coordinated action descends through the same layers, starting from the work itself and
          ending at a verified local result.
        </p>
        <div className="cp-hier">
          <span className="cp-hier__axis mono">System level</span>
          <ol className="cp-hier__steps">
            {HIERARCHY.map(([n, name, desc], i) => (
              <li key={n} className={'cp-hier__step' + (i === HIERARCHY.length - 1 ? ' cp-hier__step--verify' : '')}>
                <span className="cp-hier__n mono">{n}</span>
                <span className="cp-hier__name">{name}</span>
                <span className="cp-hier__desc">{desc}</span>
              </li>
            ))}
          </ol>
          <span className="cp-hier__axis mono">Local level</span>
        </div>
      </section>
    </>
  );
}
