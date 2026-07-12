/**
 * Simulation engine — framework-independent, deterministic.
 *
 * Exposes the full operator surface: create, load, advance, update controls,
 * generate/approve/reject/stage/simulate/verify, reset, serialize, restore.
 * Every function is pure: it takes a state and returns a NEW state, never
 * mutating its input. Determinism is guaranteed by an injected clock (the
 * `advance` delta) and a seeded PRNG for the only stochastic values (telemetry
 * noise and lifetime drift).
 */

import type {
  ActionEffect,
  AccumulatedEffects,
  CoordinationEvent,
  KpiBump,
  RecommendationCard,
  ScenarioKey,
  SimulationState,
  StagedAction,
  TelemetrySample,
  TopoNodeId,
  WorkloadFilter,
  WorkloadRow,
  WorkloadState,
  ZoneId,
} from '../models/types';
import { BUMP_SCALE, LIFETIME_SEED, ZONE_BASE, clamp } from './constants';
import { SCN, SCENARIO_META } from '../scenarios/scenarios';
import { RECOMMENDATION_POOL } from '../scenarios/recommendations';
import { WORKLOAD_POOL } from '../scenarios/workloads';
import { computeFleet } from './compute';
import { createPrng } from './prng';
import { dayFractionFromSeconds, formatClock } from './accumulation';

export const SCHEMA_VERSION = 2;

const HISTORY_LIMIT = 240;
const MAX_EVENTS = 9;

const AMBIENT_EVENTS: Array<Omit<CoordinationEvent, 'time'>> = [
  { type: 'analyzed', text: 'Recomputed carbon-aware placement across regions' },
  { type: 'verified', text: 'Cooling setpoints remain within target band' },
  { type: 'acted', text: 'Rebalanced <b>3%</b> flexible load toward a lower-carbon grid' },
  { type: 'analyzed', text: 'Grid carbon forecast refreshed for the next operating window' },
  { type: 'verified', text: 'All priority SLAs holding' },
  { type: 'acted', text: 'Deferred <b>2 batch jobs</b> to a cheaper window' },
];

function freshBump(): KpiBump {
  return { energy: 0, cost: 0, carbon: 0, cooling: 0, gpu: 0, pue: 0 };
}

function freshEffects(): AccumulatedEffects {
  return { regionDelta: {}, riskOverride: {}, bump: freshBump(), peakBias: 0, zoneDelta: {} };
}

/** Extract the numeric action counter from a scenario's trace string. */
function traceActionNumber(scenario: ScenarioKey): number {
  const match = /#(\d+)/.exec(SCN[scenario].trace.action);
  return match ? Number(match[1]) : 184;
}

/** Default simulation clock seeded to a mid-afternoon operating point. */
function defaultClockSeconds(): number {
  // 14:30 UTC — a representative point on the accumulation curve so the demo
  // opens mid-day rather than at the overnight floor. Deterministic (no Date).
  return 14 * 3600 + 30 * 60;
}

// ---- Recommendation / workload construction ---------------------------------

function makeRec(poolIndex: number, seq: number, createdAt: number): RecommendationCard {
  return {
    id: 'REC-' + String(seq).padStart(2, '0'),
    poolIndex,
    state: 'proposed',
    createdAt,
    template: RECOMMENDATION_POOL[poolIndex % RECOMMENDATION_POOL.length]!,
  };
}

function workloadState(risk: string): WorkloadState {
  return risk === 'high' ? 'constrained' : 'running';
}

function makeWorkload(poolIndex: number, seq: number): WorkloadRow {
  const template = WORKLOAD_POOL[poolIndex % WORKLOAD_POOL.length]!;
  return {
    id: 'WL-' + String(seq).padStart(2, '0'),
    poolIndex,
    state: workloadState(template.risk),
    template,
  };
}

// ---- Public API -------------------------------------------------------------

export interface CreateOptions {
  scenario?: ScenarioKey;
  clockSeconds?: number;
}

