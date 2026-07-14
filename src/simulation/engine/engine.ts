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
  EntityRef,
  InfraRegionId,
  KpiBump,
  OperatorActionRecord,
  RecommendationCard,
  ScenarioKey,
  SelectedEntity,
  SimulationState,
  StagedAction,
  TelemetrySample,
  TopoNodeId,
  WorkloadFilter,
  WorkloadRow,
  WorkloadState,
  ZoneId,
} from '../models/types';
import { BUMP_SCALE, INFRA_TO_TOPO, LIFETIME_SEED, ZONE_BASE, clamp } from './constants';
import { SCN, SCENARIO_META } from '../scenarios/scenarios';
import { RECOMMENDATION_POOL } from '../scenarios/recommendations';
import { WORKLOAD_POOL } from '../scenarios/workloads';
import { computeFleet } from './compute';
import { createPrng } from './prng';
import { dayFractionFromSeconds } from './accumulation';
import { AMBIENT_EVENTS, MAX_EVENTS, makeEvent, seedEvents, type EventInput } from './events';

export const SCHEMA_VERSION = 3;

const HISTORY_LIMIT = 240;

function freshBump(): KpiBump {
  return { energy: 0, cost: 0, carbon: 0, cooling: 0, gpu: 0, pue: 0 };
}

// ---- Event / log helpers ------------------------------------------------------

/** Append a structured event exactly once, advancing the unique-id counter. */
function withEvent(state: SimulationState, input: EventInput): SimulationState {
  const eventSeq = state.eventSeq + 1;
  const event = makeEvent(eventSeq, state.clock.seconds, input);
  return { ...state, eventSeq, events: [...state.events, event].slice(-MAX_EVENTS) };
}

/** Record an operator input in the append-only replay log. */
function withLog(
  state: SimulationState,
  kind: OperatorActionRecord['kind'],
  payload: string,
): SimulationState {
  const record: OperatorActionRecord = {
    seq: state.actionLog.length + 1,
    tick: state.clock.seconds,
    kind,
    payload,
  };
  return { ...state, actionLog: [...state.actionLog, record] };
}

/** Region entity refs for the infra regions an effect touches. */
function effectRegionRefs(fx: ActionEffect): EntityRef[] {
  if (!fx.regionDelta) return [];
  return (Object.keys(fx.regionDelta) as InfraRegionId[]).map((k) => ({
    type: 'region',
    id: INFRA_TO_TOPO[k],
  }));
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
  const { events, nextSeq } = seedEvents(SCN[scenario].events, 0);

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
    events,
    eventSeq: nextSeq,
    actionCounter: traceActionNumber(scenario),
    history: [],
    lifetime: { ...LIFETIME_SEED },
    prngState: prng.getState(),
    selectedEntity: null,
    actionLog: [],
  };
}

/** Switch to a different scenario, clearing all approved/staged state. */
export function loadScenario(state: SimulationState, scenario: ScenarioKey): SimulationState {
  const clockSeconds = state.clock.seconds;
  const seed = SCENARIO_META[scenario].seed;
  const prng = createPrng(seed);
  // The unique-id counter carries forward so an id can never repeat in-session.
  const { events, nextSeq } = seedEvents(SCN[scenario].events, state.eventSeq);
  const next: SimulationState = {
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
    events,
    eventSeq: nextSeq,
    actionCounter: traceActionNumber(scenario),
    history: [],
    lifetime: { ...state.lifetime },
    prngState: prng.getState(),
    selectedEntity: null,
    actionLog: [...state.actionLog],
  };
  return withLog(
    withEvent(next, {
      category: 'system',
      severity: 'info',
      title: 'Scenario loaded',
      text: `Scenario switched to <b>${SCENARIO_META[scenario].name}</b>`,
    }),
    'loadScenario',
    scenario,
  );
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
  const next = withEvent(
    { ...state, recommendations, queue, queueSeq },
    {
      category: 'approval',
      severity: 'ok',
      title: 'Operator approved',
      text: `Recommendation <b>${id}</b> approved: staged for simulation`,
      entities: [{ type: 'recommendation', id }, ...effectRegionRefs(card.template.fx)],
      recId: id,
    },
  );
  return withLog(next, 'approve', id);
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
  const next = withEvent(
    { ...state, recommendations, queue },
    {
      category: 'rejection',
      severity: 'warn',
      title: 'Operator rejected',
      text: `Recommendation <b>${id}</b> rejected: no change applied`,
      entities: [{ type: 'recommendation', id }],
      recId: id,
    },
  );
  return withLog(next, 'reject', id);
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

  let next: SimulationState = { ...state, effects, recommendations, queue };
  next = withEvent(next, {
    category: 'action',
    severity: 'info',
    title: 'Action applied',
    text: `Applied <b>${card.template.type}</b> from ${id} to the fleet`,
    entities: [{ type: 'recommendation', id }, ...effectRegionRefs(card.template.fx)],
    recId: id,
  });
  // Routing actions move load between topology nodes → record the migration.
  if (card.template.topo.to) {
    next = withEvent(next, {
      category: 'migration',
      severity: 'info',
      title: 'Workload migration',
      text: `Workload movement <b>${card.template.topo.from} → ${card.template.topo.to}</b> under ${id}`,
      entities: [
        { type: 'region', id: card.template.topo.from },
        { type: 'region', id: card.template.topo.to },
        { type: 'recommendation', id },
      ],
      recId: id,
    });
  }
  next = withLog(next, 'simulate', id);
  return verifyAction(next, id);
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
  return withEvent(
    { ...state, recommendations, verification },
    {
      category: 'verification',
      severity: 'ok',
      title: 'Verification complete',
      text: `Verified ${id}: peak <b>${card.template.verify.peak}</b>, PUE <b>${card.template.verify.pue}</b>, emissions <b>${card.template.verify.emissions}</b>`,
      entities: [{ type: 'recommendation', id }],
      recId: id,
    },
  );
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
  const replaced = withEvent(
    { ...state, recommendations, recPointer: state.recPointer + 1, recSeq: seq },
    {
      category: 'recommendation',
      severity: 'info',
      title: 'Recommendation generated',
      text: `New recommendation <b>${next.id}</b>: ${next.template.type}`,
      entities: [{ type: 'recommendation', id: next.id }, ...effectRegionRefs(next.template.fx)],
      recId: next.id,
    },
  );
  return withLog(replaced, 'regenerate', id);
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

  let next: SimulationState = {
    ...state,
    effects,
    workloads,
    workloadPointer: state.workloadPointer + 1,
    workloadSeq: seq,
    staged: [...state.staged, staged],
    stagedSeq,
  };
  next = withEvent(next, {
    category: 'migration',
    severity: 'info',
    title: 'Workload action staged',
    text: `<b>${w.template.name}</b>: ${w.template.action} (${w.template.region})`,
    entities: [
      { type: 'workload', id: workloadId },
      ...(w.template.topo.to
        ? ([
            { type: 'region', id: w.template.topo.from },
            { type: 'region', id: w.template.topo.to },
          ] as EntityRef[])
        : effectRegionRefs(w.template.fx)),
    ],
    actionId: staged.id,
  });
  return withLog(next, 'stage', workloadId);
}

