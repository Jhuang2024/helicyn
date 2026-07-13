import { SCN, selectPendingRecommendations, selectRegionTelemetry } from '@/simulation';
import { useControlPlane } from '@/state/controlPlaneStore';
import { MetricCards } from '../MetricCards';
import { ComparePanel } from '../Telemetry';
import { Topology } from '../Topology';

const SEQ_STEPS = [
  ['detect', '01 · Detect'],
  ['analyze', '02 · Analyze'],
  ['act', '03 · Act'],
  ['verify', '04 · Verify'],
  ['save', '05 · Save'],
] as const;

/** Scenario alert + live Detect→Save coordination rail. */
function ScenarioPulse() {
  const scenario = useControlPlane((s) => s.sim.scenario);
  const seconds = useControlPlane((s) => s.sim.clock.seconds);
  const alert = SCN[scenario].alert;
  const activeStep = Math.floor(seconds / 5) % SEQ_STEPS.length;
  return (
    <div className="cps-pulse">
      <div className={'cp-alert cp-alert--' + alert.level} role="status" aria-live="polite">
        <span className="cp-alert__ttl">{alert.ttl}</span>
        <span className="cp-alert__body">{alert.body}</span>
      </div>
      <ol className="cp-seq" aria-label="Coordination sequence">
        {SEQ_STEPS.map(([key, label], index) => (
          <li
            key={key}
            className={'cp-seq__step' + (index === activeStep ? ' is-active' : '') + (index < activeStep ? ' is-done' : '')}
            aria-current={index === activeStep ? 'step' : undefined}
          >
            <span className="mono">{label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Constrained regions and the top pending decision, linked to selection. */
function AttentionPanel() {
  const sim = useControlPlane((s) => s.sim);
  const selectEntity = useControlPlane((s) => s.selectEntity);
  const constrained = selectRegionTelemetry(sim).filter((r) => r.risk === 'high' || r.status === 'crit' || r.status === 'warn');
  const pending = selectPendingRecommendations(sim);
  const top = pending[0];

  return (
    <div className="cp-panel cps-attention">
      <div className="cp-panel__head">
        <h3>Needs attention</h3>
        <span className="mono">{constrained.length} constrained · {pending.length} pending</span>
      </div>
      <div className="cps-attention__grid">
        <div>
          <h4 className="cps-attention__k mono">Active constraints</h4>
          {constrained.length === 0 ? (
            <p className="cp-queue__empty">No constrained regions.</p>
          ) : (
            <ul className="cps-attention__list">
              {constrained.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="cps-chip cps-chip--region"
                    onClick={() => selectEntity({ type: 'region', id: r.topoId })}
                  >
                    {r.label} · {r.load}% load
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h4 className="cps-attention__k mono">Current recommendation</h4>
          {!top ? (
            <p className="cp-queue__empty">No pending recommendations.</p>
          ) : (
            <button
              type="button"
              className="cps-attention__rec"
              onClick={() => selectEntity({ type: 'recommendation', id: top.id })}
            >
              <span className="mono">{top.id}</span>
              <span dangerouslySetInnerHTML={{ __html: top.template.text }} />
              <span className="mono cps-attention__impact">{top.template.impact} · {top.template.conf}% confidence</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Overview: fleet-wide state at a glance — scenario pulse, headline metrics,
 * topology, attention items, and the baseline/coordinated comparison.
 */
export function OverviewView() {
  return (
    <div className="cps-view cps-view--overview">
      <ScenarioPulse />
      <p className="cp-caption">
        Today, coordinated — totals accumulate from 00:00 UTC and tick live. Solid sparkline is
        accumulated, dashed is projected. Use the Baseline / Coordinated toggle in the control bar
        to switch basis.
      </p>
      <MetricCards />
      <div className="cps-view__cols">
        <div className="cp-panel">
          <div className="cp-panel__head">
            <h3>Regional coordination</h3>
            <span className="mono">5 regions · carbon-aware routing</span>
          </div>
          <Topology compact />
        </div>
        <AttentionPanel />
      </div>
      <ComparePanel />
    </div>
  );
}