/** Build a fresh simulation state for a scenario. */
export function createInitialSimulationState(options: CreateOptions = {}): SimulationState {
  const scenario = options.scenario ?? 'normal';
  const clockSeconds = options.clockSeconds ?? defaultClockSeconds();
  const seed = SCENARIO_META[scenario].seed;
  const prng = createPrng(seed);

  const recommendations = [0, 1, 2].map((i, idx) => makeRec(i, idx + 1, clockSeconds));
  const workloads = [0, 1, 2, 3].map((i, idx) => makeWorkload(i, idx + 1));

  return {
    schemaVersion: SCHEMA_VERSION,
    seed,
    scenario,
    controls: { mode: 'balanced', carbon: 'medium', flex: 60, cooling: 'medium', view: 'after' },
    clock: { seconds: clockSeconds, running: true, speed: 1 },
    effects: freshEffects(),
    recommendations,
    recPointer: 3,
    recSeq: 3,
    workloads,
    workloadPointer: 4,
    workloadSeq: 4,
    workloadFilter: 'all',
    queue: [],
    queueSeq: 0,
    staged: [],
    stagedSeq: 0,
    verification: null,
    events: SCN[scenario].events.slice(-MAX_EVENTS),
    actionCounter: traceActionNumber(scenario),
    history: [],
    lifetime: { ...LIFETIME_SEED },
    prngState: prng.getState(),
    selectedRegion: null,
  };
}

/** Switch to a different scenario, clearing all approved/staged state. */
export function loadScenario(state: SimulationState, scenario: ScenarioKey): SimulationState {
  const clockSeconds = state.clock.seconds;
  const seed = SCENARIO_META[scenario].seed;
  const prng = createPrng(seed);
  return {
    ...state,
    scenario,
    seed,
    effects: freshEffects(),
    recommendations: [0, 1, 2].map((i, idx) => makeRec(i, idx + 1, clockSeconds)),
    recPointer: 3,
    recSeq: 3,
    workloads: [0, 1, 2, 3].map((i, idx) => makeWorkload(i, idx + 1)),
    workloadPointer: 4,
    workloadSeq: 4,
    workloadFilter: 'all',
    queue: [],
    queueSeq: 0,
    staged: [],
    stagedSeq: 0,
    verification: null,
    events: SCN[scenario].events.slice(-MAX_EVENTS),
    actionCounter: traceActionNumber(scenario),
    history: [],
    lifetime: { ...state.lifetime },
    prngState: prng.getState(),
    selectedRegion: null,
  };
}

/** Reset (rerun) the current scenario from its initial conditions. */
export function resetSimulation(state: SimulationState): SimulationState {
  return loadScenario({ ...state, clock: { ...state.clock } }, state.scenario);
}

/** Merge new operator-control values. Derived metrics recompute lazily. */
export function updateOperatorConstraints(
  state: SimulationState,
  patch: Partial<SimulationState['controls']>,
): SimulationState {
  const controls = { ...state.controls, ...patch };
  if (patch.flex !== undefined) controls.flex = clamp(Math.round(patch.flex), 0, 100);
  return { ...state, controls };
}

/** Ensure exactly three recommendation cards are present (used at init/refresh). */
export function generateRecommendations(state: SimulationState): SimulationState {
  if (state.recommendations.length >= 3) return state;
  const cards = [...state.recommendations];
  let pointer = state.recPointer;
  let seq = state.recSeq;
  while (cards.length < 3) {
    seq += 1;
    cards.push(makeRec(pointer, seq, state.clock.seconds));
    pointer += 1;
  }
  return { ...state, recommendations: cards, recPointer: pointer, recSeq: seq };
}

// ---- Effect application -----------------------------------------------------

