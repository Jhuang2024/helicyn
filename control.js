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
  const state = { mode: 'balanced', carbon: 'medium', flex: 60, cooling: 'medium', scenario: 'normal', view: 'after', bump: freshBump() };

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

  /* base outcomes per optimization mode (simulated) */
  const MODES = {
    conservative: { energy: 12.1, cost: 3120, carbon: 3.9, pue: 1.24, gpu: 82, cooling: 6.8,  shift: 9,  afterPeak: 13.4, afterCarbon: 8.1, afterPue: 1.24 },
    balanced:     { energy: 18.7, cost: 4820, carbon: 6.2, pue: 1.18, gpu: 87, cooling: 11.4, shift: 18, afterPeak: 12.8, afterCarbon: 6.2, afterPue: 1.18 },
    aggressive:   { energy: 26.4, cost: 7640, carbon: 9.7, pue: 1.12, gpu: 91, cooling: 17.2, shift: 29, afterPeak: 11.6, afterCarbon: 4.4, afterPue: 1.12 }
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

    // 1 - metric cards (Baseline view shows pre-coordination numbers)
    const isBase = state.view === 'baseline';
    setMetric('energy',  isBase ? 0 : energy, 1);
    setMetric('cost',    isBase ? 0 : cost,   0, '$');
    setMetric('carbon',  isBase ? 0 : carbon, 1);
    setMetric('pue',     isBase ? BASELINE.pue : pueVal, 2);
    setMetric('gpu',     isBase ? clamp(gpuVal - 8, 40, 99) : gpuVal, 0);
    setMetric('cooling', isBase ? 0 : cooling, 1);
    const metricsEl = document.querySelector('.demo-metrics');
    if (metricsEl) metricsEl.classList.toggle('is-baseline', isBase);

    // 3 - region load reflects the US-WEST → US-CENTRAL shift
    setRegionLoad('us-west',    84 - shift * 0.7);
    setRegionLoad('us-central', 61 + shift * 0.7);

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
    setScenario(name) { state.scenario = name; state.bump = freshBump(); recompute(); },
    applyBump(d) { for (const k in d) state.bump[k] = (state.bump[k] || 0) + d[k]; recompute(); },
    resetBump() { state.bump = freshBump(); recompute(); },
    revealVerification() { revealVerification(); }
  };

  function setMetric(key, val, dp, prefix) {
    const el = $('[data-metric="' + key + '"]');
    if (el) tweenNum(el, val, dp, prefix);
  }
  function setRegionLoad(key, pct) {
    pct = clamp(Math.round(pct), 0, 100);
    const row = $('[data-region="' + key + '"]');
    if (!row) return;
    const fill = $('.demo-bar__fill', row);
    const val  = $('[data-load-val]', row);
    if (fill) fill.style.width = pct + '%';
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

  /* ---- simulated before/after per recommendation --------- */
  const RECSIM = {
    'REC-01': [ { k: 'Peak power', b: '12.8 MW', a: '11.4 MW' }, { k: 'US-CENTRAL util', b: '61%', a: '74%' }, { k: 'Thermal risk', b: 'Medium', a: 'Low' } ],
    'REC-02': [ { k: 'Carbon / hr', b: '9.1 tCO₂e', a: '8.3 tCO₂e' }, { k: 'Deadline match', b: 'At risk', a: 'Aligned' } ],
    'REC-03': [ { k: 'Cooling load', b: '88%', a: '84%' }, { k: 'Zone B PUE', b: '1.31', a: '1.27' }, { k: 'Inlet variance', b: '9.8°C', a: '7.9°C' } ]
  };

  function approveInQueue(id, cat) {
    const pending = $('#cp-queue-pending');
    const approved = $('#cp-queue-approved');
    if (!pending || !approved) return;
    const empty = approved.querySelector('[data-queue-empty]');
    if (empty) empty.remove();
    let item = pending.querySelector('[data-queue-item="' + id + '"]');
    if (item) {
      item.parentNode.removeChild(item);
    } else {
      item = document.createElement('li');
      item.setAttribute('data-queue-item', id);
      item.innerHTML = '<span class="i">' + id + '</span><span class="l">' + cat + '</span>';
    }
    item.classList.add('is-approved');
    if (!item.querySelector('.chk')) { const c = document.createElement('span'); c.className = 'chk'; c.textContent = '✓'; item.appendChild(c); }
    approved.appendChild(item);
    const pc = $('[data-queue-count="pending"]'); if (pc) pc.textContent = String(pending.querySelectorAll('[data-queue-item]').length);
    const ac = $('[data-queue-count="approved"]'); if (ac) ac.textContent = String(approved.querySelectorAll('[data-queue-item]').length);
  }
  function revealVerification() {
    const empty = $('[data-verify-empty]');
    const body = $('[data-verify-body]');
    if (empty) empty.style.display = 'none';
    if (body) body.hidden = false;
  }

  /* ---- simulate / approve on recommendations ------------- */
  $$('.demo-rec').forEach((rec) => {
    const id = rec.dataset.recId;
    const sim = $('[data-act="simulate"]', rec);
    const app = $('[data-act="approve"]', rec);
    const name = rec.dataset.recName || 'recommendation';
    const simPanel = $('[data-rec-sim]', rec);
    if (sim) sim.addEventListener('click', () => {
      sim.disabled = true;
      const orig = sim.querySelector('.t');
      orig.textContent = 'Running…';
      toast('Simulating: ' + name);
      setTimeout(() => {
        if (simPanel) {
          const rows = (RECSIM[id] || []).map((r) =>
            '<div class="demo-rec__simrow"><span class="k">' + r.k + '</span><span class="ba"><span class="b">' + r.b + '</span><span class="arr">→</span><span class="a">' + r.a + '</span></span></div>'
          ).join('');
          simPanel.innerHTML = '<span class="demo-rec__simhead">Simulated before / after</span>' + rows + '<span class="demo-rec__simdone"><span class="d"></span>Simulation complete.</span>';
          simPanel.hidden = false;
        }
        orig.textContent = 'Re-simulate';
        sim.classList.add('is-done');
        sim.disabled = false;
        toast('Simulation complete · projection updated', true);
      }, 1200);
    });
    if (app) app.addEventListener('click', () => {
      if (rec.classList.contains('is-approved')) return;
      rec.classList.add('is-approved');
      app.querySelector('.t').textContent = 'Approved in simulation';
      app.disabled = true;
      const badge = $('.demo-rec__statebadge', rec);
      if (badge) { badge.className = 'demo-rec__statebadge control-badge control-badge--ok'; badge.innerHTML = '<span class="d"></span>Approved in simulation'; }
      approveInQueue(id, rec.dataset.recCat || 'Action');
      revealVerification();
      toast('Action added to verification queue.', true);
    });
  });

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

  /* ---- clickable workload actions (orchestration table) -- */
  $$('.wl-action--btn').forEach((b) => {
    b.addEventListener('click', () => {
      if (b.classList.contains('is-applied')) return;
      b.classList.add('is-applied');
      b.disabled = true;
      const label = b.dataset.wlApply || 'action';
      b.innerHTML = 'Staged <span class="chk">✓</span>';
      toast('Workload action staged in simulation: ' + label, true);
    });
  });

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
      let d = 'M' + x(0) + ',' + y(data[0]);
      for (let i = 1; i < N; i++) d += ' L' + x(i) + ',' + y(data[i]);
      linePath.setAttribute('d', d);
      areaPath.setAttribute('d', d + ' L' + x(N - 1) + ',' + BASE + ' L' + x(0) + ',' + BASE + ' Z');
      const last = data[N - 1];
      nowDot.setAttribute('cx', x(N - 1));
      nowDot.setAttribute('cy', y(last));
      if (readout) readout.textContent = fmt(last, 1) + ' MW';
    }
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
    $$('.demo-region [data-load-target]').forEach((b) => { b.style.width = b.dataset.loadTarget + '%'; });
    $$('.demo-zone [data-zone-target]').forEach((b) => { b.style.width = b.dataset.zoneTarget + '%'; });
  }, 200);

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
})();
