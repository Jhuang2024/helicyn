/* ============================================================
   HELICYN — Control Plane · coordination & explainability layer
   Vanilla JS. Simulated data only. Depends on window.CP exposed
   by control.js (recompute / setScenario / applyBump / fmt).

   Drives: scenario selector, run-optimization sequence,
   coordination event feed, decision trace, regional coordination
   topology, before/after panel, lifetime counters, alerts.
   ============================================================ */
(function () {
  "use strict";

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const prm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const CP = window.CP || { recompute() {}, setScenario() {}, applyBump() {}, fmt: (n, d) => n.toFixed(d) };

  /* ---- equirectangular map projection (80N..58S) --------- */
  const MAP = { W: 1000, H: 383, lonMin: -180, lonMax: 180, latMax: 80, latMin: -58 };
  function project(lon, lat) {
    return {
      x: (lon - MAP.lonMin) / (MAP.lonMax - MAP.lonMin) * MAP.W,
      y: (MAP.latMax - lat) / (MAP.latMax - MAP.latMin) * MAP.H
    };
  }

  /* continent outlines — coarse [lon,lat] silhouettes, stroked
     (no fill) for a clean control-plane world map. Recognisable,
     not a literal atlas. */
  const CONTINENTS = [
    // North America
    [[-165,60],[-168,65],[-156,71],[-128,71],[-95,72],[-80,73],[-62,68],[-78,62],[-64,60],[-55,51],[-66,44],[-70,41],[-75,35],[-81,25],[-90,29],[-97,26],[-105,20],[-106,23],[-112,30],[-117,32],[-124,40],[-124,48],[-135,57],[-150,59],[-165,60]],
    // Greenland
    [[-46,60],[-22,70],[-20,76],[-32,80],[-50,78],[-55,70],[-50,62],[-46,60]],
    // South America
    [[-78,8],[-70,11],[-60,9],[-50,5],[-49,0],[-44,-2],[-35,-8],[-38,-13],[-48,-25],[-55,-34],[-62,-40],[-66,-46],[-69,-52],[-74,-50],[-72,-43],[-71,-33],[-70,-18],[-76,-14],[-81,-6],[-80,2],[-78,8]],
    // Africa + Arabia
    [[-16,15],[-17,21],[-10,30],[0,36],[11,37],[25,32],[33,31],[34,29],[35,24],[38,18],[43,12],[51,12],[43,-2],[40,-12],[35,-22],[26,-34],[18,-34],[12,-17],[9,0],[8,5],[-8,5],[-13,8],[-16,15]],
    // Europe
    [[-10,36],[-9,43],[-4,48],[-5,50],[2,51],[-1,58],[5,62],[12,65],[25,71],[30,66],[28,60],[40,60],[55,58],[48,50],[40,46],[30,45],[28,41],[20,40],[16,40],[12,44],[6,43],[-2,43],[-10,36]],
    // Asia (Siberia + China + India + Arabia coastline)
    [[48,50],[60,55],[68,55],[72,67],[85,75],[105,78],[130,73],[158,72],[170,66],[163,60],[156,52],[143,46],[135,38],[128,35],[122,31],[116,23],[108,18],[106,10],[103,4],[100,8],[97,16],[91,22],[80,13],[78,8],[73,16],[67,24],[60,25],[57,24],[52,16],[44,13],[40,22],[34,30],[36,37],[40,42],[45,46],[48,50]],
    // Australia
    [[114,-22],[122,-18],[130,-12],[137,-12],[142,-11],[146,-18],[150,-24],[153,-28],[150,-37],[143,-39],[135,-35],[129,-32],[123,-34],[115,-34],[113,-26],[114,-22]],
    // Indonesia / New Guinea
    [[96,5],[104,1],[106,-3],[100,-5],[95,-2],[96,5]],
    [[109,2],[118,1],[119,-4],[110,-4],[109,2]],
    [[131,-2],[141,-3],[150,-7],[143,-9],[134,-8],[131,-2]],
    // Japan
    [[131,33],[136,36],[141,40],[143,44],[140,42],[136,35],[131,33]],
    // British Isles
    [[-5,50],[-3,53],[-5,58],[-8,57],[-6,52],[-5,50]],
    // Madagascar
    [[44,-12],[50,-15],[49,-25],[44,-22],[44,-12]],
    // New Zealand
    [[167,-45],[170,-41],[174,-37],[178,-37],[174,-42],[170,-46],[167,-45]]
  ];

  /* ---- region nodes, by real geography --------------------- */
  const NODE_POS = {
    virginia:  { lon: -78.5, lat: 38.0, label: 'VIRGINIA' },
    oregon:    { lon: -121.0, lat: 44.0, label: 'OREGON' },
    frankfurt: { lon: 8.7,   lat: 50.1, label: 'FRANKFURT' },
    singapore: { lon: 103.8, lat: 1.3,  label: 'SINGAPORE' },
    tokyo:     { lon: 139.7, lat: 35.7, label: 'TOKYO' }
  };
  Object.keys(NODE_POS).forEach((k) => { const p = project(NODE_POS[k].lon, NODE_POS[k].lat); NODE_POS[k].x = p.x; NODE_POS[k].y = p.y; });

  /* ---- base regional state (Normal Operations) ------------ */
  function baseRegions() {
    return [
      { id: 'virginia',  util: 81, carbon: 'Medium', thermal: 'Elevated', role: 'Training',          status: 'warn' },
      { id: 'oregon',    util: 74, carbon: 'Low',    thermal: 'Stable',   role: 'Training spillover', status: 'opt'  },
      { id: 'frankfurt', util: 63, carbon: 'Low',    thermal: 'Stable',   role: 'Inference',          status: 'opt'  },
      { id: 'singapore', util: 86, carbon: 'High',   thermal: 'Elevated', role: 'Inference overflow', status: 'warn' },
      { id: 'tokyo',     util: 69, carbon: 'Medium', thermal: 'Stable',   role: 'Batch',              status: 'ok'   }
    ];
  }
  function patchRegions(patch) {
    const r = baseRegions();
    if (patch) r.forEach((reg) => { if (patch[reg.id]) Object.assign(reg, patch[reg.id]); });
    return r;
  }

  /* ============================================================
     SCENARIO DEFINITIONS (predefined, client-side)
     ============================================================ */
  const SCN = {
    normal: {
      alert: { level: 'info', ttl: 'Systems nominal', body: 'Coordinating across 5 regions. No constraints active.' },
      flows: [
        { from: 'virginia',  to: 'oregon',    kind: 'opt',  label: '18% training shifted' },
        { from: 'singapore', to: 'frankfurt', kind: 'opt',  label: 'inference overflow balanced' },
        { from: 'tokyo',     to: 'oregon',    kind: 'ok',   label: 'batch deferred to low-carbon' }
      ],
      regions: patchRegions(null),
      trace: {
        action: 'ACTION #184',
        detected: 'GPU cluster utilization and thermal variance in <b>Cluster B</b> exceeded the target range.',
        reasoning: 'Another region holds spare GPU capacity, lower grid carbon intensity, and lower cooling risk for the next 2-hour window, so the work does not have to stay where it is.',
        response: 'Shifted flexible training load to Oregon, deferred non-critical batch work, and adjusted cooling setpoints locally across <b>12 racks</b>.',
        verified: 'Cooling load reduced, average PUE improved from 1.22 to <b>1.18</b>, and thermal headroom recovered.'
      },
      events: [
        { time: '09:42', type: 'detected', text: 'Thermal imbalance in GPU Cluster B' },
        { time: '09:43', type: 'analyzed', text: 'Zone B projected to exceed threshold in 14 minutes' },
        { time: '09:44', type: 'acted',    text: 'Shifted <b>18%</b> of training workload to Oregon' },
        { time: '09:45', type: 'acted',    text: 'Raised cooling setpoint by <b>1.2°C</b> in low-risk racks' },
        { time: '09:46', type: 'verified', text: 'Temperature variance reduced from 9.8°C to <b>4.2°C</b>' },
        { time: '09:47', type: 'saved',    text: 'Projected daily energy savings increased by <b>2.3 MWh</b>' }
      ]
    },

    surge: {
      alert: { level: 'warn', ttl: 'High thermal load', body: 'Zone B approaching threshold under training surge.' },
      flows: [
        { from: 'virginia',  to: 'oregon',    kind: 'opt',  label: '31% training rebalanced' },
        { from: 'singapore', to: 'tokyo',     kind: 'ok',   label: 'inference smoothed' },
        { from: 'frankfurt', to: 'oregon',    kind: 'warn', label: 'overflow under load' }
      ],
      regions: patchRegions({
        virginia:  { util: 94, thermal: 'Critical', status: 'crit', role: 'Training (peak)' },
        oregon:    { util: 88, thermal: 'Elevated', status: 'warn', role: 'Training spillover' },
        singapore: { util: 90, status: 'warn' },
        tokyo:     { util: 78, role: 'Inference relief' }
      }),
      trace: {
        action: 'ACTION #207',
        detected: '<b>Training surge</b> pushed Virginia GPU utilization to 94%. Rack inlet temperatures trending up across Zone B.',
        reasoning: 'Sustained demand will breach thermal limits in <b>9 minutes</b>. Oregon and Tokyo hold spare capacity; Oregon offers the lowest grid carbon for the surge window.',
        response: 'Rebalanced <b>31%</b> of training load to Oregon. Capped non-critical job admission. Pre-staged cooling across <b>18 racks</b> ahead of the ramp.',
        verified: 'Peak avoided without throttling priority jobs. PUE held at <b>1.21</b>. Thermal variance kept inside limits.'
      },
      events: [
        { time: '11:08', type: 'detected', text: 'Training surge: Virginia utilization at <b>94%</b>' },
        { time: '11:09', type: 'analyzed', text: 'Thermal breach projected in 9 minutes' },
        { time: '11:10', type: 'acted',    text: 'Rebalanced <b>31%</b> of training load to Oregon' },
        { time: '11:11', type: 'acted',    text: 'Pre-staged cooling across 18 racks' },
        { time: '11:13', type: 'verified', text: 'Peak avoided, priority jobs unaffected' },
        { time: '11:14', type: 'saved',    text: 'Throttling avoided on <b>1,024 GPU</b> training job' }
      ]
    },

    inference: {
      alert: { level: 'info', ttl: 'Inference overflow', body: 'Balancing Singapore → Frankfurt to hold latency targets.' },
      flows: [
        { from: 'singapore', to: 'frankfurt', kind: 'opt',  label: 'inference overflow balanced' },
        { from: 'singapore', to: 'tokyo',     kind: 'opt',  label: 'latency-aware spillover' },
        { from: 'virginia',  to: 'oregon',    kind: 'ok',   label: 'training yields headroom' }
      ],
      regions: patchRegions({
        singapore: { util: 95, thermal: 'Elevated', status: 'crit', role: 'Inference (peak)' },
        frankfurt: { util: 79, status: 'opt', role: 'Inference relief' },
        tokyo:     { util: 77, role: 'Inference relief', status: 'opt' },
        virginia:  { util: 72, thermal: 'Stable', status: 'ok' }
      }),
      trace: {
        action: 'ACTION #221',
        detected: 'Real-time inference demand on <b>Singapore</b> reached 95% of pool capacity. p99 latency rising toward SLA.',
        reasoning: 'Frankfurt and Tokyo can absorb overflow within latency budget. Routing there preserves SLA while keeping Singapore inside thermal limits.',
        response: 'Spilled <b>22%</b> of inference traffic to Frankfurt and Tokyo. Reserved Singapore capacity for latency-critical requests. Held training in place.',
        verified: 'p99 latency held within SLA. No request shedding. Inference pool thermal risk returned to <b>stable</b>.'
      },
      events: [
        { time: '14:31', type: 'detected', text: 'Inference demand spike: Singapore pool at <b>95%</b>' },
        { time: '14:32', type: 'analyzed', text: 'p99 latency approaching SLA ceiling' },
        { time: '14:33', type: 'acted',    text: 'Spilled <b>22%</b> inference to Frankfurt + Tokyo' },
        { time: '14:34', type: 'acted',    text: 'Reserved Singapore for latency-critical traffic' },
        { time: '14:36', type: 'verified', text: 'p99 latency held within SLA' },
        { time: '14:37', type: 'saved',    text: 'Zero request shedding during peak' }
      ]
    },

    cooling: {
      alert: { level: 'crit', ttl: 'Cooling constraint', body: 'Reducing hotspot risk through workload migration.' },
      flows: [
        { from: 'singapore', to: 'frankfurt', kind: 'opt',  label: 'hotspot load migrated' },
        { from: 'virginia',  to: 'oregon',    kind: 'opt',  label: 'thermal-aware reshuffle' },
        { from: 'tokyo',     to: 'oregon',    kind: 'ok',   label: 'batch deferred' }
      ],
      regions: patchRegions({
        singapore: { util: 71, thermal: 'Critical', status: 'crit', role: 'Cooling-limited' },
        virginia:  { util: 70, thermal: 'Elevated', status: 'warn' },
        oregon:    { util: 82, role: 'Thermal relief', status: 'opt' },
        frankfurt: { util: 74, status: 'opt', role: 'Cool-region intake' }
      }),
      trace: {
        action: 'ACTION #233',
        detected: 'Cooling capacity in <b>Singapore</b> constrained; rack hotspots forming in two zones.',
        reasoning: 'Holding load risks throttling. Cooler regions hold headroom, and migrating hotspot workloads reduces cooling demand faster than setpoint changes alone.',
        response: 'Migrated hotspot workloads to Frankfurt and Oregon. Sequenced setpoint increases on <b>14 low-risk racks</b>. Deferred non-urgent batch.',
        verified: 'Cooling load reduced by <b>16.4%</b>. Hotspot risk cleared. No SLA impact.'
      },
      events: [
        { time: '15:02', type: 'detected', text: 'Cooling constraint: Singapore hotspots forming' },
        { time: '15:03', type: 'analyzed', text: 'Two zones above thermal target' },
        { time: '15:04', type: 'acted',    text: 'Migrated hotspot workloads to Frankfurt + Oregon' },
        { time: '15:05', type: 'acted',    text: 'Sequenced setpoint increase on 14 racks' },
        { time: '15:07', type: 'verified', text: 'Cooling load reduced by <b>16.4%</b>' },
        { time: '15:08', type: 'saved',    text: 'Hotspot risk cleared without throttling' }
      ]
    },

    power: {
      alert: { level: 'warn', ttl: 'Power price spike', body: 'Deferring flexible batch jobs to cheaper window.' },
      flows: [
        { from: 'virginia',  to: 'oregon',    kind: 'opt',  label: 'load moved off peak price' },
        { from: 'tokyo',     to: 'oregon',    kind: 'ok',   label: 'batch deferred 90 min' },
        { from: 'singapore', to: 'frankfurt', kind: 'ok',   label: 'inference balanced' }
      ],
      regions: patchRegions({
        virginia:  { util: 68, role: 'Price-throttled', status: 'warn', carbon: 'High' },
        oregon:    { util: 79, role: 'Low-price intake', status: 'opt' },
        tokyo:     { util: 58, role: 'Batch (deferred)', status: 'ok' }
      }),
      trace: {
        action: 'ACTION #245',
        detected: 'Day-ahead power price on the <b>Virginia</b> grid spiked 3.4× above baseline for the next 90 minutes.',
        reasoning: 'Flexible batch and training can wait. Oregon power is cheaper now; deferring price-insensitive work avoids peak cost without missing deadlines.',
        response: 'Deferred <b>12 batch jobs</b> by 90 minutes. Shifted flexible training to Oregon. Held latency-critical inference in place.',
        verified: 'Estimated cost avoided rose by <b>$1,940</b> for the window. No deadlines missed.'
      },
      events: [
        { time: '17:20', type: 'detected', text: 'Power price spike: Virginia grid <b>3.4×</b> baseline' },
        { time: '17:21', type: 'analyzed', text: 'Flexible load eligible for deferral' },
        { time: '17:22', type: 'acted',    text: 'Deferred <b>12 batch jobs</b> by 90 minutes' },
        { time: '17:23', type: 'acted',    text: 'Shifted flexible training to Oregon' },
        { time: '17:25', type: 'verified', text: 'Peak-price exposure reduced' },
        { time: '17:26', type: 'saved',    text: 'Cost avoided increased by <b>$1,940</b>' }
      ]
    },

    lowcarbon: {
      alert: { level: 'ok', ttl: 'Low-carbon window open', body: 'Moving training workload to Oregon while it lasts.' },
      flows: [
        { from: 'virginia',  to: 'oregon',    kind: 'opt',  label: 'training → clean grid' },
        { from: 'frankfurt', to: 'oregon',    kind: 'opt',  label: 'flexible load advanced' },
        { from: 'tokyo',     to: 'oregon',    kind: 'opt',  label: 'batch pulled forward' }
      ],
      regions: patchRegions({
        oregon:    { util: 91, carbon: 'Low', thermal: 'Stable', status: 'opt', role: 'Low-carbon sink' },
        virginia:  { util: 64, role: 'Yielding to clean grid', status: 'ok' },
        frankfurt: { util: 58, role: 'Flexible donor', status: 'ok' },
        tokyo:     { util: 55, role: 'Batch advanced', status: 'ok' }
      }),
      trace: {
        action: 'ACTION #258',
        detected: 'Oregon grid carbon intensity dropped to <b>112 g/kWh</b>, opening a 2-hour low-carbon window.',
        reasoning: 'Concentrating flexible compute here now shifts the most carbon. The window is short, so eligible training and batch should advance immediately.',
        response: 'Pulled forward <b>9 batch jobs</b>. Migrated flexible training from Virginia and Frankfurt to Oregon. Held SLA-bound inference in region.',
        verified: 'Carbon shifted rose by <b>3.1 tCO₂e</b> for the window. GPU utilization preserved at <b>91%</b>.'
      },
      events: [
        { time: '02:14', type: 'detected', text: 'Low-carbon window open: Oregon at <b>112 g/kWh</b>' },
        { time: '02:15', type: 'analyzed', text: 'Eligible flexible load identified across 3 regions' },
        { time: '02:16', type: 'acted',    text: 'Migrated flexible training to Oregon' },
        { time: '02:17', type: 'acted',    text: 'Pulled forward <b>9 batch jobs</b>' },
        { time: '02:19', type: 'verified', text: 'GPU utilization preserved at <b>91%</b>' },
        { time: '02:20', type: 'saved',    text: 'Carbon shifted increased by <b>3.1 tCO₂e</b>' }
      ]
    }
  };

  /* ---- scenario-specific recommendation cards (#4) --------
     Texts change per scenario; types stay fixed (workload /
     timing / thermal). rec1 impact + rec3 confidence remain
     driven by the live control deck in control.js. */
  const SCN_RECS = {
    normal: {
      r: [
        'Shift flexible GPU workloads from <strong>Virginia</strong> to <strong>Oregon</strong> during peak grid load.',
        'Delay non-critical training jobs by <strong>42 minutes</strong> to align with lower-carbon energy.',
        'Increase cooling setpoint by <strong>0.8°C</strong> in Zone B without exceeding SLA thermal limits.'
      ],
      r2impact: '−0.8 tCO₂e'
    },
    surge: {
      r: [
        'Rebalance <strong>31%</strong> of training load from <strong>Virginia</strong> to <strong>Oregon</strong> ahead of the thermal ramp.',
        'Cap non-critical job admission for <strong>20 minutes</strong> until the surge peak passes.',
        'Pre-stage cooling across <strong>18 racks</strong> before rack inlet temperatures climb.'
      ],
      r2impact: '−1.2 MW peak'
    },
    inference: {
      r: [
        'Spill <strong>22%</strong> of inference traffic from <strong>Singapore</strong> to Frankfurt and Tokyo within latency budget.',
        'Reserve Singapore capacity for latency-critical requests; hold training in place.',
        'Hold zone cooling steady; thermal risk stays within limits under inference load.'
      ],
      r2impact: 'p99 within SLA'
    },
    cooling: {
      r: [
        'Migrate hotspot workloads from <strong>Singapore</strong> to Frankfurt and Oregon.',
        'Defer non-urgent batch until cooling headroom recovers.',
        'Sequence setpoint increases on <strong>14 low-risk racks</strong> to shed cooling load.'
      ],
      r2impact: '−16% cooling'
    },
    power: {
      r: [
        'Shift flexible training from <strong>Virginia</strong> to the lower-price <strong>Oregon</strong> grid.',
        'Defer <strong>12 batch jobs</strong> by 90 minutes into the cheaper price window.',
        'Hold cooling setpoints; price, not thermal load, is the binding constraint.'
      ],
      r2impact: '−$1,940 cost'
    },
    lowcarbon: {
      r: [
        'Migrate flexible training to <strong>Oregon</strong> while grid carbon sits at <strong>112 g/kWh</strong>.',
        'Pull forward <strong>9 batch jobs</strong> into the open low-carbon window.',
        'Maintain setpoints; concentrate compute to maximize carbon shifted.'
      ],
      r2impact: '−3.1 tCO₂e'
    }
  };
  const recEls = $$('.demo-rec');
  function renderRecs(name) {
    const cfg = SCN_RECS[name] || SCN_RECS.normal;
    recEls.forEach((rec, i) => {
      const txt = rec.querySelector('.demo-rec__text');
      if (txt && cfg.r[i]) txt.innerHTML = cfg.r[i];
    });
    if (cfg.r2impact && recEls[1]) {
      const imp = recEls[1].querySelector('.v.impact');
      if (imp) imp.textContent = cfg.r2impact;
    }
  }

  /* ============================================================
     TOPOLOGY RENDER
     ============================================================ */
  const flowsG = $('#cp-flows');
  const nodesG = $('#cp-nodes');
  const rcards = $('#cp-rnodes');
  const mapG   = $('#cp-map');
  const pinsEl = $('#cp-pins');

  /* draw the outline world map + subtle graticule once (backdrop) */
  function renderMap() {
    if (!mapG) return;
    let out = '';
    // graticule — longitude every 30°, latitude every 20° (very subtle)
    for (let lon = -150; lon <= 150; lon += 30) {
      const a = project(lon, MAP.latMax);
      out += '<line class="cp-graticule" x1="' + a.x.toFixed(1) + '" y1="0" x2="' + a.x.toFixed(1) + '" y2="' + MAP.H + '"></line>';
    }
    for (let lat = 60; lat >= -40; lat -= 20) {
      const a = project(MAP.lonMin, lat);
      out += '<line class="cp-graticule" x1="0" y1="' + a.y.toFixed(1) + '" x2="' + MAP.W + '" y2="' + a.y.toFixed(1) + '"></line>';
    }
    // continent outlines (stroke only)
    CONTINENTS.forEach((poly) => {
      let d = '';
      poly.forEach((pt, i) => { const p = project(pt[0], pt[1]); d += (i ? ' L' : 'M') + p.x.toFixed(1) + ',' + p.y.toFixed(1); });
      d += ' Z';
      out += '<path class="cp-coast" d="' + d + '"></path>';
    });
    mapG.innerHTML = out;
  }

  function curve(a, b) {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    // lift the control point perpendicular-ish for a gentle arc
    const cx = mx, cy = my - Math.min(70, Math.abs(b.x - a.x) * 0.18 + 28);
    return `M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}`;
  }

  function renderTopology(scn) {
    if (!flowsG || !nodesG) return;
    flowsG.innerHTML = '';
    nodesG.innerHTML = '';

    // flows (base line + animated dashed overlay)
    scn.flows.forEach((fl, i) => {
      const a = NODE_POS[fl.from], b = NODE_POS[fl.to];
      if (!a || !b) return;
      const d = curve(a, b);
      const base = document.createElementNS(SVGNS, 'path');
      base.setAttribute('d', d);
      base.setAttribute('class', 'cp-flow cp-flow--' + fl.kind);
      flowsG.appendChild(base);
      const dash = document.createElementNS(SVGNS, 'path');
      dash.setAttribute('d', d);
      dash.setAttribute('class', 'cp-flow-dash cp-flow-dash--' + fl.kind);
      dash.style.animationDelay = (i * 0.4) + 's';
      flowsG.appendChild(dash);
    });

    // nodes (markers only — labels live in floating cards)
    scn.regions.forEach((reg) => {
      const pos = NODE_POS[reg.id];
      if (!pos) return;
      const g = document.createElementNS(SVGNS, 'g');
      g.setAttribute('class', 'cp-node is-' + reg.status);
      g.setAttribute('transform', `translate(${pos.x},${pos.y})`);
      const ring = document.createElementNS(SVGNS, 'circle');
      ring.setAttribute('class', 'ring'); ring.setAttribute('r', '12');
      const core = document.createElementNS(SVGNS, 'circle');
      core.setAttribute('class', 'core'); core.setAttribute('r', '8');
      const dot = document.createElementNS(SVGNS, 'circle');
      dot.setAttribute('class', 'dotc'); dot.setAttribute('r', '3');
      g.append(ring, core, dot);
      nodesG.appendChild(g);
    });
  }

  /* floating label cards over the map (#5) */
  const CARBON_SHORT = { Low: 'LOW', Medium: 'MED', High: 'HIGH' };
  // placement per region to reduce collisions: above | below + horizontal nudge
  const PIN_PLACE = {
    oregon:    { side: 'above', dx: -2 },
    virginia:  { side: 'below', dx: 4 },
    frankfurt: { side: 'above', dx: 0 },
    singapore: { side: 'below', dx: 0 },
    tokyo:     { side: 'above', dx: 0 }
  };
  function renderPins(scn) {
    if (!pinsEl) return;
    pinsEl.innerHTML = scn.regions.map((reg) => {
      const pos = NODE_POS[reg.id];
      if (!pos) return '';
      const place = PIN_PLACE[reg.id] || { side: 'above', dx: 0 };
      const leftPct = (pos.x / MAP.W) * 100;
      const topPct = (pos.y / MAP.H) * 100;
      return (
        '<div class="cp-pin cp-pin--' + place.side + ' is-' + reg.status + '" style="left:' + leftPct.toFixed(2) + '%;top:' + topPct.toFixed(2) + '%;--dx:' + place.dx + 'px">' +
          '<div class="cp-pin__card">' +
            '<span class="cp-pin__name">' + (pos.label || reg.id) + '</span>' +
            '<span class="cp-pin__util">' + reg.util + '% UTIL</span>' +
            '<span class="cp-pin__meta">' + (CARBON_SHORT[reg.carbon] || reg.carbon) + ' · ' + reg.thermal.toUpperCase() + '</span>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  function renderRegionCards(scn) {
    if (!rcards) return;
    const badge = { ok: 'control-badge--ok', opt: 'control-badge--opt', warn: 'control-badge--warn', crit: 'control-badge--crit' };
    const statusText = { ok: 'Nominal', opt: 'Optimizing', warn: 'Strained', crit: 'Alert' };
    rcards.innerHTML = scn.regions.map((reg) => {
      const pos = NODE_POS[reg.id];
      return (
        '<article class="cp-rnode">' +
          '<div class="cp-rnode__top">' +
            '<span class="cp-rnode__name">' + (pos ? pos.label : reg.id) + '</span>' +
            '<span class="control-badge ' + badge[reg.status] + '"><span class="d"></span>' + statusText[reg.status] + '</span>' +
          '</div>' +
          '<div class="cp-rnode__rows">' +
            '<div class="cp-rnode__row"><span class="k">Utilization</span><span class="v">' + reg.util + '%</span></div>' +
            '<div class="cp-rnode__row"><span class="k">Carbon' + tip('Grid Carbon Intensity', 'Carbon emitted per unit of grid energy in this region right now. Lower means cleaner power.') + '</span><span class="v">' + reg.carbon + '</span></div>' +
            '<div class="cp-rnode__row"><span class="k">Thermal' + tip('Thermal Headroom', 'How much thermal margin remains before cooling limits are reached. Stable means ample headroom.') + '</span><span class="v">' + reg.thermal + '</span></div>' +
          '</div>' +
          '<div class="cp-rnode__role">' + reg.role + '</div>' +
        '</article>'
      );
    }).join('');
  }
  // build a tooltip span (only first card carries it to avoid repetition)
  let tipUsed = {};
  function tip(label, body) {
    if (tipUsed[label]) return '';
    tipUsed[label] = true;
    return '<button type="button" class="demo-tip" aria-label="About ' + label.toLowerCase() +
      '">i<span class="demo-tip__pop" role="tooltip"><b>' + label + '.</b> ' + body + '</span></button>';
  }

  /* ============================================================
     EVENT FEED
     ============================================================ */
  const feedEl = $('#cp-feed');
  const MAX_EVENTS = 9;

  function eventRow(ev, isNew) {
    const li = document.createElement('li');
    li.className = 'cp-event' + (isNew ? ' is-new' : '');
    li.innerHTML =
      '<span class="cp-event__time">' + ev.time + '</span>' +
      '<span class="cp-event__type cp-event__type--' + ev.type + '">' + ev.type.toUpperCase() + '</span>' +
      '<span class="cp-event__text">' + ev.text + '</span>';
    return li;
  }
  function seedFeed(scn) {
    if (!feedEl) return;
    feedEl.innerHTML = '';
    scn.events.forEach((ev) => feedEl.appendChild(eventRow(ev, false)));
    feedEl.scrollTop = feedEl.scrollHeight;
  }
  function pushEvent(ev) {
    if (!feedEl) return;
    feedEl.appendChild(eventRow(ev, true));
    while (feedEl.children.length > MAX_EVENTS) feedEl.removeChild(feedEl.firstChild);
    feedEl.scrollTop = feedEl.scrollHeight;
  }
  function nowClock(offsetSec) {
    const d = new Date(Date.now() + (offsetSec || 0) * 1000);
    return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
  }

  // ambient low-frequency events keep the feed alive without chaos
  const AMBIENT = [
    { type: 'analyzed', text: 'Recomputed carbon-aware placement across regions' },
    { type: 'verified', text: 'Cooling setpoints within target band' },
    { type: 'acted',    text: 'Rebalanced <b>3%</b> flexible load toward lower-carbon grid' },
    { type: 'analyzed', text: 'Grid carbon forecast refreshed for next window' },
    { type: 'verified', text: 'All priority SLAs holding' },
    { type: 'acted',    text: 'Deferred <b>2 batch jobs</b> to cheaper window' }
  ];
  let ambientIdx = 0, ambientTimer = null;
  function startAmbient() {
    if (prm || ambientTimer) return;
    ambientTimer = setInterval(() => {
      if (running) return;
      const a = AMBIENT[ambientIdx % AMBIENT.length]; ambientIdx++;
      pushEvent({ time: nowClock(), type: a.type, text: a.text });
    }, 7000);
  }

  /* ============================================================
     DECISION TRACE
     ============================================================ */
  function renderTrace(scn) {
    const t = scn.trace;
    const set = (k, v) => { const el = $('[data-trace="' + k + '"]'); if (el) el.innerHTML = v; };
    set('action', t.action);
    set('detected', t.detected);
    set('reasoning', t.reasoning);
    set('response', t.response);
    set('verified', t.verified);
  }

  /* ============================================================
     ALERT (command bar)
     ============================================================ */
  const alertEl = $('#cp-alert');
  function showAlert(level, ttl, body) {
    if (!alertEl) return;
    alertEl.className = 'cp-alert cp-alert--' + level;
    $('.ttl', alertEl).textContent = ttl;
    $('.body', alertEl).textContent = body;
    requestAnimationFrame(() => alertEl.classList.add('show'));
  }

  /* ============================================================
     APPLY A SCENARIO
     ============================================================ */
  function applyScenario(name) {
    const scn = SCN[name] || SCN.normal;
    tipUsed = {};                 // reset so region tooltips re-attach once
    CP.setScenario(name);         // recompute KPI cards
    renderTopology(scn);
    renderPins(scn);
    renderRegionCards(scn);
    renderTrace(scn);
    seedFeed(scn);
    renderRecs(name);
    // sticky status bar — constrained regions (strained + alert)
    const constrained = scn.regions.filter((r) => r.status === 'warn' || r.status === 'crit').length;
    const sbC = $('[data-sb="constrained"]'); if (sbC) sbC.textContent = String(constrained);
    if (scn.alert) showAlert(scn.alert.level, scn.alert.ttl, scn.alert.body);
  }

  /* ---- custom themed dropdown (replaces native select) ---- */
  const selRoot = $('#cp-scenario');
  const selBtn  = selRoot && $('.cp-select__btn', selRoot);
  const selMenu = selRoot && $('.cp-select__menu', selRoot);
  const selVal  = selRoot && $('.cp-select__val', selRoot);
  const selOpts = selRoot ? $$('[role="option"]', selRoot) : [];

  function setSelectDisabled(d) { if (selRoot) selRoot.classList.toggle('is-disabled', d); }
  function selectOpen(open) {
    if (!selRoot) return;
    selRoot.classList.toggle('is-open', open);
    selBtn.setAttribute('aria-expanded', String(open));
    selOpts.forEach((o) => o.classList.remove('is-active'));
    if (open) {
      const cur = selOpts.find((o) => o.getAttribute('aria-selected') === 'true') || selOpts[0];
      if (cur) cur.classList.add('is-active');
    }
  }
  function chooseOption(opt) {
    if (!opt) return;
    selOpts.forEach((o) => o.setAttribute('aria-selected', String(o === opt)));
    selRoot.dataset.value = opt.dataset.value;
    selVal.textContent = opt.textContent;
    selectOpen(false);
    if (!running) applyScenario(opt.dataset.value);
  }
  if (selBtn) {
    selBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (selRoot.classList.contains('is-disabled')) return;
      selectOpen(!selRoot.classList.contains('is-open'));
    });
    selOpts.forEach((opt) => opt.addEventListener('click', () => chooseOption(opt)));
    document.addEventListener('click', (e) => { if (!selRoot.contains(e.target)) selectOpen(false); });
    selBtn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); selectOpen(true); selMenu.focus();
      }
    });
    selMenu.addEventListener('keydown', (e) => {
      const active = selMenu.querySelector('.is-active') || selOpts.find((o) => o.getAttribute('aria-selected') === 'true');
      let idx = selOpts.indexOf(active);
      if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(selOpts.length - 1, idx + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(0, idx - 1); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); chooseOption(active); selBtn.focus(); return; }
      else if (e.key === 'Escape') { selectOpen(false); selBtn.focus(); return; }
      else return;
      selOpts.forEach((o) => o.classList.remove('is-active'));
      selOpts[idx].classList.add('is-active');
    });
  }

  /* ============================================================
     RUN AUTONOMOUS OPTIMIZATION (8s cinematic sequence) (#5)
     ============================================================ */
  const runBtn = $('#cp-run');
  const seqEl = $('#cp-seq');
  let running = false;

  function setStep(step, statusClass) {
    if (!seqEl) return;
    const el = seqEl.querySelector('[data-step="' + step + '"]');
    if (el) { el.classList.remove('active', 'done'); el.classList.add(statusClass); }
  }
  function timeline(steps) {
    // steps: [{at, fn}], times in ms
    steps.forEach((s) => setTimeout(s.fn, s.at));
  }

  function runOptimization() {
    if (running) return;
    running = true;
    runBtn.disabled = true;
    setSelectDisabled(true);
    runBtn.querySelector('.t').textContent = 'Optimizing…';
    if (seqEl) { seqEl.classList.add('show'); seqEl.setAttribute('aria-hidden', 'false'); $$('.cp-seq__step', seqEl).forEach((s) => s.classList.remove('active', 'done')); }

    const t = nowClock;

    timeline([
      // 1 — DETECT
      { at: 0, fn: () => {
        setStep('detect', 'active');
        showAlert('crit', 'Detect', 'Thermal imbalance detected in GPU Cluster B.');
        pushEvent({ time: t(), type: 'detected', text: 'Thermal imbalance detected in <b>GPU Cluster B</b>' });
      }},
      // 2 — ANALYZE
      { at: 1600, fn: () => {
        setStep('detect', 'done'); setStep('analyze', 'active');
        showAlert('info', 'Analyze', 'Evaluating workload placement, cooling demand, energy price, and grid carbon intensity.');
        pushEvent({ time: t(), type: 'analyzed', text: 'Evaluating placement, cooling, price, and carbon intensity' });
      }},
      // 3 — ACT
      { at: 3400, fn: () => {
        setStep('analyze', 'done'); setStep('act', 'active');
        showAlert('info', 'Act', 'Coordinating workload migration and cooling setpoints.');
        pushEvent({ time: t(), type: 'acted', text: 'Migrated <b>18%</b> training workload to Oregon' });
        // pulse the topology flows by briefly re-rendering current scenario
        const scn = SCN[CP.state.scenario] || SCN.normal;
        renderTopology(scn);
      }},
      { at: 4300, fn: () => {
        pushEvent({ time: t(), type: 'acted', text: 'Adjusted cooling setpoints across <b>12 racks</b>' });
      }},
      // 4 — VERIFY
      { at: 5400, fn: () => {
        setStep('act', 'done'); setStep('verify', 'active');
        showAlert('ok', 'Verify', 'Thermal variance reduced. Cooling load reduced. PUE improved.');
        pushEvent({ time: t(), type: 'verified', text: 'Thermal variance reduced to <b>4.2°C</b>' });
      }},
      // 5 — SAVE
      { at: 7000, fn: () => {
        setStep('verify', 'done'); setStep('save', 'active');
        CP.applyBump({ energy: 0.9, cost: 240, carbon: 0.4, cooling: 1.1, gpu: 1, pue: -0.01 });
        bumpLifetime({ energy: 0.012, cost: 1.4, carbon: 1.2, gpuh: 180 });
        pushEvent({ time: t(), type: 'saved', text: 'Daily energy savings increased by <b>0.9 MWh</b>' });
      }},
      // finish
      { at: 8000, fn: () => {
        setStep('save', 'done');
        showAlert('ok', 'Optimization complete', 'Constraint resolved. Coordination holding across 5 regions.');
        runBtn.disabled = false;
        setSelectDisabled(false);
        runBtn.querySelector('.t').textContent = 'Run autonomous optimization';
        running = false;
        setTimeout(() => {
          if (seqEl && !running) { seqEl.classList.remove('show'); seqEl.setAttribute('aria-hidden', 'true'); }
          // restore the scenario's standing alert
          const scn = SCN[CP.state.scenario] || SCN.normal;
          if (!running && scn.alert) showAlert(scn.alert.level, scn.alert.ttl, scn.alert.body);
        }, 4200);
      }}
    ]);
  }
  if (runBtn) runBtn.addEventListener('click', runOptimization);

  /* ============================================================
     LIFETIME COUNTERS (#8) — slow increment while page is open
     ============================================================ */
  const life = { energy: 2.70, cost: 692, carbon: 914, gpuh: 41000 };
  function renderLifetime() {
    const set = (k, txt) => { const el = $('[data-life="' + k + '"]'); if (el) el.textContent = txt; };
    set('energy', CP.fmt(life.energy, 2));
    set('cost', Math.round(life.cost).toLocaleString('en-US'));
    set('carbon', Math.round(life.carbon).toLocaleString('en-US'));
    set('gpuh', Math.round(life.gpuh).toLocaleString('en-US'));
  }
  function bumpLifetime(d) { for (const k in d) life[k] += d[k]; renderLifetime(); }
  renderLifetime();
  if (!prm) {
    setInterval(() => {
      // gentle organic drift
      life.energy += 0.0008 + Math.random() * 0.0010;
      life.cost   += 0.18  + Math.random() * 0.22;
      life.carbon += 0.10  + Math.random() * 0.16;
      life.gpuh   += 5     + Math.random() * 9;
      renderLifetime();
    }, 2500);
  }

  /* ============================================================
     INIT
     ============================================================ */
  renderMap();
  applyScenario('normal');
  startAmbient();
})();
