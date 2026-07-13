import { OperatorQueue, Verification } from '../OperatorQueue';
import { BeforeAfterPanel, LifetimePanel } from '../Summary';

/**
 * Verification: expected vs. realized impact. The operator queue tracks
 * decision lanes, the verification window compares against baseline, and the
 * cumulative panels persist the before/after and lifetime results.
 */
export function VerificationView() {
  return (
    <div className="cps-view cps-view--verification">
      <div className="cp-split">
        <div className="cp-panel">
          <div className="cp-panel__head"><h3>Operator queue</h3><span className="mono">Recommendations only</span></div>
          <OperatorQueue />
        </div>
        <div className="cp-panel">
          <div className="cp-panel__head"><h3>Verification window</h3></div>
          <Verification />
        </div>
      </div>
      <div className="cp-panel">
        <div className="cp-panel__head"><h3>Before / after Helicyn</h3><span className="mono">Same facility · one day</span></div>
        <BeforeAfterPanel />
      </div>
      <div className="cp-panel">
        <div className="cp-panel__head"><h3>Lifetime optimization impact</h3><span className="mono">Simulated control plane data</span></div>
        <LifetimePanel />
      </div>
    </div>
  );
}