function applyEffect(effects: AccumulatedEffects, fx: ActionEffect): AccumulatedEffects {
  const regionDelta = { ...effects.regionDelta };
  const riskOverride = { ...effects.riskOverride };
  const bump: KpiBump = { ...effects.bump };
  const zoneDelta = { ...effects.zoneDelta };
  let peakBias = effects.peakBias;

  if (fx.regionDelta) {
    for (const k of Object.keys(fx.regionDelta) as (keyof typeof fx.regionDelta)[]) {
      regionDelta[k] = (regionDelta[k] ?? 0) + (fx.regionDelta[k] ?? 0);
    }
  }
  if (fx.risk) {
    for (const k of Object.keys(fx.risk) as (keyof typeof fx.risk)[]) {
      const level = fx.risk[k];
      if (level) riskOverride[k] = level;
    }
  }
  if (fx.bump) {
    for (const k of Object.keys(fx.bump) as (keyof KpiBump)[]) {
      bump[k] += (fx.bump[k] ?? 0) * (BUMP_SCALE[k] ?? 1);
    }
  }
  if (fx.telemetry) {
    if (typeof fx.telemetry.peak === 'number') peakBias += fx.telemetry.peak;
    if (fx.telemetry.zones) {
      for (const z of Object.keys(fx.telemetry.zones) as ZoneId[]) {
        zoneDelta[z] = (zoneDelta[z] ?? 0) + (fx.telemetry.zones[z] ?? 0);
      }
    }
  }
  return { regionDelta, riskOverride, bump, zoneDelta, peakBias };
}

// ---- Recommendation lifecycle ----------------------------------------------

/** Approve a proposed recommendation → enters the operator queue. */
export function approveRecommendation(state: SimulationState, id: string): SimulationState {
  const card = state.recommendations.find((r) => r.id === id);
  if (!card || card.state !== 'proposed') return state;
  const recommendations = state.recommendations.map((r) =>
    r.id === id ? { ...r, state: 'approved' as const } : r,
  );
  const queueSeq = state.queueSeq + 1;
  const queue = [
    ...state.queue,
    {
      id: 'Q-' + String(queueSeq).padStart(2, '0'),
      recId: id,
      cat: card.template.cat,
      lane: 'approved' as const,
      timestamp: state.clock.seconds,
    },
  ];
  return { ...state, recommendations, queue, queueSeq };
}

/** Reject a recommendation → removed from the queue, has no fleet effect. */
export function rejectRecommendation(state: SimulationState, id: string): SimulationState {
  const card = state.recommendations.find((r) => r.id === id);
  if (!card || card.state === 'simulated' || card.state === 'verified' || card.state === 'rejected') {
    return state;
  }
  const recommendations = state.recommendations.map((r) =>
    r.id === id ? { ...r, state: 'rejected' as const } : r,
  );
  const queue = state.queue.filter((q) => q.recId !== id);
  const event: CoordinationEvent = {
    time: formatClock(state.clock.seconds).slice(0, 5),
    type: 'rejected',
    text: 'Recommendation ' + id + ' rejected — no change applied',
  };
  const events = [...state.events, event].slice(-MAX_EVENTS);
  return { ...state, recommendations, queue, events };
}

/**
 * Simulate an approved recommendation → applies its fleet effects, produces a
 * verification result, and advances the operator queue. This is the only point
 * at which a recommendation changes fleet state — nothing executes silently.
 */
export function simulateAction(state: SimulationState, id: string): SimulationState {
  const card = state.recommendations.find((r) => r.id === id);
  if (!card || card.state !== 'approved') return state;

  const effects = applyEffect(state.effects, card.template.fx);
  const recommendations = state.recommendations.map((r) =>
    r.id === id ? { ...r, state: 'simulated' as const } : r,
  );
  const queue = state.queue.map((q) => (q.recId === id ? { ...q, lane: 'verified' as const, timestamp: state.clock.seconds } : q));

  const nextState: SimulationState = { ...state, effects, recommendations, queue };
  return verifyAction(nextState, id);
}

/** Produce the verification comparison for a simulated recommendation. */
export function verifyAction(state: SimulationState, id: string): SimulationState {
  const card = state.recommendations.find((r) => r.id === id);
  if (!card) return state;
  const before = computeFleet({ ...state, effects: freshEffects() });
  const after = computeFleet(state);
  const recommendations = state.recommendations.map((r) =>
    r.id === id ? { ...r, state: 'verified' as const } : r,
  );
  const verification = {
    recId: id,
    strings: card.template.verify,
    deltas: {
      peak: {
        baseline: before.compare.peak.before,
        projected: after.compare.peak.after,
        simulated: after.compare.peak.after,
        unit: 'MW',
      },
      carbon: {
        baseline: before.compare.carbon.before,
        projected: after.compare.carbon.after,
        simulated: after.compare.carbon.after,
        unit: 't',
      },
      pue: {
        baseline: before.compare.pue.before,
        projected: after.compare.pue.after,
        simulated: after.compare.pue.after,
        unit: '',
      },
    },
  };
  return { ...state, recommendations, verification };
}

