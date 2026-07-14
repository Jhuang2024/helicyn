import { useEffect, useRef, useState } from 'react';
import { CustomSelect } from '@/components/common/CustomSelect';
import { formatClock, type EventSeverity, type SimEvent } from '@/simulation';
import { useControlPlane } from '@/state/controlPlaneStore';
import { EVENT_CATEGORY_LABEL, EVENT_GROUPS, eventGroupOf } from '../labels';

const SEVERITIES: { key: EventSeverity | 'all'; label: string }[] = [
  { key: 'all', label: 'All severities' },
  { key: 'info', label: 'Info' },
  { key: 'ok', label: 'OK' },
  { key: 'warn', label: 'Warning' },
  { key: 'crit', label: 'Critical' },
];
const SEVERITY_OPTIONS = SEVERITIES.map(({ key, label }) => ({ value: key, label }));

/** Forward-only timeline scrubber over the 24h simulated day. */
function TimelineScrubber() {
  const seconds = useControlPlane((s) => s.sim.clock.seconds);
  const actionLog = useControlPlane((s) => s.sim.actionLog);
  const seekTo = useControlPlane((s) => s.seekTo);
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? seconds;

  const commit = () => {
    if (drag !== null && drag > seconds) seekTo(drag);
    setDrag(null);
  };

  const markers = actionLog.filter((a) =>
    a.kind === 'approve' || a.kind === 'reject' || a.kind === 'simulate' || a.kind === 'stage',
  );

  return (
    <div className="cps-timeline">
      <span className="cps-timeline__label mono">00:00</span>
      <div className="cps-timeline__trackwrap">
        <div className="cps-timeline__markers" aria-hidden="true">
          {markers.map((m) => (
            <span
              key={m.seq}
              className={'cps-timeline__marker cps-timeline__marker--' + m.kind}
              style={{ left: `${((m.tick % 86400) / 86400) * 100}%` }}
              title={`${m.kind} · ${formatClock(m.tick).slice(0, 5)}`}
            />
          ))}
        </div>
        <input
          type="range"
          className="cps-timeline__range"
          min={0}
          max={86400}
          step={60}
          value={Math.min(86400, Math.round(shown % 86400))}
          aria-label="Timeline position (forward seek only)"
          title="Drag forward to advance the simulation deterministically. Backward seeking requires replay and is intentionally not faked."
          onChange={(e) => setDrag(Number(e.target.value))}
          onPointerUp={commit}
          onKeyUp={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'End') commit();
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setDrag(null);
          }}
          onBlur={commit}
        />
      </div>
      <span className="cps-timeline__label mono">{formatClock(shown).slice(0, 5)}</span>
    </div>
  );
}

/**
 * Persistent chronological event stream. Every entry is appended exactly once
 * by the simulation engine (unique ids: rerenders can never duplicate them).
 * Supports category/severity filtering, auto-scroll with pause, jump-to-latest,
 * and selecting an event to inspect it and highlight its entities on the canvas.
 */
export function EventStream({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const events = useControlPlane((s) => s.sim.events);
  const selectedEntity = useControlPlane((s) => s.sim.selectedEntity);
  const selectEntity = useControlPlane((s) => s.selectEntity);
  const [group, setGroup] = useState('all');
  const [severity, setSeverity] = useState<EventSeverity | 'all'>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef<HTMLOListElement>(null);

  const visible = events.filter((e) => {
    if (group !== 'all' && eventGroupOf(e.category) !== group) return false;
    if (severity !== 'all' && e.severity !== severity) return false;
    return true;
  });

  const latestId = events.at(-1)?.id;
  useEffect(() => {
    if (!autoScroll || collapsed) return;
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [latestId, autoScroll, collapsed, group, severity]);

  const jumpToLatest = () => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  };

  const selectedEventId = selectedEntity?.type === 'event' ? selectedEntity.id : null;

  const onSelect = (event: SimEvent) => {
    selectEntity(selectedEventId === event.id ? null : { type: 'event', id: event.id });
  };

  return (
    <section className={'cps-stream' + (collapsed ? ' is-collapsed' : '')} aria-label="Activity log">
      <div className="cps-stream__bar">
        <button
          type="button"
          className="cps-stream__toggle mono"
          aria-expanded={!collapsed}
          onClick={onToggle}
        >
          {collapsed ? '▴' : '▾'} Activity log
          <span className="cps-stream__count mono">{events.length}</span>
        </button>

        <TimelineScrubber />

        {!collapsed && (
          <div className="cps-stream__filters">
            <div className="cp-seg cp-seg--bar" role="group" aria-label="Filter events by phase">
              {EVENT_GROUPS.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  className={'cp-seg__btn' + (group === g.key ? ' is-active' : '')}
                  aria-pressed={group === g.key}
                  onClick={() => setGroup(g.key)}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <CustomSelect
              compact
              align="end"
              className="cps-stream__sev"
              value={severity}
              ariaLabel="Filter events by severity"
              options={SEVERITY_OPTIONS}
              onChange={setSeverity}
            />
            <button
              type="button"
              className={'cp-btn cp-btn--sm' + (autoScroll ? ' is-active' : '')}
              aria-pressed={autoScroll}
              onClick={() => setAutoScroll((v) => !v)}
              title="Automatically follow new events"
            >
              Follow
            </button>
            <button type="button" className="cp-btn cp-btn--sm" onClick={jumpToLatest}>
              Latest ↓
            </button>
          </div>
        )}
      </div>

      {!collapsed && (
        <ol className="cps-stream__list" ref={listRef} role="log" aria-label="Simulation events">
          {visible.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className={
                  'cps-event cps-event--' + eventGroupOf(e.category) +
                  ' cps-event--sev-' + e.severity +
                  (selectedEventId === e.id ? ' is-selected' : '')
                }
                aria-pressed={selectedEventId === e.id}
                onClick={() => onSelect(e)}
              >
                <span className="cps-event__time mono">{e.time}</span>
                <span className={'cps-event__cat mono'}>{(EVENT_CATEGORY_LABEL[e.category] ?? e.category).toUpperCase()}</span>
                <span className="cps-event__sevdot" aria-hidden="true" />
                <span className="cps-event__title">{e.title}</span>
                <span className="cps-event__text" dangerouslySetInnerHTML={{ __html: e.text }} />
              </button>
            </li>
          ))}
          {visible.length === 0 && (
            <li className="cps-stream__empty mono">No events match the current filter.</li>
          )}
        </ol>
      )}
    </section>
  );
}
