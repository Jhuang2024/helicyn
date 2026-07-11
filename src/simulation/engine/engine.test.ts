import { describe, it, expect } from 'vitest';
import {
  advanceSimulation,
  approveRecommendation,
  createInitialSimulationState,
  generateRecommendations,
  loadScenario,
  regenerateRecommendation,
  rejectRecommendation,
  resetSimulation,
  restoreSimulation,
  serializeSimulation,
  setClockRunning,
  simulateAction,
  stageAction,
  updateOperatorConstraints,
} from './engine';
import { computeFleet } from './compute';
import {
  selectConstrainedRegionCount,
  selectCostAvoided,
  selectAveragePue,
} from '../selectors/selectors';

describe('scenario initialization', () => {
  it('creates a normal-operations state with three recs and four workloads', () => {
    const s = createInitialSimulationState();
    expect(s.scenario).toBe('normal');
    expect(s.recommendations).toHaveLength(3);
    expect(s.workloads).toHaveLength(4);
    expect(s.queue).toHaveLength(0);
    expect(s.controls.mode).toBe('balanced');
    expect(s.recommendations.every((r) => r.state === 'proposed')).toBe(true);
  });

  it('seeds the action counter from the scenario trace', () => {
    expect(createInitialSimulationState({ scenario: 'surge' }).actionCounter).toBe(207);
    expect(createInitialSimulationState({ scenario: 'power' }).actionCounter).toBe(245);
  });
});

describe('deterministic output', () => {
  it('computes identical fleet metrics for identical state', () => {
    const a = createInitialSimulationState({ scenario: 'surge', clockSeconds: 52200 });
    const b = createInitialSimulationState({ scenario: 'surge', clockSeconds: 52200 });
    expect(computeFleet(a)).toEqual(computeFleet(b));
  });

  it('advances telemetry deterministically for the same seed', () => {
    const base = createInitialSimulationState({ scenario: 'normal', clockSeconds: 3600 });
    const a = advanceSimulation(advanceSimulation(base, 60), 60);
    const b = advanceSimulation(advanceSimulation(base, 60), 60);
    expect(a.history).toEqual(b.history);
    expect(a.lifetime).toEqual(b.lifetime);
  });
});

describe('metric calculations', () => {
  it('matches the balanced-mode projected energy formula', () => {
    const s = createInitialSimulationState({ scenario: 'normal' });
    // energy = 432 * f * 1.0 ; f = 0.82 + 0.60*0.36 = 1.036
    const fleet = computeFleet(s);
    expect(fleet.projected.energy).toBeCloseTo(432 * 1.036, 5);
  });

  it('scales carbon by carbon priority', () => {
    const low = updateOperatorConstraints(createInitialSimulationState(), { carbon: 'low' });
    const high = updateOperatorConstraints(createInitialSimulationState(), { carbon: 'high' });
    expect(computeFleet(high).projected.carbon).toBeGreaterThan(computeFleet(low).projected.carbon);
  });

  it('baseline view zeroes cumulative metrics', () => {
    const s = updateOperatorConstraints(createInitialSimulationState(), { view: 'baseline' });
    const fleet = computeFleet(s);
    expect(fleet.metrics.energy.today).toBe(0);
    expect(fleet.metrics.cost.today).toBe(0);
  });

  it('constrained region count reflects the scenario', () => {
    expect(selectConstrainedRegionCount(createInitialSimulationState({ scenario: 'normal' }))).toBe(2);
    expect(
      selectConstrainedRegionCount(createInitialSimulationState({ scenario: 'surge' })),
    ).toBeGreaterThanOrEqual(2);
  });
});

