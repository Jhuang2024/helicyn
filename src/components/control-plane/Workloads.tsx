import { workloadTypes, type TopoPath, type WorkloadFilter, type WorkloadRow } from '@/simulation';
import { useControlPlane } from '@/state/controlPlaneStore';
import { Tooltip } from './Tooltip';
import { STATIC_HOLD, WORKLOAD_PRIO_CLASS, WORKLOAD_STATE_LABEL } from './labels';

const FILTERS: [WorkloadFilter, string][] = [
  ['all', 'All'],
  ['movable', 'Movable'],
  ['training', 'Training'],
  ['batch', 'Batch'],
  ['constrained', 'Constrained'],
];

const RISK_LABEL: Record<string, string> = { low: 'Low', med: 'Medium', high: 'High' };

function Row({
  row,
  selected,
  onSelect,
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
  selected?: boolean;
  onSelect?: () => void;
  onStage?: () => void;
  onPreview?: (path: TopoPath | null) => void;
}) {
  return (
    <tr
      className={selected ? 'is-selected' : undefined}
      onPointerEnter={() => onPreview?.(row.topo ?? null)}
      onPointerLeave={() => onPreview?.(null)}
      onFocus={() => onPreview?.(row.topo ?? null)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) onPreview?.(null); }}
    >
      <td>
        {onSelect ? (
          <button
            type="button"
            className="cp-wl__namebtn"
            aria-pressed={selected}
            onClick={onSelect}
            title="Inspect this workload"
          >
            <span className="cp-wl__name">{row.name}</span>
            <span className="cp-wl__sub mono">{row.sub}</span>
          </button>
        ) : (
          <>
            <div className="cp-wl__name">{row.name}</div>
            <div className="cp-wl__sub mono">{row.sub}</div>
          </>
        )}
      </td>
      <td>
        <span className={'cp-prio ' + (WORKLOAD_PRIO_CLASS[row.prio] ?? '')}>{row.prio}</span>
      </td>
      <td>{row.region}</td>
      <td className="mono">{row.power}</td>
      <td>{RISK_LABEL[row.risk] ?? row.risk}</td>
      <td>
        <span className={'cp-wl__state cp-wl__state--' + row.state}>{WORKLOAD_STATE_LABEL[row.state] ?? row.state}</span>
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

/**
 * Workload orchestration: queue, placement, SLA locks, flexibility, and
 * migration eligibility. Staging an action applies its fleet effects through
 * the canonical store; selecting a row opens the workload inspector.
 */
export function Workloads() {
  const workloads = useControlPlane((s) => s.sim.workloads);
  const staged = useControlPlane((s) => s.sim.staged);
  const filter = useControlPlane((s) => s.sim.workloadFilter);
  const selectedEntity = useControlPlane((s) => s.sim.selectedEntity);
  const setFilter = useControlPlane((s) => s.setFilter);
  const stageWorkload = useControlPlane((s) => s.stageWorkload);
  const selectEntity = useControlPlane((s) => s.selectEntity);
  const setPreviewPath = useControlPlane((s) => s.setPreviewPath);

  const matches = (w: WorkloadRow) => filter === 'all' || workloadTypes(w.template).has(filter);
  const visible = workloads.filter(matches);
  // The permanent SLA-protected inference row is shown on the unfiltered view.
  const showHold = filter === 'all';
  const selectedId = selectedEntity?.type === 'workload' ? selectedEntity.id : null;

  return (
    <div className="cp-workloads">
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
              <th scope="col">Location</th>
              <th scope="col">Power use</th>
              <th scope="col">Heat risk</th>
              <th scope="col">Status</th>
              <th scope="col">
                Suggested action
                <Tooltip
                  label="About suggested action"
                  text="Helicyn's proposed move for each workload: shift to another site, hold in place, delay to a better time, or reroute away from risk. Nothing happens without operator approval."
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
                selected={selectedId === w.id}
                onSelect={() =>
                  selectEntity(selectedId === w.id ? null : { type: 'workload', id: w.id })
                }
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
    </div>
  );
}
