/**
 * Selectors — derived values computed from simulation state.
 *
 * Keeping derived values here (rather than storing conflicting copies in
 * components) guarantees that every module reads the same numbers. Selectors
 * are pure functions of `SimulationState`.
 */

import type {
  EventSeverity,
  InfraRegionId,
  RecommendationCard,
  RegionStatus,
  RiskLevel,
  SelectedEntity,
  SimEvent,
  SimulationState,
  TopoNodeId,
  WorkloadRow,
} from '../models/types';
import { computeFleet, type FleetComputation } from '../engine/compute';
import {
  CARBON_OFFSET,
  INFRA_LABEL,
  INFRA_TO_TOPO,
  REGION_DETAIL,
  TOPO_TO_INFRA,
  clamp,
} from '../engine/constants';
import { NODE_POS, SCN, SCENARIO_META } from '../scenarios/scenarios';

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

// ---- Unified regional telemetry ----------------------------------------------

/** Everything the UI needs to render one region, in both vocabularies. */
export interface RegionTelemetry {
  id: InfraRegionId;
  topoId: TopoNodeId;
  /** Infrastructure-grid display label (US-WEST). */
  label: string;
  /** Topology-node display label (OREGON). */
  nodeLabel: string;
  /** Displayed compute load %, including the deterministic live jitter. */
  load: number;
  spare: number;
  risk: RiskLevel;
  /** Displayed carbon intensity (g/kWh). */
  carbon: number;
  /** Live topology status (risk overrides merged over scenario roles). */
  status: RegionStatus;
  role: string;
  thermal: string;
  carbonLabel: string;
  flex: string;
  action: string;
}

/**
 * One derivation for regional display telemetry. Previously the topology map
 * and the region grid each computed their own jitter/carbon, so the same
 * region could show two different numbers at once — this selector is now the
 * single source both render from.
 */
export function selectRegionTelemetry(state: SimulationState): RegionTelemetry[] {
  const fleet = computeFleet(state);
  const scenarioNodes = new Map(SCN[state.scenario].regions.map((r) => [r.id, r]));
  return fleet.regions.map((r, index) => {
    const topoId = INFRA_TO_TOPO[r.id];
    const node = scenarioNodes.get(topoId);
    const jitter = Math.sin(state.clock.seconds / 12 + index) * 1.4;
    const load = clamp(Math.round(r.load + jitter), 0, 100);
    const carbon = Math.max(
      80,
      Math.round(fleet.carbonNow + CARBON_OFFSET[r.id] + Math.sin(state.clock.seconds / 20 + index * 1.7) * 8),
    );
    const status: RegionStatus =
      r.risk === 'high' ? 'crit' : r.risk === 'med' ? 'warn' : node?.status === 'opt' ? 'opt' : 'ok';
    return {
      id: r.id,
      topoId,
      label: INFRA_LABEL[r.id],
      nodeLabel: NODE_POS[topoId].label,
      load,
      spare: Math.max(0, 100 - load),
      risk: r.risk,
      carbon,
      status,
      role: node?.role ?? '',
      thermal: node?.thermal ?? '',
      carbonLabel: node?.carbon ?? '',
      flex: REGION_DETAIL[r.id].flex,
      action: REGION_DETAIL[r.id].action,
    };
  });
}

/** Telemetry for a single topology node. */
export function selectRegionTelemetryByTopo(
  state: SimulationState,
  topoId: TopoNodeId,
): RegionTelemetry | null {
  return selectRegionTelemetry(state).find((r) => r.topoId === topoId) ?? null;
}

// ---- System status --------------------------------------------------------------

export type SystemStatusKey =
  | 'nominal'
  | 'strained'
  | 'constrained'
  | 'applying'
  | 'recovered';

export interface SystemStatus {
  key: SystemStatusKey;
  label: string;
  level: EventSeverity;
}

/**
 * Global system status shown in the control bar. Derived, never stored:
 * staged-but-unsimulated actions dominate (the operator has work in flight),
 * then scenario alert level, then post-verification recovery.
 */
export function selectSystemStatus(state: SimulationState): SystemStatus {
  const applying = state.queue.some((q) => q.lane === 'approved');
  if (applying) return { key: 'applying', label: 'Action staged · decision in flight', level: 'info' };
  const alert = SCN[state.scenario].alert;
  if (alert.level === 'crit') return { key: 'constrained', label: 'Constrained · decision required', level: 'crit' };
  if (alert.level === 'warn') return { key: 'strained', label: 'Strained · monitoring', level: 'warn' };
  if (state.verification) return { key: 'recovered', label: 'Recovered · verified in simulation', level: 'ok' };
  return { key: 'nominal', label: 'Nominal', level: 'ok' };
}

// ---- Recommendation / workload relations -----------------------------------------

/** Recommendations still awaiting an operator decision. */
export function selectPendingRecommendations(state: SimulationState): RecommendationCard[] {
  return state.recommendations.filter((r) => r.state === 'proposed' || r.state === 'approved');
}

/** The topology nodes a recommendation touches (source, target, fx regions). */
export function recommendationRegions(card: RecommendationCard): TopoNodeId[] {
  const nodes = new Set<TopoNodeId>();
  nodes.add(card.template.topo.from);
  if (card.template.topo.to) nodes.add(card.template.topo.to);
  for (const k of Object.keys(card.template.fx.regionDelta ?? {}) as InfraRegionId[]) {
    nodes.add(INFRA_TO_TOPO[k]);
  }
  return [...nodes];
}

/** Recommendations related to a topology region. */
export function selectRecommendationsForRegion(
  state: SimulationState,
  topoId: TopoNodeId,
): RecommendationCard[] {
  return state.recommendations.filter((r) => recommendationRegions(r).includes(topoId));
}

/** Workloads currently placed in (or moving through) a topology region. */
export function selectWorkloadsForRegion(state: SimulationState, topoId: TopoNodeId): WorkloadRow[] {
  const infra = TOPO_TO_INFRA[topoId];
  const label = INFRA_LABEL[infra];
  return state.workloads.filter(
    (w) =>
      w.template.region === label ||
      w.template.topo.from === topoId ||
      w.template.topo.to === topoId,
  );
}

// ---- Event relations --------------------------------------------------------------

export function selectEventById(state: SimulationState, id: string): SimEvent | null {
  return state.events.find((e) => e.id === id) ?? null;
}

/** Events that reference the given entity (region/workload/recommendation). */
export function selectEventsForEntity(
  state: SimulationState,
  entity: Exclude<SelectedEntity, null>,
): SimEvent[] {
  if (entity.type === 'event') {
    const event = selectEventById(state, entity.id);
    return event ? [event] : [];
  }
  return state.events.filter(
    (e) =>
      e.entities.some((ref) => ref.type === entity.type && ref.id === entity.id) ||
      (entity.type === 'recommendation' && e.recId === entity.id),
  );
}