/** Replace a terminal (simulated/verified/rejected) card with the next pool item. */
export function regenerateRecommendation(state: SimulationState, id: string): SimulationState {
  const idx = state.recommendations.findIndex((r) => r.id === id);
  if (idx === -1) return state;
  const card = state.recommendations[idx]!;
  if (card.state === 'proposed' || card.state === 'approved') return state;
  const seq = state.recSeq + 1;
  const next = makeRec(state.recPointer, seq, state.clock.seconds);
  const recommendations = [...state.recommendations];
  recommendations[idx] = next;
  return { ...state, recommendations, recPointer: state.recPointer + 1, recSeq: seq };
}

// ---- Workload staging -------------------------------------------------------

function stagedSummary(fx: ActionEffect): string {
  if (!fx.regionDelta || Object.keys(fx.regionDelta).length === 0) return 'Local optimization';
  return (Object.keys(fx.regionDelta) as (keyof typeof fx.regionDelta)[])
    .map((k) => {
      const v = fx.regionDelta![k] ?? 0;
      const label = String(k).toUpperCase();
      return `${label} ${v > 0 ? '+' : ''}${v}%`;
    })
    .join(' · ');
}

/**
 * Stage a workload action → applies its fleet effects, records a staged action,
 * and cycles the orchestration table to the next pool workload.
 */
export function stageAction(state: SimulationState, workloadId: string): SimulationState {
  const idx = state.workloads.findIndex((w) => w.id === workloadId);
  if (idx === -1) return state;
  const w = state.workloads[idx]!;

  const effects = applyEffect(state.effects, w.template.fx);
  const stagedSeq = state.stagedSeq + 1;
  const staged: StagedAction = {
    id: 'WLS-' + String(stagedSeq).padStart(2, '0'),
    label: w.template.name,
    summary: stagedSummary(w.template.fx),
    topo: w.template.topo,
    source: 'workload',
    timestamp: state.clock.seconds,
  };

  const seq = state.workloadSeq + 1;
  const replacement = makeWorkload(state.workloadPointer, seq);
  const workloads = [...state.workloads];
  workloads[idx] = replacement;

  return {
    ...state,
    effects,
    workloads,
    workloadPointer: state.workloadPointer + 1,
    workloadSeq: seq,
    staged: [...state.staged, staged],
    stagedSeq,
  };
}

/** Set the active workload filter. */
export function setWorkloadFilter(state: SimulationState, filter: WorkloadFilter): SimulationState {
  return { ...state, workloadFilter: filter };
}

// ---- Region selection -------------------------------------------------------

export function selectRegion(state: SimulationState, region: TopoNodeId | null): SimulationState {
  return { ...state, selectedRegion: region };
}

// ---- Time advance -----------------------------------------------------------

/** Deterministic power-demand sample for the telemetry chart. */
function powerSample(prng: ReturnType<typeof createPrng>, fraction: number, peakBias: number): number {
  const base = 10.5 + Math.sin(fraction * Math.PI * 1.3) * 2.4;
  const noise = (prng.next() - 0.5) * 0.5;
  return clamp(base + Math.sin(fraction * 12 * 0.7) * 0.4 + noise + peakBias, 7.5, 15.5);
}

/**
 * Advance the simulation clock by `dtSeconds` of real time (scaled by speed),
 * recording a telemetry sample and drifting lifetime counters. When
 * `force` is true the clock advances even if paused (used for step-forward).
 */
