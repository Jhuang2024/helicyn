import { describe, it, expect, beforeEach } from 'vitest';
import { useControlPlane } from './controlPlaneStore';
import { createInitialSimulationState, computeFleet, SCN } from '@/simulation';

/** Reset the store to a clean scenario before each test. */
beforeEach(() => {
  useControlPlane.setState({ sim: createInitialSimulationState() });
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
    expect(get().sim.selectedRegion).toBe('oregon');
    get().selectRegion(null);
    expect(get().sim.selectedRegion).toBeNull();
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
