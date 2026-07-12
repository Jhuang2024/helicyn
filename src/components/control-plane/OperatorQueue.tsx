import { formatClock } from '@/simulation';
import { useControlPlane } from '@/state/controlPlaneStore';

/**
 * Operator queue. Separates lanes — pending review (approved, awaiting
 * simulation) and approved-in-simulation (verified) — with simulation-time
 * timestamps. Nothing executes automatically; items only advance through
 * explicit operator actions on the recommendation cards.
 */
export function OperatorQueue() {
  const queue = useControlPlane((s) => s.sim.queue);
  const pending = queue.filter((q) => q.lane === 'approved');
  const approved = queue.filter((q) => q.lane === 'verified');

  return (
    <div className="cp-queue">
      <div className="cp-modhead">
        <span className="cp-modhead__tick mono">·</span>
        <h2>Operator queue</h2>
        <span className="cp-modhead__note mono">Recommendations only</span>
      </div>
      <p className="cp-caption">
        Nothing executes automatically. Approving a recommendation moves it into a simulated
        verification queue for operator confirmation.
      </p>
      <div className="cp-queue__cols">
        <div className="cp-queue__col">
          <h3 className="cp-queue__title">
            Pending review <span className="cp-queue__count mono">{pending.length}</span>
          </h3>
          {pending.length === 0 ? (
            <p className="cp-queue__empty">No actions awaiting simulation.</p>
          ) : (
            <ul className="cp-queue__list">
              {pending.map((q) => (
                <li key={q.id}>
                  <span>{q.cat}</span>
                  <span className="mono">{formatClock(q.timestamp).slice(0, 5)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="cp-queue__col">
          <h3 className="cp-queue__title">
            Approved in simulation <span className="cp-queue__count mono">{approved.length}</span>
          </h3>
          {approved.length === 0 ? (
            <p className="cp-queue__empty">No actions approved yet.</p>
          ) : (
            <ul className="cp-queue__list">
              {approved.map((q) => (
                <li key={q.id}>
                  <span>✓ {q.cat}</span>
                  <span className="mono">{formatClock(q.timestamp).slice(0, 5)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Verification window. Compares the coordinated result against the baseline
 * simulation for the most recently simulated action. Explicitly labelled as a
 * simulation result pending real telemetry.
 */
export function Verification() {
  const verification = useControlPlane((s) => s.sim.verification);
  return (
    <div className="cp-verify">
      <div className="cp-modhead">
        <span className="cp-modhead__tick mono">·</span>
        <h2>Verification window</h2>
      </div>
      <p className="cp-caption">
        Projected impact of approved actions, measured against the baseline simulation.
      </p>
      {!verification ? (
        <p className="cp-verify__empty">Projected impact pending simulation.</p>
      ) : (
        <div className="cp-verify__body">
          <h3 className="cp-verify__title">Projected impact</h3>
          <dl className="cp-verify__rows">
            <div><dt>Peak power</dt><dd>{verification.strings.peak}</dd></div>
            <div><dt>PUE</dt><dd>{verification.strings.pue}</dd></div>
            <div><dt>Thermal variance</dt><dd>{verification.strings.variance}</dd></div>
            <div><dt>Emissions shifted</dt><dd>{verification.strings.emissions}</dd></div>
          </dl>
          <p className="cp-verify__status mono">Verified in simulation · pending real telemetry</p>
        </div>
      )}
    </div>
  );
}
