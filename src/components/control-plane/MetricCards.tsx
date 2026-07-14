import { computeFleet } from '@/simulation';
import { useControlPlane } from '@/state/controlPlaneStore';
import { buildMetricViews } from './format';
import { Sparkline } from './charts';
import { Tooltip } from './Tooltip';

/**
 * "Today, coordinated" headline metrics. Every value is derived from the shared
 * fleet computation (accumulated so far vs. projected) and transitions smoothly
 * via CSS. The global Baseline/Coordinated toggle (control bar) switches the
 * accumulation basis. Pass `keys` to show a subset (the Overview leads with the
 * four headline cards; the technical cards live in Fleet health).
 */
export function MetricCards({ keys }: { keys?: string[] }) {
  const sim = useControlPlane((s) => s.sim);
  const fleet = computeFleet(sim);
  const metrics = buildMetricViews(fleet, fleet.dayFraction).filter(
    (m) => !keys || keys.includes(m.key),
  );
  const isBaseline = sim.controls.view === 'baseline';

  return (
    <div className={'cp-metrics' + (isBaseline ? ' is-baseline' : '')}>
      {metrics.map((m) => (
        <article className="cp-metric" key={m.key}>
          <div className="cp-metric__top">
            <span className="cp-metric__label">{m.label}</span>
            <Tooltip label={`About ${m.label}`} text={m.tooltip} />
          </div>
          <div className="cp-metric__value">
            {m.value}
            {m.unit && <span className="cp-metric__unit"> {m.unit}</span>}
          </div>
          <div className={'cp-metric__trend' + (m.trendGood ? ' is-good' : ' is-bad')}>{m.trend}</div>
          <div className="cp-metric__ctx">{m.context}</div>
          <Sparkline
            series={m.series}
            nowFraction={m.nowFraction}
            color={m.key === 'pue' ? 'var(--ok)' : m.key === 'cooling' ? 'var(--warn)' : 'var(--signal)'}
            ariaLabel={`${m.label} trend over the day`}
          />
        </article>
      ))}
    </div>
  );
}
