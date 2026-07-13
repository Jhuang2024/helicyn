import { Topology } from '../Topology';
import { RegionGrid } from '../RegionInfrastructure';

/**
 * Regions: the coordination topology plus selectable region cards with live
 * simulated telemetry. Both derive from the same region-telemetry selector,
 * and selecting a region anywhere opens its inspector.
 */
export function RegionsView() {
  return (
    <div className="cps-view cps-view--regions">
      <p className="cp-caption">
        Workload routing across constrained and underutilized regions. Each data center is a node
        in a larger system, not an island. Select a region for detail.
      </p>
      <Topology />
      <RegionGrid />
    </div>
  );
}
