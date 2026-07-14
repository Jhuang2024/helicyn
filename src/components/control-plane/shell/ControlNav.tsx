import { selectConstrainedRegionCount, selectPendingRecommendations } from '@/simulation';
import { useControlPlane } from '@/state/controlPlaneStore';
import { CONTROL_VIEWS, type ControlView } from './views';

/**
 * Internal view navigation. These are application views over one shared
 * simulation: switching never resets state. Badges surface live counts
 * (pending decisions, constrained regions) from the canonical store.
 */
export function ControlNav({
  view,
  onChange,
}: {
  view: ControlView;
  onChange: (view: ControlView) => void;
}) {
  const sim = useControlPlane((s) => s.sim);
  const pending = selectPendingRecommendations(sim).length;
  const constrained = selectConstrainedRegionCount(sim);
  const badges: Partial<Record<ControlView, number>> = {
    recommendations: pending,
    regions: constrained,
  };

  return (
    <nav className="cps-nav" aria-label="Control Plane views">
      <ul>
        {CONTROL_VIEWS.map(({ key, label }) => (
          <li key={key}>
            <button
              type="button"
              className={'cps-nav__item' + (view === key ? ' is-active' : '')}
              aria-current={view === key ? 'page' : undefined}
              onClick={() => onChange(key)}
            >
              <span>{label}</span>
              {badges[key] ? <span className="cps-nav__badge mono">{badges[key]}</span> : null}
            </button>
          </li>
        ))}
      </ul>
      <dl className="cps-nav__stats" aria-label="Fleet status summary">
        <div><dt className="mono">Regions</dt><dd>5</dd></div>
        <div><dt className="mono">Active workloads</dt><dd>{sim.workloads.length + 1}</dd></div>
        <div><dt className="mono">Constrained</dt><dd>{constrained}</dd></div>
        <div><dt className="mono">Operator approval</dt><dd>Required</dd></div>
      </dl>
    </nav>
  );
}