describe('control effects', () => {
  it('aggressive mode lowers PUE relative to conservative', () => {
    const cons = updateOperatorConstraints(createInitialSimulationState(), { mode: 'conservative' });
    const aggr = updateOperatorConstraints(createInitialSimulationState(), { mode: 'aggressive' });
    expect(selectAveragePue(aggr)).toBeLessThan(selectAveragePue(cons));
  });

  it('flexibility redistributes us-west load to us-central', () => {
    const low = updateOperatorConstraints(createInitialSimulationState(), { flex: 0 });
    const high = updateOperatorConstraints(createInitialSimulationState(), { flex: 100 });
    const west = (s: typeof low) => computeFleet(s).regions.find((r) => r.id === 'us-west')!.load;
    const central = (s: typeof low) => computeFleet(s).regions.find((r) => r.id === 'us-central')!.load;
    expect(west(high)).toBeLessThan(west(low));
    expect(central(high)).toBeGreaterThan(central(low));
  });

  it('clamps flexibility to 0..100', () => {
    expect(updateOperatorConstraints(createInitialSimulationState(), { flex: 250 }).controls.flex).toBe(100);
    expect(updateOperatorConstraints(createInitialSimulationState(), { flex: -5 }).controls.flex).toBe(0);
  });
});

describe('recommendation lifecycle', () => {
  it('approves a proposed recommendation and enqueues it', () => {
    const s = createInitialSimulationState();
    const id = s.recommendations[0]!.id;
    const next = approveRecommendation(s, id);
    expect(next.recommendations[0]!.state).toBe('approved');
    expect(next.queue).toHaveLength(1);
    expect(next.queue[0]!.lane).toBe('approved');
  });

  it('cannot approve an already-approved recommendation twice', () => {
    const s = createInitialSimulationState();
    const id = s.recommendations[0]!.id;
    const once = approveRecommendation(s, id);
    const twice = approveRecommendation(once, id);
    expect(twice.queue).toHaveLength(1);
  });

  it('simulate applies fleet effects and produces verification', () => {
    const s = createInitialSimulationState();
    const id = s.recommendations[0]!.id;
    const before = computeFleet(s).projected.cost;
    const approved = approveRecommendation(s, id);
    const simulated = simulateAction(approved, id);
    expect(simulated.recommendations[0]!.state).toBe('verified');
    expect(simulated.verification).not.toBeNull();
    expect(simulated.verification!.recId).toBe(id);
    // Applying the bump raises projected cost above the untouched baseline.
    expect(computeFleet(simulated).projected.cost).toBeGreaterThan(before);
  });

  it('cannot simulate a recommendation that was never approved', () => {
    const s = createInitialSimulationState();
    const id = s.recommendations[0]!.id;
    expect(simulateAction(s, id)).toEqual(s);
  });

  it('rejection removes the queue item and has no fleet effect', () => {
    const s = createInitialSimulationState();
    const id = s.recommendations[0]!.id;
    const approved = approveRecommendation(s, id);
    const rejected = rejectRecommendation(approved, id);
    expect(rejected.recommendations[0]!.state).toBe('rejected');
    expect(rejected.queue).toHaveLength(0);
    expect(computeFleet(rejected).projected.cost).toBeCloseTo(computeFleet(s).projected.cost, 5);
  });

  it('a simulated recommendation cannot then be rejected', () => {
    const s = createInitialSimulationState();
    const id = s.recommendations[0]!.id;
    const simulated = simulateAction(approveRecommendation(s, id), id);
    const attempted = rejectRecommendation(simulated, id);
    expect(attempted.recommendations[0]!.state).toBe('verified');
  });

  it('regenerates a terminal card from the pool', () => {
    const s = createInitialSimulationState();
    const id = s.recommendations[0]!.id;
    const rejected = rejectRecommendation(s, id);
    const regenerated = regenerateRecommendation(rejected, id);
    expect(regenerated.recommendations[0]!.state).toBe('proposed');
    expect(regenerated.recommendations[0]!.poolIndex).toBe(3);
    expect(regenerated.recPointer).toBe(4);
  });

  it('generateRecommendations refills to three cards', () => {
    const s = createInitialSimulationState();
    const trimmed = { ...s, recommendations: s.recommendations.slice(0, 1) };
    expect(generateRecommendations(trimmed).recommendations).toHaveLength(3);
  });
});

