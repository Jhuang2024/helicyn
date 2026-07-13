import {
  NODE_POS,
  PRIO_CLASS,
  RISK_TEXT,
  SCN,
  formatClock,
  selectRecommendationsForRegion,
  selectRegionTelemetryByTopo,
  selectScenarioMeta,
  selectWorkloadsForRegion,
  type SelectedEntity,
  type SimEvent,
  type TopoNodeId,
} from '@/simulation';
import { useControlPlane } from '@/state/controlPlaneStore';
import { STATE_BADGE, WORKLOAD_PRIO_CLASS, WORKLOAD_STATE_LABEL } from '../labels';
import { TracePanel } from '../DecisionTrace';

const STATUS_BADGE: Record<string, { txt: string; cls: string }> = {
  ok: { txt: 'Nominal', cls: 'control-badge--ok' },
  opt: { txt: 'Optimizing', cls: 'control-badge--opt' },
  warn: { txt: 'Strained', cls: 'control-badge--warn' },
  crit: { txt: 'Alert', cls: 'control-badge--crit' },
};

function EntityChip({
  label,
  onClick,
  kind,
}: {
  label: string;
  onClick: () => void;
  kind: 'region' | 'workload' | 'recommendation';
}) {
  return (
    <button type="button" className={'cps-chip cps-chip--' + kind} onClick={onClick}>
      {label}
    </button>
  );
}

/** Default inspector: active scenario, its alert, and the decision trace. */
function ScenarioInspector() {
  const sim = useControlPlane((s) => s.sim);
  const meta = selectScenarioMeta(sim);
  const alert = SCN[sim.scenario].alert;
  return (
    <div className="cps-inspector__body">
      <h3 className="cps-inspector__name">{meta.name}</h3>
      <p className="cps-inspector__desc">{meta.description}</p>
      <div className={'cp-alert cp-alert--' + alert.level} role="status" aria-live="polite">
        <span className="cp-alert__ttl">{alert.ttl}</span>
        <span className="cp-alert__body">{alert.body}</span>
      </div>
      <p className="cps-inspector__hint">
        Select a region, workload, recommendation, or event to inspect it here.
      </p>
      <TracePanel />
    </div>
  );
}

