/**
 * Selectors — derived values computed from simulation state.
 *
 * Keeping derived values here (rather than storing conflicting copies in
 * components) guarantees that every module reads the same numbers. Selectors
 * are pure functions of `SimulationState`.
 */

import type { RegionStatus, SimulationState, TopoNodeId } from '../models/types';
import { computeFleet, type FleetComputation } from '../engine/compute';
import { SCN, SCENARIO_META } from '../scenarios/scenarios';

export function selectFleet(state: SimulationState): FleetComputation {
  return computeFleet(state);
}

/** Average fleet PUE (instantaneous). */
export function selectAveragePue(state: SimulationState): number {
  return computeFleet(state).metrics.pue.today;
}

/** Total GPU utilization across the fleet (instantaneous %). */
export function selectTotalGpuUtilization(state: SimulationState): number {
  return computeFleet(state).metrics.gpu.today;
}

/** Number of topology regions currently in a warn/crit state. */
export function selectConstrainedRegionCount(state: SimulationState): number {
  const constrained: RegionStatus[] = ['warn', 'crit'];
  return SCN[state.scenario].regions.filter((r) => constrained.includes(r.status)).length;
}

/**
 * The "saved / avoided / shifted" figures are MODELLED savings: the difference
 * between the uncoordinated baseline and the coordinated result (the
 * before/after panel), accrued by the diurnal fraction so they climb through
 * the day. They are illustrative — not measured production savings.
 */

/** Illustrative price applied to modelled peak-power reduction (USD per MW-day). */
const PRICE_PER_MW_DAY = 3200;

/** Estimated cost avoided so far today (modeled, USD). */
export function selectCostAvoided(state: SimulationState): number {
  const fleet = computeFleet(state);
  const peakSaved = Math.max(0, fleet.compare.peak.before - fleet.compare.peak.after);
  return peakSaved * PRICE_PER_MW_DAY * fleet.cumulativeFraction;
}

/** Modeled energy saved so far today (MWh). */
export function selectEnergySaved(state: SimulationState): number {
  const fleet = computeFleet(state);
  const peakSaved = Math.max(0, fleet.compare.peak.before - fleet.compare.peak.after);
  return peakSaved * 24 * fleet.cumulativeFraction;
}

/** Emissions shifted so far today (tCO₂e). */
export function selectEmissionsShifted(state: SimulationState): number {
  const fleet = computeFleet(state);
  const carbonSaved = Math.max(0, fleet.compare.carbon.before - fleet.compare.carbon.after);
  return carbonSaved * fleet.cumulativeFraction;
}

/** Cooling-load reduction so far today (% of baseline PUE overhead removed). */
export function selectCoolingReduction(state: SimulationState): number {
  const fleet = computeFleet(state);
  const { before, after } = fleet.compare.pue;
  if (before <= 0) return 0;
  return Math.max(0, ((before - after) / before) * 100) * fleet.cumulativeFraction;
}

/** Regional spare capacity (100 − load) for every infrastructure region. */
export function selectRegionalCapacity(state: SimulationState): { id: string; spare: number }[] {
  return computeFleet(state).regions.map((r) => ({ id: r.id, spare: Math.max(0, 100 - r.load) }));
}

/** Whether the current view shows accumulated (coordinated) or baseline values. */
export function selectIsBaseline(state: SimulationState): boolean {
  return state.controls.view === 'baseline';
}

/** Projected-vs-accumulated pair for a cumulative metric. */
export function selectProjectedVsAccumulated(
  state: SimulationState,
  key: 'energy' | 'cost' | 'carbon' | 'cooling',
): { accumulated: number; projected: number } {
  const fleet = computeFleet(state);
  return { accumulated: fleet.metrics[key].today, projected: fleet.metrics[key].projected };
}

/** Verification deltas (variance from projection) if a verification exists. */
export function selectVerificationVariance(
  state: SimulationState,
): { key: string; variance: number }[] | null {
  const v = state.verification;
  if (!v) return null;
  return (['peak', 'carbon', 'pue'] as const).map((k) => ({
    key: k,
    variance: v.deltas[k].simulated - v.deltas[k].projected,
  }));
}

/** Count of pending / approved / verified / rejected queue items. */
export function selectQueueCounts(state: SimulationState): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of state.queue) counts[item.lane] = (counts[item.lane] ?? 0) + 1;
  return counts;
}

/** The topology node role & status for the selected region (linked panels). */
export function selectRegionDetail(state: SimulationState, id: TopoNodeId) {
  return SCN[state.scenario].regions.find((r) => r.id === id) ?? null;
}

/** Active scenario descriptive metadata. */
export function selectScenarioMeta(state: SimulationState) {
  return SCENARIO_META[state.scenario];
}
