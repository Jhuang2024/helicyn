/**
 * Recommendation pool — the seven recommendation templates the Control Plane
 * cycles through. Copied verbatim from the original control.js POOL so the
 * migrated recommendation cards carry identical reasoning, impact, and effects.
 */

import type { RecommendationTemplate } from '../models/types';

export const RECOMMENDATION_POOL: RecommendationTemplate[] = [
  {
    type: 'Workload routing',
    cat: 'Workload routing',
    text: 'Shift flexible GPU workloads from <strong>US-WEST</strong> to <strong>US-CENTRAL</strong> during peak grid load.',
    prio: 'High',
    impact: '−1.4 MW peak',
    conf: 92,
    protect: 'Latency-critical inference remains locked in US-EAST.',
    risk: 'Stop rerouting if US-CENTRAL utilization exceeds 78%.',
    sim: [
      { k: 'Peak power', b: '12.8 MW', a: '11.4 MW' },
      { k: 'US-CENTRAL util', b: '61%', a: '74%' },
      { k: 'Thermal risk', b: 'Medium', a: 'Low' },
    ],
    verify: { peak: '−1.4 MW', pue: '1.31 → 1.18', variance: '9.8°C → 4.2°C', emissions: '−0.8 tCO₂e/hr' },
    fx: {
      regionDelta: { 'us-west': -14, 'us-central': 14 },
      risk: { 'us-west': 'low' },
      flash: ['us-west', 'us-central'],
      telemetry: { peak: 1.4 },
      bump: { energy: 1.1, cost: 280, carbon: 0.4, pue: -0.01, cooling: 0.9 },
    },
    topo: { from: 'virginia', to: 'oregon' },
  },
  {
    type: 'Time shifting',
    cat: 'Time shifting',
    text: 'Delay non-critical training jobs by <strong>42 minutes</strong> to align with lower-carbon energy.',
    prio: 'Medium',
    impact: '−0.8 tCO₂e',
    conf: 87,
    protect: 'SLA-bound jobs keep their original deadlines.',
    risk: 'Re-evaluate if the low-carbon window closes early.',
    sim: [
      { k: 'Carbon / hr', b: '9.1 tCO₂e', a: '8.3 tCO₂e' },
      { k: 'Deadline match', b: 'At risk', a: 'Aligned' },
    ],
    verify: { peak: '−0.4 MW', pue: '1.24 → 1.22', variance: '6.1°C → 5.4°C', emissions: '−0.8 tCO₂e/hr' },
    fx: {
      regionDelta: { 'eu-west': -8 },
      flash: ['eu-west'],
      telemetry: { peak: 0.4 },
      bump: { energy: 0.5, cost: 140, carbon: 0.7, cooling: 0.2 },
    },
    topo: { from: 'frankfurt', to: 'oregon' },
  },
  {
    type: 'Local thermal control',
    cat: 'Thermal control',
    text: 'Increase cooling setpoint by <strong>0.8°C</strong> in Zone B without exceeding SLA thermal limits.',
    prio: 'Low',
    impact: '−340 kW cooling',
    conf: 78,
    protect: 'Zone B stays within SLA thermal limits.',
    risk: 'Revert setpoint if rack inlet variance exceeds 6°C.',
    sim: [
      { k: 'Cooling load', b: '88%', a: '84%' },
      { k: 'Zone B PUE', b: '1.31', a: '1.27' },
      { k: 'Inlet variance', b: '9.8°C', a: '7.9°C' },
    ],
    verify: { peak: '−0.3 MW', pue: '1.31 → 1.27', variance: '9.8°C → 7.9°C', emissions: '−0.2 tCO₂e/hr' },
    fx: {
      telemetry: { peak: 0.3, zones: { B: -4 } },
      flash: [],
      bump: { energy: 0.4, cost: 90, cooling: 1.4, pue: -0.01 },
    },
    topo: { from: 'singapore', to: null },
  },
  {
    type: 'Workload routing',
    cat: 'Workload routing',
    text: 'Shift flexible training from <strong>APAC</strong> to <strong>EU-WEST</strong> away from constrained cooling.',
    prio: 'High',
    impact: '−1.1 MW peak',
    conf: 84,
    protect: 'APAC inference stays in-region for latency.',
    risk: 'Hold if EU-WEST utilization passes 80%.',
    sim: [
      { k: 'APAC cooling', b: '92%', a: '80%' },
      { k: 'EU-WEST util', b: '58%', a: '68%' },
      { k: 'Thermal risk', b: 'High', a: 'Medium' },
    ],
    verify: { peak: '−1.1 MW', pue: '1.29 → 1.20', variance: '8.4°C → 5.1°C', emissions: '−0.6 tCO₂e/hr' },
    fx: {
      regionDelta: { apac: -16, 'eu-west': 10 },
      risk: { apac: 'med' },
      flash: ['apac', 'eu-west'],
      telemetry: { peak: 1.1 },
      bump: { energy: 0.8, cost: 210, carbon: 0.6, cooling: 1.1 },
    },
    topo: { from: 'singapore', to: 'frankfurt' },
  },
  {
    type: 'Carbon-aware scheduling',
    cat: 'Time shifting',
    text: 'Move flexible batch in <strong>EU-WEST</strong> into the next low-carbon window.',
    prio: 'Medium',
    impact: '−0.6 tCO₂e',
    conf: 83,
    protect: 'Deadlines with SLA penalties are excluded.',
    risk: 'Window forecast confidence drops after 3h.',
    sim: [
      { k: 'Grid carbon', b: '410 g', a: '280 g' },
      { k: 'Batch slip', b: '0 min', a: '31 min' },
    ],
    verify: { peak: '−0.3 MW', pue: '1.23 → 1.21', variance: '5.6°C → 5.2°C', emissions: '−0.6 tCO₂e/hr' },
    fx: {
      regionDelta: { 'eu-west': -5 },
      flash: ['eu-west'],
      telemetry: { peak: 0.3 },
      bump: { energy: 0.4, cost: 110, carbon: 0.6 },
    },
    topo: { from: 'frankfurt', to: 'oregon' },
  },
  {
    type: 'Local thermal control',
    cat: 'Thermal control',
    text: 'Tune <strong>Zone A</strong> fan curve to recover headroom at equal inlet temps.',
    prio: 'Low',
    impact: '−180 kW cooling',
    conf: 80,
    protect: 'Inlet temperature target unchanged.',
    risk: 'Revert if Zone A variance exceeds 5°C.',
    sim: [
      { k: 'Zone A load', b: '72%', a: '69%' },
      { k: 'Fan power', b: '210 kW', a: '180 kW' },
    ],
    verify: { peak: '−0.2 MW', pue: '1.22 → 1.20', variance: '5.1°C → 4.6°C', emissions: '−0.1 tCO₂e/hr' },
    fx: {
      telemetry: { peak: 0.2, zones: { A: -3 } },
      flash: [],
      bump: { cooling: 0.8, cost: 70, pue: -0.01 },
    },
    topo: { from: 'virginia', to: null },
  },
  {
    type: 'Workload routing',
    cat: 'Workload routing',
    text: 'Rebalance a fine-tune job from <strong>US-EAST</strong> to <strong>US-CENTRAL</strong>.',
    prio: 'Medium',
    impact: '−0.9 MW peak',
    conf: 86,
    protect: 'Checkpoint cadence preserved across the move.',
    risk: 'Pause if US-CENTRAL crosses 80% utilization.',
    sim: [
      { k: 'US-EAST util', b: '89%', a: '81%' },
      { k: 'US-CENTRAL util', b: '66%', a: '74%' },
    ],
    verify: { peak: '−0.9 MW', pue: '1.27 → 1.21', variance: '7.0°C → 5.3°C', emissions: '−0.4 tCO₂e/hr' },
    fx: {
      regionDelta: { 'us-east': -8, 'us-central': 8 },
      flash: ['us-east', 'us-central'],
      telemetry: { peak: 0.9 },
      bump: { energy: 0.5, cost: 120, cooling: 0.5 },
    },
    topo: { from: 'tokyo', to: 'oregon' },
  },
];

export const PRIO_CLASS: Record<RecommendationTemplate['prio'], string> = {
  High: 'demo-prio--critical',
  Medium: 'demo-prio--standard',
  Low: 'demo-prio--flexible',
};
