/**
 * Workload pool — the seven workload templates the orchestration table cycles
 * through. Copied verbatim from the original control.js workload POOL.
 */

import type { WorkloadTemplate } from '../models/types';

export const WORKLOAD_POOL: WorkloadTemplate[] = [
  {
    name: 'LLM Training · Batch A17',
    sub: 'Training Cluster · 1,024 GPU',
    prio: 'Flexible',
    region: 'US-WEST',
    power: '2.4 MW',
    risk: 'med',
    action: 'Shift 18% → US-CENTRAL',
    why: 'Medium thermal risk; cheaper, lower-risk capacity in US-CENTRAL',
    fx: {
      regionDelta: { 'us-west': -14, 'us-central': 14 },
      risk: { 'us-west': 'low' },
      flash: ['us-west', 'us-central'],
      bump: { energy: 1.1, cost: 280, carbon: 0.4, pue: -0.01, cooling: 0.9 },
    },
    topo: { from: 'oregon', to: 'virginia' },
  },
  {
    name: 'Embedding Refresh',
    sub: 'Batch Scheduler · nightly',
    prio: 'Flexible',
    region: 'EU-WEST',
    power: '0.7 MW',
    risk: 'low',
    action: 'Defer 42 min',
    why: 'Flexible batch aligned to a cleaner, cheaper window',
    fx: {
      regionDelta: { 'eu-west': -8 },
      flash: ['eu-west'],
      bump: { energy: 0.5, cost: 140, carbon: 0.7, cooling: 0.2 },
    },
    topo: { from: 'frankfurt', to: null },
  },
  {
    name: 'Vision Model Training',
    sub: 'GPU Pods · 512 GPU',
    prio: 'Standard',
    region: 'US-CENTRAL',
    power: '1.8 MW',
    risk: 'high',
    action: 'Reroute → US-EAST',
    why: 'High thermal risk in current region',
    fx: {
      regionDelta: { 'us-central': -12, 'us-east': 6 },
      risk: { 'us-central': 'med' },
      flash: ['us-central', 'us-east'],
      bump: { energy: 0.4, cost: 90, cooling: 1.4, pue: -0.01 },
    },
    topo: { from: 'virginia', to: 'tokyo' },
  },
  {
    name: 'Recsys Retrain',
    sub: 'Training Cluster · 768 GPU',
    prio: 'Flexible',
    region: 'APAC',
    power: '1.5 MW',
    risk: 'high',
    action: 'Shift → EU-WEST',
    why: 'Constrained cooling; cleaner capacity in EU-WEST',
    fx: {
      regionDelta: { apac: -16, 'eu-west': 10 },
      risk: { apac: 'med' },
      flash: ['apac', 'eu-west'],
      bump: { energy: 0.8, cost: 210, carbon: 0.6, cooling: 1.1 },
    },
    topo: { from: 'singapore', to: 'frankfurt' },
  },
  {
    name: 'Checkpoint Sync',
    sub: 'Batch Scheduler · rolling',
    prio: 'Flexible',
    region: 'US-WEST',
    power: '0.9 MW',
    risk: 'med',
    action: 'Defer 25 min',
    why: 'Non-urgent; shift out of the current demand peak',
    fx: {
      regionDelta: { 'us-west': -6 },
      flash: ['us-west'],
      bump: { energy: 0.3, cost: 95, carbon: 0.3 },
    },
    topo: { from: 'oregon', to: null },
  },
  {
    name: 'Fine-tune Job 22',
    sub: 'GPU Pods · 256 GPU',
    prio: 'Standard',
    region: 'US-EAST',
    power: '1.3 MW',
    risk: 'med',
    action: 'Rebalance → US-CENTRAL',
    why: 'Spread load off a warming US-EAST zone',
    fx: {
      regionDelta: { 'us-east': -8, 'us-central': 8 },
      flash: ['us-east', 'us-central'],
      bump: { energy: 0.5, cost: 120, cooling: 0.5 },
    },
    topo: { from: 'tokyo', to: 'virginia' },
  },
  {
    name: 'Data Pipeline ETL',
    sub: 'Batch Scheduler · hourly',
    prio: 'Flexible',
    region: 'EU-WEST',
    power: '0.6 MW',
    risk: 'low',
    action: 'Consolidate nodes',
    why: 'Pack onto fewer nodes to free idle capacity',
    fx: {
      regionDelta: { 'eu-west': -5 },
      flash: ['eu-west'],
      bump: { energy: 0.4, cost: 110, carbon: 0.2, cooling: 0.3 },
    },
    topo: { from: 'frankfurt', to: null },
  },
];

/** Which filter chips a workload matches. */
export function workloadTypes(w: WorkloadTemplate): Set<string> {
  const types = new Set<string>(['all']);
  if (w.prio === 'Flexible') types.add('movable');
  if (/training|gpu pods/i.test(w.sub)) types.add('training');
  if (/batch/i.test(w.sub)) types.add('batch');
  if (w.risk === 'high') types.add('constrained');
  return types;
}
