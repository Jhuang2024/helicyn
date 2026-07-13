/**
 * Framework-independent simulation type model.
 *
 * These types describe the entire Control Plane fleet state. Nothing here
 * imports React — the engine is a pure TypeScript module that computes state,
 * and the rendering layer reads it. Types are explicit and closed (string
 * literal unions rather than loose `string`) so impossible states are hard to
 * represent.
 */

// ---- Enumerations -----------------------------------------------------------

export type ScenarioKey =
  | 'normal'
  | 'surge'
  | 'inference'
  | 'cooling'
  | 'power'
  | 'lowcarbon';

export type OptimizationMode = 'conservative' | 'balanced' | 'aggressive';
export type CarbonPriority = 'low' | 'medium' | 'high';
export type CoolingTolerance = 'low' | 'medium' | 'high';
export type FleetView = 'after' | 'baseline';

/** Risk level shared by regions, zones, workloads. */
export type RiskLevel = 'low' | 'med' | 'high';

/** Topology node status. */
export type RegionStatus = 'ok' | 'opt' | 'warn' | 'crit';

/** Infrastructure-grid region ids (US-* vocabulary). */
export type InfraRegionId = 'us-west' | 'us-central' | 'us-east' | 'eu-west' | 'apac';

/** Topology node ids (geographic vocabulary). */
export type TopoNodeId = 'virginia' | 'oregon' | 'frankfurt' | 'singapore' | 'tokyo';

export type WorkloadPriority = 'Flexible' | 'Standard' | 'Critical';
export type RecommendationPriority = 'High' | 'Medium' | 'Low';

// ---- Operator controls ------------------------------------------------------

export interface OperatorControls {
  mode: OptimizationMode;
  carbon: CarbonPriority;
  /** Flexibility slider, integer 0..100. */
  flex: number;
  cooling: CoolingTolerance;
  view: FleetView;
}

// ---- Simulation clock -------------------------------------------------------

export interface SimClock {
  /** Seconds since 00:00 UTC of the virtual simulation day, 0..86400. */
  seconds: number;
  /** Whether the clock is advancing. */
  running: boolean;
  /** Playback multiplier (1 = real time, 60 = a minute per second, etc.). */
  speed: number;
}

// ---- Accumulated fleet effects (from approved / staged actions) -------------

export interface KpiBump {
  energy: number;
  cost: number;
  carbon: number;
  cooling: number;
  gpu: number;
  pue: number;
}

/** Telemetry biases carried by approved actions. */
export interface TelemetryEffect {
  peak?: number;
  zones?: Partial<Record<ZoneId, number>>;
}

export interface ActionEffect {
  regionDelta?: Partial<Record<InfraRegionId, number>>;
  risk?: Partial<Record<InfraRegionId, RiskLevel>>;
  flash?: InfraRegionId[];
  telemetry?: TelemetryEffect;
  bump?: Partial<KpiBump>;
}

export interface AccumulatedEffects {
  /** Persistent per-region load offsets from approved/staged actions. */
  regionDelta: Partial<Record<InfraRegionId, number>>;
  /** Persistent per-region risk overrides. */
  riskOverride: Partial<Record<InfraRegionId, RiskLevel>>;
  /** Accumulated KPI effects (already scaled by BUMP_SCALE). */
  bump: KpiBump;
  /** Telemetry peak-bias accumulated from approved thermal/routing actions. */
  peakBias: number;
  /** Per-zone cooling target adjustments. */
  zoneDelta: Partial<Record<ZoneId, number>>;
}

export type ZoneId = 'A' | 'B' | 'C' | 'D' | 'E';

// ---- Recommendations --------------------------------------------------------

export interface SimRow {
  k: string;
  b: string;
  a: string;
}

export interface VerifyStrings {
  peak: string;
  pue: string;
  variance: string;
  emissions: string;
}

export interface TopoPath {
  from: TopoNodeId;
  to: TopoNodeId | null;
}

