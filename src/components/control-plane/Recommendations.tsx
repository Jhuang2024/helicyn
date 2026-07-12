import { useControlPlane } from '@/state/controlPlaneStore';
import { PRIO_CLASS, type RecommendationCard } from '@/simulation';
import { Tooltip } from './Tooltip';

const STATE_BADGE: Record<RecommendationCard['state'], { txt: string; cls: string }> = {
  proposed: { txt: 'Proposed', cls: 'is-proposed' },
  approved: { txt: 'Approved · ready to simulate', cls: 'is-approved' },
  simulating: { txt: 'Simulating…', cls: 'is-approved' },
  simulated: { txt: 'Approved in simulation', cls: 'is-simulated' },
  verifying: { txt: 'Verifying…', cls: 'is-simulated' },
  verified: { txt: 'Approved in simulation', cls: 'is-simulated' },
  rejected: { txt: 'Rejected', cls: 'is-rejected' },
};

function RecCard({ card }: { card: RecommendationCard }) {
  const approveRec = useControlPlane((s) => s.approveRec);
  const rejectRec = useControlPlane((s) => s.rejectRec);
  const simulateRec = useControlPlane((s) => s.simulateRec);
  const regenerateRec = useControlPlane((s) => s.regenerateRec);
  const setPreviewPath = useControlPlane((s) => s.setPreviewPath);
  const t = card.template;
  const badge = STATE_BADGE[card.state];
  const isApproved = card.state === 'approved';
  const isTerminal = card.state === 'verified' || card.state === 'simulated' || card.state === 'rejected';

  const onSimulate = () => {
    simulateRec(card.id);
    window.setTimeout(() => regenerateRec(card.id), 1600);
  };
  const onReject = () => {
    rejectRec(card.id);
    window.setTimeout(() => regenerateRec(card.id), 900);
  };
  const onExplain = () => {
    document.getElementById('cp-trace')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <article
      className={'cp-rec ' + badge.cls}
      onPointerEnter={() => setPreviewPath(t.topo)}
      onPointerLeave={() => setPreviewPath(null)}
      onFocus={() => setPreviewPath(t.topo)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPreviewPath(null); }}
    >
      <div className="cp-rec__head">
        <span className="cp-rec__id mono">{card.id}</span>
        <span className="cp-rec__type">{t.type}</span>
        <span className={'cp-rec__state ' + badge.cls}>{badge.txt}</span>
      </div>
      <p className="cp-rec__text" dangerouslySetInnerHTML={{ __html: t.text }} />
      <dl className="cp-rec__meta">
        <div>
          <dt>Priority</dt>
          <dd className={PRIO_CLASS[t.prio]}>{t.prio}</dd>
        </div>
        <div>
          <dt>Est. impact</dt>
          <dd>{t.impact}</dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd>
            <span className="cp-conf">
              <span className="cp-conf__fill" style={{ width: `${t.conf}%` }} />
            </span>
            {t.conf}%
          </dd>
        </div>
      </dl>
      <div className="cp-rec__guards">
        <p><span className="cp-rec__guardk mono">Protected</span> {t.protect}</p>
        <p><span className="cp-rec__guardk mono">Risk</span> {t.risk}</p>
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
          disabled={!isApproved}
          title={!isApproved ? 'Approve in simulation first' : undefined}
          onClick={onSimulate}
        >
          Simulate
        </button>
        <button type="button" className="cp-btn" onClick={onExplain} title="Jump to the decision trace behind this recommendation">
          Explain
        </button>
        <button type="button" className="cp-btn cp-btn--danger" disabled={isTerminal} onClick={onReject} title="Reject recommendation">
          Reject
        </button>
      </div>
    </article>
  );
}

export function Recommendations() {
  const recs = useControlPlane((s) => s.sim.recommendations);
  return (
    <div className="cp-recs">
      <div className="cp-modhead">
        <span className="cp-modhead__tick mono">04</span>
        <h2>Recommendations</h2>
        <span className="cp-modhead__note mono">Operator approval required</span>
      </div>
      <p className="cp-caption">
        Approve to stage an action, simulate to file it, or reject to dismiss it. Every approval
        generates the next recommendation.
      </p>
      <div className="cp-recs__list">
        {recs.map((card) => (
          <RecCard key={card.id} card={card} />
        ))}
      </div>
    </div>
  );
}

