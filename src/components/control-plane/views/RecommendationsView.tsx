import { Recommendations, SimulationControls } from '../Recommendations';

/**
 * Recommendations: pending proposals with projected effects and confidence,
 * next to the operator constraint deck that bounds what the coordinator may
 * propose. Approve / simulate / reject actions drive the shared lifecycle.
 */
export function RecommendationsView() {
  return (
    <div className="cps-view cps-view--recommendations">
      <div className="cp-split">
        <div>
          <p className="cp-caption">
            Approve to stage an action, simulate to file it, or reject to dismiss it. Every approval
            generates the next recommendation. Operator approval required.
          </p>
          <Recommendations />
        </div>
        <div>
          <p className="cp-caption">Operators define the boundaries. Helicyn proposes actions inside them.</p>
          <SimulationControls />
        </div>
      </div>
    </div>
  );
}
