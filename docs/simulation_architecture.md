# Simulation architecture

The Control Plane behaves like a simulation application, not a static page. The
simulation logic is a **framework-independent TypeScript module** under
`src/simulation`: it never imports React. React renders state; the engine
calculates it.

## Principles

- **Deterministic.** Given the same scenario, seed, inputs, and operator
  actions, the engine produces the same result. The only stochastic values
  (telemetry noise, lifetime-counter drift) flow through a seeded PRNG
  (`engine/prng.ts`): never `Math.random()`.
- **Pure, immutable transitions.** Every engine function takes a state and
  returns a **new** state; it never mutates its input and performs no I/O.
- **Derived values stay derived.** Metrics are computed by `computeFleet` and
  selectors, not stored in multiple places, so totals can't disagree.

## Modules

| File | Responsibility |
|---|---|
| `engine/prng.ts` | Seeded mulberry32 PRNG (`createPrng`, `hashSeed`). |
| `engine/constants.ts` | Verbatim scenario multipliers, mode outcomes, regional loads/risks, baselines, zones: the illustrative numbers. |
| `engine/accumulation.ts` | Diurnal `ACC(t)` curve and clock helpers. |
| `engine/compute.ts` | `computeFleet(state)`: the pure re-derivation of every metric, region load, trend, and before/after value. |
| `engine/engine.ts` | The operator surface (see below) + effect application, lifecycle, serialization. |
| `models/types.ts` | The closed, explicit type model for the whole fleet state. |
| `scenarios/scenarios.ts` | Scenario registry (alerts, flows, regions, traces, events, metadata, seeds). |
| `scenarios/recommendations.ts` | The 7-item recommendation pool. |
| `scenarios/workloads.ts` | The 7-item workload pool. |
| `selectors/selectors.ts` | Derived selectors (average PUE, constrained count, cost avoided, energy saved, emissions shifted, etc.). |

## Engine surface

```ts
createInitialSimulationState(opts?)   // fresh state for a scenario
loadScenario(state, key)              // switch scenario, clear stale state
resetSimulation(state)                // rerun current scenario
updateOperatorConstraints(state, p)   // merge control values
generateRecommendations(state)        // (re)fill the 3 visible cards
approveRecommendation(state, id)       // proposed → approved, enqueue
rejectRecommendation(state, id)        // → rejected, no fleet effect
simulateAction(state, id)              // approved → apply effects → verify
verifyAction(state, id)                // baseline-vs-coordinated comparison
regenerateRecommendation(state, id)    // cycle a terminal card from the pool
stageAction(state, workloadId)         // apply a workload move, record staged
advanceSimulation(state, dt, force?)   // advance the clock, record telemetry
stepForward(state, seconds?)           // step while paused
serializeSimulation(state)             // → JSON string
restoreSimulation(payload)             // validate + migrate → state | null
```

## State ownership

One authoritative Zustand store (`src/state/controlPlaneStore.ts`) wraps the
engine. Every Control Plane module reads from and writes to it, so changing the
scenario, selecting a region, adjusting a control, or approving an action updates
every panel consistently.

- **Persistence** is versioned (`version: 2`) with a `migrate`/`merge` that runs
  the payload through `restoreSimulation`, so a schema change can't crash the
  app. Telemetry history is not persisted (it's ephemeral).
- **The loop** (`useSimulationLoop`) advances the clock once per second while the
  Control Plane is mounted, pauses when the tab is hidden, and cleans up on
  unmount: no duplicate loops or leaks.

## Impossible states are prevented

The lifecycle guards ensure an action can't be simultaneously approved and
rejected, a verified action can't be re-rejected, verification only appears
after simulation, and a scenario reset clears all approved/staged/verified state.
See `src/simulation/engine/engine.test.ts` and
`src/state/controlPlaneStore.test.ts`.