function RegionInspector({ id }: { id: TopoNodeId }) {
  const sim = useControlPlane((s) => s.sim);
  const selectEntity = useControlPlane((s) => s.selectEntity);
  const region = selectRegionTelemetryByTopo(sim, id);
  if (!region) return <p className="cps-inspector__empty">Region unavailable.</p>;
  const badge = STATUS_BADGE[region.status]!;
  const flows = SCN[sim.scenario].flows.filter((f) => f.from === id || f.to === id);
  const workloads = selectWorkloadsForRegion(sim, id);
  const recs = selectRecommendationsForRegion(sim, id);

  return (
    <div className="cps-inspector__body">
      <div className="cps-inspector__titlerow">
        <h3 className="cps-inspector__name">{region.nodeLabel}</h3>
        <span className={'control-badge ' + badge.cls}>{badge.txt}</span>
      </div>
      <p className="cps-inspector__desc">{region.label} · {region.role}</p>

      <dl className="cps-kv">
        <div><dt>Compute load</dt><dd className="mono">{region.load}%</dd></div>
        <div><dt>Available capacity</dt><dd className="mono">{region.spare}%</dd></div>
        <div><dt>Carbon intensity</dt><dd className="mono">{region.carbon} g/kWh · {region.carbonLabel}</dd></div>
        <div><dt>Thermal headroom</dt><dd>{region.thermal}</dd></div>
        <div><dt>Cooling risk</dt><dd>{RISK_TEXT[region.risk]}</dd></div>
        <div><dt>Flexible workload share</dt><dd className="mono">{region.flex}</dd></div>
      </dl>

      <div className="cps-inspector__section">
        <h4>Recommended action</h4>
        <p>{region.action}</p>
      </div>

      {flows.length > 0 && (
        <div className="cps-inspector__section">
          <h4>Workload movement</h4>
          <ul className="cps-flowlist">
            {flows.map((f, i) => (
              <li key={i} className={'cps-flow cps-flow--' + f.kind}>
                <span className="mono">
                  {f.from === id ? '→ ' + NODE_POS[f.to].label : '← ' + NODE_POS[f.from].label}
                </span>
                <span>{f.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {workloads.length > 0 && (
        <div className="cps-inspector__section">
          <h4>Active workloads</h4>
          <div className="cps-chiprow">
            {workloads.map((w) => (
              <EntityChip
                key={w.id}
                kind="workload"
                label={w.template.name}
                onClick={() => selectEntity({ type: 'workload', id: w.id })}
              />
            ))}
          </div>
        </div>
      )}

      {recs.length > 0 && (
        <div className="cps-inspector__section">
          <h4>Related recommendations</h4>
          <div className="cps-chiprow">
            {recs.map((r) => (
              <EntityChip
                key={r.id}
                kind="recommendation"
                label={`${r.id} · ${r.template.type}`}
                onClick={() => selectEntity({ type: 'recommendation', id: r.id })}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WorkloadInspector({ id }: { id: string }) {
  const sim = useControlPlane((s) => s.sim);
  const selectEntity = useControlPlane((s) => s.selectEntity);
  const stageWorkload = useControlPlane((s) => s.stageWorkload);
  const workload = sim.workloads.find((w) => w.id === id);
  if (!workload) {
    const staged = sim.staged.find((s) => s.id === id);
    return (
      <p className="cps-inspector__empty">
        {staged
          ? `This workload action was staged (${staged.label}).`
          : 'This workload has completed its action and left the queue.'}
      </p>
    );
  }
  const t = workload.template;
  return (
    <div className="cps-inspector__body">
      <div className="cps-inspector__titlerow">
        <h3 className="cps-inspector__name">{t.name}</h3>
        <span className={'cp-prio ' + (WORKLOAD_PRIO_CLASS[t.prio] ?? '')}>{t.prio}</span>
      </div>
      <p className="cps-inspector__desc mono">{t.sub}</p>
      <dl className="cps-kv">
        <div><dt>State</dt><dd>{WORKLOAD_STATE_LABEL[workload.state] ?? workload.state}</dd></div>
        <div><dt>Current placement</dt><dd>{t.region}</dd></div>
        {t.topo.to && (
          <div><dt>Target placement</dt><dd>{NODE_POS[t.topo.to].label}</dd></div>
        )}
        <div><dt>Power draw</dt><dd className="mono">{t.power}</dd></div>
        <div><dt>Thermal risk</dt><dd>{RISK_TEXT[t.risk]}</dd></div>
        <div><dt>SLA</dt><dd>{t.prio === 'Critical' ? 'Latency-locked · cannot move' : t.prio === 'Standard' ? 'Deadline-bound · limited moves' : 'Flexible · migration eligible'}</dd></div>
      </dl>
      <div className="cps-inspector__section">
        <h4>Recommended action</h4>
        <p>{t.action}</p>
        <p className="cps-inspector__why">{t.why}</p>
        <button type="button" className="cp-btn cp-btn--primary" onClick={() => stageWorkload(workload.id)}>
          Stage: {t.action}
        </button>
      </div>
      <div className="cps-inspector__section">
        <h4>Regions</h4>
        <div className="cps-chiprow">
          <EntityChip
            kind="region"
            label={NODE_POS[t.topo.from].label}
            onClick={() => selectEntity({ type: 'region', id: t.topo.from })}
          />
          {t.topo.to && (
            <EntityChip
              kind="region"
              label={NODE_POS[t.topo.to].label}
              onClick={() => selectEntity({ type: 'region', id: t.topo.to! })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function RecommendationInspector({ id }: { id: string }) {
  const sim = useControlPlane((s) => s.sim);
  const selectEntity = useControlPlane((s) => s.selectEntity);
  const approveRec = useControlPlane((s) => s.approveRec);
  const rejectRec = useControlPlane((s) => s.rejectRec);
  const simulateRec = useControlPlane((s) => s.simulateRec);
  const regenerateRec = useControlPlane((s) => s.regenerateRec);
  const card = sim.recommendations.find((r) => r.id === id);
  if (!card) {
    return <p className="cps-inspector__empty">This recommendation has been resolved and replaced in the queue.</p>;
  }
  const t = card.template;
  const badge = STATE_BADGE[card.state];
  const verification = sim.verification?.recId === id ? sim.verification : null;
  const regions = new Set<TopoNodeId>([t.topo.from, ...(t.topo.to ? [t.topo.to] : [])]);

  return (
    <div className="cps-inspector__body">
      <div className="cps-inspector__titlerow">
        <h3 className="cps-inspector__name mono">{card.id}</h3>
        <span className={'cp-rec__state ' + badge.cls}>{badge.txt}</span>
      </div>
      <p className="cps-inspector__desc">{t.type} · generated {formatClock(card.createdAt).slice(0, 5)} UTC</p>
      <p className="cps-inspector__text" dangerouslySetInnerHTML={{ __html: t.text }} />

      <dl className="cps-kv">
        <div><dt>Priority</dt><dd className={PRIO_CLASS[t.prio]}>{t.prio}</dd></div>
        <div><dt>Projected impact</dt><dd className="mono">{t.impact}</dd></div>
        <div>
          <dt>Confidence</dt>
          <dd>
            <span className="cp-conf"><span className="cp-conf__fill" style={{ width: `${t.conf}%` }} /></span>
            <span className="mono"> {t.conf}%</span>
          </dd>
        </div>
      </dl>

      <div className="cps-inspector__section">
        <h4>Simulated effect</h4>
        <table className="cps-simtable">
          <thead>
            <tr><th>Metric</th><th>Before</th><th>After</th></tr>
          </thead>
          <tbody>
            {t.sim.map((row) => (
              <tr key={row.k}>
                <td>{row.k}</td>
                <td className="mono">{row.b}</td>
                <td className="mono">{row.a}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="cps-inspector__section">
        <h4>Tradeoffs &amp; guardrails</h4>
        <p><span className="cp-rec__guardk mono">Protected</span> {t.protect}</p>
        <p><span className="cp-rec__guardk mono">Risk</span> {t.risk}</p>
      </div>

      <div className="cps-inspector__section">
        <h4>Affected regions</h4>
        <div className="cps-chiprow">
          {[...regions].map((r) => (
            <EntityChip
              key={r}
              kind="region"
              label={NODE_POS[r].label}
              onClick={() => selectEntity({ type: 'region', id: r })}
            />
          ))}
        </div>
      </div>

      <div className="cp-rec__actions">
        <button
          type="button"
          className="cp-btn cp-btn--primary"
          disabled={card.state !== 'proposed'}
          onClick={() => approveRec(card.id)}
        >
          {card.state === 'proposed' ? 'Approve in simulation' : 'Approved'}
        </button>
        <button
          type="button"
          className="cp-btn"
          disabled={card.state !== 'approved'}
          onClick={() => {
            simulateRec(card.id);
            window.setTimeout(() => regenerateRec(card.id), 1600);
          }}
        >
          Simulate
        </button>
        <button
          type="button"
          className="cp-btn cp-btn--danger"
          disabled={card.state === 'verified' || card.state === 'simulated' || card.state === 'rejected'}
          onClick={() => {
            rejectRec(card.id);
            window.setTimeout(() => regenerateRec(card.id), 900);
          }}
        >
          Reject
        </button>
      </div>

      {verification && (
        <div className="cps-inspector__section">
          <h4>Verification result</h4>
          <dl className="cps-kv">
            <div><dt>Peak power</dt><dd className="mono">{verification.strings.peak}</dd></div>
            <div><dt>PUE</dt><dd className="mono">{verification.strings.pue}</dd></div>
            <div><dt>Thermal variance</dt><dd className="mono">{verification.strings.variance}</dd></div>
            <div><dt>Emissions</dt><dd className="mono">{verification.strings.emissions}</dd></div>
          </dl>
          <p className="cp-verify__status mono">Verified in simulation · pending real telemetry</p>
        </div>
      )}

      <div className="cps-inspector__section">
        <h4>Why the coordinator proposed this</h4>
        <TracePanel />
      </div>
    </div>
  );
}

function EventInspector({ id }: { id: string }) {
  const sim = useControlPlane((s) => s.sim);
  const selectEntity = useControlPlane((s) => s.selectEntity);
  const seekTo = useControlPlane((s) => s.seekTo);
  const event = sim.events.find((e) => e.id === id) as SimEvent | undefined;
  if (!event) return <p className="cps-inspector__empty">This event has left the retained stream window.</p>;
  const canSeek = event.tick > sim.clock.seconds;

  const chipLabel = (ref: { type: string; id: string }) => {
    if (ref.type === 'region') return NODE_POS[ref.id as TopoNodeId]?.label ?? ref.id;
    if (ref.type === 'workload') {
      return sim.workloads.find((w) => w.id === ref.id)?.template.name ?? ref.id;
    }
    return ref.id;
  };

  return (
    <div className="cps-inspector__body">
      <div className="cps-inspector__titlerow">
        <h3 className="cps-inspector__name">{event.title}</h3>
        <span className={'cps-event__sevbadge cps-event__sevbadge--' + event.severity}>{event.severity.toUpperCase()}</span>
      </div>
      <p className="cps-inspector__desc mono">
        {event.id} · {event.category.toUpperCase()} · {event.time} UTC
      </p>
      <p className="cps-inspector__text" dangerouslySetInnerHTML={{ __html: event.text }} />

      {event.entities.length > 0 && (
        <div className="cps-inspector__section">
          <h4>Related entities</h4>
          <div className="cps-chiprow">
            {event.entities.map((ref, i) => (
              <EntityChip
                key={ref.type + ref.id + i}
                kind={ref.type}
                label={chipLabel(ref)}
                onClick={() => selectEntity({ type: ref.type, id: ref.id } as Exclude<SelectedEntity, null>)}
              />
            ))}
          </div>
        </div>
      )}

      {event.recId && (
        <div className="cps-inspector__section">
          <h4>Linked recommendation</h4>
          <EntityChip
            kind="recommendation"
            label={event.recId}
            onClick={() => selectEntity({ type: 'recommendation', id: event.recId! })}
          />
        </div>
      )}

      {event.actionId && (
        <p className="cps-inspector__desc mono">Linked action: {event.actionId}</p>
      )}

      {canSeek && (
        <button type="button" className="cp-btn" onClick={() => seekTo(event.tick)}>
          Seek to {formatClock(event.tick).slice(0, 5)} UTC
        </button>
      )}
    </div>
  );
}

const TITLES: Record<string, string> = {
  region: 'Region',
  workload: 'Workload',
  recommendation: 'Recommendation',
  event: 'Event',
};

/**
 * Contextual inspector. Always reflects the globally selected entity from the
 * canonical store; selecting anything anywhere (map, tables, cards, stream)
 * updates this panel. With nothing selected it shows the active scenario and
 * its decision trace.
 */
export function Inspector({ onClose }: { onClose?: () => void }) {
  const selectedEntity = useControlPlane((s) => s.sim.selectedEntity);
  const selectEntity = useControlPlane((s) => s.selectEntity);

  return (
    <aside className="cps-inspector" aria-label="Inspector" aria-live="polite">
      <div className="cps-inspector__head">
        <h2 className="cps-inspector__title mono">
          {selectedEntity ? TITLES[selectedEntity.type] : 'Scenario'} inspector
        </h2>
        {selectedEntity && (
          <button
            type="button"
            className="cp-btn cp-btn--sm"
            onClick={() => {
              selectEntity(null);
              onClose?.();
            }}
            aria-label="Clear selection"
          >
            Clear
          </button>
        )}
      </div>
      {!selectedEntity && <ScenarioInspector />}
      {selectedEntity?.type === 'region' && <RegionInspector id={selectedEntity.id} />}
      {selectedEntity?.type === 'workload' && <WorkloadInspector id={selectedEntity.id} />}
      {selectedEntity?.type === 'recommendation' && <RecommendationInspector id={selectedEntity.id} />}
      {selectedEntity?.type === 'event' && <EventInspector id={selectedEntity.id} />}
    </aside>
  );
}
