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
        A closer look at how the facilities are doing: how much power they draw, how hard the
        cooling is working, and how efficiently everything runs. All readings are simulated.
      </p>
      <div className="cp-telemetry">
        <PowerPanel />
        <CoolingZonesPanel />
      </div>
      <TrendPanels />
    </div>
  );
}
