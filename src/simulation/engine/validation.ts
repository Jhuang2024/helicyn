import type { SimulationState } from '../models/types';
import { RECOMMENDATION_POOL } from '../scenarios/recommendations';
import { WORKLOAD_POOL } from '../scenarios/workloads';
export const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e12;
const integer = (value: unknown) => finite(value) && Number.isInteger(value) && Number(value) >= 0;
const string = (value: unknown) => typeof value === 'string' && value.length <= 20000;
const choice = (value: unknown, choices: string[]) => typeof value === 'string' && choices.includes(value);
const fields = (value: unknown, checks: Record<string, (v: unknown) => boolean>) => record(value) && Object.entries(checks).every(([key, check]) => check(value[key]));
const optional = (value: unknown, check: (v: unknown) => boolean) => value === undefined || check(value);
const array = (value: unknown, check: (v: unknown) => boolean, limit = 1000) => Array.isArray(value) && value.length <= limit && value.every(check);
const regions = ['virginia', 'oregon', 'frankfurt', 'singapore', 'tokyo'];
const infra = ['us-west', 'us-central', 'us-east', 'eu-west', 'apac'];
const topo = (value: unknown) => fields(value, { from: (v) => choice(v, regions), to: (v) => v === null || choice(v, regions) });
const risk = (value: unknown) => choice(value, ['low', 'med', 'high']);
const map = (value: unknown, keys: string[], check: (v: unknown) => boolean) => record(value) && Object.entries(value).every(([k, v]) => keys.includes(k) && check(v));
const delta = (value: unknown) => fields(value, { baseline: finite, projected: finite, simulated: finite, unit: string });
const verifyStrings = (value: unknown) => fields(value, { peak: string, pue: string, variance: string, emissions: string });
const entity = (value: unknown) => fields(value, { type: (v) => choice(v, ['region', 'workload', 'recommendation', 'event']), id: string }) && (!(value as Record<string, unknown>).type || (value as Record<string, unknown>).type !== 'region' || choice((value as Record<string, unknown>).id, regions));
const event = (value: unknown) => fields(value, {
  id: string, tick: finite, time: string, category: (v) => choice(v, ['telemetry', 'constraint', 'analysis', 'recommendation', 'approval', 'rejection', 'migration', 'action', 'verification', 'savings', 'system']),
  severity: (v) => choice(v, ['info', 'ok', 'warn', 'crit']), title: string, text: string, entities: (v) => array(v, entity, 100),
});
const unique = (value: unknown) => Array.isArray(value) && new Set(value.map((v) => v.id)).size === value.length;
/** Validate every supplied durable field before overlaying it onto migration defaults. */
export function validSnapshot(candidate: Record<string, unknown>): boolean {
  const controls = candidate.controls;
  if (!record(controls) || !Object.keys(controls).every((key) => ['mode', 'carbon', 'flex', 'cooling', 'view'].includes(key))) return false;
  if (!optional(controls.mode, (v) => choice(v, ['conservative', 'balanced', 'aggressive'])) ||
      !optional(controls.carbon, (v) => choice(v, ['low', 'medium', 'high'])) ||
      !optional(controls.cooling, (v) => choice(v, ['low', 'medium', 'high'])) ||
      !optional(controls.view, (v) => choice(v, ['after', 'baseline'])) ||
      !optional(controls.flex, (v) => finite(v) && Number(v) >= 0 && Number(v) <= 100)) return false;
  const checks: Record<string, (value: unknown) => boolean> = {
    seed: string,
    clock: (v) => record(v) && optional(v.seconds, (n) => finite(n) && Number(n) >= 0) && optional(v.speed, (n) => finite(n) && Number(n) >= 1 && Number(n) <= 3600) && optional(v.running, (b) => typeof b === 'boolean'),
    effects: (v) => record(v) && optional(v.regionDelta, (m) => map(m, infra, finite)) && optional(v.riskOverride, (m) => map(m, infra, risk)) && optional(v.bump, (m) => record(m) && Object.values(m).every(finite)) && optional(v.peakBias, finite) && optional(v.zoneDelta, (m) => map(m, ['A', 'B', 'C', 'D', 'E'], finite)),
    lifetime: (v) => record(v) && Object.entries(v).every(([k, n]) => ['energy', 'cost', 'carbon', 'gpuh'].includes(k) && finite(n) && Number(n) >= 0),
    workloadFilter: (v) => choice(v, ['all', 'movable', 'training', 'batch', 'constrained']),
    selectedRegion: (v) => v === null || choice(v, regions),
    selectedEntity: (v) => v === null || entity(v),
    history: (v) => array(v, (row) => fields(row, Object.fromEntries(['t', 'energy', 'cost', 'carbon', 'carbonIntensity', 'cooling', 'gpu', 'pue', 'power'].map((k) => [k, finite]))), 240),
    recommendations: (v) => array(v, (r) => fields(r, { id: string, poolIndex: integer, state: (s) => choice(s, ['proposed', 'approved', 'simulating', 'simulated', 'verifying', 'verified', 'rejected']), createdAt: finite })) && unique(v),
    workloads: (v) => array(v, (r) => fields(r, { id: string, poolIndex: integer, state: (s) => choice(s, ['queued', 'running', 'moving', 'deferred', 'held', 'throttled', 'completed', 'constrained']) })) && unique(v),
    queue: (v) => array(v, (r) => fields(r, { id: string, recId: string, cat: string, timestamp: finite, lane: (l) => choice(l, ['pending', 'approved', 'simulating', 'verifying', 'verified', 'rejected', 'failed']) })) && unique(v),
    staged: (v) => array(v, (r) => fields(r, { id: string, label: string, summary: string, topo, source: (s) => choice(s, ['recommendation', 'workload']), timestamp: finite })) && unique(v),
    verification: (v) => v === null || fields(v, { recId: string, strings: verifyStrings, deltas: (d) => fields(d, { peak: delta, carbon: delta, pue: delta }) }),
    events: (v) => Number(candidate.schemaVersion) < 3 ? Array.isArray(v) : array(v, event) && unique(v),
    actionLog: (v) => array(v, (r) => fields(r, { seq: integer, tick: finite, kind: (k) => choice(k, ['loadScenario', 'setControl', 'approve', 'reject', 'simulate', 'regenerate', 'stage', 'setFilter', 'seek', 'reset']), payload: string }), 10000),
  };
  for (const key of ['recPointer', 'recSeq', 'workloadPointer', 'workloadSeq', 'queueSeq', 'stagedSeq', 'eventSeq', 'actionCounter', 'prngState']) checks[key] = integer;
  return Object.entries(checks).every(([key, check]) => optional(candidate[key], check));
}
/** Templates are authored by the engine, not executable/customizable snapshot content. */
export function restoreTemplates(state: SimulationState): void {
  state.recommendations = state.recommendations.map((r) => ({ ...r, template: RECOMMENDATION_POOL[r.poolIndex % RECOMMENDATION_POOL.length]! }));
  state.workloads = state.workloads.map((r) => ({ ...r, template: WORKLOAD_POOL[r.poolIndex % WORKLOAD_POOL.length]! }));
}
