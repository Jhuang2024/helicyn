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
        Helicyn moves work between data centers around the world — away from sites that are
        stressed, toward sites with room to spare. Select a region to see its details.
      </p>
      <Topology />
      <RegionGrid />
    </div>
  );
}
