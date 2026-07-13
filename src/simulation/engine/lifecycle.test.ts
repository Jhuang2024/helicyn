import { describe, it, expect } from 'vitest';
import {
  approveRecommendation,
  createInitialSimulationState,
  loadScenario,
  regenerateRecommendation,
  rejectRecommendation,
  restoreSimulation,
  seekToTime,
  selectEntity,
  simulateAction,
  stageAction,
} from './engine';
import {
  selectEventsForEntity,
  selectRecommendationsForRegion,
  selectRegionTelemetry,
  selectSystemStatus,
  selectWorkloadsForRegion,
} from '../selectors/selectors';

describe('structured event stream', () => {
  it('seeds scenario backstory as structured events with unique ids', () => {
    const s = createInitialSimulationState();
    expect(s.events.length).toBeGreaterThan(0);
    const ids = s.events.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(s.events[0]).toMatchObject({ category: 'constraint', severity: 'warn' });
  });

  it('appends exactly one approval event per approval', () => {
    const s = createInitialSimulationState();
    const id = s.recommendations[0]!.id;
    const once = approveRecommendation(s, id);
    expect(once.events.length).toBe(s.events.length + 1);
    expect(once.events.at(-1)).toMatchObject({ category: 'approval', recId: id });
    // A second approval attempt is a no-op: no duplicate event.
    const twice = approveRecommendation(once, id);
    expect(twice.events.length).toBe(once.events.length);
  });

  it('records the full lifecycle: approve → action (+migration) → verification', () => {
    let s = createInitialSimulationState();
    const id = s.recommendations[0]!.id;
    s = simulateAction(approveRecommendation(s, id), id);
    const cats = s.events.slice(-4).map((e) => e.category);
    expect(cats).toEqual(['approval', 'action', 'migration', 'verification']);
    // Every lifecycle event links back to the recommendation.
    expect(s.events.slice(-4).every((e) => e.recId === id)).toBe(true);
  });

  it('rejection emits a rejection event linked to the recommendation', () => {
    const s = createInitialSimulationState();
    const id = s.recommendations[0]!.id;
    const rejected = rejectRecommendation(s, id);
    expect(rejected.events.at(-1)).toMatchObject({ category: 'rejection', severity: 'warn', recId: id });
  });

  it('regeneration emits a recommendation-generated event', () => {
    const s = createInitialSimulationState();
    const id = s.recommendations[0]!.id;
    const regen = regenerateRecommendation(rejectRecommendation(s, id), id);
    expect(regen.events.at(-1)!.category).toBe('recommendation');
  });

  it('staging a workload emits a migration event with region entities', () => {
    const s = createInitialSimulationState();
    const staged = stageAction(s, s.workloads[0]!.id);
    const event = staged.events.at(-1)!;
    expect(event.category).toBe('migration');
    expect(event.entities.some((r) => r.type === 'region')).toBe(true);
    expect(event.actionId).toBe(staged.staged[0]!.id);
  });

  it('event ids never repeat across a scenario switch', () => {
    let s = createInitialSimulationState();
    s = approveRecommendation(s, s.recommendations[0]!.id);
    const idsBefore = s.events.map((e) => e.id);
    const switched = loadScenario(s, 'surge');
    const idsAfter = switched.events.map((e) => e.id);
    expect(idsBefore.filter((id) => idsAfter.includes(id))).toHaveLength(0);
  });
});

describe('linked selection', () => {
  it('selects and clears any entity type', () => {
    const s = createInitialSimulationState();
    const withRegion = selectEntity(s, { type: 'region', id: 'oregon' });
    expect(withRegion.selectedEntity).toEqual({ type: 'region', id: 'oregon' });
    const withWorkload = selectEntity(withRegion, { type: 'workload', id: s.workloads[0]!.id });
    expect(withWorkload.selectedEntity!.type).toBe('workload');
    expect(selectEntity(withWorkload, null).selectedEntity).toBeNull();
  });

  it('relates recommendations, workloads, and events to a region', () => {
    let s = createInitialSimulationState();
    // REC-01 shifts us-west → us-central (oregon → virginia in topo vocabulary).
    expect(selectRecommendationsForRegion(s, 'oregon').map((r) => r.id)).toContain('REC-01');
    expect(selectWorkloadsForRegion(s, 'oregon').length).toBeGreaterThan(0);
    const id = s.recommendations[0]!.id;
    s = simulateAction(approveRecommendation(s, id), id);
    const regionEvents = selectEventsForEntity(s, { type: 'region', id: 'oregon' });
    expect(regionEvents.some((e) => e.category === 'approval')).toBe(true);
  });
});

describe('forward timeline seek', () => {
  it('seeks forward deterministically', () => {
    const s = createInitialSimulationState({ clockSeconds: 3600 });
    const a = seekToTime(s, 7200);
    const b = seekToTime(s, 7200);
    expect(a.clock.seconds).toBeCloseTo(7200, 5);
    expect(a.history).toEqual(b.history);
    expect(a.lifetime).toEqual(b.lifetime);
  });

  it('refuses to seek backward (no corrupted state, no fake jump)', () => {
    const s = createInitialSimulationState({ clockSeconds: 7200 });
    expect(seekToTime(s, 3600)).toBe(s);
  });

  it('records the seek in the operator action log', () => {
    const s = createInitialSimulationState({ clockSeconds: 3600 });
    const sought = seekToTime(s, 5400);
    expect(sought.actionLog.at(-1)).toMatchObject({ kind: 'seek', payload: '5400' });
  });
});

describe('derived system status', () => {
  it('reflects scenario alerts and staged decisions', () => {
    const normal = createInitialSimulationState();
    expect(selectSystemStatus(normal).key).toBe('nominal');

    const cooling = loadScenario(normal, 'cooling');
    expect(selectSystemStatus(cooling).key).toBe('constrained');

    const staged = approveRecommendation(normal, normal.recommendations[0]!.id);
    expect(selectSystemStatus(staged).key).toBe('applying');

    const id = normal.recommendations[0]!.id;
    const verified = simulateAction(approveRecommendation(normal, id), id);
    expect(selectSystemStatus(verified).key).toBe('recovered');
  });
});

describe('unified regional telemetry', () => {
  it('derives one consistent number set per region', () => {
    const s = createInitialSimulationState();
    const rows = selectRegionTelemetry(s);
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.load + row.spare === 100 || row.spare === 0).toBe(true);
      expect(row.carbon).toBeGreaterThanOrEqual(80);
      expect(row.label).toBeTruthy();
      expect(row.nodeLabel).toBeTruthy();
    }
    // Same state → identical telemetry (no per-render randomness).
    expect(selectRegionTelemetry(s)).toEqual(rows);
  });
});

describe('schema migration', () => {
  it('migrates a v2 payload with legacy events and selectedRegion', () => {
    const legacy = {
      schemaVersion: 2,
      scenario: 'surge',
      controls: { mode: 'aggressive' },
      events: [{ time: '11:08', type: 'detected', text: 'legacy event' }],
      selectedRegion: 'oregon',
    };
    const restored = restoreSimulation(JSON.stringify(legacy));
    expect(restored).not.toBeNull();
    expect(restored!.events.every((e) => typeof e.id === 'string')).toBe(true);
    expect(restored!.selectedEntity).toEqual({ type: 'region', id: 'oregon' });
    expect(restored!.actionLog).toEqual([]);
  });
});
