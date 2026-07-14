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
            Helicyn suggests actions; you decide. Approve a suggestion to line it up, simulate it
            to see the result, or reject it. Nothing ever runs without your approval.
          </p>
          <Recommendations />
        </div>
        <div>
          <p className="cp-caption">You set the boundaries here. Helicyn only proposes actions inside them.</p>
          <SimulationControls />
        </div>
      </div>
    </div>
  );
}