/** A recommendation template from the pool (immutable data). */
export interface RecommendationTemplate {
  type: string;
  cat: string;
  text: string;
  prio: RecommendationPriority;
  impact: string;
  conf: number;
  protect: string;
  risk: string;
  sim: SimRow[];
  verify: VerifyStrings;
  fx: ActionEffect;
  topo: TopoPath;
}

/**
 * Recommendation lifecycle. These states are mutually exclusive — a card can
 * never be both approved and rejected. Terminal transitions are guarded in the
 * engine.
 */
export type RecommendationState =
  | 'proposed'
  | 'approved'
  | 'simulating'
  | 'simulated'
  | 'verifying'
  | 'verified'
  | 'rejected';

/** A live recommendation card (template + lifecycle + identity). */
export interface RecommendationCard {
  id: string;
  poolIndex: number;
  state: RecommendationState;
  /** Simulation-time seconds at which this card entered the queue. */
  createdAt: number;
  template: RecommendationTemplate;
}

// ---- Workloads --------------------------------------------------------------

export type WorkloadState =
  | 'queued'
  | 'running'
  | 'moving'
  | 'deferred'
  | 'held'
  | 'throttled'
  | 'completed'
  | 'constrained';

export interface WorkloadTemplate {
  name: string;
  sub: string;
  prio: WorkloadPriority;
  region: string;
  power: string;
  risk: RiskLevel;
  action: string;
  why: string;
  fx: ActionEffect;
  topo: TopoPath;
}

export interface WorkloadRow {
  id: string;
  poolIndex: number;
  state: WorkloadState;
  template: WorkloadTemplate;
}

export type WorkloadFilter = 'all' | 'movable' | 'training' | 'batch' | 'constrained';

// ---- Operator queue ---------------------------------------------------------

export type QueueLane =
  | 'pending'
  | 'approved'
  | 'simulating'
  | 'verifying'
  | 'verified'
  | 'rejected'
  | 'failed';

export interface QueueItem {
  id: string;
  recId: string;
  cat: string;
  lane: QueueLane;
  /** Simulation-time seconds at which the item entered its current lane. */
  timestamp: number;
}

// ---- Staged actions ---------------------------------------------------------

export interface StagedAction {
  id: string;
  label: string;
  summary: string;
  topo: TopoPath;
  source: 'recommendation' | 'workload';
  timestamp: number;
}

// ---- Verification -----------------------------------------------------------

export interface VerificationResult {
  recId: string;
  strings: VerifyStrings;
  /** Computed baseline vs coordinated comparison. */
  deltas: {
    peak: ComparisonDelta;
    carbon: ComparisonDelta;
    pue: ComparisonDelta;
  };
}

export interface ComparisonDelta {
  baseline: number;
  projected: number;
  simulated: number;
  unit: string;
}

// ---- Decision trace & events ------------------------------------------------

export interface DecisionTrace {
  action: string;
  detected: string;
  reasoning: string;
  response: string;
  verified: string;
}

export type EventType = 'detected' | 'analyzed' | 'acted' | 'verified' | 'saved' | 'rejected';

/** Legacy scenario-authored event (still the authoring format in scenarios.ts). */
export interface CoordinationEvent {
  time: string;
  type: EventType;
  text: string;
}

/** Event-stream category. Detection, recommendation, action, and verification
 * phases are distinct so the stream can differentiate them visually. */
export type EventCategory =
  | 'telemetry'
  | 'constraint'
  | 'analysis'
  | 'recommendation'
  | 'approval'
  | 'rejection'
  | 'migration'
  | 'action'
  | 'verification'
  | 'savings'
  | 'system';

export type EventSeverity = 'info' | 'ok' | 'warn' | 'crit';

/** A reference from an event to a domain entity it affects. */
export interface EntityRef {
  type: 'region' | 'workload' | 'recommendation';
  id: string;
}

