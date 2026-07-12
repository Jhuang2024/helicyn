import { ACC } from '@/simulation';
import type { FleetComputation } from '@/simulation';

/** Number formatting matching the original control deck. */
export function fmt(n: number, dp: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/** Build a full-day series (0..1 sampled) for a cumulative metric, scaled by ACC. */
export function cumulativeSeries(projected: number, points = 60): number[] {
  return Array.from({ length: points }, (_, i) => projected * ACC(i / (points - 1)));
}

/** Build a ramp series for an instantaneous metric (gpu/pue) from floor→top. */
export function rampSeries(floor: number, top: number, points = 60): number[] {
  return Array.from({ length: points }, (_, i) => floor + (top - floor) * ACC(i / (points - 1)));
}

export interface MetricView {
  key: string;
  label: string;
  value: string;
  unit: string;
  trend: string;
  trendGood: boolean;
  context: string;
  tooltip: string;
  series: number[];
  /** fraction 0..1 of the day elapsed (split point solid/dashed). */
  nowFraction: number;
}

/**
 * Assemble the six metric cards from the fleet computation, preserving the
 * original labels, units, tooltips, and context lines verbatim.
 */
export function buildMetricViews(fleet: FleetComputation, dayFraction: number): MetricView[] {
  const now = Math.max(0.004, Math.min(0.9995, dayFraction));
  const energy = fleet.metrics.energy;
  const cost = fleet.metrics.cost;
  const carbon = fleet.metrics.carbon;
  const pue = fleet.metrics.pue;
  const gpu = fleet.metrics.gpu;
  const cooling = fleet.metrics.cooling;

  const pct = (cur: number, ref: number) => (ref ? (cur / ref) * 100 : 0);

  return [
    {
      key: 'energy',
      label: 'Modeled energy saved',
      value: fmt(energy.today, 1),
      unit: 'MWh',
      trend: `↗ ${pct(energy.today, energy.yesterday).toFixed(1)}% of yesterday`,
      trendGood: true,
      context: 'across 5 coordinated regions',
      tooltip:
        'Modeled Energy Saved. Simulated energy saved by coordinating workload placement, scheduling, and cooling instead of running each system independently.',
      series: cumulativeSeries(energy.projected),
      nowFraction: now,
    },
    {
      key: 'cost',
      label: 'Estimated cost avoided',
      value: '$' + fmt(cost.today, 0),
      unit: '',
      trend: `↗ ${pct(cost.today, cost.yesterday).toFixed(1)}% of yesterday`,
      trendGood: true,
      context: 'grid arbitrage + deferred load',
      tooltip:
        'Cost Avoided. Spend avoided through grid arbitrage (running flexible load when and where power is cheaper), plus deferred non-urgent jobs.',
      series: cumulativeSeries(cost.projected),
      nowFraction: now,
    },
    {
      key: 'carbon',
      label: 'Emissions shifted',
      value: fmt(carbon.today, 1),
      unit: 'tCO₂e',
      trend: `↗ ${pct(carbon.today, carbon.yesterday).toFixed(1)}% of yesterday`,
      trendGood: true,
      context: 'load moved to low-carbon windows',
      tooltip:
        'Emissions Shifted. Estimated emissions avoided by moving flexible workloads to lower-carbon regions or time windows.',
      series: cumulativeSeries(carbon.projected),
      nowFraction: now,
    },
    {
      key: 'pue',
      label: 'Average PUE',
      value: fmt(pue.today, 2),
      unit: '',
      trend: `${pue.today - pue.yesterday >= 0 ? '↗ +' : '↘ −'}${Math.abs(pue.today - pue.yesterday).toFixed(2)} vs. yesterday`,
      trendGood: pue.today - pue.yesterday < 0,
      context: 'power usage effectiveness',
      tooltip:
        'PUE. Power Usage Effectiveness: the ratio of total facility energy to IT equipment energy. Lower is better.',
      series: rampSeries(1.31, pue.projected),
      nowFraction: now,
    },
    {
      key: 'gpu',
      label: 'GPU utilization',
      value: fmt(gpu.today, 0),
      unit: '%',
      trend: `${gpu.today - gpu.yesterday >= 0 ? '↗ +' : '↘ −'}${Math.abs(gpu.today - gpu.yesterday).toFixed(1)} pts vs. yesterday`,
      trendGood: gpu.today - gpu.yesterday >= 0,
      context: 'fleet-wide, scheduling-aware',
      tooltip:
        'GPU Utilization. Share of fleet GPU capacity doing useful work. Coordination keeps this high while shifting load.',
      series: rampSeries(46, gpu.projected),
      nowFraction: now,
    },
    {
      key: 'cooling',
      label: 'Cooling load reduction',
      value: fmt(cooling.today, 1),
      unit: '%',
      trend: `↗ ${pct(cooling.today, cooling.yesterday).toFixed(1)}% of yesterday`,
      trendGood: true,
      context: 'thermal headroom recovered',
      tooltip:
        'Cooling Load Reduction. Reduction in cooling demand from thermal-aware workload placement and setpoint coordination.',
      series: cumulativeSeries(cooling.projected),
      nowFraction: now,
    },
  ];
}
