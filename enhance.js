/* ============================================================
   HELICYN - enhance
   Lightweight, on-brand interactivity for the coordination
   diagrams: a traveling "active" signal that walks each flow,
   hover-to-scrub, point-by-point comparison linking, and a
   causal-chain cascade. Vanilla. Reduced-motion aware.
   Shared by the landing page and the Control Plane.
   ============================================================ */
(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  /* ---- generic sequential walker --------------------------
     Applies `cls` to one item at a time, advancing on an
     interval. Hovering an item scrubs to it and pauses; the
     walk only runs while the group is on screen.            */
  function walker(items, opts) {
    opts = opts || {};
    const cls = opts.cls || 'is-active';
    const interval = opts.interval || 1400;
    if (items.length < 2) return;
    let idx = 0, paused = false;
    const root = items[0].parentElement;
    const paint = (i) => items.forEach((el, k) => el.classList.toggle(cls, k === i));

    // hover scrubs to a step and pauses the walk
    items.forEach((el, k) => {
      el.addEventListener('pointerenter', () => { paused = true; idx = k; paint(k); });
      el.addEventListener('pointerleave', () => { paused = false; });
    });

    paint(0);                 // always show a lit start state
    if (reduce) return;       // reduced-motion: static, hover still works

    // advance only while the group is on screen - cheap + robust
    function onScreen() {
      const r = root.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      return r.top < vh * 0.9 && r.bottom > vh * 0.1;
    }
    setInterval(() => {
      if (paused || !onScreen()) return;
      idx = (idx + 1) % items.length;
      paint(idx);
    }, interval);
  }

  /* 2 · Coordination loop - Detect → Coordinate → Optimize → Verify */
  walker($$('.loop__step'), { interval: 1300 });
  /* 3 · Control-Plane preview flow chips */
  walker($$('.cpflow__step'), { interval: 1050 });
  /* 4 · Decision hierarchy (Control Plane) */
  walker($$('.cp-hier__step'), { interval: 950 });

  /* ---- comparison: point-by-point cross-linking -----------
     The two columns are positionally parallel. Hovering a row
     in one lights the matching row in the other so the
     contrast reads one claim at a time.                     */
  (function compareLink() {
    const cols = $$('.compare__col');
    if (cols.length !== 2) return;
    const a = $$('.compare__list li', cols[0]);
    const b = $$('.compare__list li', cols[1]);
    const n = Math.min(a.length, b.length);
    const set = (i, on) => { if (a[i]) a[i].classList.toggle('is-linked', on); if (b[i]) b[i].classList.toggle('is-linked', on); };
    for (let i = 0; i < n; i++) {
      [a[i], b[i]].forEach((row) => {
        if (!row) return;
        row.addEventListener('pointerenter', () => set(i, true));
        row.addEventListener('pointerleave', () => set(i, false));
      });
    }
  })();

  /* ---- causal chain: cascade up to the hovered link -------
     "What the Control Plane demonstrates" is a dependency
     chain (workload → thermal → cooling → energy → cost).
     Hovering item N lights 1..N to show the compounding.    */
  (function causalChain() {
    const items = $$('.cp-demolist li');
    if (items.length < 2) return;
    items.forEach((it, i) => {
      it.addEventListener('pointerenter', () => items.forEach((x, k) => x.classList.toggle('is-lit', k <= i)));
      it.addEventListener('pointerleave', () => items.forEach((x) => x.classList.remove('is-lit')));
    });
  })();

  /* ---- architecture stack: interactive layer explainer -----
     Hovering/focusing/selecting a layer swaps the explanation
     panel and highlights the adjacent (connected) layers.      */
  (function archStack() {
    const body = document.querySelector('.archstack__body');
    if (!body) return;
    const buttons = $$('.archstack__layer', body);
    const idxEl = body.querySelector('[data-archstack-idx]');
    const textEl = body.querySelector('[data-archstack-text]');
    const tagEl = body.querySelector('[data-archstack-tag]');
    const ORDER = ['workload', 'compute', 'region', 'facility', 'power', 'thermal', 'cooling', 'operator'];
    const DATA = {
      workload: { tag: 'Not scheduler-only', text: 'Training, inference, and batch jobs enter with priority, SLA flexibility, and deadline constraints already attached. This is where a coordination decision starts.' },
      compute:  { tag: 'GPU utilization', text: 'GPU clusters translate workload demand into utilization, thermal load, and power draw — the first physical cost of a placement decision.' },
      region:   { tag: 'Regional capacity', text: 'Grid carbon intensity, power price, and spare capacity vary by region. The same job costs and emits differently depending on where it runs.' },
      facility: { tag: 'Facility limits', text: 'Each data center holds its own cooling and power ceiling. Regional headroom means nothing if the facility itself is constrained.' },
      power:    { tag: 'Price exposure', text: 'Electricity price and availability set how much discretionary compute can run right now, and how much should wait for a cheaper window.' },
      thermal:  { tag: 'Thermal headroom', text: 'Rack-level heat and headroom determine how much load a zone can safely absorb before cooling becomes the binding constraint.' },
      cooling:  { tag: 'Not cooling-only', text: 'Cooling is a downstream effect, not the starting point. Setpoints and airflow respond to thermal load inside facility limits — Helicyn is not a cooling-only optimizer.' },
      operator: { tag: 'Operator-in-the-loop', text: 'Every recommended action is reviewed and approved by an operator before it changes anything. Helicyn recommends; it does not act alone.' }
    };

    let swapTimer = null;
    function setActive(id) {
      const idx = ORDER.indexOf(id);
      if (idx < 0) return;
      buttons.forEach((b) => {
        const bi = ORDER.indexOf(b.dataset.layer);
        const active = b.dataset.layer === id;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', String(active));
        b.classList.toggle('is-related', !active && Math.abs(bi - idx) === 1);
      });
      const d = DATA[id];
      if (!d) return;
      if (idxEl) idxEl.textContent = String(idx + 1).padStart(2, '0') + ' / ' + String(ORDER.length).padStart(2, '0');
      if (tagEl) tagEl.textContent = d.tag;
      if (textEl) {
        clearTimeout(swapTimer);
        if (reduce) { textEl.textContent = d.text; return; }
        textEl.classList.add('is-swapping');
        swapTimer = setTimeout(() => { textEl.textContent = d.text; textEl.classList.remove('is-swapping'); }, 140);
      }
    }

    buttons.forEach((b) => {
      b.addEventListener('click', () => setActive(b.dataset.layer));
      b.addEventListener('pointerenter', () => setActive(b.dataset.layer));
      b.addEventListener('focus', () => setActive(b.dataset.layer));
    });
    const list = body.querySelector('.archstack__layers');
    if (list) {
      list.addEventListener('keydown', (e) => {
        const cur = buttons.findIndex((b) => b.classList.contains('is-active'));
        let next = cur;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = Math.min(buttons.length - 1, cur + 1);
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = Math.max(0, cur - 1);
        else return;
        e.preventDefault();
        buttons[next].focus();
        setActive(buttons[next].dataset.layer);
      });
    }
  })();

  /* ---- floating tooltips ----------------------------------
     The "i" popups live inside cards, tables, and panels that
     clip overflow (rounded corners / scroll wrappers), so an
     absolutely-positioned popup gets cut at the border. On
     open we relocate the popup to <body> and position it
     fixed, clamped to the viewport, flipping above/below as
     room allows - so it always floats clear of any clip.

     ONE controller, two interaction modes chosen by device:
       • hover-capable (desktop): hover / focus opens, leave / blur closes
       • touch (no hover): tap the "i" to toggle it open/closed;
         tapping anywhere else, scrolling, or resizing dismisses it.

     The mode is keyed to the SAME media query the CSS uses
     ((hover: none), (pointer: coarse)) so JS and CSS always
     agree which mode is live. (Previously a second, separate
     tap handler ran alongside the hover one and the two fought
     over the same popup on phones - opening then instantly
     hiding it. That duplicate is now gone.)                 */
  (function floatTips() {
    const tips = $$('.demo-tip');
    if (!tips.length) return;

    // Touch-mode when the device can't hover / uses a coarse pointer -
    // identical condition to the CSS @media block for tooltips.
    const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
    let open = null;          // the currently-floated .demo-tip__pop, or null

    function place(tip, pop) {
      const r = tip.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      const M = 10;
      pop.style.maxWidth = Math.min(260, vw - M * 2) + 'px';
      // measure off-screen
      pop.style.left = '0px'; pop.style.top = '0px';
      const pr = pop.getBoundingClientRect();
      let left = r.left + r.width / 2 - pr.width / 2;
      left = Math.max(M, Math.min(left, vw - pr.width - M));
      let below = false;
      let top = r.top - pr.height - 9;
      if (top < M) { top = r.bottom + 9; below = true; }
      // keep it on screen vertically even when flipped below a low trigger
      top = Math.min(top, vh - pr.height - M);
      top = Math.max(M, top);
      pop.style.left = Math.round(left) + 'px';
      pop.style.top = Math.round(top) + 'px';
      pop.style.setProperty('--tip-arrow', Math.round(r.left + r.width / 2 - left) + 'px');
      pop.classList.toggle('demo-tip__pop--below', below);
      // (On touch the CSS centers the popup and hides the arrow; the
      //  left/arrow values above are simply overridden there.)
    }

    function show(tip) {
      const pop = tip.querySelector('.demo-tip__pop');
      if (!pop || open === pop) return;
      if (open) hide();
      if (!tip._tipHome) {
        tip._tipHome = document.createComment('tip');
        pop.parentNode.insertBefore(tip._tipHome, pop);
      }
      document.body.appendChild(pop);
      pop.classList.add('demo-tip__pop--float');
      place(tip, pop);
      requestAnimationFrame(() => pop.classList.add('is-shown'));
      open = pop; open._tip = tip;
    }

    function hide() {
      if (!open) return;
      const pop = open, tip = open._tip;
      pop.classList.remove('demo-tip__pop--float', 'demo-tip__pop--below', 'is-shown');
      pop.style.cssText = '';
      if (tip && tip._tipHome && tip._tipHome.parentNode) {
        tip._tipHome.parentNode.insertBefore(pop, tip._tipHome);
      }
      open = null;
    }

    tips.forEach((tip) => {
      if (isTouch) {
        // Tap toggles this tip. Tapping a different tip swaps to it
        // (show() closes any already-open one first).
        tip.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();        // keep the outside-tap closer below from firing
          const pop = tip.querySelector('.demo-tip__pop');
          if (open && open === pop) hide();
          else show(tip);
        });
      } else {
        tip.addEventListener('pointerenter', () => show(tip));
        tip.addEventListener('pointerleave', hide);
        tip.addEventListener('focus', () => show(tip));
        tip.addEventListener('blur', hide);
      }
    });

    // Touch: a tap anywhere outside the open popup dismisses it.
    if (isTouch) {
      document.addEventListener('click', (e) => {
        if (open && !open.contains(e.target)) hide();
      });
    }

    window.addEventListener('scroll', hide, { passive: true });
    window.addEventListener('resize', hide);
  })();
})();
