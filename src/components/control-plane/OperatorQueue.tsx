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
  const selectEntity = useControlPlane((s) => s.selectEntity);
  const pending = queue.filter((q) => q.lane === 'approved');
  const approved = queue.filter((q) => q.lane === 'verified');

  const lane = (items: typeof queue, empty: string) =>
    items.length === 0 ? (
      <p className="cp-queue__empty">{empty}</p>
    ) : (
      <ul className="cp-queue__list">
        {items.map((q) => (
          <li key={q.id}>
            <button
              type="button"
              className="cp-queue__link"
              onClick={() => selectEntity({ type: 'recommendation', id: q.recId })}
              title={`Inspect ${q.recId}`}
            >
              {q.lane === 'verified' ? '✓ ' : ''}{q.cat}
            </button>
            <span className="mono">{formatClock(q.timestamp).slice(0, 5)}</span>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="cp-queue">
      <p className="cp-caption">
        Nothing executes automatically. Approving a recommendation moves it into a simulated
        verification queue for operator confirmation.
      </p>
      <div className="cp-queue__cols">
        <div className="cp-queue__col">
          <h3 className="cp-queue__title">
            Pending review <span className="cp-queue__count mono">{pending.length}</span>
          </h3>
          {lane(pending, 'No actions awaiting simulation.')}
        </div>
        <div className="cp-queue__col">
          <h3 className="cp-queue__title">
            Approved in simulation <span className="cp-queue__count mono">{approved.length}</span>
          </h3>
          {lane(approved, 'No actions approved yet.')}
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
      <p className="cp-caption">
        Projected impact of approved actions, measured against the baseline simulation.
      </p>
      {!verification ? (
        <p className="cp-verify__empty">Projected impact pending simulation.</p>
      ) : (
        <div className="cp-verify__body">
          <h3 className="cp-verify__title">
            Projected impact <span className="mono cp-verify__rec">{verification.recId}</span>
          </h3>
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
