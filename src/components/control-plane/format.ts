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

/** "+14% vs yesterday" style trend line for a cumulative daily metric. */
function vsYesterday(cur: number, ref: number): string {
  const diff = ref ? (cur / ref - 1) * 100 : 0;
  return `${diff >= 0 ? '↗ +' : '↘ −'}${Math.abs(diff).toFixed(0)}% vs yesterday`;
}

/** Rough real-world equivalents that make the headline numbers tangible. */
const HOME_MWH_PER_DAY = 0.03; // ~30 kWh average household day
const CAR_TCO2_PER_YEAR = 4.6; // EPA typical passenger vehicle

/**
 * Assemble the metric cards from the fleet computation. Labels and context
 * lines are written for a general audience; the tooltips carry the precise
 * technical definitions for operators who want them.
 */
export function buildMetricViews(fleet: FleetComputation, dayFraction: number): MetricView[] {
  const now = Math.max(0.004, Math.min(0.9995, dayFraction));
  const energy = fleet.metrics.energy;
  const cost = fleet.metrics.cost;
  const carbon = fleet.metrics.carbon;
  const pue = fleet.metrics.pue;
  const gpu = fleet.metrics.gpu;
  const cooling = fleet.metrics.cooling;

  const pueDelta = pue.today - pue.yesterday;

  return [
    {
      key: 'energy',
      label: 'Energy saved today',
      value: fmt(energy.today, 1),
      unit: 'MWh',
      trend: vsYesterday(energy.today, energy.yesterday),
      trendGood: energy.today >= energy.yesterday,
      context: `≈ a day of electricity for ${fmt(Math.round(energy.today / HOME_MWH_PER_DAY), 0)} homes`,
      tooltip:
        'Electricity saved by coordinating where and when work runs, instead of letting each site run independently. Modeled, in megawatt-hours (MWh), across 5 coordinated regions.',
      series: cumulativeSeries(energy.projected),
      nowFraction: now,
    },
    {
      key: 'cost',
      label: 'Money saved today',
      value: '$' + fmt(cost.today, 0),
      unit: '',
      trend: vsYesterday(cost.today, cost.yesterday),
      trendGood: cost.today >= cost.yesterday,
      context: 'from cheaper power and smarter timing',
      tooltip:
        'Estimated spend avoided by running flexible work when and where power is cheaper (grid arbitrage), plus deferring non-urgent jobs.',
      series: cumulativeSeries(cost.projected),
      nowFraction: now,
    },
    {
      key: 'carbon',
      label: 'CO₂ avoided today',
      value: fmt(carbon.today, 1),
      unit: 'tons',
      trend: vsYesterday(carbon.today, carbon.yesterday),
      trendGood: carbon.today >= carbon.yesterday,
      context: `≈ ${fmt(Math.round(carbon.today / CAR_TCO2_PER_YEAR), 0)} cars taken off the road for a year`,
      tooltip:
        'Estimated emissions avoided by moving flexible work to cleaner-energy regions or times of day. Measured in metric tons of CO₂ equivalent (tCO₂e).',
      series: cumulativeSeries(carbon.projected),
      nowFraction: now,
    },
    {
      key: 'pue',
      label: 'Energy efficiency',
      value: fmt(pue.today, 2),
      unit: 'PUE',
      trend: `${pueDelta < 0 ? '↘' : '↗'} ${Math.abs(pueDelta).toFixed(2)} ${pueDelta < 0 ? 'better' : 'worse'} than yesterday`,
      trendGood: pueDelta < 0,
      context: 'lower is better · 1.00 is perfect',
      tooltip:
        'Power Usage Effectiveness (PUE): total facility energy divided by the energy that reaches the computers. 1.24 means 24% extra goes to cooling and overhead. Lower is better.',
      series: rampSeries(1.31, pue.projected),
      nowFraction: now,
    },
    {
      key: 'gpu',
      label: 'Computers kept busy',
      value: fmt(gpu.today, 0),
      unit: '%',
      trend: `${gpu.today - gpu.yesterday >= 0 ? '↗ +' : '↘ −'}${Math.abs(gpu.today - gpu.yesterday).toFixed(1)} pts vs yesterday`,
      trendGood: gpu.today - gpu.yesterday >= 0,
      context: 'share of computing power doing useful work',
      tooltip:
        'GPU utilization: the share of the fleet’s computing capacity doing useful work. Coordination keeps this high even while work is being moved around.',
      series: rampSeries(46, gpu.projected),
      nowFraction: now,
    },
    {
      key: 'cooling',
      label: 'Cooling energy saved',
      value: fmt(cooling.today, 1),
      unit: '%',
      trend: vsYesterday(cooling.today, cooling.yesterday),
      trendGood: cooling.today >= cooling.yesterday,
      context: 'less energy spent on air conditioning',
      tooltip:
        'Reduction in cooling demand from placing heat-producing work where the cooling system has room to spare.',
      series: cumulativeSeries(cooling.projected),
      nowFraction: now,
    },
  ];
}