describe('workload staging', () => {
  it('staging applies effects, records a staged action, and cycles the table', () => {
    const s = createInitialSimulationState();
    const id = s.workloads[0]!.id;
    const staged = stageAction(s, id);
    expect(staged.staged).toHaveLength(1);
    expect(staged.workloads).toHaveLength(4);
    expect(staged.workloads[0]!.poolIndex).toBe(4);
    // us-west load drops because the staged workload shifts it away.
    const westBefore = computeFleet(s).regions.find((r) => r.id === 'us-west')!.load;
    const westAfter = computeFleet(staged).regions.find((r) => r.id === 'us-west')!.load;
    expect(westAfter).toBeLessThan(westBefore);
  });
});

describe('scenario switching and reset', () => {
  it('loadScenario clears approved/staged state and switches data', () => {
    let s = createInitialSimulationState();
    s = approveRecommendation(s, s.recommendations[0]!.id);
    s = stageAction(s, s.workloads[0]!.id);
    const switched = loadScenario(s, 'cooling');
    expect(switched.scenario).toBe('cooling');
    expect(switched.queue).toHaveLength(0);
    expect(switched.staged).toHaveLength(0);
    expect(switched.verification).toBeNull();
    expect(switched.effects.bump.energy).toBe(0);
  });

  it('reset reruns the current scenario from initial conditions', () => {
    let s = createInitialSimulationState({ scenario: 'surge' });
    s = simulateAction(approveRecommendation(s, s.recommendations[0]!.id), s.recommendations[0]!.id);
    const reset = resetSimulation(s);
    expect(reset.scenario).toBe('surge');
    expect(reset.verification).toBeNull();
    expect(reset.recommendations.every((r) => r.state === 'proposed')).toBe(true);
  });
});

describe('clock advance', () => {
  it('does not advance while paused unless forced', () => {
    const s = setClockRunning(createInitialSimulationState({ clockSeconds: 3600 }), false);
    expect(advanceSimulation(s, 60).clock.seconds).toBe(3600);
    // Step-forward forces the advance.
    const stepped = advanceSimulation(s, 60, true);
    expect(stepped.clock.seconds).toBe(3660);
  });

  it('accumulates cost avoided as the day progresses', () => {
    const early = createInitialSimulationState({ scenario: 'normal', clockSeconds: 3600 });
    const late = createInitialSimulationState({ scenario: 'normal', clockSeconds: 72000 });
    expect(selectCostAvoided(late)).toBeGreaterThan(selectCostAvoided(early));
  });
});

describe('serialization', () => {
  it('round-trips through serialize/restore', () => {
    let s = createInitialSimulationState({ scenario: 'power' });
    s = approveRecommendation(s, s.recommendations[0]!.id);
    const restored = restoreSimulation(serializeSimulation(s));
    expect(restored).not.toBeNull();
    expect(restored!.scenario).toBe('power');
    expect(restored!.queue).toHaveLength(1);
  });

  it('rejects malformed payloads', () => {
    expect(restoreSimulation('not json')).toBeNull();
    expect(restoreSimulation('{"scenario":"nonsense"}')).toBeNull();
    expect(restoreSimulation(JSON.stringify({ scenario: 'normal' }))).toBeNull();
  });

  it('migrates a payload that is missing newer fields', () => {
    const s = createInitialSimulationState();
    const payload = { schemaVersion: 1, scenario: 'normal', controls: { mode: 'aggressive' } };
    const restored = restoreSimulation(JSON.stringify(payload));
    expect(restored).not.toBeNull();
    expect(restored!.controls.mode).toBe('aggressive');
    // Missing fields fall back to defaults.
    expect(restored!.recommendations).toHaveLength(3);
    expect(restored!.schemaVersion).toBe(s.schemaVersion);
  });
});
