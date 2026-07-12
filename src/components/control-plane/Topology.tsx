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

// Coarse geographic silhouettes from the original Control Plane. The React
// migration retained the projection and nodes but accidentally dropped the
// land layer, leaving the "map" as an empty graticule.
const CONTINENTS: Array<Array<[number, number]>> = [
  [[-165,60],[-156,71],[-128,71],[-95,72],[-62,68],[-78,62],[-55,51],[-70,41],[-81,25],[-97,26],[-112,30],[-124,48],[-150,59],[-165,60]],
  [[-78,8],[-60,9],[-49,0],[-35,-8],[-48,-25],[-62,-40],[-69,-52],[-74,-50],[-71,-33],[-70,-18],[-81,-6],[-78,8]],
  [[-16,15],[-10,30],[0,36],[25,32],[35,24],[51,12],[43,-2],[35,-22],[26,-34],[18,-34],[12,-17],[9,0],[-8,5],[-16,15]],
  [[-10,36],[-9,43],[-4,48],[-1,58],[12,65],[25,71],[30,66],[28,60],[55,58],[48,50],[30,45],[20,40],[6,43],[-10,36]],
  [[48,50],[68,55],[85,75],[105,78],[158,72],[170,66],[156,52],[135,38],[122,31],[108,18],[103,4],[91,22],[80,13],[67,24],[52,16],[40,22],[34,30],[48,50]],
  [[114,-22],[130,-12],[142,-11],[150,-24],[153,-28],[150,-37],[143,-39],[129,-32],[115,-34],[114,-22]],
  [[-46,60],[-22,70],[-20,76],[-32,80],[-50,78],[-55,70],[-46,60]],
];

function landPath(points: Array<[number, number]>): string {
  return points.map(([lon, lat], i) => {
    const x = ((lon - MAP.lonMin) / (MAP.lonMax - MAP.lonMin)) * MAP.W;
    const y = ((MAP.latMax - lat) / (MAP.latMax - MAP.latMin)) * MAP.H;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ') + ' Z';
}

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

        <g className="cp-topo__land" aria-hidden="true">
          {CONTINENTS.map((points, i) => <path key={i} d={landPath(points)} />)}
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