/** Set the active workload filter. */
export function setWorkloadFilter(state: SimulationState, filter: WorkloadFilter): SimulationState {
  return { ...state, workloadFilter: filter };
}

// ---- Linked selection ---------------------------------------------------------

/** Select any entity (region, workload, recommendation, event) or clear. */
export function selectEntity(state: SimulationState, entity: SelectedEntity): SimulationState {
  return { ...state, selectedEntity: entity };
}

/** Convenience wrapper preserving the original region-selection call sites. */
export function selectRegion(state: SimulationState, region: TopoNodeId | null): SimulationState {
  return selectEntity(state, region ? { type: 'region', id: region } : null);
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

/**
 * Seek the timeline forward to an absolute simulation time (seconds of the
 * virtual day). Forward-only: the engine advances deterministically in bounded
 * chunks so telemetry sampling cadence is preserved. Backward seeking is not
 * faked — replaying from the initial state via {@link SimulationState.actionLog}
 * is the structured path for adding it later.
 */
export function seekToTime(state: SimulationState, targetSeconds: number): SimulationState {
  const delta = targetSeconds - state.clock.seconds;
  if (delta <= 0) return state;
  // Sample at most every 15 simulated minutes, with a hard chunk bound.
  const CHUNK = 900;
  const chunks = Math.min(200, Math.ceil(delta / CHUNK));
  const per = delta / chunks;
  let next = state;
  for (let i = 0; i < chunks; i++) next = advanceSimulation(next, per, true);
  return withLog(next, 'seek', String(Math.round(targetSeconds)));
}

export function setClockRunning(state: SimulationState, running: boolean): SimulationState {
  return { ...state, clock: { ...state.clock, running } };
}

export function setClockSpeed(state: SimulationState, speed: number): SimulationState {
  return { ...state, clock: { ...state.clock, speed: clamp(speed, 1, 3600) } };
}

/** Append the next deterministic low-frequency coordination event. */
export function appendAmbientEvent(state: SimulationState): SimulationState {
  const template = AMBIENT_EVENTS[state.actionCounter % AMBIENT_EVENTS.length]!;
  return withEvent({ ...state, actionCounter: state.actionCounter + 1 }, template);
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

  // Schema migration: v2 payloads carried unstructured events and a
  // region-only selection. Re-seed events and map the selection forward.
  const eventsValid =
    Array.isArray(merged.events) && merged.events.every((e) => e && typeof e === 'object' && 'id' in e);
  if (!eventsValid) {
    merged.events = base.events;
    merged.eventSeq = base.eventSeq;
  }
  if (typeof merged.eventSeq !== 'number') merged.eventSeq = base.eventSeq;
  if (!Array.isArray(merged.actionLog)) merged.actionLog = [];
  const legacyRegion = (candidate as { selectedRegion?: TopoNodeId | null }).selectedRegion;
  if (merged.selectedEntity === undefined || merged.selectedEntity === null) {
    merged.selectedEntity = legacyRegion ? { type: 'region', id: legacyRegion } : null;
  }
  delete (merged as { selectedRegion?: unknown }).selectedRegion;
  return merged;
}
