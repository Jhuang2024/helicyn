/**
 * Lightweight, dependency-free SVG chart primitives for the Control Plane.
 *
 * All charts are driven by simulation state (never independent random values),
 * scale to their container, expose accessible text summaries, and respect
 * reduced motion via CSS. Kept small and inline so no heavyweight charting
 * library is pulled into the bundle.
 */

interface SparklineProps {
  series: number[];
  nowFraction: number;
  color?: string;
  ariaLabel: string;
}

function pathFrom(series: number[], w: number, h: number, pad = 2): { d: string; min: number; max: number } {
  const min = Math.min(0, ...series);
  const max = Math.max(...series, min + 1);
  const span = max - min || 1;
  const step = series.length > 1 ? (w - pad * 2) / (series.length - 1) : 0;
  const d = series
    .map((v, i) => {
      const x = pad + i * step;
      const y = h - pad - ((v - min) / span) * (h - pad * 2);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
  return { d, min, max };
}

/** Metric sparkline: solid up to "now", dashed projection after. */
export function Sparkline({ series, nowFraction, color = 'var(--signal)', ariaLabel }: SparklineProps) {
  const w = 220;
  const h = 46;
  const splitIndex = Math.max(1, Math.round(nowFraction * (series.length - 1)));
  const solid = series.slice(0, splitIndex + 1);
  const dashed = series.slice(splitIndex);
  const full = pathFrom(series, w, h);
  const min = full.min;
  const max = full.max;
  const span = max - min || 1;
  const pad = 2;
  const step = (w - pad * 2) / (series.length - 1);
  const toXY = (v: number, i: number) => {
    const x = pad + i * step;
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return `${x.toFixed(2)} ${y.toFixed(2)}`;
  };
  const solidD = solid.map((v, i) => `${i === 0 ? 'M' : 'L'}${toXY(v, i)}`).join(' ');
  const dashedD = dashed.map((v, i) => `${i === 0 ? 'M' : 'L'}${toXY(v, splitIndex + i)}`).join(' ');
  const nowX = pad + splitIndex * step;

  return (
    <svg className="cp-spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={ariaLabel} preserveAspectRatio="none">
      <path d={solidD} fill="none" stroke={color} strokeWidth="1.6" />
      <path d={dashedD} fill="none" stroke={color} strokeWidth="1.4" strokeDasharray="3 3" opacity="0.55" />
      <line x1={nowX} y1={pad} x2={nowX} y2={h - pad} stroke="var(--line-2)" strokeWidth="1" />
    </svg>
  );
}

interface LineChartProps {
  series: number[];
  min: number;
  max: number;
  color?: string;
  ariaLabel: string;
  topLabel: string;
  bottomLabel: string;
}

/** Full line chart with gridlines and axis labels (power demand). */
export function LineChart({ series, min, max, color = 'var(--signal)', ariaLabel, topLabel, bottomLabel }: LineChartProps) {
  const w = 600;
  const h = 180;
  const pad = 8;
  const span = max - min || 1;
  const step = series.length > 1 ? (w - pad * 2) / (series.length - 1) : 0;
  const y = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2);
  const d = series
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(pad + i * step).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(' ');
  const area = `${d} L${(pad + (series.length - 1) * step).toFixed(1)} ${h - pad} L${pad} ${h - pad} Z`;
  return (
    <div className="cp-chart">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={ariaLabel} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1={pad} y1={h * g} x2={w - pad} y2={h * g} stroke="var(--line-soft)" strokeWidth="1" />
        ))}
        <path d={area} fill={color} opacity="0.08" />
        <path d={d} fill="none" stroke={color} strokeWidth="1.8" />
      </svg>
      <span className="cp-chart__axis cp-chart__axis--top mono">{topLabel}</span>
      <span className="cp-chart__axis cp-chart__axis--bottom mono">{bottomLabel}</span>
    </div>
  );
}

interface TrendChartProps {
  series: number[];
  nowFraction: number;
  color?: string;
  ariaLabel: string;
  now: string;
  hi: string;
  lo: string;
  unit: string;
  fullySolid?: boolean;
}

/** Mini trend chart (carbon/gpu/pue) with a now-marker and projection tail. */
export function TrendChart({ series, nowFraction, color = 'var(--signal)', ariaLabel, now, hi, lo, unit, fullySolid }: TrendChartProps) {
  const w = 300;
  const h = 120;
  const pad = 6;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const step = (w - pad * 2) / (series.length - 1);
  const y = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2);
  const splitIndex = fullySolid ? series.length - 1 : Math.max(1, Math.round(nowFraction * (series.length - 1)));
  const toD = (arr: number[], offset: number) =>
    arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${(pad + (offset + i) * step).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const solidD = toD(series.slice(0, splitIndex + 1), 0);
  const dashedD = fullySolid ? '' : toD(series.slice(splitIndex), splitIndex);
  const nowX = pad + splitIndex * step;
  return (
    <div className="cp-trend">
      <div className="cp-trend__now mono">{now}</div>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={ariaLabel} preserveAspectRatio="none">
        <path d={solidD} fill="none" stroke={color} strokeWidth="1.8" />
        {dashedD && <path d={dashedD} fill="none" stroke={color} strokeWidth="1.4" strokeDasharray="3 3" opacity="0.5" />}
        {!fullySolid && <line x1={nowX} y1={pad} x2={nowX} y2={h - pad} stroke="var(--line-2)" strokeWidth="1" />}
      </svg>
      <div className="cp-trend__axis mono">
        <span>{hi}</span>
        <span>{lo}</span>
      </div>
      <div className="cp-trend__unit mono">{unit}</div>
    </div>
  );
}

interface CompareRowProps {
  label: string;
  before: number;
  after: number;
  unit: string;
  dp: number;
}

/** Before/after comparison bars with a delta percentage. */
export function CompareBars({ label, before, after, unit, dp }: CompareRowProps) {
  const max = Math.max(before, after) * 1.05 || 1;
  const pct = Math.round(((before - after) / before) * 100);
  const sign = after > before ? '+' : '−';
  return (
    <div className="cp-compare">
      <div className="cp-compare__head">
        <span className="cp-compare__label">{label}</span>
        <span className={'cp-compare__delta ' + (after <= before ? 'is-good' : 'is-bad')}>
          {sign}
          {Math.abs(pct)}% {unit ? `${unit} ` : ''}optimized
        </span>
      </div>
      <div className="cp-compare__bars">
        <div className="cp-compare__bar">
          <span className="cp-compare__k mono">Before</span>
          <span className="cp-compare__track">
            <span className="cp-compare__fill cp-compare__fill--before" style={{ width: `${(before / max) * 100}%` }} />
          </span>
          <span className="cp-compare__v mono">
            {before.toFixed(dp)} {unit}
          </span>
        </div>
        <div className="cp-compare__bar">
          <span className="cp-compare__k mono">After</span>
          <span className="cp-compare__track">
            <span className="cp-compare__fill cp-compare__fill--after" style={{ width: `${(after / max) * 100}%` }} />
          </span>
          <span className="cp-compare__v mono">
            {after.toFixed(dp)} {unit}
          </span>
        </div>
      </div>
    </div>
  );
}
