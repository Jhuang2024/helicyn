/* ============================================================
   HELICYN — enhance
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

    // advance only while the group is on screen — cheap + robust
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

  /* 1 · One system, many layers — descending layer flow */
  walker($$('.layerflow__node'), { interval: 850 });
  /* 2 · Coordination loop — Detect → Coordinate → Optimize → Verify */
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

  /* ---- floating tooltips ----------------------------------
     The "i" popups live inside cards, tables, and panels that
     clip overflow (rounded corners / scroll wrappers), so an
     absolutely-positioned popup gets cut at the border. On
     open we relocate the popup to <body> and position it
     fixed, clamped to the viewport, flipping above/below as
     room allows — so it always floats clear of any clip.    */
  (function floatTips() {
    const tips = $$('.demo-tip');
    if (!tips.length) return;
    let open = null;

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
      pop.style.left = Math.round(left) + 'px';
      pop.style.top = Math.round(top) + 'px';
      pop.style.setProperty('--tip-arrow', Math.round(r.left + r.width / 2 - left) + 'px');
      pop.classList.toggle('demo-tip__pop--below', below);
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
      tip.addEventListener('pointerenter', () => show(tip));
      tip.addEventListener('pointerleave', hide);
      tip.addEventListener('focus', () => show(tip));
      tip.addEventListener('blur', hide);
    });
    window.addEventListener('scroll', hide, { passive: true });
    window.addEventListener('resize', hide);
  })();
})();

(() => {
(() => {
  const tips = document.querySelectorAll(".demo-tip");
  let activeTip = null;
  let activePop = null;

  const isMobileLike = () =>
    window.matchMedia("(hover: none), (pointer: coarse)").matches;

  function restorePopup(pop) {
    if (!pop || !pop.__home) return;
    const { parent, next } = pop.__home;
    if (next && next.parentNode === parent) parent.insertBefore(pop, next);
    else parent.appendChild(pop);
  }

  function hideActive() {
    if (!activePop) return;

    activePop.classList.remove(
      "is-shown",
      "demo-tip__pop--float",
      "demo-tip__pop--below"
    );
    activePop.style.left = "";
    activePop.style.top = "";
    activePop.style.transform = "";

    restorePopup(activePop);

    activeTip = null;
    activePop = null;
  }

  function showTooltip(tip, pop) {
    if (!pop.__home) {
      pop.__home = {
        parent: pop.parentNode,
        next: pop.nextSibling
      };
    }

    document.body.appendChild(pop);
    pop.classList.add("demo-tip__pop--float", "is-shown");

    const r = tip.getBoundingClientRect();
    const margin = 12;
    const popRect = pop.getBoundingClientRect();

    let top = r.top - popRect.height - 12;

    if (top < margin) {
      top = r.bottom + 12;
      pop.classList.add("demo-tip__pop--below");
    } else {
      pop.classList.remove("demo-tip__pop--below");
    }

    if (top + popRect.height > window.innerHeight - margin) {
      top = window.innerHeight - popRect.height - margin;
    }

    pop.style.left = "50%";
    pop.style.top = `${Math.max(margin, top)}px`;
    pop.style.transform = "translateX(-50%)";
  }

  tips.forEach((tip) => {
    const pop = tip.querySelector(".demo-tip__pop");
    if (!pop) return;

    tip.addEventListener("click", (e) => {
      if (!isMobileLike()) return;

      e.preventDefault();
      e.stopPropagation();

      if (activeTip === tip) {
        hideActive();
        return;
      }

      hideActive();
      activeTip = tip;
      activePop = pop;
      showTooltip(tip, pop);
    });
  });

  document.addEventListener("click", () => {
    if (isMobileLike()) hideActive();
  });

  window.addEventListener("scroll", hideActive, { passive: true });
  window.addEventListener("resize", hideActive);
})();
