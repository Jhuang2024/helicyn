import { workloadTypes, type TopoPath, type WorkloadFilter, type WorkloadRow } from '@/simulation';
import { useControlPlane } from '@/state/controlPlaneStore';
import { Tooltip } from './Tooltip';

const FILTERS: [WorkloadFilter, string][] = [
  ['all', 'All'],
  ['movable', 'Movable'],
  ['training', 'Training'],
  ['batch', 'Batch'],
  ['constrained', 'Constrained'],
];

const PRIO_CLASS: Record<string, string> = {
  Flexible: 'demo-prio--flexible',
  Critical: 'demo-prio--critical',
  Standard: 'demo-prio--standard',
};

const RISK_LABEL: Record<string, string> = { low: 'Low', med: 'Medium', high: 'High' };

const STATE_LABEL: Record<string, string> = {
  queued: 'Queued',
  running: 'Running',
  moving: 'Moving',
  deferred: 'Deferred',
  held: 'Held',
  throttled: 'Throttled',
  completed: 'Completed',
  constrained: 'Constrained',
};

/** A permanent SLA-protected critical inference row that never moves (held). */
const STATIC_HOLD = {
  name: 'Inference Cluster 04',
  sub: 'Inference Pool · realtime',
  prio: 'Critical' as const,
  region: 'US-EAST',
  power: '1.1 MW',
  risk: 'low' as const,
  action: 'Hold',
  why: 'Critical real-time inference, SLA protected',
  state: 'held' as const,
};

function Row({
  row,
  onStage,
  onPreview,
}: {
  row: {
    id: string;
    name: string;
    sub: string;
    prio: string;
    region: string;
    power: string;
    risk: string;
    action: string;
    why: string;
    state: string;
    stageable: boolean;
    topo?: TopoPath;
  };
  onStage?: () => void;
  onPreview?: (path: TopoPath | null) => void;
}) {
  return (
    <tr
      onPointerEnter={() => onPreview?.(row.topo ?? null)}
      onPointerLeave={() => onPreview?.(null)}
      onFocus={() => onPreview?.(row.topo ?? null)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) onPreview?.(null); }}
    >
      <td>
        <div className="cp-wl__name">{row.name}</div>
        <div className="cp-wl__sub mono">{row.sub}</div>
      </td>
      <td>
        <span className={'cp-prio ' + (PRIO_CLASS[row.prio] ?? '')}>{row.prio}</span>
      </td>
      <td>{row.region}</td>
      <td className="mono">{row.power}</td>
      <td>{RISK_LABEL[row.risk] ?? row.risk}</td>
      <td>
        <span className={'cp-wl__state cp-wl__state--' + row.state}>{STATE_LABEL[row.state] ?? row.state}</span>
      </td>
      <td>
        {row.stageable && onStage ? (
          <button type="button" className="cp-btn cp-btn--sm" onClick={onStage}>
            {row.action}
          </button>
        ) : (
          <span className="cp-wl__hold">{row.action}</span>
        )}
      </td>
      <td className="cp-wl__why">{row.why}</td>
    </tr>
  );
}

export function Workloads() {
  const workloads = useControlPlane((s) => s.sim.workloads);
  const staged = useControlPlane((s) => s.sim.staged);
  const filter = useControlPlane((s) => s.sim.workloadFilter);
  const setFilter = useControlPlane((s) => s.setFilter);
  const stageWorkload = useControlPlane((s) => s.stageWorkload);
  const setPreviewPath = useControlPlane((s) => s.setPreviewPath);

  const matches = (w: WorkloadRow) => filter === 'all' || workloadTypes(w.template).has(filter);
  const visible = workloads.filter(matches);
  // The permanent SLA-protected inference row is shown on the unfiltered view.
  const showHold = filter === 'all';

  return (
    <section className="demo-section" id="workloads" aria-label="Workload orchestration">
      <div className="cp-modhead">
        <span className="cp-modhead__tick mono">06</span>
        <h2>Workload orchestration</h2>
        <span className="cp-modhead__note mono">Scheduler · {workloads.length + 1} active</span>
      </div>
      <p className="cp-caption">
        Helicyn treats work as the first control surface. Flexible jobs can move, critical inference
        can hold, and batch workloads can defer when energy or thermal conditions change.
      </p>

      <div className="wl-filters" role="group" aria-label="Filter workloads">
        {FILTERS.map(([f, l]) => (
          <button
            key={f}
            type="button"
            className={'cp-chip' + (filter === f ? ' is-active' : '')}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="cp-tablewrap">
        <table className="cp-table">
          <thead>
            <tr>
              <th scope="col">Workload</th>
              <th scope="col">Priority</th>
              <th scope="col">Region</th>
              <th scope="col">Power draw</th>
              <th scope="col">Thermal risk</th>
              <th scope="col">State</th>
              <th scope="col">
                Recommended action
                <Tooltip
                  label="About recommended action"
                  text="Recommended Action. The coordinator's proposed move for each workload: shift to another region, hold in place, defer to a better window, or reroute away from risk. Each one needs operator approval."
                />
              </th>
              <th scope="col">Why</th>
            </tr>
          </thead>
          <tbody>
            {showHold && (
              <Row
                row={{ id: 'static-hold', ...STATIC_HOLD, stageable: false }}
              />
            )}
            {visible.map((w) => (
              <Row
                key={w.id}
                row={{
                  id: w.id,
                  name: w.template.name,
                  sub: w.template.sub,
                  prio: w.template.prio,
                  region: w.template.region,
                  power: w.template.power,
                  risk: w.template.risk,
                  action: w.template.action,
                  why: w.template.why,
                  state: w.state,
                  stageable: true,
                  topo: w.template.topo,
                }}
                onStage={() => stageWorkload(w.id)}
                onPreview={setPreviewPath}
              />
            ))}
          </tbody>
        </table>
      </div>

      {staged.length > 0 && (
        <div className="wl-staged">
          <div className="wl-staged__head">
            <h3>Staged actions</h3>
            <span className="mono">{staged.length} staged in simulation</span>
          </div>
          <ul className="wl-staged__list">
            {staged.map((s) => (
              <li key={s.id} className="wl-staged__card">
                <span className="wl-staged__id mono">{s.id}</span>
                <span className="wl-staged__label">{s.label}</span>
                <span className="wl-staged__summary mono">{s.summary}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
