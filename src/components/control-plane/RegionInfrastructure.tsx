import {
  INFRA_LABEL,
  REGION_DETAIL,
  RISK_TEXT,
  computeFleet,
  type InfraRegionId,
  type TopoNodeId,
} from '@/simulation';
import { useControlPlane } from '@/state/controlPlaneStore';
import { InteractiveSurface } from '@/components/common/InteractiveSurface';
import { Tooltip } from './Tooltip';

/** Static per-region telemetry values from the original grid. */
const STATIC: Record<InfraRegionId, { carbon: string; badge: string; badgeCls: string }> = {
  'us-west': { carbon: '412 g/kWh', badge: 'Optimizing', badgeCls: 'control-badge--opt' },
  'us-central': { carbon: '280 g/kWh', badge: 'Nominal', badgeCls: 'control-badge--ok' },
  'us-east': { carbon: '351 g/kWh', badge: 'Nominal', badgeCls: 'control-badge--ok' },
  'eu-west': { carbon: '190 g/kWh', badge: 'Nominal', badgeCls: 'control-badge--ok' },
  apac: { carbon: '468 g/kWh', badge: 'Constrained', badgeCls: 'control-badge--crit' },
};

/** Infrastructure grid ⇄ topology node mapping (for linked selection). */
const INFRA_TO_TOPO: Record<InfraRegionId, TopoNodeId> = {
  'us-west': 'oregon',
  'us-central': 'virginia',
  'us-east': 'tokyo',
  'eu-west': 'frankfurt',
  apac: 'singapore',
};

function loadColor(pct: number): string {
  const t = Math.max(0, Math.min(1, (pct - 45) / 50));
  const hue = 195 - t * 190;
  return `oklch(0.72 ${(0.09 + t * 0.1).toFixed(3)} ${hue.toFixed(1)})`;
}

export function RegionInfrastructure() {
  const sim = useControlPlane((s) => s.sim);
  const selectRegion = useControlPlane((s) => s.selectRegion);
  const fleet = computeFleet(sim);

  return (
    <section className="demo-section demo-section--line" id="regions" aria-label="Regional infrastructure">
      <div className="cp-modhead">
        <span className="cp-modhead__tick mono">03</span>
        <h2>Regional infrastructure</h2>
        <span className="cp-modhead__note mono">5 regions · simulated telemetry</span>
      </div>
      <p className="cp-caption">
        Simulated telemetry per region (GPU load, carbon intensity, and cooling risk), downstream of
        routing decisions. Select a region for detail.
      </p>

      <div className="cp-regions">
        {fleet.regions.map((r) => {
          const label = INFRA_LABEL[r.id];
          const s = STATIC[r.id];
          const detail = REGION_DETAIL[r.id];
          const topo = INFRA_TO_TOPO[r.id];
          const isSelected = sim.selectedRegion === topo;
          return (
            <InteractiveSurface
              key={r.id}
              className={'cp-region' + (isSelected ? ' is-selected' : '')}
              role="button"
              tabIndex={0}
              ariaExpanded={isSelected}
              ariaLabel={`${label} region detail`}
              onClick={() => selectRegion(isSelected ? null : topo)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  selectRegion(isSelected ? null : topo);
                }
              }}
            >
              <div className="cp-region__head">
                <span className="cp-region__name">{label}</span>
                <span className={'control-badge ' + s.badgeCls}>{s.badge}</span>
              </div>
              <div className="cp-region__loadhead">
                <span>Compute load</span>
                <span className="mono">{r.load}%</span>
              </div>
              <div className="cp-region__bar">
                <span className="cp-region__fill" style={{ width: `${r.load}%`, background: loadColor(r.load) }} />
              </div>
              <div className="cp-region__stats">
                <div>
                  <span className="cp-region__k">Carbon intensity:</span> {s.carbon}
                </div>
                <div>
                  <span className="cp-region__k">Cooling risk:</span> {RISK_TEXT[r.risk]}
                  {r.id === 'us-west' && (
                    <Tooltip
                      label="About cooling risk"
                      text="Cooling Risk. How close a region is to its thermal limits. High risk means little headroom before hotspots force throttling."
                    />
                  )}
                </div>
              </div>
              {isSelected && detail && (
                <div className="cp-region__detail">
                  <div className="cp-region__detrow">
                    <span className="cp-region__k">Flexible workload share</span>
                    <span>{detail.flex}</span>
                  </div>
                  <div className="cp-region__detrow">
                    <span className="cp-region__k">Recommended action</span>
                    <span className="cp-region__act">{detail.action}</span>
                  </div>
                </div>
              )}
            </InteractiveSurface>
          );
        })}
      </div>
    </section>
  );
}
