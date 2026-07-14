import { useState } from 'react';
import {
  MAP,
  NODE_POS,
  SCN,
  projectNode,
  selectRegionTelemetry,
  type FlowArc,
  type RegionNode,
  type TopoNodeId,
} from '@/simulation';
import { useControlPlane } from '@/state/controlPlaneStore';

const STATUS_COLOR: Record<RegionNode['status'], string> = {
  ok: 'var(--ok)',
  opt: 'var(--signal)',
  warn: 'var(--warn)',
  crit: 'oklch(0.62 0.2 25)',
};

const STATUS_LABEL: Record<RegionNode['status'], string> = {
  ok: 'Healthy',
  opt: 'Optimizing',
  warn: 'Under strain',
  crit: 'Alert',
};

const FLOW_COLOR: Record<FlowArc['kind'], string> = {
  opt: 'var(--signal)',
  ok: 'var(--ok)',
  warn: 'var(--warn)',
};

function arcPath(from: TopoNodeId, to: TopoNodeId): string {
  const a = projectNode(from);
  const b = projectNode(to);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2 - Math.abs(b.x - a.x) * 0.18 - 20;
  return `M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}`;
}

/**
 * Regional coordination topology: the main canvas visualization. Every node
 * derives from the unified region-telemetry selector (the same numbers the
 * region cards show), and clicking a node sets the global selected entity so
 * the inspector, event stream, and other views stay in sync. When a
 * recommendation is selected, its touched regions glow; hovering a rec or
 * workload previews its movement path. Reduced motion disables flow animation.
 */
