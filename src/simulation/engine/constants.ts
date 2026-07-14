/**
 * Simulation constants: copied verbatim from the original control.js / scenario.js
 * so the TypeScript engine reproduces the exact same illustrative numbers.
 *
 * All values here are SIMULATED / MODELLED figures used to drive the Control
 * Plane demonstration. They are not measured production telemetry.
 */

import type {
  CarbonPriority,
  InfraRegionId,
  OptimizationMode,
  RegionStatus,
  RiskLevel,
  ScenarioKey,
  TopoNodeId,
  ZoneId,
} from '../models/types';

export const SCENARIO_KEYS: ScenarioKey[] = [
  'normal',
  'surge',
  'inference',
  'cooling',
  'power',
  'lowcarbon',
];

export const INFRA_ORDER: InfraRegionId[] = ['us-west', 'us-central', 'us-east', 'eu-west', 'apac'];

/**
 * Canonical mapping between the infrastructure-grid vocabulary (US-* regions)
 * and the topology-node vocabulary (geographic sites). Previously duplicated
 * inside two components; a single mapping keeps linked selection consistent.
 */
export const INFRA_TO_TOPO: Record<InfraRegionId, TopoNodeId> = {
  'us-west': 'oregon',
  'us-central': 'virginia',
  'us-east': 'tokyo',
  'eu-west': 'frankfurt',
  apac: 'singapore',
};

export const TOPO_TO_INFRA: Record<TopoNodeId, InfraRegionId> = {
  oregon: 'us-west',
  virginia: 'us-central',
  tokyo: 'us-east',
  frankfurt: 'eu-west',
  singapore: 'apac',
};

/** Per-region carbon-intensity offset from the fleet average (g/kWh). */
export const CARBON_OFFSET: Record<InfraRegionId, number> = {
  'us-west': 72,
  'us-central': -60,
  'us-east': 11,
  'eu-west': -150,
  apac: 128,
};

/** Human labels for the infrastructure grid. */
export const INFRA_LABEL: Record<InfraRegionId, string> = {
  'us-west': 'US-WEST',
  'us-central': 'US-CENTRAL',
  'us-east': 'US-EAST',
  'eu-west': 'EU-WEST',
  apac: 'APAC',
};

/** Regional compute load per scenario (%). */
export const INFRA: Record<ScenarioKey, Record<InfraRegionId, number>> = {
  normal: { 'us-west': 84, 'us-central': 61, 'us-east': 73, 'eu-west': 58, apac: 79 },
  surge: { 'us-west': 93, 'us-central': 75, 'us-east': 80, 'eu-west': 66, apac: 85 },
  inference: { 'us-west': 70, 'us-central': 64, 'us-east': 89, 'eu-west': 74, apac: 83 },
  cooling: { 'us-west': 80, 'us-central': 68, 'us-east': 76, 'eu-west': 60, apac: 92 },
  power: { 'us-west': 67, 'us-central': 78, 'us-east': 70, 'eu-west': 62, apac: 73 },
  lowcarbon: { 'us-west': 71, 'us-central': 66, 'us-east': 69, 'eu-west': 87, apac: 70 },
};

/** Regional cooling risk per scenario. */
export const INFRA_RISK: Record<ScenarioKey, Record<InfraRegionId, RiskLevel>> = {
  normal: { 'us-west': 'med', 'us-central': 'low', 'us-east': 'low', 'eu-west': 'low', apac: 'high' },
  surge: { 'us-west': 'high', 'us-central': 'med', 'us-east': 'med', 'eu-west': 'low', apac: 'high' },
  inference: { 'us-west': 'low', 'us-central': 'low', 'us-east': 'med', 'eu-west': 'low', apac: 'high' },
  cooling: { 'us-west': 'med', 'us-central': 'low', 'us-east': 'med', 'eu-west': 'low', apac: 'high' },
  power: { 'us-west': 'low', 'us-central': 'med', 'us-east': 'low', 'eu-west': 'low', apac: 'med' },
  lowcarbon: { 'us-west': 'low', 'us-central': 'low', 'us-east': 'low', 'eu-west': 'med', apac: 'low' },
};

export interface RiskBadge {
  cls: string;
  txt: string;
}

export const RISK_BADGE: Record<RiskLevel, RiskBadge> = {
  low: { cls: 'control-badge--ok', txt: 'Nominal' },
  med: { cls: 'control-badge--opt', txt: 'Optimizing' },
  high: { cls: 'control-badge--crit', txt: 'Constrained' },
};

export const RISK_TEXT: Record<RiskLevel, string> = { low: 'Low', med: 'Medium', high: 'High' };

export const STATUS_BADGE: Record<RegionStatus, RiskBadge> = {
  ok: { cls: 'control-badge--ok', txt: 'Nominal' },
  opt: { cls: 'control-badge--opt', txt: 'Optimizing' },
  warn: { cls: 'control-badge--warn', txt: 'Strained' },
  crit: { cls: 'control-badge--crit', txt: 'Alert' },
};

export interface ScenarioMultiplier {
  energyMul: number;
  costMul: number;
  carbonMul: number;
  coolingMul: number;
  gpuDelta: number;
  pueDelta: number;
}

