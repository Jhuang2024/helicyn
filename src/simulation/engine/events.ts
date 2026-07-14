/**
 * Structured event construction.
 *
 * Every event in the stream is created here, by the engine, exactly once per
 * state transition: render code never appends events, so rerenders and React
 * Strict Mode double-invocation can never duplicate entries. Scenario copy is
 * still authored in the legacy {time,type,text} format and converted to the
 * structured {@link SimEvent} shape at load time.
 */

import type {
  CoordinationEvent,
  EntityRef,
  EventCategory,
  EventSeverity,
  EventType,
  SimEvent,
} from '../models/types';
import { formatClock } from './accumulation';

/** Cap on retained events. Old entries fall off; ids stay unique regardless. */
export const MAX_EVENTS = 120;

/** Legacy scenario event type → structured category/severity/title. */
const LEGACY_MAP: Record<EventType, { category: EventCategory; severity: EventSeverity; title: string }> = {
  detected: { category: 'constraint', severity: 'warn', title: 'Constraint detected' },
  analyzed: { category: 'analysis', severity: 'info', title: 'Analysis' },
  acted: { category: 'action', severity: 'info', title: 'Action applied' },
  verified: { category: 'verification', severity: 'ok', title: 'Verified' },
  saved: { category: 'savings', severity: 'ok', title: 'Savings recorded' },
  rejected: { category: 'rejection', severity: 'warn', title: 'Rejected' },
};

/** Parse a scenario "HH:MM" time string into simulation seconds. */
function ticksFromTimeString(time: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60;
}

export interface EventInput {
  category: EventCategory;
  severity: EventSeverity;
  title: string;
  text: string;
  entities?: EntityRef[];
  recId?: string;
  actionId?: string;
}

/** Build a structured event stamped at the given simulation tick. */
export function makeEvent(seq: number, tick: number, input: EventInput): SimEvent {
  return {
    id: 'EV-' + String(seq).padStart(3, '0'),
    tick,
    time: formatClock(tick).slice(0, 5),
    category: input.category,
    severity: input.severity,
    title: input.title,
    text: input.text,
    entities: input.entities ?? [],
    ...(input.recId ? { recId: input.recId } : {}),
    ...(input.actionId ? { actionId: input.actionId } : {}),
  };
}

/**
 * Convert the scenario-authored backstory events into structured events.
 * Their authored HH:MM timestamps are preserved as real ticks so the timeline
 * can place them.
 */
export function seedEvents(
  legacy: CoordinationEvent[],
  startSeq: number,
): { events: SimEvent[]; nextSeq: number } {
  let seq = startSeq;
  const events = legacy.map((e) => {
    seq += 1;
    const meta = LEGACY_MAP[e.type];
    const tick = ticksFromTimeString(e.time);
    const event = makeEvent(seq, tick, {
      category: meta.category,
      severity: meta.severity,
      title: meta.title,
      text: e.text,
    });
    // Preserve the authored display time verbatim (it is scenario backstory).
    return { ...event, time: e.time || event.time };
  });
  return { events, nextSeq: seq };
}

/** Ambient coordination activity cycled while the fleet idles (deterministic). */
export const AMBIENT_EVENTS: EventInput[] = [
  {
    category: 'analysis',
    severity: 'info',
    title: 'Placement recomputed',
    text: 'Recomputed carbon-aware placement across regions',
  },
  {
    category: 'verification',
    severity: 'ok',
    title: 'Setpoints verified',
    text: 'Cooling setpoints remain within target band',
  },
  {
    category: 'action',
    severity: 'info',
    title: 'Load rebalanced',
    text: 'Rebalanced <b>3%</b> flexible load toward a lower-carbon grid',
  },
  {
    category: 'telemetry',
    severity: 'info',
    title: 'Forecast refreshed',
    text: 'Grid carbon forecast refreshed for the next operating window',
  },
  {
    category: 'verification',
    severity: 'ok',
    title: 'SLAs holding',
    text: 'All priority SLAs holding',
  },
  {
    category: 'action',
    severity: 'info',
    title: 'Batch deferred',
    text: 'Deferred <b>2 batch jobs</b> to a cheaper window',
  },
];