const MODE_EXPLAIN: Record<string, string> = {
  conservative:
    'Conservative mode favors SLA confidence and thermal headroom over savings; fewer workloads are eligible to move.',
  balanced:
    'Balanced mode prioritizes energy savings while preserving thermal headroom and SLA-locked workloads.',
  aggressive: 'Aggressive mode unlocks the most savings and surfaces more warnings, with lower confidence.',
};

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  tooltip,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  tooltip?: string;
}) {
  return (
    <div className="cp-ctrl">
      <span className="cp-ctrl__k">
        {label}
        {tooltip && <Tooltip label={`About ${label}`} text={tooltip} />}
      </span>
      <div className="cp-seg" role="group" aria-label={label}>
        {options.map(([v, l]) => (
          <button
            key={v}
            type="button"
            className={'cp-seg__btn' + (v === value ? ' is-active' : '')}
            aria-pressed={v === value}
            onClick={() => onChange(v)}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SimulationControls() {
  const controls = useControlPlane((s) => s.sim.controls);
  const setControl = useControlPlane((s) => s.setControl);
  const carbonText =
    controls.carbon === 'high'
      ? ' High carbon priority moves flexible workloads toward lower-carbon regions even when cost savings are smaller.'
      : controls.carbon === 'low'
        ? ' Low carbon priority weights cost and energy efficiency over emissions.'
        : '';

  return (
    <div className="cp-controls" id="controls">
      <div className="cp-modhead">
        <span className="cp-modhead__tick mono">05</span>
        <h2>Simulation controls</h2>
      </div>
      <p className="cp-caption">Operators define the boundaries. Helicyn proposes actions inside them.</p>

      <div className="cp-deck">
        <Segmented
          label="Optimization mode"
          value={controls.mode}
          options={[
            ['conservative', 'Conservative'],
            ['balanced', 'Balanced'],
            ['aggressive', 'Aggressive'],
          ]}
          onChange={(v) => setControl({ mode: v })}
        />
        <Segmented
          label="Carbon priority"
          value={controls.carbon}
          options={[
            ['low', 'Low'],
            ['medium', 'Medium'],
            ['high', 'High'],
          ]}
          onChange={(v) => setControl({ carbon: v })}
        />
        <div className="cp-ctrl">
          <span className="cp-ctrl__k">
            SLA protection
            <Tooltip
              label="About SLA protection"
              text="SLA Protection. A hard boundary: latency-critical and deadline-bound workloads are never moved or throttled in a way that breaches their service-level agreement."
            />
          </span>
          <span className="cp-locked mono">Locked · Enforced</span>
        </div>
        <div className="cp-ctrl">
          <span className="cp-ctrl__k">
            Workload flexibility
            <Tooltip
              label="About workload flexibility"
              text="Workload Flexibility. How much load is eligible to move or defer. Higher flexibility gives the coordinator more room to shift work toward cleaner, cheaper, cooler conditions."
            />
            <span className="cp-ctrl__val mono">{controls.flex}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={controls.flex}
            aria-label="Workload flexibility"
            onChange={(e) => setControl({ flex: Number(e.target.value) })}
          />
          <div className="cp-ctrl__scale mono">
            <span>Rigid</span>
            <span>Elastic</span>
          </div>
        </div>
        <Segmented
          label="Cooling risk tolerance"
          value={controls.cooling}
          options={[
            ['low', 'Low'],
            ['medium', 'Medium'],
            ['high', 'High'],
          ]}
          onChange={(v) => setControl({ cooling: v })}
          tooltip="Cooling Risk Tolerance. How close to thermal limits the system is allowed to operate. Higher tolerance unlocks more savings but leaves less headroom against hotspots."
        />
        <p className="cp-deck__explain">{MODE_EXPLAIN[controls.mode] + carbonText}</p>
        <p className="cp-deck__foot mono">Recomputing projection in real time</p>
      </div>
    </div>
  );
}
