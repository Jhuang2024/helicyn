/* ============================================================
   HELICYN - Control Plane · ambient interaction layer
   Brings the landing page's "everything responds" feel to the
   dashboard: a cursor-reactive background glow + faint parallax
   grid behind the content, and a per-card spotlight sheen that
   follows the pointer. Vanilla. Reduced-motion aware. Purely
   decorative; never blocks pointer events or changes layout.
   ============================================================ */
(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const main = document.getElementById('control-main') || document.getElementById('main');
  if (!main) return;

  const root = document.documentElement;

  /* ---- ambient background layer (behind content) ----------
     Desktop / fine-pointer only: on touch we keep the layout
     clean and static (the CSS hover effects also no-op there). */
  if (!reduce && fine) buildAmbient();

  function buildAmbient() {
    const amb = document.createElement('div');
    amb.className = 'cp-ambient';
    amb.setAttribute('aria-hidden', 'true');
    amb.innerHTML = '<div class="cp-ambient__grid"></div><div class="cp-ambient__glow"></div>';
    document.body.insertBefore(amb, document.body.firstChild);

    let mx = window.innerWidth / 2, my = window.innerHeight * 0.4;
    let tx = mx, ty = my, raf = 0;
    let scrollY = window.scrollY || document.documentElement.scrollTop || 0;

    function paint(x, y) {
      root.style.setProperty('--mx', x.toFixed(1) + 'px');
      root.style.setProperty('--my', y.toFixed(1) + 'px');
      // faint grid drifts a few px opposite the cursor → parallax depth,
      // plus a slow scroll-linked drift so the whole page reads as one
      // continuous surface rather than resetting section to section
      const gx = (x / window.innerWidth - 0.5) * -16;
      const gy = (y / window.innerHeight - 0.5) * -16 - scrollY * 0.045;
      root.style.setProperty('--gx', gx.toFixed(1) + 'px');
      root.style.setProperty('--gy', gy.toFixed(1) + 'px');
    }
    paint(mx, my);

    function loop() {
      raf = 0;
      mx += (tx - mx) * 0.10;
      my += (ty - my) * 0.10;
      paint(mx, my);
      if (Math.abs(tx - mx) > 0.4 || Math.abs(ty - my) > 0.4) raf = requestAnimationFrame(loop);
    }

    let scrollRaf = 0;
    window.addEventListener('scroll', () => {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0;
        scrollY = window.scrollY || document.documentElement.scrollTop || 0;
        paint(mx, my);
      });
    }, { passive: true });

    /* ---- per-card spotlight (cursor-tracked sheen) -------- */
    const CARD_SEL = '.demo-metric, .demo-region, .demo-rec, .cp-lifecell, .cp-rnode, .wl-staged__card, .demo-panel, .cp-queue__list li, .cp-assume, .archstack__panel, .compare__col, .cpcta__panel, .cap';
    let cardRaf = 0, lastEvt = null;
    function spot() {
      cardRaf = 0;
      const e = lastEvt;
      if (!e || !e.target || !e.target.closest) return;
      const card = e.target.closest(CARD_SEL);
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--cx', (((e.clientX - r.left) / r.width) * 100).toFixed(1) + '%');
      card.style.setProperty('--cy', (((e.clientY - r.top) / r.height) * 100).toFixed(1) + '%');
    }

    document.addEventListener('pointermove', (e) => {
      tx = e.clientX; ty = e.clientY;
      document.body.classList.add('is-pointer');
      if (!raf) raf = requestAnimationFrame(loop);
      lastEvt = e;
      if (!cardRaf) cardRaf = requestAnimationFrame(spot);
    }, { passive: true });

    document.addEventListener('pointerleave', () => { document.body.classList.remove('is-pointer'); });
    window.addEventListener('blur', () => { document.body.classList.remove('is-pointer'); });
  }

  /* ---- topology: hovering a region node lights its flows --
     Each region card / map node carries data-region-id; flows
     in the map are tagged with their endpoints. Hovering a node
     raises the matching flows so the power/coordination path
     illuminates together. (Pure class toggle; CSS does the glow.) */
  function wireTopology() {
    const map = document.querySelector('.cp-topo__map');
    if (!map) return;
    const cards = document.querySelectorAll('[data-region-id]');
    cards.forEach((card) => {
      const id = card.getAttribute('data-region-id');
      card.addEventListener('pointerenter', () => {
        map.classList.add('is-tracing');
        document.querySelectorAll('.cp-flow[data-from="' + id + '"], .cp-flow[data-to="' + id + '"], .cp-flow-dash[data-from="' + id + '"], .cp-flow-dash[data-to="' + id + '"]').forEach((f) => f.classList.add('is-lit'));
        const node = map.querySelector('.cp-node[data-region-id="' + id + '"]');
        if (node) node.classList.add('is-lit');
      });
      card.addEventListener('pointerleave', () => {
        map.classList.remove('is-tracing');
        map.querySelectorAll('.is-lit').forEach((f) => f.classList.remove('is-lit'));
      });
    });
  }
  // topology nodes/cards are rendered by scenario.js; wire after a tick
  // and again whenever the scenario re-renders.
  setTimeout(wireTopology, 400);
  window.addEventListener('cp:topology-rendered', wireTopology);
})();
