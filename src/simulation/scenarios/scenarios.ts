/**
 * Scenario registry.
 *
 * Merges the two original data sources (control.js multipliers/loads and
 * scenario.js coordination content) into one typed record per scenario. All
 * copy: alerts, decision traces, coordination events, region roles: is
 * reproduced verbatim so the migrated Control Plane reads identically.
 */

import type {
  CoordinationEvent,
  DecisionTrace,
  FlowArc,
  RegionNode,
  ScenarioAlert,
  ScenarioKey,
  TopoNodeId,
} from '../models/types';

export interface ScenarioMeta {
  key: ScenarioKey;
  /** Selector display name. */
  name: string;
  /** One-line scenario description shown in the selector. */
  description: string;
  /** Deterministic seed used for this scenario's telemetry noise. */
  seed: string;
}

export const SCENARIO_META: Record<ScenarioKey, ScenarioMeta> = {
  normal: {
    key: 'normal',
    name: 'Normal Operations',
    description: 'Steady multi-region load with no active constraints. The fleet coordinates routine training, inference, and batch work.',
    seed: 'helicyn-normal',
  },
  surge: {
    key: 'surge',
    name: 'Training Surge',
    description: 'A large training run pushes Virginia toward its thermal ceiling; flexible load rebalances to Oregon before a breach.',
    seed: 'helicyn-surge',
  },
  inference: {
    key: 'inference',
    name: 'Inference Demand Spike',
    description: 'Real-time inference demand peaks in Singapore; overflow spills to Frankfurt and Tokyo to hold p99 latency within SLA.',
    seed: 'helicyn-inference',
  },
  cooling: {
    key: 'cooling',
    name: 'Cooling Constraint',
    description: 'Cooling capacity in Singapore is constrained; hotspot workloads migrate to cooler regions to clear thermal risk.',
    seed: 'helicyn-cooling',
  },
  power: {
    key: 'power',
    name: 'Power Price Spike',
    description: 'A day-ahead price spike on the Virginia grid defers flexible batch and shifts training to a cheaper Oregon window.',
    seed: 'helicyn-power',
  },
  lowcarbon: {
    key: 'lowcarbon',
    name: 'Low-Carbon Window',
    description: 'A short low-carbon window opens on the Oregon grid; eligible flexible compute advances to shift the most carbon.',
    seed: 'helicyn-lowcarbon',
  },
};

// ---- Topology node positions (lon/lat) --------------------------------------

export interface NodePos {
  lon: number;
  lat: number;
  label: string;
}

export const NODE_POS: Record<TopoNodeId, NodePos> = {
  virginia: { lon: -78.5, lat: 38.0, label: 'VIRGINIA' },
  oregon: { lon: -121.0, lat: 44.0, label: 'OREGON' },
  frankfurt: { lon: 8.7, lat: 50.1, label: 'FRANKFURT' },
  singapore: { lon: 103.8, lat: 1.3, label: 'SINGAPORE' },
  tokyo: { lon: 139.7, lat: 35.7, label: 'TOKYO' },
};

/** Equirectangular map projection bounds (matches the original SVG map). */
export const MAP = { W: 1000, H: 383, lonMin: -180, lonMax: 180, latMax: 80, latMin: -58 } as const;

export function projectNode(id: TopoNodeId): { x: number; y: number } {
  const { lon, lat } = NODE_POS[id];
  const x = ((lon - MAP.lonMin) / (MAP.lonMax - MAP.lonMin)) * MAP.W;
  const y = ((MAP.latMax - lat) / (MAP.latMax - MAP.latMin)) * MAP.H;
  return { x, y };
}

// ---- Base regional state (Normal Operations) --------------------------------

function baseRegions(): RegionNode[] {
  return [
    { id: 'virginia', util: 81, carbon: 'Medium', thermal: 'Elevated', role: 'Training', status: 'warn' },
    { id: 'oregon', util: 74, carbon: 'Low', thermal: 'Stable', role: 'Training spillover', status: 'opt' },
    { id: 'frankfurt', util: 63, carbon: 'Low', thermal: 'Stable', role: 'Inference', status: 'opt' },
    { id: 'singapore', util: 86, carbon: 'High', thermal: 'Elevated', role: 'Inference overflow', status: 'warn' },
    { id: 'tokyo', util: 69, carbon: 'Medium', thermal: 'Stable', role: 'Batch', status: 'ok' },
  ];
}

