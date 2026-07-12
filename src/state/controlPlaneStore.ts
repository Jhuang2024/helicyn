/**
 * Centralized Control Plane state.
 *
 * One authoritative Zustand store owns the entire simulation state. Every
 * module (topology, metrics, recommendations, queue, workloads, telemetry,
 * verification) reads from and writes to this single source, so changing the
 * scenario, selecting a region, or approving an action updates every panel
 * consistently. React only renders; the engine calculates.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  ScenarioKey,
  SimulationState,
  TopoNodeId,
  TopoPath,
  WorkloadFilter,
} from '@/simulation';
import {
  advanceSimulation,
  appendAmbientEvent,
  approveRecommendation,
  createInitialSimulationState,
  loadScenario,
  regenerateRecommendation,
  rejectRecommendation,
  resetSimulation,
  restoreSimulation,
  selectRegion as selectRegionEngine,
  serializeSimulation,
  setClockRunning,
  setClockSpeed,
  setWorkloadFilter,
  simulateAction,
  stageAction,
  stepForward,
  updateOperatorConstraints,
} from '@/simulation';

export interface ControlPlaneStore {
  sim: SimulationState;
  previewPath: TopoPath | null;

  // scenario + controls
  setScenario: (key: ScenarioKey) => void;
  setControl: (patch: Partial<SimulationState['controls']>) => void;

  // recommendation lifecycle
  approveRec: (id: string) => void;
  rejectRec: (id: string) => void;
  simulateRec: (id: string) => void;
  regenerateRec: (id: string) => void;

  // workloads
  stageWorkload: (id: string) => void;
  setFilter: (filter: WorkloadFilter) => void;

  // linked selection
  selectRegion: (id: TopoNodeId | null) => void;
  setPreviewPath: (path: TopoPath | null) => void;

  // clock
  tick: (dtSeconds: number) => void;
  setRunning: (running: boolean) => void;
  setSpeed: (speed: number) => void;
  stepForward: () => void;
  ambientEvent: () => void;

  // lifecycle
  reset: () => void;
  rerun: () => void;

  // shareability
  exportSnapshot: () => string;
  importSnapshot: (payload: string) => boolean;
}

const PERSIST_VERSION = 2;

export const useControlPlane = create<ControlPlaneStore>()(
  persist(
    (set, get) => ({
      sim: createInitialSimulationState(),
      previewPath: null,

      setScenario: (key) => set((s) => ({ sim: loadScenario(s.sim, key) })),
      setControl: (patch) => set((s) => ({ sim: updateOperatorConstraints(s.sim, patch) })),

      approveRec: (id) => set((s) => ({ sim: approveRecommendation(s.sim, id) })),
      rejectRec: (id) => set((s) => ({ sim: rejectRecommendation(s.sim, id) })),
      simulateRec: (id) => set((s) => ({ sim: simulateAction(s.sim, id) })),
      regenerateRec: (id) => set((s) => ({ sim: regenerateRecommendation(s.sim, id) })),

      stageWorkload: (id) => set((s) => ({ sim: stageAction(s.sim, id) })),
      setFilter: (filter) => set((s) => ({ sim: setWorkloadFilter(s.sim, filter) })),

      selectRegion: (id) => set((s) => ({ sim: selectRegionEngine(s.sim, id) })),
      setPreviewPath: (path) => set({ previewPath: path }),

      tick: (dt) => set((s) => ({ sim: advanceSimulation(s.sim, dt) })),
      setRunning: (running) => set((s) => ({ sim: setClockRunning(s.sim, running) })),
      setSpeed: (speed) => set((s) => ({ sim: setClockSpeed(s.sim, speed) })),
      stepForward: () => set((s) => ({ sim: stepForward(s.sim) })),
      ambientEvent: () => set((s) => ({ sim: appendAmbientEvent(s.sim) })),

      reset: () => set((s) => ({ sim: resetSimulation(s.sim) })),
      rerun: () => set((s) => ({ sim: resetSimulation(s.sim) })),

      exportSnapshot: () => serializeSimulation(get().sim),
      importSnapshot: (payload) => {
        const restored = restoreSimulation(payload);
        if (!restored) return false;
        set({ sim: restored });
        return true;
      },
    }),
    {
      name: 'helicyn.control-plane',
      version: PERSIST_VERSION,
      storage: createJSONStorage(() => localStorage),
      // Persist only durable session choices; telemetry history is ephemeral.
      partialize: (state) => ({
        sim: {
          ...state.sim,
          history: [],
        },
      }),
      // Validate/migrate persisted state so a schema change can't crash the app.
      migrate: (persisted: unknown) => {
        const p = persisted as { sim?: unknown } | null;
        if (!p || !p.sim) return { sim: createInitialSimulationState() };
        const restored = restoreSimulation(p.sim);
        return { sim: restored ?? createInitialSimulationState() };
      },
      merge: (persisted, current) => {
        const p = persisted as { sim?: unknown } | undefined;
        const restored = p?.sim ? restoreSimulation(p.sim) : null;
        return { ...current, sim: restored ?? current.sim };
      },
    },
  ),
);
