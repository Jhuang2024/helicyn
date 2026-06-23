/* ============================================================
   HELICYN - Control Plane interactions (simulation demo)
   Vanilla JS only. Simulated data. No external dependencies.

   Responsibilities:
   - Hold simulation state (mode / carbon priority / flexibility /
     cooling tolerance) and recompute the dashboard on any change.
   - Drive the live power-demand line chart.
   - Wire Simulate / Approve actions with inline feedback + toast.
   nav state, scroll progress, the live UTC clock and [data-reveal]
   entrances are handled by the shared main.js.
   ============================================================ */
(function () {
  "use strict";

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const prm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  /* ---- simulation state ---------------------------------- */
  const freshBump = () => ({ energy: 0, cost: 0, carbon: 0, cooling: 0, gpu: 0, pue: 0 });
  const state = { mode: 'balanced', carbon: 'medium', flex: 60, cooling: 'medium', scenario: 'normal', view: 'after', regionDelta: {}, riskOverride: {}, bump: freshBump() };

  /* yesterday's coordinated reference, per metric (simulated).
     Today's displayed value minus this drives the real "vs. yesterday"
     delta, so the deltas move with the baseline toggle, the controls,
     and every coordination run. */
  const YDAY = { energy: 392, cost: 112000, carbon: 139, pue: 1.22, gpu: 84, cooling: 9.8 };
  const TREND_CFG = {
    energy:  { mode: 'pct', dp: 1, lowerBetter: false },
    cost:    { mode: 'pct', dp: 1, lowerBetter: false },
    carbon:  { mode: 'pct', dp: 1, lowerBetter: false },
    cooling: { mode: 'pct', dp: 1, lowerBetter: false },
    pue:     { mode: 'delta', dp: 2, unit: '', lowerBetter: true },
    gpu:     { mode: 'delta', dp: 1, unit: ' pts', lowerBetter: false }
  };

  /* ---- live diurnal accumulation -------------------------
     The "today, coordinated" totals accumulate from 0 at 00:00 UTC.
     The pace is NOT constant: little happens overnight, the curve
     steepens through the working day and tapers in the evening.
     C(t) is the normalized cumulative fraction at time-of-day t∈[0,1). */
  const ACC = (function () {
    const N = 240;
    const rate = (t) =>
      0.16 +
      0.80 * Math.exp(-Math.pow((t - 0.40) / 0.13, 2)) +   // morning ramp
      1.25 * Math.exp(-Math.pow((t - 0.66) / 0.17, 2));    // afternoon/evening peak
    const cum = new Array(N + 1).fill(0);
    let s = 0;
    for (let i = 0; i < N; i++) { s += rate((i + 0.5) / N); cum[i + 1] = s; }
    for (let i = 0; i <= N; i++) cum[i] /= s;
    return function (t) {
      t = Math.max(0, Math.min(0.999999, t));
      const x = t * N, i = Math.floor(x), f = x - i;
      return cum[i] + (cum[i + 1] - cum[i]) * f;
    };
  })();
  function dayFraction() {
    // ACTUAL real UTC time-of-day. Fleet totals are 0 at 00:00 UTC and build
    // to a full day's worth by 24:00 — they reflect exactly how far into the
    // real day we are right now (no seeding, no acceleration, no skipping).
    const d = new Date();
    return (d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds() + d.getUTCMilliseconds() / 1000) / 86400;
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  // GPU utilization & PUE are instantaneous states, not cumulative: they
  // ramp from an overnight floor toward today's coordinated value.
  const GPU_NIGHT = 46;   // fleet util floor at ~00:00 UTC

  /* ---- per-scenario regional infrastructure (the US-* grid) ----
     Compute load + cooling-risk per region, so selecting a scenario
     visibly re-shapes the regional infrastructure cards. */
  const INFRA_ORDER = ['us-west', 'us-central', 'us-east', 'eu-west', 'apac'];
  const INFRA = {
    normal:    { 'us-west': 84, 'us-central': 61, 'us-east': 73, 'eu-west': 58, 'apac': 79 },
    surge:     { 'us-west': 93, 'us-central': 75, 'us-east': 80, 'eu-west': 66, 'apac': 85 },
    inference: { 'us-west': 70, 'us-central': 64, 'us-east': 89, 'eu-west': 74, 'apac': 83 },
    cooling:   { 'us-west': 80, 'us-central': 68, 'us-east': 76, 'eu-west': 60, 'apac': 92 },
    power:     { 'us-west': 67, 'us-central': 78, 'us-east': 70, 'eu-west': 62, 'apac': 73 },
    lowcarbon: { 'us-west': 71, 'us-central': 66, 'us-east': 69, 'eu-west': 87, 'apac': 70 }
  };
  const INFRA_RISK = {
    normal:    { 'us-west': 'med',  'us-central': 'low', 'us-east': 'low', 'eu-west': 'low', 'apac': 'high' },
    surge:     { 'us-west': 'high', 'us-central': 'med', 'us-east': 'med', 'eu-west': 'low', 'apac': 'high' },
    inference: { 'us-west': 'low',  'us-central': 'low', 'us-east': 'med', 'eu-west': 'low', 'apac': 'high' },
    cooling:   { 'us-west': 'med',  'us-central': 'low', 'us-east': 'med', 'eu-west': 'low', 'apac': 'high' },
    power:     { 'us-west': 'low',  'us-central': 'med', 'us-east': 'low', 'eu-west': 'low', 'apac': 'med'  },
    lowcarbon: { 'us-west': 'low',  'us-central': 'low', 'us-east': 'low', 'eu-west': 'med', 'apac': 'low'  }
  };
  const RISK_BADGE = {
    low:  { cls: 'control-badge--ok',   txt: 'Nominal' },
    med:  { cls: 'control-badge--opt',  txt: 'Optimizing' },
    high: { cls: 'control-badge--crit', txt: 'Constrained' }
  };
  const RISK_CLASS = { low: 'demo-risk--low', med: 'demo-risk--med', high: 'demo-risk--high' };
  const RISK_TEXT  = { low: 'Low', med: 'Medium', high: 'High' };
  let actionApplied = {};   // recommendations approved this session (declared early: used in recompute)

  /* scenario multipliers layered on top of the mode math (#4).
     All client-side, predefined. */
  const SCEN = {
    normal:    { energyMul: 1.00, costMul: 1.00, carbonMul: 1.00, coolingMul: 1.00, gpuDelta: 0,  pueDelta: 0.00 },
    surge:     { energyMul: 1.34, costMul: 1.28, carbonMul: 1.18, coolingMul: 1.22, gpuDelta: 6,  pueDelta: 0.03 },
    inference: { energyMul: 1.15, costMul: 1.22, carbonMul: 1.10, coolingMul: 1.08, gpuDelta: 4,  pueDelta: 0.01 },
    cooling:   { energyMul: 1.06, costMul: 1.10, carbonMul: 1.04, coolingMul: 1.55, gpuDelta: -2, pueDelta: -0.02 },
    power:     { energyMul: 1.10, costMul: 1.46, carbonMul: 1.08, coolingMul: 1.05, gpuDelta: -3, pueDelta: 0.00 },
    lowcarbon: { energyMul: 1.22, costMul: 1.16, carbonMul: 1.62, coolingMul: 1.02, gpuDelta: 2,  pueDelta: -0.01 }
  };

  /* base outcomes per optimization mode (simulated).
     energy / cost / carbon are FLEET-WIDE daily totals across every data
     center Helicyn coordinates, so they dwarf the single-facility figures
     in the Before/after panel. PUE, GPU%, cooling% are ratios (unscaled). */
  const MODES = {
    conservative: { energy: 286, cost: 82400,  carbon: 98,  pue: 1.24, gpu: 82, cooling: 6.8,  shift: 9,  afterPeak: 13.4, afterCarbon: 8.1, afterPue: 1.24 },
    balanced:     { energy: 432, cost: 124000, carbon: 154, pue: 1.18, gpu: 87, cooling: 11.4, shift: 18, afterPeak: 12.8, afterCarbon: 6.2, afterPue: 1.18 },
    aggressive:   { energy: 624, cost: 198000, carbon: 246, pue: 1.12, gpu: 91, cooling: 17.2, shift: 29, afterPeak: 11.6, afterCarbon: 4.4, afterPue: 1.12 }
  };
  /* constant pre-optimization baseline for the before/after panel */
  const BASELINE = { peak: 14.2, carbon: 9.1, pue: 1.31 };
  const CARBON_MULT = { low: 0.9, medium: 1.0, high: 1.14 };

  /* ---- number formatting + tween ------------------------- */
  function fmt(n, dp) { return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }); }
  function tweenNum(el, to, dp, prefix) {
    prefix = prefix || '';
    const from = parseFloat(el.dataset.cur || to);
    el.dataset.cur = to;
    if (prm) { el.firstChild ? (el.childNodes[0].nodeValue = prefix + fmt(to, dp)) : (el.textContent = prefix + fmt(to, dp)); return; }
    const t0 = performance.now(), dur = 650;
    function step(t) {
      const p = clamp((t - t0) / dur, 0, 1);
      const k = 1 - Math.pow(1 - p, 3);
      const v = from + (to - from) * k;
      const txt = prefix + fmt(v, dp);
      // write into the first text node so a trailing <span class="unit"> survives
      if (el.childNodes.length && el.childNodes[0].nodeType === 3) el.childNodes[0].nodeValue = txt;
      else el.textContent = txt;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---- recompute the whole dashboard from state ---------- */
  function recompute() {
    const m = MODES[state.mode];
    // flexibility scales the "shiftable" outcomes from 0.82x .. 1.18x
    const f = 0.82 + (state.flex / 100) * 0.36;
    const cMult = CARBON_MULT[state.carbon];
    const S = SCEN[state.scenario] || SCEN.normal;
    const b = state.bump;

    const energy  = m.energy * f * S.energyMul + b.energy;
    const cost    = m.cost   * f * S.costMul   + b.cost;
    const carbon  = m.carbon * f * cMult * S.carbonMul + b.carbon;
    const cooling = m.cooling * (0.9 + (state.flex / 100) * 0.2) * S.coolingMul + b.cooling;
    const gpuVal  = clamp(m.gpu + S.gpuDelta + b.gpu, 40, 99);
    const pueVal  = m.pue + S.pueDelta + b.pue;
    const shift   = Math.round(m.shift * f);

    // 1 - metric cards. Cumulative savings accumulate from 0 at 00:00 UTC;
    //     instantaneous states (PUE, GPU) ramp from an overnight floor.
    const isBase = state.view === 'baseline';
    const fr = dayFraction();                    // real UTC time-of-day
    const cf = ACC(fr);                          // 0..1 cumulative fraction now
    // live clock in the "Today, coordinated" header (actual UTC), aligned to the sparkline
    const clockEl = document.querySelector('[data-day-clock]');
    if (clockEl) {
      const d = new Date();
      clockEl.textContent = pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ':' + pad2(d.getUTCSeconds()) + ' UTC';
    }

    // today's coordinated values, live (so far today)
    const dEnergy  = isBase ? 0 : energy * cf;
    const dCost    = isBase ? 0 : cost   * cf;
    const dCarbon  = isBase ? 0 : carbon * cf;
    const dCooling = isBase ? 0 : cooling * cf;
    const gpuFloor = isBase ? GPU_NIGHT - 6 : GPU_NIGHT;
    const gpuTop   = isBase ? clamp(gpuVal - 8, 40, 99) : gpuVal;
    const dGpu     = gpuFloor + (gpuTop - gpuFloor) * cf;
    const pueTop   = isBase ? BASELINE.pue : pueVal;
    const dPue     = BASELINE.pue + (pueTop - BASELINE.pue) * cf;

    // yesterday's value at this same time of day (for the "vs. yesterday" delta)
    const yEnergy  = YDAY.energy * cf;
    const yCost    = YDAY.cost   * cf;
    const yCarbon  = YDAY.carbon * cf;
    const yCooling = YDAY.cooling * cf;
    const yGpu     = GPU_NIGHT + (YDAY.gpu - GPU_NIGHT) * cf;
    const yPue     = BASELINE.pue + (YDAY.pue - BASELINE.pue) * cf;

    setMetric('energy',  dEnergy, 1);
    setMetric('cost',    dCost,   0, '$');
    setMetric('carbon',  dCarbon, 1);
    setMetric('pue',     dPue,    2);
    setMetric('gpu',     dGpu,    0);
    setMetric('cooling', dCooling, 1);
    // real "vs. yesterday" deltas, same time-of-day comparison
    setTrend('energy',  dEnergy,  yEnergy);
    setTrend('cost',    dCost,    yCost);
    setTrend('carbon',  dCarbon,  yCarbon);
    setTrend('pue',     dPue,     yPue);
    setTrend('gpu',     dGpu,     yGpu);
    setTrend('cooling', dCooling, yCooling);
    const metricsEl = document.querySelector('.demo-metrics');
    if (metricsEl) metricsEl.classList.toggle('is-baseline', isBase);

    // sparklines: solid = accumulated 00:00→now, dashed = projected rest of day
    renderSpark('energy',  (t) => (isBase ? 0 : energy)  * ACC(t), true);
    renderSpark('cost',    (t) => (isBase ? 0 : cost)    * ACC(t), true);
    renderSpark('carbon',  (t) => (isBase ? 0 : carbon)  * ACC(t), true);
    renderSpark('cooling', (t) => (isBase ? 0 : cooling) * ACC(t), true);
    renderSpark('gpu',     (t) => gpuFloor + (gpuTop - gpuFloor) * ACC(t), false);
    renderSpark('pue',     (t) => BASELINE.pue + (pueTop - BASELINE.pue) * ACC(t), false);

    // 3 + region grid: scenario-driven loads & cooling risk for ALL regions
    const baseLoads = INFRA[state.scenario] || INFRA.normal;
    const risks     = INFRA_RISK[state.scenario] || INFRA_RISK.normal;
    INFRA_ORDER.forEach((k) => {
      let load = baseLoads[k];
      // flexibility slider coordinates US-WEST → US-CENTRAL
      if (k === 'us-west')    load -= shift * 0.7;
      if (k === 'us-central') load += shift * 0.7;
      // persistent per-region effects from staged / approved actions
      load += (state.regionDelta[k] || 0);
      setRegionLoad(k, load);
      const risk = state.riskOverride[k] || risks[k];
      setRegionRisk(k, risk);
    });

    // 5 - recommendation #1 impact scales with the shift
    const recImpact = $('[data-rec-impact="shift"]');
    if (recImpact) recImpact.textContent = '−' + fmt(0.9 + shift * 0.05, 1) + ' MW peak';
    // confidence nudges with cooling tolerance (more tolerance → higher confidence on the cooling rec)
    const coolConf = { low: 72, medium: 78, high: 85 }[state.cooling];
    setConf('cooling', coolConf);

    // 6 - before / after comparison panel
    const afterPeak   = m.afterPeak   * (2 - f);     // more flex → lower after-peak
    const afterCarbon = m.afterCarbon * (2 - f) * cMult;
    setCompare('peak',   BASELINE.peak,   afterPeak,   1, 'MW');
    setCompare('carbon', BASELINE.carbon, afterCarbon, 1, 't');
    setCompare('pue',    BASELINE.pue,    m.afterPue,  2, '');

    // sticky status bar - reflect active optimization mode
    const sbMode = document.querySelector('[data-sb="mode"]');
    if (sbMode) sbMode.textContent = state.mode.charAt(0).toUpperCase() + state.mode.slice(1);

    // control-deck explanatory line reacts to mode + carbon priority
    const explain = document.querySelector('[data-control-explain]');
    if (explain) {
      const modeTxt = {
        conservative: 'Conservative mode favors SLA confidence and thermal headroom over savings; fewer workloads are eligible to move.',
        balanced:     'Balanced mode prioritizes energy savings while preserving thermal headroom and SLA-locked workloads.',
        aggressive:   'Aggressive mode unlocks the most savings and surfaces more warnings, with lower confidence.'
      }[state.mode] || '';
      const carbonTxt = state.carbon === 'high'
        ? ' High carbon priority moves flexible workloads toward lower-carbon regions even when cost savings are smaller.'
        : state.carbon === 'low'
          ? ' Low carbon priority weights cost and energy efficiency over emissions.'
          : '';
      explain.textContent = modeTxt + carbonTxt;
    }
  }

  /* expose a minimal API for the scenario / run-optimization layer */
  window.CP = {
    recompute,
    fmt,
    get state() { return state; },
    setScenario(name) { state.scenario = name; state.bump = freshBump(); state.regionDelta = {}; state.riskOverride = {}; resetApprovals(); recompute(); },
    applyBump(d) { for (const k in d) state.bump[k] = (state.bump[k] || 0) + d[k]; recompute(); },
    resetBump() { state.bump = freshBump(); recompute(); },
    revealVerification() { revealVerification(); }
  };

  function setMetric(key, val, dp, prefix) {
    const el = $('[data-metric="' + key + '"]');
    if (el) tweenNum(el, val, dp, prefix);
  }
  function setTrend(key, current, reference) {
    const el = $('[data-trend="' + key + '"]');
    if (!el) return;
    const cfg = TREND_CFG[key];
    if (!el.dataset.built) {
      el.innerHTML = '<span class="dir"></span><span class="tnum"></span><span class="tsuf"></span>';
      el.dataset.built = '1';
    }
    const dir = el.querySelector('.dir');
    const num = el.querySelector('.tnum');
    const suf = el.querySelector('.tsuf');
    if (cfg.mode === 'pct') {
      // % of yesterday's full-day total: climbs 0→~114% in lockstep with the big number
      const pct = current / (YDAY[key] || 1) * 100;
      dir.textContent = '↗'; dir.className = 'dir';
      el.classList.remove('is-bad');
      suf.textContent = 'of yesterday';
      tweenTrendNum(num, pct, cfg.dp, '', '%');
    } else {
      const delta = current - reference;
      const rounded = parseFloat(fmt(Math.abs(delta), cfg.dp));
      const flat = rounded === 0;
      const up = delta >= 0;
      const good = flat ? true : (cfg.lowerBetter ? !up : up);
      dir.textContent = flat ? '→' : (up ? '↗' : '↘');
      dir.className = 'dir' + (up ? '' : ' down') + (good ? '' : ' bad');
      el.classList.toggle('is-bad', !good);
      const unit = cfg.unit.trim();
      suf.textContent = (unit ? unit + ' ' : '') + 'vs. yesterday';
      const lead = flat ? '' : (up ? '+' : '−') + (cfg.prefix || '');
      tweenTrendNum(num, rounded, cfg.dp, lead, '');
    }
  }
  function tweenTrendNum(el, to, dp, lead, trail) {
    const from = parseFloat(el.dataset.cur);
    el.dataset.cur = to;
    if (prm || isNaN(from)) { el.textContent = lead + fmt(to, dp) + trail; return; }
    const t0 = performance.now(), dur = 600;
    (function step(t) {
      const p = clamp((t - t0) / dur, 0, 1);
      const k = 1 - Math.pow(1 - p, 3);
      el.textContent = lead + fmt(from + (to - from) * k, dp) + trail;
      if (p < 1) requestAnimationFrame(step);
    })(performance.now());
  }
  /* draw a metric's real intraday curve: solid = accumulated 00:00→now,
     dashed = projected rest of day, with a vertical "now" marker. */
  function renderSpark(key, seriesFn, anchorZero) {
    const svg = $('[data-spark="' + key + '"]');
    if (!svg) return;
    const frac = Math.min(0.9995, Math.max(dayFraction(), 0.004));
    const N = 60;
    const ys = [];
    for (let i = 0; i < N; i++) ys.push(seriesFn(i / (N - 1)));
    let lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
    if (anchorZero) lo = Math.min(lo, 0);
    if (hi - lo < 1e-6) hi = lo + 1;
    const padTop = (hi - lo) * 0.14;
    hi += padTop;
    const X = (t) => t * 100;
    const Y = (v) => 45 - (v - lo) / (hi - lo) * 39;
    const seg = (t0, t1) => {
      const steps = Math.max(2, Math.round((t1 - t0) * N));
      let dd = '';
      for (let i = 0; i <= steps; i++) {
        const t = t0 + (t1 - t0) * i / steps;
        dd += (i ? ' L' : 'M') + X(t).toFixed(1) + ',' + Y(seriesFn(t)).toFixed(1);
      }
      return dd;
    };
    // ensure the projection path + now-marker exist (created once)
    let proj = svg.querySelector('.proj');
    if (!proj) { proj = document.createElementNS(SVGNS, 'path'); proj.setAttribute('class', 'proj'); svg.appendChild(proj); }
    let mark = svg.querySelector('.nowmark');
    if (!mark) { mark = document.createElementNS(SVGNS, 'line'); mark.setAttribute('class', 'nowmark'); svg.appendChild(mark); }
    const solid = seg(0, frac);
    const area  = solid + ' L' + X(frac).toFixed(1) + ',48 L0,48 Z';
    const areaP = svg.querySelector('.area'), lineP = svg.querySelector('.line');
    if (areaP) areaP.setAttribute('d', area);
    if (lineP) lineP.setAttribute('d', solid);
    proj.setAttribute('d', seg(frac, 1));
    const nx = X(frac).toFixed(1);
    mark.setAttribute('x1', nx); mark.setAttribute('x2', nx);
    mark.setAttribute('y1', '4'); mark.setAttribute('y2', '48');
  }
  const SVGNS = 'http://www.w3.org/2000/svg';
  function setRegionLoad(key, pct) {
    pct = clamp(Math.round(pct), 0, 100);
    const row = $('[data-region="' + key + '"]');
    if (!row) return;
    const fill = $('.demo-bar__fill', row);
    const val  = $('[data-load-val]', row);
    if (fill) {
      fill.style.width = pct + '%';
      // continuous colour: the higher the compute load, the redder the bar.
      // hue runs cyan (low) → amber → red (high) across ~45–95% load.
      const t = clamp((pct - 45) / 50, 0, 1);
      const hue = 195 - t * 190;            // 195 (cyan) → 5 (red)
      const c = 'oklch(0.72 ' + (0.09 + t * 0.10).toFixed(3) + ' ' + hue.toFixed(0) + ')';
      fill.classList.remove('warn', 'crit');
      fill.style.background = 'linear-gradient(90deg, color-mix(in srgb, ' + c + ' 45%, transparent), ' + c + ')';
    }
    if (val) val.textContent = pct + '%';
  }
  function setConf(key, pct) {
    const fill = $('[data-conf="' + key + '"]');
    const lbl  = $('[data-conf-val="' + key + '"]');
    if (fill) fill.style.width = pct + '%';
    if (lbl) lbl.textContent = pct + '%';
  }
  function setCompare(key, before, after, dp, unit) {
    const block = $('[data-cmp="' + key + '"]');
    if (!block) return;
    // bars are scaled to the larger (before) value as 100%
    const max = Math.max(before, after) * 1.05;
    const bBar = $('.before .fill', block), aBar = $('.after .fill', block);
    if (bBar) bBar.style.width = (before / max * 100) + '%';
    if (aBar) aBar.style.width = (after / max * 100) + '%';
    const bNum = $('.before .num', block), aNum = $('.after .num', block);
    if (bNum) bNum.textContent = fmt(before, dp);
    if (aNum) aNum.textContent = fmt(after, dp);
    const delta = $('.delta', block);
    if (delta) {
      const pct = before > 0 ? Math.round((before - after) / before * 100) : 0;
      delta.textContent = (pct >= 0 ? '−' : '+') + Math.abs(pct) + '% ' + (unit ? unit + ' ' : '') + 'optimized';
    }
  }

  /* ---- segmented controls -------------------------------- */
  $$('.control-seg').forEach((seg) => {
    const key = seg.dataset.control;
    seg.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      $$('button', seg).forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      state[key] = btn.dataset.value;
      recompute();
    });
  });

  /* ---- flexibility slider -------------------------------- */
  const slider = $('#control-flex');
  const sliderVal = $('[data-flex-val]');
  if (slider) {
    const sync = () => {
      state.flex = parseInt(slider.value, 10);
      slider.style.setProperty('--p', state.flex + '%');
      if (sliderVal) sliderVal.textContent = state.flex + '%';
      recompute();
    };
    slider.addEventListener('input', sync);
    sync();
  }

  /* ---- toast -------------------------------------------- */
  let toastTimer;
  function toast(msg, ok) {
    let t = $('.control-toast');
    if (!t) { t = document.createElement('div'); t.className = 'control-toast'; t.innerHTML = '<span class="d"></span><span class="msg"></span>'; document.body.appendChild(t); }
    t.classList.toggle('ok', !!ok);
    $('.msg', t).textContent = msg;
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }

  /* ---- operator queue helpers ---------------------------- */
  function queueAddPending(id, cat) {
    const pending = $('#cp-queue-pending');
    if (!pending) return;
    const empty = pending.querySelector('[data-pending-empty]');
    if (empty) empty.remove();
    if (pending.querySelector('[data-queue-item="' + id + '"]')) return;
    const item = document.createElement('li');
    item.setAttribute('data-queue-item', id);
    item.innerHTML = '<span class="i">' + id + '</span><span class="l">' + cat + '</span>';
    pending.appendChild(item);
    refreshQueueCounts();
  }
  function queueMoveApproved(id) {
    const pending = $('#cp-queue-pending');
    const approved = $('#cp-queue-approved');
    if (!approved) return;
    const empty = approved.querySelector('[data-queue-empty]');
    if (empty) empty.remove();
    let item = pending && pending.querySelector('[data-queue-item="' + id + '"]');
    if (item) item.parentNode.removeChild(item);
    item = document.createElement('li');
    item.setAttribute('data-queue-item', id);
    item.className = 'is-approved';
    item.innerHTML = '<span class="i">' + id + '</span><span class="l" data-approved-label></span><span class="chk">✓</span>';
    approved.appendChild(item);
    // restore pending empty-state if it's now empty
    if (pending && !pending.querySelector('[data-queue-item]')) {
      pending.innerHTML = '<li class="cp-queue__empty" data-pending-empty>No actions awaiting simulation.</li>';
    }
    refreshQueueCounts();
    return item;
  }
  function refreshQueueCounts() {
    const pending = $('#cp-queue-pending');
    const approved = $('#cp-queue-approved');
    const pc = $('[data-queue-count="pending"]'); if (pc && pending) pc.textContent = String(pending.querySelectorAll('[data-queue-item]').length);
    const ac = $('[data-queue-count="approved"]'); if (ac && approved) ac.textContent = String(approved.querySelectorAll('[data-queue-item]').length);
  }
  function resetQueue() {
    const pending = $('#cp-queue-pending');
    const approved = $('#cp-queue-approved');
    if (pending) pending.innerHTML = '<li class="cp-queue__empty" data-pending-empty>No actions awaiting simulation.</li>';
    if (approved) approved.innerHTML = '<li class="cp-queue__empty" data-queue-empty>No actions approved yet.</li>';
    refreshQueueCounts();
  }
  function revealVerification() {
    const empty = $('[data-verify-empty]');
    const body = $('[data-verify-body]');
    if (empty) empty.style.display = 'none';
    if (body) body.hidden = false;
  }
  function hideVerification() {
    const empty = $('[data-verify-empty]');
    const body = $('[data-verify-body]');
    if (empty) empty.style.display = '';
    if (body) body.hidden = true;
  }
  // update the verification window rows from a simulated action
  function setVerification(v) {
    revealVerification();
    for (const k in v) { const el = $('[data-verify="' + k + '"]'); if (el) el.textContent = v[k]; }
  }

  /* ---- apply an approved action to the regional INFRASTRUCTURE
     cards (the static US-* grid) + propagate to the regional
     COORDINATION map (scenario.js) and the top KPIs. Persistent. */
  function setRegionRisk(regionKey, level) {
    const row = $('[data-region="' + regionKey + '"]');
    if (!row) return;
    const pill = $('.demo-risk', row);
    if (pill) {
      pill.className = 'demo-risk ' + RISK_CLASS[level];
      pill.innerHTML = '<span class="d"></span>' + RISK_TEXT[level];
    }
    // also reflect risk in the card's status badge
    const badge = $('.demo-region__top .control-badge', row);
    const cfg = RISK_BADGE[level];
    if (badge && cfg) { badge.className = 'control-badge ' + cfg.cls; badge.innerHTML = '<span class="d"></span>' + cfg.txt; }
  }
  function flash(el) {
    if (!el) return;
    el.classList.remove('cp-flash'); void el.offsetWidth; el.classList.add('cp-flash');
  }

  /* ---- TELEMETRY effects (section 6 charts react to sims) ---
     Approved+simulated actions lower facility power demand and
     specific cooling-zone loads, so the live charts visibly move. */
  const TELE = { peakBias: 0 };
  let rerenderPower = function () {};
  const ZONE_BASE = { A: 72, B: 88, C: 64, D: 41, E: 55 };
  function zoneEl(letter) {
    return $$('.demo-zone').find((el) => { const z = $('.z', el); return z && z.textContent.trim() === 'Zone ' + letter; });
  }
  function adjustZone(letter, delta) {
    const zone = zoneEl(letter);
    if (!zone) return;
    const fill = $('.demo-bar__fill', zone), v = $('.v', zone);
    const cur = parseFloat(fill.dataset.zoneTarget) || 0;
    const next = clamp(cur + delta, 0, 100);
    fill.dataset.zoneTarget = next;
    fill.style.width = next + '%';
    if (v) v.textContent = Math.round(next) + '%';
    flash(zone);
  }
  function applyTelemetry(t) {
    if (!t) return;
    if (t.peak) { TELE.peakBias += t.peak; rerenderPower(); flash($('#demo-power') && $('#demo-power').closest('.demo-chart')); }
    if (t.zones) for (const z in t.zones) adjustZone(z, t.zones[z]);
  }
  function resetTelemetry() {
    TELE.peakBias = 0;
    rerenderPower();
    for (const z in ZONE_BASE) {
      const zone = zoneEl(z); if (!zone) continue;
      const fill = $('.demo-bar__fill', zone), v = $('.v', zone);
      fill.dataset.zoneTarget = ZONE_BASE[z];
      fill.style.width = ZONE_BASE[z] + '%';
      if (v) v.textContent = ZONE_BASE[z] + '%';
    }
  }

  // apply a generic effect object to the fleet (used by rec cards AND workload staging)
  // energy/cost/carbon bumps are scaled to the fleet so they read against the big totals.
  const BUMP_SCALE = { energy: 16, cost: 18, carbon: 15 };
  function applyFx(fx, scenePatchId) {
    if (!fx) return;
    if (fx.regionDelta) for (const k in fx.regionDelta) state.regionDelta[k] = (state.regionDelta[k] || 0) + fx.regionDelta[k];
    if (fx.risk) for (const k in fx.risk) state.riskOverride[k] = fx.risk[k];
    if (fx.bump) for (const k in fx.bump) state.bump[k] = (state.bump[k] || 0) + fx.bump[k] * (BUMP_SCALE[k] || 1);
    recompute();
    (fx.flash || []).forEach((k) => flash($('[data-region="' + k + '"]')));
    if (fx.telemetry) applyTelemetry(fx.telemetry);
    if (scenePatchId && window.CPScene && window.CPScene.applyRecPatch) window.CPScene.applyRecPatch(scenePatchId);
  }
  function resetApprovals() {
    actionApplied = {};
    state.regionDelta = {};
    state.riskOverride = {};
    resetTelemetry();
    resetQueue();
    hideVerification();
    if (window.__resetRecs) window.__resetRecs();
    // reset the workload orchestration table + staged-actions panel
    if (window.__resetWorkloads) window.__resetWorkloads();
  }

  /* ---- recommendations: approve → simulate → file → regenerate
     Flow: each card must be APPROVED before it can be SIMULATED.
     Simulating applies region + telemetry + KPI effects, files the
     action into the operator queue (Approved in simulation), reveals
     the verification window, removes the card, and generates a fresh
     recommendation so the section always shows three. */
  (function recommendations() {
    const host = $('#demo-recs');
    if (!host) return;
    const PRIOC = { High: 'demo-prio--critical', Medium: 'demo-prio--standard', Low: 'demo-prio--flexible' };
    const POOL = [
      { type: 'Workload routing', cat: 'Workload routing', text: 'Shift flexible GPU workloads from <strong>US-WEST</strong> to <strong>US-CENTRAL</strong> during peak grid load.', prio: 'High', impact: '−1.4 MW peak', conf: 92, protect: 'Latency-critical inference remains locked in US-EAST.', risk: 'Stop rerouting if US-CENTRAL utilization exceeds 78%.', sim: [{ k: 'Peak power', b: '12.8 MW', a: '11.4 MW' }, { k: 'US-CENTRAL util', b: '61%', a: '74%' }, { k: 'Thermal risk', b: 'Medium', a: 'Low' }], verify: { peak: '−1.4 MW', pue: '1.31 → 1.18', variance: '9.8°C → 4.2°C', emissions: '−0.8 tCO₂e/hr' }, fx: { regionDelta: { 'us-west': -14, 'us-central': 14 }, risk: { 'us-west': 'low' }, flash: ['us-west', 'us-central'], telemetry: { peak: 1.4 }, bump: { energy: 1.1, cost: 280, carbon: 0.4, pue: -0.01, cooling: 0.9 } } },
      { type: 'Time shifting', cat: 'Time shifting', text: 'Delay non-critical training jobs by <strong>42 minutes</strong> to align with lower-carbon energy.', prio: 'Medium', impact: '−0.8 tCO₂e', conf: 87, protect: 'SLA-bound jobs keep their original deadlines.', risk: 'Re-evaluate if the low-carbon window closes early.', sim: [{ k: 'Carbon / hr', b: '9.1 tCO₂e', a: '8.3 tCO₂e' }, { k: 'Deadline match', b: 'At risk', a: 'Aligned' }], verify: { peak: '−0.4 MW', pue: '1.24 → 1.22', variance: '6.1°C → 5.4°C', emissions: '−0.8 tCO₂e/hr' }, fx: { regionDelta: { 'eu-west': -8 }, flash: ['eu-west'], telemetry: { peak: 0.4 }, bump: { energy: 0.5, cost: 140, carbon: 0.7, cooling: 0.2 } } },
      { type: 'Local thermal control', cat: 'Thermal control', text: 'Increase cooling setpoint by <strong>0.8°C</strong> in Zone B without exceeding SLA thermal limits.', prio: 'Low', impact: '−340 kW cooling', conf: 78, protect: 'Zone B stays within SLA thermal limits.', risk: 'Revert setpoint if rack inlet variance exceeds 6°C.', sim: [{ k: 'Cooling load', b: '88%', a: '84%' }, { k: 'Zone B PUE', b: '1.31', a: '1.27' }, { k: 'Inlet variance', b: '9.8°C', a: '7.9°C' }], verify: { peak: '−0.3 MW', pue: '1.31 → 1.27', variance: '9.8°C → 7.9°C', emissions: '−0.2 tCO₂e/hr' }, fx: { telemetry: { peak: 0.3, zones: { B: -4 } }, flash: [], bump: { energy: 0.4, cost: 90, cooling: 1.4, pue: -0.01 } } },
      { type: 'Workload routing', cat: 'Workload routing', text: 'Shift flexible training from <strong>APAC</strong> to <strong>EU-WEST</strong> away from constrained cooling.', prio: 'High', impact: '−1.1 MW peak', conf: 84, protect: 'APAC inference stays in-region for latency.', risk: 'Hold if EU-WEST utilization passes 80%.', sim: [{ k: 'APAC cooling', b: '92%', a: '80%' }, { k: 'EU-WEST util', b: '58%', a: '68%' }, { k: 'Thermal risk', b: 'High', a: 'Medium' }], verify: { peak: '−1.1 MW', pue: '1.29 → 1.20', variance: '8.4°C → 5.1°C', emissions: '−0.6 tCO₂e/hr' }, fx: { regionDelta: { 'apac': -16, 'eu-west': 10 }, risk: { 'apac': 'med' }, flash: ['apac', 'eu-west'], telemetry: { peak: 1.1 }, bump: { energy: 0.8, cost: 210, carbon: 0.6, cooling: 1.1 } } },
      { type: 'Carbon-aware scheduling', cat: 'Time shifting', text: 'Move flexible batch in <strong>EU-WEST</strong> into the next low-carbon window.', prio: 'Medium', impact: '−0.6 tCO₂e', conf: 83, protect: 'Deadlines with SLA penalties are excluded.', risk: 'Window forecast confidence drops after 3h.', sim: [{ k: 'Grid carbon', b: '410 g', a: '280 g' }, { k: 'Batch slip', b: '0 min', a: '31 min' }], verify: { peak: '−0.3 MW', pue: '1.23 → 1.21', variance: '5.6°C → 5.2°C', emissions: '−0.6 tCO₂e/hr' }, fx: { regionDelta: { 'eu-west': -5 }, flash: ['eu-west'], telemetry: { peak: 0.3 }, bump: { energy: 0.4, cost: 110, carbon: 0.6 } } },
      { type: 'Local thermal control', cat: 'Thermal control', text: 'Tune <strong>Zone A</strong> fan curve to recover headroom at equal inlet temps.', prio: 'Low', impact: '−180 kW cooling', conf: 80, protect: 'Inlet temperature target unchanged.', risk: 'Revert if Zone A variance exceeds 5°C.', sim: [{ k: 'Zone A load', b: '72%', a: '69%' }, { k: 'Fan power', b: '210 kW', a: '180 kW' }], verify: { peak: '−0.2 MW', pue: '1.22 → 1.20', variance: '5.1°C → 4.6°C', emissions: '−0.1 tCO₂e/hr' }, fx: { telemetry: { peak: 0.2, zones: { A: -3 } }, flash: [], bump: { cooling: 0.8, cost: 70, pue: -0.01 } } },
      { type: 'Workload routing', cat: 'Workload routing', text: 'Rebalance a fine-tune job from <strong>US-EAST</strong> to <strong>US-CENTRAL</strong>.', prio: 'Medium', impact: '−0.9 MW peak', conf: 86, protect: 'Checkpoint cadence preserved across the move.', risk: 'Pause if US-CENTRAL crosses 80% utilization.', sim: [{ k: 'US-EAST util', b: '89%', a: '81%' }, { k: 'US-CENTRAL util', b: '66%', a: '74%' }], verify: { peak: '−0.9 MW', pue: '1.27 → 1.21', variance: '7.0°C → 5.3°C', emissions: '−0.4 tCO₂e/hr' }, fx: { regionDelta: { 'us-east': -8, 'us-central': 8 }, flash: ['us-east', 'us-central'], telemetry: { peak: 0.9 }, bump: { energy: 0.5, cost: 120, cooling: 0.5 } } }
    ];
    let displayed = [0, 1, 2];
    let ptr = 3;
    let seq = 0;
    const idFor = () => 'REC-' + String(++seq).padStart(2, '0');

    function cardHTML(poolIdx, recId) {
      const r = POOL[poolIdx];
      const confAttr = r.cat === 'Thermal control' ? ' data-conf="cooling"' : '';
      const confValAttr = r.cat === 'Thermal control' ? ' data-conf-val="cooling"' : '';
      return '<article class="demo-rec" data-rec-id="' + recId + '" data-pool="' + poolIdx + '">' +
        '<div class="demo-rec__head">' +
          '<span class="demo-rec__lead"><span class="demo-rec__idx">' + recId + '</span><span class="demo-rec__type">' + r.type + '</span></span>' +
          '<span class="demo-rec__statebadge control-badge"><span class="d"></span>Proposed</span>' +
        '</div>' +
        '<p class="demo-rec__text">' + r.text + '</p>' +
        '<div class="demo-rec__meta">' +
          '<div class="demo-rec__row"><span class="k">Priority: </span><span class="v"><span class="demo-prio ' + PRIOC[r.prio] + '">' + r.prio + '</span></span></div>' +
          '<div class="demo-rec__row"><span class="k">Est. impact: </span><span class="v impact">' + r.impact + '</span></div>' +
          '<div class="demo-rec__row"><span class="k">Confidence: </span><span class="demo-conf"><span class="demo-conf__track"><span class="demo-conf__fill"' + confAttr + ' style="width:' + r.conf + '%"></span></span><span class="v"' + confValAttr + '>' + r.conf + '%</span></span></div>' +
        '</div>' +
        '<div class="demo-rec__guard">' +
          '<div class="demo-rec__guardrow"><span class="lbl">Protected</span><span class="t">' + r.protect + '</span></div>' +
          '<div class="demo-rec__guardrow demo-rec__guardrow--risk"><span class="lbl">Risk</span><span class="t">' + r.risk + '</span></div>' +
        '</div>' +
        '<div class="demo-rec__sim" data-rec-sim hidden></div>' +
        '<div class="demo-rec__actions">' +
          '<button class="control-btn control-btn--primary" data-act="approve"><span class="t">Approve in simulation</span></button>' +
          '<button class="control-btn" data-act="simulate" disabled title="Approve in simulation first"><span class="t">Simulate</span></button>' +
        '</div>' +
      '</article>';
    }
    function render() {
      seq = 0;
      host.innerHTML = displayed.map((p) => cardHTML(p, idFor())).join('');
    }
    function regenerate(slotCard) {
      const slot = [...host.children].indexOf(slotCard);
      if (slot < 0) return;
      slotCard.classList.add('is-leaving');
      setTimeout(() => {
        const nextPool = ptr % POOL.length; ptr++;
        const fresh = document.createElement('div');
        fresh.innerHTML = cardHTML(nextPool, idFor());
        const node = fresh.firstChild;
        node.classList.add('is-entering');
        if (slotCard.parentNode) slotCard.parentNode.replaceChild(node, slotCard);
        requestAnimationFrame(() => node.classList.remove('is-entering'));
      }, 420);
    }

    host.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const rec = btn.closest('.demo-rec');
      const poolIdx = parseInt(rec.dataset.pool, 10);
      const r = POOL[poolIdx];
      const id = rec.dataset.recId;
      const badge = $('.demo-rec__statebadge', rec);
      const simBtn = $('[data-act="simulate"]', rec);
      const appBtn = $('[data-act="approve"]', rec);

      if (btn.dataset.act === 'approve') {
        if (rec.classList.contains('is-approved')) return;
        rec.classList.add('is-approved');
        appBtn.disabled = true;
        appBtn.querySelector('.t').textContent = 'Approved';
        simBtn.disabled = false;
        simBtn.removeAttribute('title');
        simBtn.classList.add('control-btn--primary');
        if (badge) { badge.className = 'demo-rec__statebadge control-badge control-badge--opt'; badge.innerHTML = '<span class="d"></span>Approved · ready to simulate'; }
        queueAddPending(id, r.cat);
        toast('Approved in simulation · ready to simulate', true);
        return;
      }

      // simulate (only reachable once approved)
      if (btn.dataset.act === 'simulate') {
        if (!rec.classList.contains('is-approved') || rec.classList.contains('is-simulated')) return;
        rec.classList.add('is-simulated');
        simBtn.disabled = true;
        simBtn.querySelector('.t').textContent = 'Simulating…';
        toast('Simulating: ' + r.type);
        setTimeout(() => {
          // before/after panel
          const simPanel = $('[data-rec-sim]', rec);
          if (simPanel) {
            const rows = r.sim.map((s) => '<div class="demo-rec__simrow"><span class="k">' + s.k + '</span><span class="ba"><span class="b">' + s.b + '</span><span class="arr">→</span><span class="a">' + s.a + '</span></span></div>').join('');
            simPanel.innerHTML = '<span class="demo-rec__simhead">Simulated before / after</span>' + rows + '<span class="demo-rec__simdone"><span class="d"></span>Filed to operator queue.</span>';
            simPanel.hidden = false;
          }
          // apply fleet + telemetry + KPI effects
          applyFx(r.fx);
          // file into operator queue + verification window
          const item = queueMoveApproved(id);
          if (item) { const lbl = $('[data-approved-label]', item); if (lbl) lbl.textContent = r.cat; }
          setVerification(r.verify);
          // finalize card: no re-simulate, badge done
          simBtn.querySelector('.t').textContent = 'Filed to queue';
          if (badge) { badge.className = 'demo-rec__statebadge control-badge control-badge--ok'; badge.innerHTML = '<span class="d"></span>Approved in simulation'; }
          toast('Simulation complete · filed to operator queue', true);
          // regenerate a fresh recommendation in this slot
          setTimeout(() => regenerate(rec), 1500);
        }, 1200);
      }
    });

    window.__resetRecs = function () { displayed = [0, 1, 2]; ptr = 3; render(); };
    render();
  })();

  /* ---- clickable region cards (detail on select) --------- */
  const REGION_DETAIL = {
    'US-WEST':    { flex: '34%', action: 'Shift 18% of flexible training to US-CENTRAL.' },
    'US-CENTRAL': { flex: '46%', action: 'Accept shifted training; ample cooling headroom available.' },
    'US-EAST':    { flex: '12%', action: 'Hold latency-critical inference in region (SLA-locked).' },
    'EU-WEST':    { flex: '52%', action: 'Pull forward flexible batch into the low-carbon window.' },
    'APAC':       { flex: '21%', action: 'Reroute flexible training away from constrained cooling.' }
  };
  $$('.demo-region').forEach((card) => {
    const nameEl = $('.demo-region__name', card);
    const name = nameEl ? nameEl.textContent.trim() : '';
    const d = REGION_DETAIL[name];
    if (!d) return;
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-expanded', 'false');
    const detail = document.createElement('div');
    detail.className = 'demo-region__detail';
    detail.hidden = true;
    detail.innerHTML =
      '<div class="demo-region__detrow"><span class="k">Flexible workload share</span><span class="v">' + d.flex + '</span></div>' +
      '<div class="demo-region__detrow"><span class="k">Recommended action</span><span class="v act">' + d.action + '</span></div>';
    card.appendChild(detail);
    const toggle = () => {
      const open = !card.classList.contains('is-selected');
      $$('.demo-region').forEach((o) => {
        o.classList.toggle('is-selected', o === card && open);
        o.setAttribute('aria-expanded', String(o === card && open));
        const dd = $('.demo-region__detail', o);
        if (dd) dd.hidden = !(o === card && open);
      });
    };
    card.addEventListener('click', (e) => { if (e.target.closest('.demo-tip')) return; toggle(); });
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  });

  /* ---- clickable cooling zones (thermal detail) ---------- */
  const ZONE_DETAIL = {
    'Zone A': { load: '72%', variance: '5.1°C', headroom: 'Ample',    action: 'Within target; monitor only.' },
    'Zone B': { load: '88%', variance: '9.8°C', headroom: 'Limited',  action: 'Reduce compute density first, then adjust local cooling setpoint.' },
    'Zone C': { load: '64%', variance: '4.4°C', headroom: 'Ample',    action: 'Available to absorb shifted load.' },
    'Zone D': { load: '41%', variance: '3.2°C', headroom: 'Ample',    action: 'Idle capacity; candidate for consolidation.' },
    'Zone E': { load: '55%', variance: '4.0°C', headroom: 'Moderate', action: 'Stable; no change recommended.' }
  };
  const zones = $$('.demo-zone');
  if (zones.length) {
    const host = zones[0].closest('.demo-zones');
    let panel = null;
    if (host) { panel = document.createElement('div'); panel.className = 'demo-zonedetail'; panel.hidden = true; host.parentNode.insertBefore(panel, host.nextSibling); }
    zones.forEach((z) => {
      const zn = $('.z', z);
      const name = zn ? zn.textContent.trim() : '';
      const d = ZONE_DETAIL[name];
      if (!d || !panel) return;
      z.setAttribute('tabindex', '0');
      z.setAttribute('role', 'button');
      z.style.cursor = 'pointer';
      const open = () => {
        zones.forEach((o) => o.classList.toggle('is-selected', o === z));
        panel.innerHTML =
          '<span class="demo-zonedetail__ttl">' + name + ' · thermal detail</span>' +
          '<div class="demo-zonedetail__rows">' +
            '<div class="r"><span class="k">Cooling load</span><span class="v">' + d.load + '</span></div>' +
            '<div class="r"><span class="k">Rack inlet variance</span><span class="v">' + d.variance + '</span></div>' +
            '<div class="r"><span class="k">Headroom</span><span class="v">' + d.headroom + '</span></div>' +
            '<div class="r"><span class="k">Recommended action</span><span class="v act">' + d.action + '</span></div>' +
          '</div>';
        panel.hidden = false;
      };
      z.addEventListener('click', open);
      z.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
  }

  /* ---- workload orchestration: live table + staging -------
     A pool of workloads feeds a table that always shows 4 actionable
     recommendations. Staging one applies its real per-region effects,
     moves it into the Staged actions panel, and regenerates the row
     with the next workload so there are always 4 recommendations. */
  (function workloads() {
    const tbody = $('#wl-tbody');
    if (!tbody) return;
    const RISKC = { low: 'demo-risk--low', med: 'demo-risk--med', high: 'demo-risk--high' };
    const RISKT = { low: 'Low', med: 'Medium', high: 'High' };
    const PRIOC = { Flexible: 'demo-prio--flexible', Standard: 'demo-prio--standard', Critical: 'demo-prio--critical' };
    const POOL = [
      { name: 'LLM Training · Batch A17', sub: 'Training Cluster · 1,024 GPU', prio: 'Flexible', region: 'US-WEST', power: '2.4 MW', risk: 'med', action: 'Shift 18% → US-CENTRAL', why: 'Medium thermal risk; cheaper, lower-risk capacity in US-CENTRAL', fx: { regionDelta: { 'us-west': -14, 'us-central': 14 }, risk: { 'us-west': 'low' }, flash: ['us-west', 'us-central'], bump: { energy: 1.1, cost: 280, carbon: 0.4, pue: -0.01, cooling: 0.9 } } },
      { name: 'Embedding Refresh', sub: 'Batch Scheduler · nightly', prio: 'Flexible', region: 'EU-WEST', power: '0.7 MW', risk: 'low', action: 'Defer 42 min', why: 'Flexible batch aligned to a cleaner, cheaper window', fx: { regionDelta: { 'eu-west': -8 }, flash: ['eu-west'], bump: { energy: 0.5, cost: 140, carbon: 0.7, cooling: 0.2 } } },
      { name: 'Vision Model Training', sub: 'GPU Pods · 512 GPU', prio: 'Standard', region: 'US-CENTRAL', power: '1.8 MW', risk: 'high', action: 'Reroute → US-EAST', why: 'High thermal risk in current region', fx: { regionDelta: { 'us-central': -12, 'us-east': 6 }, risk: { 'us-central': 'med' }, flash: ['us-central', 'us-east'], bump: { energy: 0.4, cost: 90, cooling: 1.4, pue: -0.01 } } },
      { name: 'Recsys Retrain', sub: 'Training Cluster · 768 GPU', prio: 'Flexible', region: 'APAC', power: '1.5 MW', risk: 'high', action: 'Shift → EU-WEST', why: 'Constrained cooling; cleaner capacity in EU-WEST', fx: { regionDelta: { 'apac': -16, 'eu-west': 10 }, risk: { 'apac': 'med' }, flash: ['apac', 'eu-west'], bump: { energy: 0.8, cost: 210, carbon: 0.6, cooling: 1.1 } } },
      { name: 'Checkpoint Sync', sub: 'Batch Scheduler · rolling', prio: 'Flexible', region: 'US-WEST', power: '0.9 MW', risk: 'med', action: 'Defer 25 min', why: 'Non-urgent; shift out of the current demand peak', fx: { regionDelta: { 'us-west': -6 }, flash: ['us-west'], bump: { energy: 0.3, cost: 95, carbon: 0.3 } } },
      { name: 'Fine-tune Job 22', sub: 'GPU Pods · 256 GPU', prio: 'Standard', region: 'US-EAST', power: '1.3 MW', risk: 'med', action: 'Rebalance → US-CENTRAL', why: 'Spread load off a warming US-EAST zone', fx: { regionDelta: { 'us-east': -8, 'us-central': 8 }, flash: ['us-east', 'us-central'], bump: { energy: 0.5, cost: 120, cooling: 0.5 } } },
      { name: 'Data Pipeline ETL', sub: 'Batch Scheduler · hourly', prio: 'Flexible', region: 'EU-WEST', power: '0.6 MW', risk: 'low', action: 'Consolidate nodes', why: 'Pack onto fewer nodes to free idle capacity', fx: { regionDelta: { 'eu-west': -5 }, flash: ['eu-west'], bump: { energy: 0.4, cost: 110, carbon: 0.2, cooling: 0.3 } } }
    ];
    let displayed = [0, 1, 2, 3];
    let ptr = 4;
    let staged = 0;

    function rowHTML(i) {
      const w = POOL[i];
      return '<tr data-wl-slot>' +
        '<td><span class="wl-name">' + w.name + '</span><span class="wl-sub">' + w.sub + '</span></td>' +
        '<td><span class="demo-prio ' + PRIOC[w.prio] + '">' + w.prio + '</span></td>' +
        '<td><span class="mono">' + w.region + '</span></td>' +
        '<td><span class="mono">' + w.power + '</span></td>' +
        '<td><span class="demo-risk ' + RISKC[w.risk] + '"><span class="d"></span>' + RISKT[w.risk] + '</span></td>' +
        '<td><button type="button" class="wl-action wl-action--btn" data-wl-pool="' + i + '">' + w.action + ' <span class="arr" aria-hidden="true">→</span></button></td>' +
        '<td><span class="wl-why">' + w.why + '</span></td>' +
        '</tr>';
    }
    function render() {
      tbody.innerHTML = displayed.map(rowHTML).join('');
      const note = $('[data-wl-note]');
      if (note) note.textContent = 'Scheduler · 4 active';
    }
    function addStaged(w) {
      const panel = $('#wl-staged-list');
      const empty = $('[data-staged-empty]');
      if (empty) empty.remove();
      staged++;
      const id = 'WL-' + String(staged).padStart(2, '0');
      const fxKeys = Object.keys(w.fx.regionDelta || {}).map((k) => {
        const d = w.fx.regionDelta[k];
        return k.toUpperCase() + ' ' + (d > 0 ? '+' : '−') + Math.abs(d) + '%';
      }).join(' · ');
      const card = document.createElement('div');
      card.className = 'wl-staged__card';
      card.innerHTML =
        '<div class="wl-staged__top"><span class="wl-staged__id">' + id + '</span>' +
        '<span class="control-badge control-badge--ok"><span class="d"></span>Staged in simulation</span></div>' +
        '<div class="wl-staged__name">' + w.name + '</div>' +
        '<div class="wl-staged__act">' + w.action + '</div>' +
        '<div class="wl-staged__fx">' + (fxKeys || 'Local optimization') + '</div>';
      $('#wl-staged-list').appendChild(card);
      const cnt = $('[data-staged-count]');
      if (cnt) cnt.textContent = String(staged);
      const sec = $('#wl-staged');
      if (sec) sec.hidden = false;
    }
    function onStage(i) {
      const w = POOL[i];
      applyFx(w.fx);                  // real per-region infrastructure change
      addStaged(w);
      // regenerate this slot with the next workload from the pool
      const slot = displayed.indexOf(i);
      displayed[slot] = ptr % POOL.length;
      ptr++;
      render();
      toast('Staged · ' + w.name + ' · ' + w.action, true);
    }
    tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-wl-pool]');
      if (!btn) return;
      onStage(parseInt(btn.dataset.wlPool, 10));
    });
    window.__resetWorkloads = function () {
      displayed = [0, 1, 2, 3]; ptr = 4; staged = 0;
      render();
      const list = $('#wl-staged-list');
      if (list) list.innerHTML = '<p class="wl-staged__empty" data-staged-empty>No actions staged yet. Stage a recommended action above to add it here.</p>';
      const cnt = $('[data-staged-count]'); if (cnt) cnt.textContent = '0';
      const sec = $('#wl-staged'); if (sec) sec.hidden = true;
    };
    render();
  })();

  /* ============================================================
     POWER-DEMAND LINE CHART (live, simulated)
     A scrolling area+line of total facility power over ~2h.
     ============================================================ */
  (function powerChart() {
    const svg = $('#demo-power');
    if (!svg) return;
    const W = 600, H = 180, PAD = 8, BASE = H - 14;
    const N = 48;
    // seed a believable demand curve (MW), gently noisy around a daytime ramp
    let data = [];
    for (let i = 0; i < N; i++) {
      const base = 10.5 + Math.sin(i / N * Math.PI * 1.3) * 2.4;
      data.push(base + (Math.sin(i * 0.7) * 0.4) + (Math.random() - 0.5) * 0.5);
    }
    const min = 7, max = 16;
    const x = (i) => PAD + (i / (N - 1)) * (W - PAD * 2);
    const y = (v) => PAD + (1 - (v - min) / (max - min)) * (BASE - PAD);

    const linePath = $('.line', svg);
    const areaPath = $('.area', svg);
    const nowDot   = $('.now', svg);
    const readout  = $('[data-power-now]');

    function render() {
      let d = 'M' + x(0) + ',' + y(data[0] - TELE.peakBias);
      for (let i = 1; i < N; i++) d += ' L' + x(i) + ',' + y(data[i] - TELE.peakBias);
      linePath.setAttribute('d', d);
      areaPath.setAttribute('d', d + ' L' + x(N - 1) + ',' + BASE + ' L' + x(0) + ',' + BASE + ' Z');
      const last = data[N - 1] - TELE.peakBias;
      nowDot.setAttribute('cx', x(N - 1));
      nowDot.setAttribute('cy', y(last));
      if (readout) readout.textContent = fmt(last, 1) + ' MW';
    }
    rerenderPower = render;
    render();

    if (!prm) {
      setInterval(() => {
        // shift left, append a new sample that drifts from the last
        const prev = data[N - 1];
        let next = prev + (Math.random() - 0.5) * 0.7 + (11.5 - prev) * 0.04;
        next = clamp(next, min + 0.5, max - 0.5);
        data.push(next); data.shift();
        render();
      }, 2000);
    }
  })();

  /* ---- initial paint ------------------------------------- */
  recompute();
  // animate region/zone/compare bars in shortly after load
  setTimeout(() => {
    $$('.demo-zone [data-zone-target]').forEach((b) => { b.style.width = b.dataset.zoneTarget + '%'; });
  }, 200);

  /* ---- live tick: re-derive the time-of-day totals every few
     seconds so the "today, coordinated" numbers visibly climb
     (cost/energy/carbon tick up; sparklines extend toward now). */
  (function liveTick() {
    setInterval(() => { if (!document.hidden) recompute(); }, 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) recompute(); });
  })();

  /* ---- keep the sticky status bar pinned exactly below the
     fixed nav (nav height varies by viewport + scrolled state) --- */
  (function syncNavHeight() {
    const nav = $('.nav');
    if (!nav) return;
    const set = () => document.documentElement.style.setProperty('--cp-navh', nav.offsetHeight + 'px');
    set();
    if (window.ResizeObserver) new ResizeObserver(set).observe(nav);
    window.addEventListener('resize', set);
    window.addEventListener('load', set);
  })();

  /* ---- section anchor nav: scrollspy + smooth scroll ------ */
  (function secNav() {
    const links = $$('[data-secnav]');
    if (!links.length) return;
    const map = new Map();
    links.forEach((a) => {
      const id = a.getAttribute('href').slice(1);
      const sec = document.getElementById(id);
      if (sec) map.set(sec, a);
    });
    if (!map.size) return;
    const setActive = (a) => links.forEach((l) => l.classList.toggle('is-active', l === a));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) setActive(map.get(e.target)); });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    map.forEach((_, sec) => io.observe(sec));
  })();
})();
