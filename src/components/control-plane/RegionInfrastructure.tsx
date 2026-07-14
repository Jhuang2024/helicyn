import { RISK_TEXT, selectRegionTelemetry } from '@/simulation';
import { useControlPlane } from '@/state/controlPlaneStore';
import { InteractiveSurface } from '@/components/common/InteractiveSurface';
import { Tooltip } from './Tooltip';

const RISK_BADGE = {
  low: { badge: 'Nominal', badgeCls: 'control-badge--ok' },
  med: { badge: 'Optimizing', badgeCls: 'control-badge--opt' },
  high: { badge: 'Constrained', badgeCls: 'control-badge--crit' },
} as const;

function loadColor(pct: number): string {
  const t = Math.max(0, Math.min(1, (pct - 45) / 50));
  const hue = 195 - t * 190;
  return `oklch(0.72 ${(0.09 + t * 0.1).toFixed(3)} ${hue.toFixed(1)})`;
}

/**
 * Selectable region cards with live simulated telemetry (GPU load, carbon
 * intensity, cooling risk). All numbers come from the shared region-telemetry
 * selector: identical to the topology map: and selecting a card sets the
 * global selected entity, opening the region inspector.
 */
export function RegionGrid() {
  const sim = useControlPlane((s) => s.sim);
  const selectRegion = useControlPlane((s) => s.selectRegion);
  const regions = selectRegionTelemetry(sim);
  const selected = sim.selectedEntity?.type === 'region' ? sim.selectedEntity.id : null;

  return (
    <div className="cp-regions">
      {regions.map((r) => {
        const s = RISK_BADGE[r.risk];
        const isSelected = selected === r.topoId;
        return (
          <InteractiveSurface
            key={r.id}
            className={'cp-region' + (isSelected ? ' is-selected' : '')}
            role="button"
            tabIndex={0}
            ariaExpanded={isSelected}
            ariaLabel={`${r.label} region detail, ${r.load}% compute load, ${r.carbon} grams carbon intensity`}
            onClick={() => selectRegion(isSelected ? null : r.topoId)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectRegion(isSelected ? null : r.topoId);
              }
            }}
          >
            <div className="cp-region__head">
              <span className="cp-region__name">{r.label}</span>
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
                <span className="cp-region__k">Carbon intensity:</span> {r.carbon} g/kWh
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
            {isSelected && (
              <div className="cp-region__detail">
                <div className="cp-region__detrow">
                  <span className="cp-region__k">Flexible workload share</span>
                  <span>{r.flex}</span>
                </div>
                <div className="cp-region__detrow">
                  <span className="cp-region__k">Recommended action</span>
                  <span className="cp-region__act">{r.action}</span>
                </div>
              </div>
            )}
          </InteractiveSurface>
        );
      })}
    </div>
  );
}