export function Topology({ compact = false }: { compact?: boolean }) {
  const sim = useControlPlane((s) => s.sim);
  const scenario = sim.scenario;
  const selectedEntity = sim.selectedEntity;
  const selected = selectedEntity?.type === 'region' ? selectedEntity.id : null;
  const selectRegion = useControlPlane((s) => s.selectRegion);
  const previewPath = useControlPlane((s) => s.previewPath);
  const [hover, setHover] = useState<TopoNodeId | null>(null);

  const content = SCN[scenario];
  const telemetry = selectRegionTelemetry(sim);
  const liveRegions = telemetry.map((t) => ({
    id: t.topoId,
    util: t.load,
    carbon: t.carbonLabel,
    thermal: t.thermal,
    role: t.role,
    status: t.status,
    spare: t.spare,
  }));

  // Regions touched by the currently selected recommendation glow on the map.
  const relatedNodes = new Set<TopoNodeId>();
  if (selectedEntity?.type === 'recommendation') {
    const card = sim.recommendations.find((r) => r.id === selectedEntity.id);
    if (card) {
      relatedNodes.add(card.template.topo.from);
      if (card.template.topo.to) relatedNodes.add(card.template.topo.to);
    }
  }
  if (selectedEntity?.type === 'workload') {
    const w = sim.workloads.find((r) => r.id === selectedEntity.id);
    if (w) {
      relatedNodes.add(w.template.topo.from);
      if (w.template.topo.to) relatedNodes.add(w.template.topo.to);
    }
  }
  if (selectedEntity?.type === 'event') {
    const event = sim.events.find((e) => e.id === selectedEntity.id);
    for (const ref of event?.entities ?? []) {
      if (ref.type === 'region') relatedNodes.add(ref.id as TopoNodeId);
    }
  }

  const regionById = new Map(liveRegions.map((r) => [r.id, r]));
  const tipId = hover ?? selected;
  const tip = tipId ? regionById.get(tipId) : null;
  const tipPos = tipId ? projectNode(tipId) : null;

  return (
    <div className={'cp-topo' + (compact ? ' cp-topo--compact' : '')}>
      <svg
        className="cp-topo__map"
        viewBox={`${MAP.X} ${MAP.Y} ${MAP.W} ${MAP.H}`}
        role="img"
        aria-label="World map showing workload coordination flows between five regions"
      >
        {/* graticule backdrop */}
        <g className="cp-topo__grid" aria-hidden="true">
          {[0.2, 0.4, 0.6, 0.8].map((g) => (
            <line key={'h' + g} x1={MAP.X} y1={MAP.Y + MAP.H * g} x2={MAP.X + MAP.W} y2={MAP.Y + MAP.H * g} stroke="var(--line-soft)" />
          ))}
          {[0.2, 0.4, 0.6, 0.8].map((g) => (
            <line key={'v' + g} x1={MAP.X + MAP.W * g} y1={MAP.Y} x2={MAP.X + MAP.W * g} y2={MAP.Y + MAP.H} stroke="var(--line-soft)" />
          ))}
        </g>

        <image
          className="cp-topo__world"
          href="/images/world-outline.png"
          x={0}
          y={0}
          width={MAP.IMG_W}
          height={MAP.IMG_H}
          aria-hidden="true"
        />

        {/* flow arcs */}
        <g className={'cp-topo__flows' + (previewPath ? ' is-previewing' : '')}>
          {content.flows.map((flow, i) => (
            <g key={i}>
              <path
                d={arcPath(flow.from, flow.to)}
                fill="none"
                stroke={FLOW_COLOR[flow.kind]}
                strokeWidth="1.6"
                opacity="0.5"
              />
              <path
                className="cp-topo__flowdash"
                d={arcPath(flow.from, flow.to)}
                fill="none"
                stroke={FLOW_COLOR[flow.kind]}
                strokeWidth="2"
                strokeDasharray="4 10"
              >
                <title>
                  {NODE_POS[flow.from].label} → {NODE_POS[flow.to].label}: {flow.label}
                </title>
              </path>
            </g>
          ))}
        </g>

        {previewPath && previewPath.to && (
          <g className="cp-topo__preview" aria-hidden="true">
            <path d={arcPath(previewPath.from, previewPath.to)} className="cp-topo__previewbase" />
            <path d={arcPath(previewPath.from, previewPath.to)} className="cp-topo__previewdash" />
          </g>
        )}

        {/* nodes */}
        <g className="cp-topo__nodes">
          {liveRegions.map((r) => {
            const p = projectNode(r.id);
            const isActive = tipId === r.id;
            const isRelated = relatedNodes.has(r.id);
            return (
              <g
                key={r.id}
                className={
                  'cp-topo__node' +
                  (isActive ? ' is-active' : '') +
                  (isRelated ? ' is-related' : '') +
                  (previewPath?.from === r.id ? ' is-preview-source' : '') +
                  (previewPath?.to === r.id ? ' is-preview-target' : '')
                }
                transform={`translate(${p.x} ${p.y})`}
                role="button"
                tabIndex={0}
                aria-pressed={selected === r.id}
                aria-label={`${NODE_POS[r.id].label}: ${STATUS_LABEL[r.status]}, ${r.util}% utilization`}
                onMouseEnter={() => setHover(r.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(r.id)}
                onBlur={() => setHover(null)}
                onClick={() => selectRegion(selected === r.id ? null : r.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectRegion(selected === r.id ? null : r.id);
                  }
                }}
              >
                {isRelated && <circle r={13} fill="none" stroke="var(--signal)" strokeDasharray="3 4" opacity="0.8" />}
                <circle r={isActive ? 10 : 8} fill={STATUS_COLOR[r.status]} opacity="0.18" />
                <circle r={isActive ? 5.5 : 4} fill={STATUS_COLOR[r.status]} />
                <text className="cp-topo__nodelabel mono" y={-13} textAnchor="middle">
                  {NODE_POS[r.id].label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {tip && tipPos && !compact && (
        <div
          className="cp-topo__tip"
          style={{ left: `${((tipPos.x - MAP.X) / MAP.W) * 100}%`, top: `${((tipPos.y - MAP.Y) / MAP.H) * 100}%` }}
          role="status"
        >
          <strong>{NODE_POS[tip.id].label}</strong>
          <span className={'cp-topo__tipbadge cp-topo__tipbadge--' + tip.status}>{STATUS_LABEL[tip.status]}</span>
          <dl>
            <div><dt>Load</dt><dd>{tip.util}%</dd></div>
            <div><dt>Spare capacity</dt><dd>{tip.spare}%</dd></div>
            <div><dt>Carbon</dt><dd>{tip.carbon}</dd></div>
            <div><dt>Thermal</dt><dd>{tip.thermal}</dd></div>
            <div><dt>Role</dt><dd>{tip.role}</dd></div>
          </dl>
        </div>
      )}

      <div className="cp-topo__legend" aria-hidden="true">
        <span><span className="cp-dot cp-dot--opt" />Work being moved</span>
        <span><span className="cp-dot cp-dot--ok" />Healthy</span>
        <span><span className="cp-dot cp-dot--warn" />Under stress</span>
      </div>
    </div>
  );
}
