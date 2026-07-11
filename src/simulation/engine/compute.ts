/**
 * Pure fleet computation.
 *
 * `computeFleet` is the deterministic heart of the engine: given the mutable
 * simulation state and no external input beyond the state's own clock, it
 * re-derives every displayed metric, trend, region load, and before/after
 * value. It performs no I/O, touches no DOM, and calls no `Math.random`.
 */

import type {
  FleetView,
  InfraRegionId,
  RiskLevel,
  SimulationState,
} from '../models/types';
import {
  BASELINE,
  CARBON_BASE,
  CARBON_MULT,
  clamp,
  COOL_CONF,
  GPU_NIGHT,
  INFRA,
  INFRA_ORDER,
  INFRA_RISK,
  MODES,
  SCEN,
  YDAY,
} from './constants';
import { ACC, dayFractionFromSeconds } from './accumulation';

export interface RegionLoad {
  id: InfraRegionId;
  load: number;
  risk: RiskLevel;
}

export interface MetricValue {
  /** Value accrued so far today (or instantaneous state for gpu/pue). */
  today: number;
  /** Full-day projected total (or target state). */
  projected: number;
  /** Same-time-of-day reference from yesterday. */
  yesterday: number;
}

export interface CompareRow {
  before: number;
  after: number;
  unit: string;
}

export interface FleetComputation {
  isBaseline: boolean;
  dayFraction: number;
  cumulativeFraction: number;
  metrics: {
    energy: MetricValue;
    cost: MetricValue;
    carbon: MetricValue;
    cooling: MetricValue;
    gpu: MetricValue;
    pue: MetricValue;
  };
  shift: number;
  regions: RegionLoad[];
  compare: {
    peak: CompareRow;
    carbon: CompareRow;
    pue: CompareRow;
  };
  rec1Impact: string;
  coolingConfidence: number;
  carbonNow: number;
  /** Full-day projected fleet totals (pre-accumulation). */
  projected: {
    energy: number;
    cost: number;
    carbon: number;
    cooling: number;
    gpu: number;
    pue: number;
  };
}

function fmt1(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function computeFleet(state: SimulationState): FleetComputation {
  const { controls, effects, scenario } = state;
  const isBaseline = controls.view === 'baseline';
  const m = MODES[controls.mode];
  const f = 0.82 + (controls.flex / 100) * 0.36;
  const cMult = CARBON_MULT[controls.carbon];
  const S = SCEN[scenario];
  const b = effects.bump;

  const energy = m.energy * f * S.energyMul + b.energy;
  const cost = m.cost * f * S.costMul + b.cost;
  const carbon = m.carbon * f * cMult * S.carbonMul + b.carbon;
  const cooling = m.cooling * (0.9 + (controls.flex / 100) * 0.2) * S.coolingMul + b.cooling;
  const gpuVal = clamp(m.gpu + S.gpuDelta + b.gpu, 40, 99);
  const pueVal = m.pue + S.pueDelta + b.pue;
  const shift = Math.round(m.shift * f);

  const fr = dayFractionFromSeconds(state.clock.seconds);
  const cf = ACC(fr);

  const dEnergy = isBaseline ? 0 : energy * cf;
  const dCost = isBaseline ? 0 : cost * cf;
  const dCarbon = isBaseline ? 0 : carbon * cf;
  const dCooling = isBaseline ? 0 : cooling * cf;

  const gpuFloor = isBaseline ? GPU_NIGHT - 6 : GPU_NIGHT;
  const gpuTop = isBaseline ? clamp(gpuVal - 8, 40, 99) : gpuVal;
  const dGpu = gpuFloor + (gpuTop - gpuFloor) * cf;

  const pueTop = isBaseline ? BASELINE.pue : pueVal;
  const dPue = BASELINE.pue + (pueTop - BASELINE.pue) * cf;

  const yEnergy = YDAY.energy * cf;
  const yCost = YDAY.cost * cf;
  const yCarbon = YDAY.carbon * cf;
  const yCooling = YDAY.cooling * cf;
  const yGpu = GPU_NIGHT + (YDAY.gpu - GPU_NIGHT) * cf;
  const yPue = BASELINE.pue + (YDAY.pue - BASELINE.pue) * cf;

  // Region grid.
  const baseLoads = INFRA[scenario];
  const risks = INFRA_RISK[scenario];
  const regions: RegionLoad[] = INFRA_ORDER.map((k) => {
    let load = baseLoads[k];
    if (k === 'us-west') load -= shift * 0.7;
    if (k === 'us-central') load += shift * 0.7;
    load += effects.regionDelta[k] ?? 0;
    const risk = effects.riskOverride[k] ?? risks[k];
    return { id: k, load: clamp(Math.round(load), 0, 100), risk };
  });

  // Before/after panel.
  const afterPeak = m.afterPeak * (2 - f);
  const afterCarbon = m.afterCarbon * (2 - f) * cMult;

  const rec1Impact = '−' + fmt1(0.9 + shift * 0.05) + ' MW peak';
  const coolingConfidence = COOL_CONF[controls.cooling];

  const carbonBase = CARBON_BASE[scenario];
  const carbonNow = carbonBase * (0.94 + (cMult - 1) * 0.4);

  return {
    isBaseline,
    dayFraction: fr,
    cumulativeFraction: cf,
    metrics: {
      energy: { today: dEnergy, projected: energy, yesterday: yEnergy },
      cost: { today: dCost, projected: cost, yesterday: yCost },
      carbon: { today: dCarbon, projected: carbon, yesterday: yCarbon },
      cooling: { today: dCooling, projected: cooling, yesterday: yCooling },
      gpu: { today: dGpu, projected: gpuTop, yesterday: yGpu },
      pue: { today: dPue, projected: pueTop, yesterday: yPue },
    },
    shift,
    regions,
    compare: {
      peak: { before: BASELINE.peak, after: afterPeak, unit: 'MW' },
      carbon: { before: BASELINE.carbon, after: afterCarbon, unit: 't' },
      pue: { before: BASELINE.pue, after: m.afterPue, unit: '' },
    },
    rec1Impact,
    coolingConfidence,
    carbonNow,
    projected: { energy, cost, carbon, cooling, gpu: gpuVal, pue: pueVal },
  };
}

/** Series accessor for cumulative metrics over the day (used by charts). */
export function seriesValue(
  computation: FleetComputation,
  key: 'energy' | 'cost' | 'carbon' | 'cooling',
  t: number,
  view: FleetView,
): number {
  if (view === 'baseline') return 0;
  return computation.projected[key] * ACC(t);
}

/** Instantaneous ramp accessor for gpu/pue over the day. */
export function rampValue(
  computation: FleetComputation,
  key: 'gpu' | 'pue',
  t: number,
): number {
  if (key === 'gpu') {
    const floor = computation.isBaseline ? GPU_NIGHT - 6 : GPU_NIGHT;
    return floor + (computation.metrics.gpu.projected - floor) * ACC(t);
  }
  return BASELINE.pue + (computation.metrics.pue.projected - BASELINE.pue) * ACC(t);
}
