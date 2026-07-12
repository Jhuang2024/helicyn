import { useState } from 'react';
import {
  MAP,
  NODE_POS,
  SCN,
  projectNode,
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
  ok: 'Nominal',
  opt: 'Optimizing',
  warn: 'Strained',
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
 * Regional coordination topology. Represents every active region, colour-codes
 * nominal/optimizing/constrained/critical states, animates workload flows
 * between regions, and links selection with every other module: clicking a node
 * selects the region across the whole Control Plane. Reduced-motion disables the
 * flow animation. Tooltips carry load, spare capacity, carbon, thermal, and role.
 */
export function Topology() {
  const scenario = useControlPlane((s) => s.sim.scenario);
  const selected = useControlPlane((s) => s.sim.selectedRegion);
  const selectRegion = useControlPlane((s) => s.selectRegion);
  const [hover, setHover] = useState<TopoNodeId | null>(null);

  const content = SCN[scenario];
  const regionById = new Map(content.regions.map((r) => [r.id, r]));
  const tipId = hover ?? selected;
  const tip = tipId ? regionById.get(tipId) : null;
  const tipPos = tipId ? projectNode(tipId) : null;

  return (
    <div className="cp-topo">
      <svg
        className="cp-topo__map"
        viewBox={`0 0 ${MAP.W} ${MAP.H}`}
        role="img"
        aria-label="World map showing workload coordination flows between five regions"
      >
        {/* graticule backdrop */}
        <g className="cp-topo__grid" aria-hidden="true">
          {[0.2, 0.4, 0.6, 0.8].map((g) => (
            <line key={'h' + g} x1={0} y1={MAP.H * g} x2={MAP.W} y2={MAP.H * g} stroke="var(--line-soft)" />
          ))}
          {[0.2, 0.4, 0.6, 0.8].map((g) => (
            <line key={'v' + g} x1={MAP.W * g} y1={0} x2={MAP.W * g} y2={MAP.H} stroke="var(--line-soft)" />
          ))}
        </g>

        {/* flow arcs */}
        <g className="cp-topo__flows">
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

        {/* nodes */}
        <g className="cp-topo__nodes">
          {content.regions.map((r) => {
            const p = projectNode(r.id);
            const isActive = tipId === r.id;
            return (
              <g
                key={r.id}
                className={'cp-topo__node' + (isActive ? ' is-active' : '')}
                transform={`translate(${p.x} ${p.y})`}
                role="button"
                tabIndex={0}
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
                <circle r={isActive ? 13 : 10} fill={STATUS_COLOR[r.status]} opacity="0.18" />
                <circle r={isActive ? 7 : 5} fill={STATUS_COLOR[r.status]} />
                <text className="cp-topo__nodelabel mono" y={-16} textAnchor="middle">
                  {NODE_POS[r.id].label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {tip && tipPos && (
        <div
          className="cp-topo__tip"
          style={{ left: `${(tipPos.x / MAP.W) * 100}%`, top: `${(tipPos.y / MAP.H) * 100}%` }}
          role="status"
        >
          <strong>{NODE_POS[tip.id].label}</strong>
          <span className={'cp-topo__tipbadge cp-topo__tipbadge--' + tip.status}>{STATUS_LABEL[tip.status]}</span>
          <dl>
            <div><dt>Load</dt><dd>{tip.util}%</dd></div>
            <div><dt>Spare capacity</dt><dd>{Math.max(0, 100 - tip.util)}%</dd></div>
            <div><dt>Carbon</dt><dd>{tip.carbon}</dd></div>
            <div><dt>Thermal</dt><dd>{tip.thermal}</dd></div>
            <div><dt>Role</dt><dd>{tip.role}</dd></div>
          </dl>
        </div>
      )}

      <div className="cp-topo__legend" aria-hidden="true">
        <span><span className="cp-dot cp-dot--opt" />Optimized workload flow</span>
        <span><span className="cp-dot cp-dot--ok" />Balanced capacity</span>
        <span><span className="cp-dot cp-dot--warn" />Constrained region</span>
      </div>
    </div>
  );
}
