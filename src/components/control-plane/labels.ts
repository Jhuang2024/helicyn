/**
 * Shared display labels and badge mappings for the Control Plane UI.
 * Kept out of component files so React Fast Refresh works per-component and
 * every module renders lifecycle states with identical wording.
 */

import type { EventCategory, RecommendationCard } from '@/simulation';

/** Recommendation lifecycle → badge text/class. */
export const STATE_BADGE: Record<RecommendationCard['state'], { txt: string; cls: string }> = {
  proposed: { txt: 'Proposed', cls: 'is-proposed' },
  approved: { txt: 'Approved · ready to simulate', cls: 'is-approved' },
  simulating: { txt: 'Simulating…', cls: 'is-approved' },
  simulated: { txt: 'Approved in simulation', cls: 'is-simulated' },
  verifying: { txt: 'Verifying…', cls: 'is-simulated' },
  verified: { txt: 'Approved in simulation', cls: 'is-simulated' },
  rejected: { txt: 'Rejected', cls: 'is-rejected' },
};

export const WORKLOAD_PRIO_CLASS: Record<string, string> = {
  Flexible: 'demo-prio--flexible',
  Critical: 'demo-prio--critical',
  Standard: 'demo-prio--standard',
};

export const WORKLOAD_STATE_LABEL: Record<string, string> = {
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
export const STATIC_HOLD = {
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

/** Event-stream category groups (detection / recommendation / decision /
 * action / verification phases are visually and filterably distinct). */
export const EVENT_GROUPS: { key: string; label: string; categories: EventCategory[] }[] = [
  { key: 'all', label: 'All', categories: [] },
  { key: 'detect', label: 'Detect', categories: ['telemetry', 'constraint', 'analysis'] },
  { key: 'recommend', label: 'Recommend', categories: ['recommendation'] },
  { key: 'decide', label: 'Decide', categories: ['approval', 'rejection'] },
  { key: 'act', label: 'Act', categories: ['action', 'migration'] },
  { key: 'verify', label: 'Verify', categories: ['verification', 'savings'] },
  { key: 'system', label: 'System', categories: ['system'] },
];

export function eventGroupOf(category: EventCategory): string {
  return EVENT_GROUPS.find((g) => g.categories.includes(category))?.key ?? 'system';
}

/** Plain-language chip text for each event category (shown in the activity log). */
export const EVENT_CATEGORY_LABEL: Record<EventCategory, string> = {
  telemetry: 'Reading',
  constraint: 'Alert',
  analysis: 'Analysis',
  recommendation: 'Suggestion',
  approval: 'Approved',
  rejection: 'Rejected',
  action: 'Action',
  migration: 'Move',
  verification: 'Check',
  savings: 'Savings',
  system: 'System',
};