/**
 * A structured simulation event. Events are appended exactly once by the
 * engine (never by render code), carry a unique id, and link back to the
 * entities and recommendation/action that produced them.
 */
export interface SimEvent {
  id: string;
  /** Simulation-time seconds at which the event occurred. */
  tick: number;
  /** Display time (HH:MM), derived from tick at creation. */
  time: string;
  category: EventCategory;
  severity: EventSeverity;
  title: string;
  /** Rich text body (may contain <b>/<strong> markup from scenario copy). */
  text: string;
  entities: EntityRef[];
  /** Related recommendation id, when the event belongs to a rec lifecycle. */
  recId?: string;
  /** Related staged-action id, when the event belongs to a workload action. */
  actionId?: string;
}

// ---- Global selection ---------------------------------------------------------

/** The globally selected entity (drives inspector, canvas highlight, stream). */
export type SelectedEntity =
  | { type: 'region'; id: TopoNodeId }
  | { type: 'workload'; id: string }
  | { type: 'recommendation'; id: string }
  | { type: 'event'; id: string }
  | null;

// ---- Operator action log ------------------------------------------------------

/**
 * A recorded operator input. The log is append-only and, together with the
 * scenario seed, is sufficient to deterministically replay a session —
 * backward timeline seeking can be layered on later without a schema change.
 */
export interface OperatorActionRecord {
  seq: number;
  /** Simulation-time seconds at which the operator acted. */
  tick: number;
  kind:
    | 'loadScenario'
    | 'setControl'
    | 'approve'
    | 'reject'
    | 'simulate'
    | 'regenerate'
    | 'stage'
    | 'setFilter'
    | 'seek'
    | 'reset';
  payload: string;
}

// ---- Topology ---------------------------------------------------------------

export interface RegionNode {
  id: TopoNodeId;
  util: number;
  carbon: string;
  thermal: string;
  role: string;
  status: RegionStatus;
}

export interface FlowArc {
  from: TopoNodeId;
  to: TopoNodeId;
  kind: 'opt' | 'ok' | 'warn';
  label: string;
}

export interface ScenarioAlert {
  level: 'info' | 'warn' | 'crit' | 'ok';
  ttl: string;
  body: string;
}

// ---- Lifetime counters ------------------------------------------------------

export interface LifetimeCounters {
  energy: number;
  cost: number;
  carbon: number;
  gpuh: number;
}

// ---- Telemetry history ------------------------------------------------------

export interface TelemetrySample {
  t: number; // simulation seconds
  energy: number;
  cost: number;
  carbon: number;
  carbonIntensity: number;
  cooling: number;
  gpu: number;
  pue: number;
  power: number;
}

// ---- The authoritative simulation state -------------------------------------

export interface SimulationState {
  /** Schema version for persisted state migration. */
  schemaVersion: number;
  seed: string;
  scenario: ScenarioKey;
  controls: OperatorControls;
  clock: SimClock;
  effects: AccumulatedEffects;
  recommendations: RecommendationCard[];
  recPointer: number;
  recSeq: number;
  workloads: WorkloadRow[];
  workloadPointer: number;
  workloadSeq: number;
  workloadFilter: WorkloadFilter;
  queue: QueueItem[];
  queueSeq: number;
  staged: StagedAction[];
  stagedSeq: number;
  verification: VerificationResult | null;
  events: SimEvent[];
  /** Monotonic counter guaranteeing unique event ids (never reset mid-scenario). */
  eventSeq: number;
  actionCounter: number;
  history: TelemetrySample[];
  lifetime: LifetimeCounters;
  /** Serialized PRNG state for reproducible telemetry noise. */
  prngState: number;
  /** Currently selected entity (linked selection across canvas/inspector/stream). */
  selectedEntity: SelectedEntity;
  /** Append-only operator input log (deterministic-replay structure). */
  actionLog: OperatorActionRecord[];
}
