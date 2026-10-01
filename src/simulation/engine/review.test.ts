import { describe, expect, it } from 'vitest';
import { advanceSimulation, appendAmbientEvent, createInitialSimulationState, restoreSimulation, setClockRunning, setClockSpeed } from './engine';
describe('snapshot validation', () => {
  it('rejects corrupt nested state before it can reach selectors or renderers', () => {
    const base = createInitialSimulationState();
    for (const patch of [ { controls: { ...base.controls, mode: 'invalid' } }, { clock: { ...base.clock, seconds: null } }, { history: null }, { recommendations: [{}] }, { effects: { bump: { energy: 'broken' } } }, { selectedEntity: { type: 'region', id: 'unknown' } }, { schemaVersion: 99 } ]) {
      expect(restoreSimulation(JSON.stringify({ ...base, ...patch }))).toBeNull();
    }
  });
  it('rebuilds recommendation templates from authored pools', () => {
    const base = createInitialSimulationState();
    const tampered = structuredClone(base);
    tampered.recommendations[0]!.template.text = '<img src=x onerror=alert(1)>';
    expect(restoreSimulation(tampered)?.recommendations[0]?.template.text).toBe(base.recommendations[0]?.template.text);
  });
  it('ignores invalid time inputs and stops ambient activity while paused', () => {
    const state = createInitialSimulationState();
    expect(advanceSimulation(state, NaN)).toBe(state);
    expect(advanceSimulation(state, -1)).toBe(state);
    expect(setClockSpeed(state, Infinity)).toBe(state);
    const paused = setClockRunning(state, false);
    expect(appendAmbientEvent(paused)).toBe(paused);
  });
});
