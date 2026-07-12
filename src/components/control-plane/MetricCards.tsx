import { computeFleet, formatClock } from '@/simulation';
import { useControlPlane } from '@/state/controlPlaneStore';
import { buildMetricViews } from './format';
import { Sparkline } from './charts';
import { Tooltip } from './Tooltip';

/**
 * "Today, coordinated" headline metrics. Every value is derived from the shared
 * fleet computation (accumulated so far vs. projected), transitions smoothly via
 * CSS, and preserves the original labels, units, context lines, and tooltip
 * definitions. The Baseline/After view toggle switches the accumulation basis.
 */
export function MetricCards() {
  const sim = useControlPlane((s) => s.sim);
  const setControl = useControlPlane((s) => s.setControl);
  const fleet = computeFleet(sim);
  const metrics = buildMetricViews(fleet, fleet.dayFraction);
  const isBaseline = sim.controls.view === 'baseline';

  return (
    <section className="demo-section" id="metrics" aria-label="Key metrics">
      <div className="cp-modhead">
        <span className="cp-modhead__tick mono">01</span>
        <h2>Today, coordinated</h2>
        <span className="cp-modhead__note mono">Rolling 24h · simulated</span>
        <span className="cp-modhead__clock mono">{formatClock(sim.clock.seconds).slice(0, 5)} UTC</span>
      </div>
      <p className="cp-caption">
        These totals accumulate from 00:00 UTC and tick up live; the sparkline under each card shows
        today&apos;s curve: solid is accumulated, dashed is projected.
      </p>

      <div className="cp-viewtoggle" role="group" aria-label="Metric view">
        <span className="cp-viewtoggle__k mono">View</span>
        <div className="cp-seg" role="group" aria-label="Baseline or coordinated view">
          <button
            type="button"
            className={'cp-seg__btn' + (isBaseline ? ' is-active' : '')}
            aria-pressed={isBaseline}
            onClick={() => setControl({ view: 'baseline' })}
          >
            Baseline
          </button>
          <button
            type="button"
            className={'cp-seg__btn' + (!isBaseline ? ' is-active' : '')}
            aria-pressed={!isBaseline}
            onClick={() => setControl({ view: 'after' })}
          >
            After coordination
          </button>
        </div>
        <span className="cp-viewtoggle__note mono">Simulated projection, not measured telemetry</span>
      </div>

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
            <div className="cp-metric__axis mono">
              <span>00:00 UTC</span>
              <span>24:00</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
