# Extending the Control Plane

The engine is data-driven, so most extensions are additions to typed data plus a
small amount of wiring. After any change, run
`pnpm typecheck && pnpm test`.

## Add a scenario

1. Add the key to `ScenarioKey` in `src/simulation/models/types.ts`.
2. In `src/simulation/engine/constants.ts`, add a row to `INFRA`, `INFRA_RISK`,
   `SCEN` (multipliers), and `CARBON_BASE`.
3. In `src/simulation/scenarios/scenarios.ts`, add an entry to `SCENARIO_META`
   (name, description, deterministic `seed`) and to `SCN` (alert, flows, region
   patches, decision trace, and 6 seed events).
4. That's it — the scenario appears in the selector and drives every module.
   Make the loads, workloads, constraints, carbon, prices, cooling risks,
   recommendations, and trace meaningfully different, not just relabeled.

## Add a metric

1. If it's a new fleet quantity, extend `FleetComputation` in
   `src/simulation/engine/compute.ts` and compute it in `computeFleet`.
2. For a derived/rolled-up value, add a selector in
   `src/simulation/selectors/selectors.ts`.
3. To surface it as a headline card, add a `MetricView` in
   `src/components/control-plane/format.ts` (`buildMetricViews`) with its label,
   unit, tooltip, context line, and series accessor; it renders automatically in
   `MetricCards`. Keep units consistent and avoid misleading precision. Label any
   modeled figure as simulated/modeled/illustrative/projected.

## Add a recommendation type

1. Append a `RecommendationTemplate` to `RECOMMENDATION_POOL` in
   `src/simulation/scenarios/recommendations.ts` with its `type`, `text`,
   `prio`, `impact`, `conf`, `protect`, `risk`, `sim` rows, `verify` strings,
   `fx` (region deltas / risk overrides / telemetry / KPI bump), and `topo`
   path.
2. The lifecycle (approve → simulate → verify → regenerate) and the topology
   highlight work automatically. `fx.bump` values for energy/cost/carbon are
   scaled by `BUMP_SCALE` so small template numbers read against fleet totals.

## Add a workload type

Append a `WorkloadTemplate` to `WORKLOAD_POOL` in
`src/simulation/scenarios/workloads.ts`. `workloadTypes()` derives which filter
chips it matches from its priority/sub/risk. Staging applies its `fx` and cycles
the table.

## Add a chart

Add an inline SVG primitive to `src/components/control-plane/charts.tsx` and
drive it from simulation state (or `state.history`) — never from independent
random values. Give it a responsive `viewBox`, readable axis labels, an
accessible `aria-label` summary, and respect reduced motion.