export function advanceSimulation(
  state: SimulationState,
  dtSeconds: number,
  force = false,
): SimulationState {
  if (!state.clock.running && !force) return state;
  const advanceBy = dtSeconds * (force ? 1 : state.clock.speed);
  const seconds = state.clock.seconds + advanceBy;

  const prng = createPrng(0);
  prng.setState(state.prngState);

  const fleet = computeFleet({ ...state, clock: { ...state.clock, seconds } });
  const power = powerSample(prng, dayFractionFromSeconds(seconds), state.effects.peakBias);

  const sample: TelemetrySample = {
    t: seconds,
    energy: fleet.metrics.energy.today,
    cost: fleet.metrics.cost.today,
    carbon: fleet.metrics.carbon.today,
    carbonIntensity: fleet.carbonNow,
    cooling: fleet.metrics.cooling.today,
    gpu: fleet.metrics.gpu.today,
    pue: fleet.metrics.pue.today,
    power,
  };
  const history = [...state.history, sample].slice(-HISTORY_LIMIT);

  // Lifetime counters drift slowly (illustrative running totals).
  const lifetime = {
    energy: state.lifetime.energy + (0.004 + prng.next() * 0.006) * (advanceBy / 60),
    cost: state.lifetime.cost + (0.003 + prng.next() * 0.005) * (advanceBy / 60),
    carbon: state.lifetime.carbon + (1.2 + prng.next() * 1.8) * (advanceBy / 60),
    gpuh: state.lifetime.gpuh + (0.0006 + prng.next() * 0.001) * (advanceBy / 60),
  };

  return {
    ...state,
    clock: { ...state.clock, seconds },
    history,
    lifetime,
    prngState: prng.getState(),
  };
}

/** Step the clock forward by a fixed amount while paused. */
export function stepForward(state: SimulationState, seconds = 900): SimulationState {
  return advanceSimulation(state, seconds, true);
}

export function setClockRunning(state: SimulationState, running: boolean): SimulationState {
  return { ...state, clock: { ...state.clock, running } };
}

export function setClockSpeed(state: SimulationState, speed: number): SimulationState {
  return { ...state, clock: { ...state.clock, speed: clamp(speed, 1, 3600) } };
}

/** Append the next deterministic low-frequency coordination event. */
export function appendAmbientEvent(state: SimulationState): SimulationState {
  const next = AMBIENT_EVENTS[state.actionCounter % AMBIENT_EVENTS.length]!;
  const event: CoordinationEvent = {
    ...next,
    time: formatClock(state.clock.seconds).slice(0, 5),
  };
  return {
    ...state,
    actionCounter: state.actionCounter + 1,
    events: [...state.events, event].slice(-MAX_EVENTS),
  };
}

// ---- Cooling zones ----------------------------------------------------------

export function zoneTarget(state: SimulationState, zone: ZoneId): number {
  return clamp(ZONE_BASE[zone] + (state.effects.zoneDelta[zone] ?? 0), 0, 100);
}

// ---- Serialization ----------------------------------------------------------

export function serializeSimulation(state: SimulationState): string {
  return JSON.stringify(state);
}

const SCENARIO_KEY_SET = new Set(Object.keys(SCENARIO_META));

/** Validate and restore persisted state; returns null if the payload is invalid. */
export function restoreSimulation(payload: string | unknown): SimulationState | null {
  let data: unknown;
  try {
    data = typeof payload === 'string' ? JSON.parse(payload) : payload;
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const candidate = data as Partial<SimulationState>;
  if (typeof candidate.scenario !== 'string' || !SCENARIO_KEY_SET.has(candidate.scenario)) return null;
  if (!candidate.controls || typeof candidate.controls !== 'object') return null;
  if (typeof candidate.schemaVersion !== 'number') return null;

  // Rebuild from a fresh base and overlay validated fields so that a partial or
  // older-schema payload cannot leave the store in a broken shape.
  const base = createInitialSimulationState({ scenario: candidate.scenario });
  const merged: SimulationState = {
    ...base,
    ...candidate,
    schemaVersion: SCHEMA_VERSION,
    scenario: candidate.scenario,
    controls: { ...base.controls, ...candidate.controls },
    clock: { ...base.clock, ...(candidate.clock ?? {}) },
    effects: { ...freshEffects(), ...(candidate.effects ?? {}) },
    lifetime: { ...base.lifetime, ...(candidate.lifetime ?? {}) },
  };
  return merged;
}