export const SCEN: Record<ScenarioKey, ScenarioMultiplier> = {
  normal: { energyMul: 1.0, costMul: 1.0, carbonMul: 1.0, coolingMul: 1.0, gpuDelta: 0, pueDelta: 0.0 },
  surge: { energyMul: 1.34, costMul: 1.28, carbonMul: 1.18, coolingMul: 1.22, gpuDelta: 6, pueDelta: 0.03 },
  inference: { energyMul: 1.15, costMul: 1.22, carbonMul: 1.1, coolingMul: 1.08, gpuDelta: 4, pueDelta: 0.01 },
  cooling: { energyMul: 1.06, costMul: 1.1, carbonMul: 1.04, coolingMul: 1.55, gpuDelta: -2, pueDelta: -0.02 },
  power: { energyMul: 1.1, costMul: 1.46, carbonMul: 1.08, coolingMul: 1.05, gpuDelta: -3, pueDelta: 0.0 },
  lowcarbon: { energyMul: 1.22, costMul: 1.16, carbonMul: 1.62, coolingMul: 1.02, gpuDelta: 2, pueDelta: -0.01 },
};

export interface ModeOutcome {
  energy: number;
  cost: number;
  carbon: number;
  pue: number;
  gpu: number;
  cooling: number;
  shift: number;
  afterPeak: number;
  afterCarbon: number;
  afterPue: number;
}

export const MODES: Record<OptimizationMode, ModeOutcome> = {
  conservative: { energy: 286, cost: 82400, carbon: 98, pue: 1.24, gpu: 82, cooling: 6.8, shift: 9, afterPeak: 13.4, afterCarbon: 8.1, afterPue: 1.24 },
  balanced: { energy: 432, cost: 124000, carbon: 154, pue: 1.18, gpu: 87, cooling: 11.4, shift: 18, afterPeak: 12.8, afterCarbon: 6.2, afterPue: 1.18 },
  aggressive: { energy: 624, cost: 198000, carbon: 246, pue: 1.12, gpu: 91, cooling: 17.2, shift: 29, afterPeak: 11.6, afterCarbon: 4.4, afterPue: 1.12 },
};

export const BASELINE = { peak: 14.2, carbon: 9.1, pue: 1.31 } as const;
export const CARBON_MULT: Record<CarbonPriority, number> = { low: 0.9, medium: 1.0, high: 1.14 };
export const GPU_NIGHT = 46;
export const YDAY = { energy: 392, cost: 112000, carbon: 139, pue: 1.22, gpu: 84, cooling: 9.8 } as const;

/** Scenario-level carbon-intensity forecast base (g/kWh). */
export const CARBON_BASE: Record<ScenarioKey, number> = {
  normal: 320,
  surge: 350,
  inference: 300,
  cooling: 310,
  power: 340,
  lowcarbon: 180,
};

/** Cooling-tolerance → recommendation confidence for the thermal card. */
export const COOL_CONF: Record<CarbonPriority, number> = { low: 72, medium: 78, high: 85 };

/** BUMP scaling so small template numbers read against big fleet totals. */
export const BUMP_SCALE: Record<string, number> = { energy: 16, cost: 18, carbon: 15 };

export const ZONE_BASE: Record<ZoneId, number> = { A: 72, B: 88, C: 64, D: 41, E: 55 };

export interface ZoneDetail {
  load: string;
  variance: string;
  headroom: string;
  action: string;
}

export const ZONE_DETAIL: Record<ZoneId, ZoneDetail> = {
  A: { load: '72%', variance: '5.1°C', headroom: 'Ample', action: 'Within target; monitor only.' },
  B: { load: '88%', variance: '9.8°C', headroom: 'Limited', action: 'Reduce compute density first, then adjust local cooling setpoint.' },
  C: { load: '64%', variance: '4.4°C', headroom: 'Ample', action: 'Available to absorb shifted load.' },
  D: { load: '41%', variance: '3.2°C', headroom: 'Ample', action: 'Idle capacity; candidate for consolidation.' },
  E: { load: '55%', variance: '4.0°C', headroom: 'Moderate', action: 'Stable; no change recommended.' },
};

export interface RegionDetail {
  flex: string;
  action: string;
}

export const REGION_DETAIL: Record<InfraRegionId, RegionDetail> = {
  'us-west': { flex: '34%', action: 'Shift 18% of flexible training to US-CENTRAL.' },
  'us-central': { flex: '46%', action: 'Accept shifted training; ample cooling headroom available.' },
  'us-east': { flex: '12%', action: 'Hold latency-critical inference in region (SLA-locked).' },
  'eu-west': { flex: '52%', action: 'Pull forward flexible batch into the low-carbon window.' },
  apac: { flex: '21%', action: 'Reroute flexible training away from constrained cooling.' },
};

/** Control-deck explainer strings by mode. */
export const MODE_EXPLAIN: Record<OptimizationMode, string> = {
  conservative: 'Conservative mode favors SLA confidence and thermal headroom over savings; fewer workloads are eligible to move.',
  balanced: 'Balanced mode prioritizes energy savings while preserving thermal headroom and SLA-locked workloads.',
  aggressive: 'Aggressive mode unlocks the most savings and surfaces more warnings, with lower confidence.',
};

export const CARBON_EXPLAIN: Partial<Record<CarbonPriority, string>> = {
  high: ' High carbon priority moves flexible workloads toward lower-carbon regions even when cost savings are smaller.',
  low: ' Low carbon priority weights cost and energy efficiency over emissions.',
};

/** Lifetime counter seed values (illustrative running totals). */
export const LIFETIME_SEED = { energy: 52.4, cost: 14.9, carbon: 18500, gpuh: 2.46 } as const;

export function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}
