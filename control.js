/* ============================================================
   HELICYN — Control Plane interactions (simulation demo)
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
  const state = { mode: 'balanced', carbon: 'medium', flex: 60, cooling: 'medium' };

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

    const energy  = m.energy * f;
    const cost    = m.cost   * f;
    const carbon  = m.carbon * f * cMult;
    const cooling = m.cooling * (0.9 + (state.flex / 100) * 0.2);
    const shift   = Math.round(m.shift * f);

    // 1 — metric cards
    setMetric('energy',  energy, 1);
    setMetric('cost',    cost,   0, '$');
    setMetric('carbon',  carbon, 1);
    setMetric('pue',     m.pue,  2);
    setMetric('gpu',     m.gpu,  0);
    setMetric('cooling', cooling, 1);

    // 3 — region load reflects the US-WEST → US-CENTRAL shift
    setRegionLoad('us-west',    84 - shift * 0.7);
    setRegionLoad('us-central', 61 + shift * 0.7);

    // 5 — recommendation #1 impact scales with the shift
    const recImpact = $('[data-rec-impact="shift"]');
    if (recImpact) recImpact.textContent = '−' + fmt(0.9 + shift * 0.05, 1) + ' MW peak';
    // confidence nudges with cooling tolerance (more tolerance → higher confidence on the cooling rec)
    const coolConf = { low: 72, medium: 78, high: 85 }[state.cooling];
    setConf('cooling', coolConf);

    // 6 — before / after comparison panel
    const afterPeak   = m.afterPeak   * (2 - f);     // more flex → lower after-peak
    const afterCarbon = m.afterCarbon * (2 - f) * cMult;
    setCompare('peak',   BASELINE.peak,   afterPeak,   1, 'MW');
    setCompare('carbon', BASELINE.carbon, afterCarbon, 1, 't');
    setCompare('pue',    BASELINE.pue,    m.afterPue,  2, '');
  }

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

  /* ---- simulate / approve on recommendations ------------- */
  $$('.demo-rec').forEach((rec) => {
    const sim = $('[data-act="simulate"]', rec);
    const app = $('[data-act="approve"]', rec);
    const name = rec.dataset.recName || 'recommendation';
    if (sim) sim.addEventListener('click', () => {
      sim.disabled = true;
      const orig = sim.querySelector('.t');
      orig.textContent = 'Running…';
      toast('Simulating: ' + name);
      setTimeout(() => {
        orig.textContent = 'Simulated';
        sim.classList.add('is-done');
        sim.disabled = false;
        toast('Simulation complete · projection updated', true);
      }, 1400);
    });
    if (app) app.addEventListener('click', () => {
      rec.classList.add('is-approved');
      app.querySelector('.t').textContent = 'Approved';
      app.disabled = true;
      const badge = $('.demo-rec__statebadge', rec);
      if (badge) { badge.className = 'demo-rec__statebadge control-badge control-badge--ok'; badge.innerHTML = '<span class="d"></span>Queued'; }
      toast('Approved · queued for operator confirmation', true);
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
})();