function patchRegions(patch: Partial<Record<TopoNodeId, Partial<RegionNode>>> | null): RegionNode[] {
  const r = baseRegions();
  if (patch) {
    for (const reg of r) {
      const p = patch[reg.id];
      if (p) Object.assign(reg, p);
    }
  }
  return r;
}

export interface ScenarioContent {
  alert: ScenarioAlert;
  flows: FlowArc[];
  regions: RegionNode[];
  trace: DecisionTrace;
  events: CoordinationEvent[];
}

export const SCN: Record<ScenarioKey, ScenarioContent> = {
  normal: {
    alert: { level: 'info', ttl: 'All systems normal', body: 'Coordinating across 5 regions. Nothing needs your attention.' },
    flows: [
      { from: 'virginia', to: 'oregon', kind: 'opt', label: '18% training shifted' },
      { from: 'singapore', to: 'frankfurt', kind: 'opt', label: 'inference overflow balanced' },
      { from: 'tokyo', to: 'oregon', kind: 'ok', label: 'batch deferred to low-carbon' },
    ],
    regions: patchRegions(null),
    trace: {
      action: 'ACTION #184',
      detected: 'GPU cluster utilization and thermal variance in <b>Cluster B</b> exceeded the target range.',
      reasoning:
        'Another region holds spare GPU capacity, lower grid carbon intensity, and lower cooling risk for the next 2-hour window, so the work does not have to stay where it is.',
      response:
        'Shifted flexible training load to Oregon, deferred non-critical batch work, and adjusted cooling setpoints locally across <b>12 racks</b>.',
      verified: 'Cooling load reduced, average PUE improved from 1.22 to <b>1.18</b>, and thermal headroom recovered.',
    },
    events: [
      { time: '09:42', type: 'detected', text: 'Thermal imbalance in GPU Cluster B' },
      { time: '09:43', type: 'analyzed', text: 'Zone B projected to exceed threshold in 14 minutes' },
      { time: '09:44', type: 'acted', text: 'Shifted <b>18%</b> of training workload to Oregon' },
      { time: '09:45', type: 'acted', text: 'Raised cooling setpoint by <b>1.2°C</b> in low-risk racks' },
      { time: '09:46', type: 'verified', text: 'Temperature variance reduced from 9.8°C to <b>4.2°C</b>' },
      { time: '09:47', type: 'saved', text: 'Projected daily energy savings increased by <b>2.3 MWh</b>' },
    ],
  },

  surge: {
    alert: { level: 'warn', ttl: 'High thermal load', body: 'Zone B approaching threshold under training surge.' },
    flows: [
      { from: 'virginia', to: 'oregon', kind: 'opt', label: '31% training rebalanced' },
      { from: 'singapore', to: 'tokyo', kind: 'ok', label: 'inference smoothed' },
      { from: 'frankfurt', to: 'oregon', kind: 'warn', label: 'overflow under load' },
    ],
    regions: patchRegions({
      virginia: { util: 94, thermal: 'Critical', status: 'crit', role: 'Training (peak)' },
      oregon: { util: 88, thermal: 'Elevated', status: 'warn', role: 'Training spillover' },
      singapore: { util: 90, status: 'warn' },
      tokyo: { util: 78, role: 'Inference relief' },
    }),
    trace: {
      action: 'ACTION #207',
      detected: '<b>Training surge</b> pushed Virginia GPU utilization to 94%. Rack inlet temperatures trending up across Zone B.',
      reasoning:
        'Sustained demand will breach thermal limits in <b>9 minutes</b>. Oregon and Tokyo hold spare capacity; Oregon offers the lowest grid carbon for the surge window.',
      response:
        'Rebalanced <b>31%</b> of training load to Oregon. Capped non-critical job admission. Pre-staged cooling across <b>18 racks</b> ahead of the ramp.',
      verified: 'Peak avoided without throttling priority jobs. PUE held at <b>1.21</b>. Thermal variance kept inside limits.',
    },
    events: [
      { time: '11:08', type: 'detected', text: 'Training surge: Virginia utilization at <b>94%</b>' },
      { time: '11:09', type: 'analyzed', text: 'Thermal breach projected in 9 minutes' },
      { time: '11:10', type: 'acted', text: 'Rebalanced <b>31%</b> of training load to Oregon' },
      { time: '11:11', type: 'acted', text: 'Pre-staged cooling across 18 racks' },
      { time: '11:13', type: 'verified', text: 'Peak avoided, priority jobs unaffected' },
      { time: '11:14', type: 'saved', text: 'Throttling avoided on <b>1,024 GPU</b> training job' },
    ],
  },

  inference: {
    alert: { level: 'info', ttl: 'Inference overflow', body: 'Balancing Singapore → Frankfurt to hold latency targets.' },
    flows: [
      { from: 'singapore', to: 'frankfurt', kind: 'opt', label: 'inference overflow balanced' },
      { from: 'singapore', to: 'tokyo', kind: 'opt', label: 'latency-aware spillover' },
      { from: 'virginia', to: 'oregon', kind: 'ok', label: 'training yields headroom' },
    ],
    regions: patchRegions({
      singapore: { util: 95, thermal: 'Elevated', status: 'crit', role: 'Inference (peak)' },
      frankfurt: { util: 79, status: 'opt', role: 'Inference relief' },
      tokyo: { util: 77, role: 'Inference relief', status: 'opt' },
      virginia: { util: 72, thermal: 'Stable', status: 'ok' },
    }),
    trace: {
      action: 'ACTION #221',
      detected: 'Real-time inference demand on <b>Singapore</b> reached 95% of pool capacity. p99 latency rising toward SLA.',
      reasoning:
        'Frankfurt and Tokyo can absorb overflow within latency budget. Routing there preserves SLA while keeping Singapore inside thermal limits.',
      response:
        'Spilled <b>22%</b> of inference traffic to Frankfurt and Tokyo. Reserved Singapore capacity for latency-critical requests. Held training in place.',
      verified: 'p99 latency held within SLA. No request shedding. Inference pool thermal risk returned to <b>stable</b>.',
    },
    events: [
      { time: '14:31', type: 'detected', text: 'Inference demand spike: Singapore pool at <b>95%</b>' },
      { time: '14:32', type: 'analyzed', text: 'p99 latency approaching SLA ceiling' },
      { time: '14:33', type: 'acted', text: 'Spilled <b>22%</b> inference to Frankfurt + Tokyo' },
      { time: '14:34', type: 'acted', text: 'Reserved Singapore for latency-critical traffic' },
      { time: '14:36', type: 'verified', text: 'p99 latency held within SLA' },
      { time: '14:37', type: 'saved', text: 'Zero request shedding during peak' },
    ],
  },

  cooling: {
    alert: { level: 'crit', ttl: 'Cooling constraint', body: 'Reducing hotspot risk through workload migration.' },
    flows: [
      { from: 'singapore', to: 'frankfurt', kind: 'opt', label: 'hotspot load migrated' },
      { from: 'virginia', to: 'oregon', kind: 'opt', label: 'thermal-aware reshuffle' },
      { from: 'tokyo', to: 'oregon', kind: 'ok', label: 'batch deferred' },
    ],
    regions: patchRegions({
      singapore: { util: 71, thermal: 'Critical', status: 'crit', role: 'Cooling-limited' },
      virginia: { util: 70, thermal: 'Elevated', status: 'warn' },
      oregon: { util: 82, role: 'Thermal relief', status: 'opt' },
      frankfurt: { util: 74, status: 'opt', role: 'Cool-region intake' },
    }),
    trace: {
      action: 'ACTION #233',
      detected: 'Cooling capacity in <b>Singapore</b> constrained; rack hotspots forming in two zones.',
      reasoning:
        'Holding load risks throttling. Cooler regions hold headroom, and migrating hotspot workloads reduces cooling demand faster than setpoint changes alone.',
      response:
        'Migrated hotspot workloads to Frankfurt and Oregon. Sequenced setpoint increases on <b>14 low-risk racks</b>. Deferred non-urgent batch.',
      verified: 'Cooling load reduced by <b>16.4%</b>. Hotspot risk cleared. No SLA impact.',
    },
    events: [
      { time: '15:02', type: 'detected', text: 'Cooling constraint: Singapore hotspots forming' },
      { time: '15:03', type: 'analyzed', text: 'Two zones above thermal target' },
      { time: '15:04', type: 'acted', text: 'Migrated hotspot workloads to Frankfurt + Oregon' },
      { time: '15:05', type: 'acted', text: 'Sequenced setpoint increase on 14 racks' },
      { time: '15:07', type: 'verified', text: 'Cooling load reduced by <b>16.4%</b>' },
      { time: '15:08', type: 'saved', text: 'Hotspot risk cleared without throttling' },
    ],
  },

  power: {
    alert: { level: 'warn', ttl: 'Power price spike', body: 'Deferring flexible batch jobs to cheaper window.' },
    flows: [
      { from: 'virginia', to: 'oregon', kind: 'opt', label: 'load moved off peak price' },
      { from: 'tokyo', to: 'oregon', kind: 'ok', label: 'batch deferred 90 min' },
      { from: 'singapore', to: 'frankfurt', kind: 'ok', label: 'inference balanced' },
    ],
    regions: patchRegions({
      virginia: { util: 68, role: 'Price-throttled', status: 'warn', carbon: 'High' },
      oregon: { util: 79, role: 'Low-price intake', status: 'opt' },
      tokyo: { util: 58, role: 'Batch (deferred)', status: 'ok' },
    }),
    trace: {
      action: 'ACTION #245',
      detected: 'Day-ahead power price on the <b>Virginia</b> grid spiked 3.4× above baseline for the next 90 minutes.',
      reasoning:
        'Flexible batch and training can wait. Oregon power is cheaper now; deferring price-insensitive work avoids peak cost without missing deadlines.',
      response:
        'Deferred <b>12 batch jobs</b> by 90 minutes. Shifted flexible training to Oregon. Held latency-critical inference in place.',
      verified: 'Estimated cost avoided rose by <b>$1,940</b> for the window. No deadlines missed.',
    },
    events: [
      { time: '17:20', type: 'detected', text: 'Power price spike: Virginia grid <b>3.4×</b> baseline' },
      { time: '17:21', type: 'analyzed', text: 'Flexible load eligible for deferral' },
      { time: '17:22', type: 'acted', text: 'Deferred <b>12 batch jobs</b> by 90 minutes' },
      { time: '17:23', type: 'acted', text: 'Shifted flexible training to Oregon' },
      { time: '17:25', type: 'verified', text: 'Peak-price exposure reduced' },
      { time: '17:26', type: 'saved', text: 'Cost avoided increased by <b>$1,940</b>' },
    ],
  },

  lowcarbon: {
    alert: { level: 'ok', ttl: 'Low-carbon window open', body: 'Moving training workload to Oregon while it lasts.' },
    flows: [
      { from: 'virginia', to: 'oregon', kind: 'opt', label: 'training → clean grid' },
      { from: 'frankfurt', to: 'oregon', kind: 'opt', label: 'flexible load advanced' },
      { from: 'tokyo', to: 'oregon', kind: 'opt', label: 'batch pulled forward' },
    ],
    regions: patchRegions({
      oregon: { util: 91, carbon: 'Low', thermal: 'Stable', status: 'opt', role: 'Low-carbon sink' },
      virginia: { util: 64, role: 'Yielding to clean grid', status: 'ok' },
      frankfurt: { util: 58, role: 'Flexible donor', status: 'ok' },
      tokyo: { util: 55, role: 'Batch advanced', status: 'ok' },
    }),
    trace: {
      action: 'ACTION #258',
      detected: 'Oregon grid carbon intensity dropped to <b>112 g/kWh</b>, opening a 2-hour low-carbon window.',
      reasoning:
        'Concentrating flexible compute here now shifts the most carbon. The window is short, so eligible training and batch should advance immediately.',
      response:
        'Pulled forward <b>9 batch jobs</b>. Migrated flexible training from Virginia and Frankfurt to Oregon. Held SLA-bound inference in region.',
      verified: 'Carbon shifted rose by <b>3.1 tCO₂e</b> for the window. GPU utilization preserved at <b>91%</b>.',
    },
    events: [
      { time: '02:14', type: 'detected', text: 'Low-carbon window open: Oregon at <b>112 g/kWh</b>' },
      { time: '02:15', type: 'analyzed', text: 'Eligible flexible load identified across 3 regions' },
      { time: '02:16', type: 'acted', text: 'Migrated flexible training to Oregon' },
      { time: '02:17', type: 'acted', text: 'Pulled forward <b>9 batch jobs</b>' },
      { time: '02:19', type: 'verified', text: 'GPU utilization preserved at <b>91%</b>' },
      { time: '02:20', type: 'saved', text: 'Carbon shifted increased by <b>3.1 tCO₂e</b>' },
    ],
  },
};

/** Ambient coordination events cycled while the fleet idles. */
export const AMBIENT: CoordinationEvent[] = [
  { time: '', type: 'analyzed', text: 'Recomputed carbon-aware placement across regions' },
  { time: '', type: 'verified', text: 'Cooling setpoints within target band' },
  { time: '', type: 'acted', text: 'Rebalanced <b>3%</b> flexible load toward lower-carbon grid' },
  { time: '', type: 'analyzed', text: 'Grid carbon forecast refreshed for next window' },
  { time: '', type: 'verified', text: 'All priority SLAs holding' },
  { time: '', type: 'acted', text: 'Deferred <b>2 batch jobs</b> to cheaper window' },
];
