import { CoolingZonesPanel, PowerPanel, TrendPanels } from '../Telemetry';

/**
 * Fleet: facility-level telemetry downstream of coordination: power demand,
 * cooling load by zone, and carbon / GPU / PUE trends, all fed by the shared
 * simulation history.
 */
export function FleetView() {
  return (
    <div className="cps-view cps-view--fleet">
      <p className="cp-caption">
        After fleet-level decisions are made, Helicyn verifies local facility impact. This is the
        local optimization layer, downstream of coordination. Illustrative telemetry.
      </p>
      <div className="cp-telemetry">
        <PowerPanel />
        <CoolingZonesPanel />
      </div>
      <TrendPanels />
    </div>
  );
}
