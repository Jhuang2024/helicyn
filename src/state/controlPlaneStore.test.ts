import { describe, it, expect, beforeEach } from 'vitest';
import { useControlPlane } from './controlPlaneStore';
import { createInitialSimulationState, computeFleet, SCN } from '@/simulation';

/** Reset the store to a clean scenario before each test. */
beforeEach(() => {
  useControlPlane.setState({ sim: createInitialSimulationState(), previewPath: null });
});

const get = () => useControlPlane.getState();

describe('centralized Control Plane store', () => {
  it('scenario switch updates every module from one state', () => {
    get().setScenario('cooling');
    const sim = get().sim;
    expect(sim.scenario).toBe('cooling');
    // Topology, trace, and alert all reflect the new scenario.
    expect(SCN[sim.scenario].alert.ttl).toBe('Cooling constraint');
    expect(SCN[sim.scenario].trace.action).toBe('ACTION #233');
    // No stale approved/staged state survives the switch.
    expect(sim.queue).toHaveLength(0);
    expect(sim.staged).toHaveLength(0);
    expect(sim.verification).toBeNull();
  });

  it('changing a control recomputes projected metrics', () => {
    const before = computeFleet(get().sim).projected.pue;
    get().setControl({ mode: 'aggressive' });
    const after = computeFleet(get().sim).projected.pue;
    expect(after).toBeLessThan(before);
  });

  it('selecting a region updates the shared selection', () => {
    get().selectRegion('oregon');
    expect(get().sim.selectedEntity).toEqual({ type: 'region', id: 'oregon' });
    get().selectRegion(null);
    expect(get().sim.selectedEntity).toBeNull();
  });

  it('selects workloads, recommendations, and events globally', () => {
    const recId = get().sim.recommendations[0]!.id;
    get().selectEntity({ type: 'recommendation', id: recId });
    expect(get().sim.selectedEntity).toEqual({ type: 'recommendation', id: recId });
    const eventId = get().sim.events[0]!.id;
    get().selectEntity({ type: 'event', id: eventId });
    expect(get().sim.selectedEntity).toEqual({ type: 'event', id: eventId });
  });

  it('shares recommendation and workload topology previews without mutating simulation state', () => {
    const before = get().sim;
    const path = before.recommendations[0]!.template.topo;
    get().setPreviewPath(path);
    expect(get().previewPath).toEqual(path);
    expect(get().sim).toBe(before);
    get().setPreviewPath(null);
    expect(get().previewPath).toBeNull();
  });

  it('approving an action updates the queue', () => {
    const id = get().sim.recommendations[0]!.id;
    get().approveRec(id);
    expect(get().sim.queue).toHaveLength(1);
    expect(get().sim.queue[0]!.lane).toBe('approved');
  });

  it('simulating an action changes fleet state and reveals verification', () => {
    const id = get().sim.recommendations[0]!.id;
    const before = computeFleet(get().sim).projected.cost;
    get().approveRec(id);
    get().simulateRec(id);
    expect(get().sim.verification).not.toBeNull();
    expect(computeFleet(get().sim).projected.cost).toBeGreaterThan(before);
  });

  it('staging a workload propagates through regional load', () => {
    const id = get().sim.workloads[0]!.id;
    const westBefore = computeFleet(get().sim).regions.find((r) => r.id === 'us-west')!.load;
    get().stageWorkload(id);
    const westAfter = computeFleet(get().sim).regions.find((r) => r.id === 'us-west')!.load;
    expect(get().sim.staged).toHaveLength(1);
    expect(westAfter).toBeLessThan(westBefore);
  });

  it('resetting removes stale approved/staged state', () => {
    const rec = get().sim.recommendations[0]!.id;
    get().approveRec(rec);
    get().stageWorkload(get().sim.workloads[0]!.id);
    get().reset();
    expect(get().sim.queue).toHaveLength(0);
    expect(get().sim.staged).toHaveLength(0);
    expect(get().sim.effects.bump.energy).toBe(0);
  });

  it('export/import round-trips the session', () => {
    get().setScenario('power');
    get().approveRec(get().sim.recommendations[0]!.id);
    const snapshot = get().exportSnapshot();
    useControlPlane.setState({ sim: createInitialSimulationState() });
    expect(get().sim.scenario).toBe('normal');
    const ok = get().importSnapshot(snapshot);
    expect(ok).toBe(true);
    expect(get().sim.scenario).toBe('power');
    expect(get().sim.queue).toHaveLength(1);
  });

  it('rejects an invalid imported snapshot', () => {
    expect(get().importSnapshot('not json')).toBe(false);
  });

  it('advancing the clock accumulates telemetry history', () => {
    const before = get().sim.history.length;
    get().tick(60);
    get().tick(60);
    expect(get().sim.history.length).toBeGreaterThan(before);
    expect(get().sim.history.at(-1)?.carbonIntensity).toBeTypeOf('number');
  });

  it('keeps the coordination event feed live', () => {
    const before = get().sim.events;
    get().ambientEvent();
    expect(get().sim.events).toHaveLength(before.length + 1);
    expect(get().sim.events.at(-1)?.text).not.toBe(before.at(-1)?.text);
    expect(get().sim.actionCounter).toBeGreaterThan(createInitialSimulationState().actionCounter);
  });

  it('never lets an action be both approved and rejected', () => {
    const id = get().sim.recommendations[0]!.id;
    get().approveRec(id);
    get().simulateRec(id);
    get().rejectRec(id); // ignored — already verified
    const card = get().sim.recommendations.find((r) => r.id === id)!;
    expect(card.state).toBe('verified');
  });
});
