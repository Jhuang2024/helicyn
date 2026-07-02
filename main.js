/* ============================================================
   HELICYN - interactions
   Scroll progress, nav state, staggered reveals, live UTC clock,
   magnetic hovers, and access-form validation.
   ============================================================ */
(function () {
  // ---- scroll progress + nav -------------------------------
  const progress = document.querySelector('.progress');
  const nav = document.querySelector('.nav');
  function onScroll() {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    const p = max > 0 ? (h.scrollTop || document.body.scrollTop) / max : 0;
    if (progress) progress.style.width = (p * 100).toFixed(2) + '%';
    if (nav) nav.classList.toggle('scrolled', (h.scrollTop || document.body.scrollTop) > 24);
  }
  document.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---- reveal on enter (rAF tween - robust to throttling) --
  const prm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const revealEls = Array.from(document.querySelectorAll('[data-reveal]'));
  const easeOutExpo = (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));
  function tween(el) {
    const mask = el.getAttribute('data-reveal') === 'mask';
    // 'is-revealing' fires immediately (not at animation end, like 'is-visible')
    // so CSS-chained children (e.g. compare rows, cpcta bars) can animate in
    // alongside the parent's own fade instead of queuing behind it.
    el.classList.add('is-revealing');
    if (prm) {
      el.style.opacity = '1'; el.style.transform = 'none';
      if (mask) el.style.clipPath = 'inset(0 0 0 0)';
      el.classList.add('is-visible');
      return;
    }
    const delay = (parseFloat(el.style.getPropertyValue('--i')) || 0) * 90;
    const dur = mask ? 1100 : 900;
    let start = null;
    function step(t) {
      if (start === null) start = t;
      const e = t - start - delay;
      if (e < 0) { requestAnimationFrame(step); return; }
      const p = Math.min(1, e / dur);
      const k = easeOutExpo(p);
      if (mask) {
        el.style.opacity = '1';
        el.style.clipPath = `inset(0 ${((1 - k) * 100).toFixed(2)}% 0 0)`;
      } else {
        el.style.opacity = String(k);
        el.style.transform = `translateY(${(1 - k) * 22}px)`;
      }
      if (p < 1) requestAnimationFrame(step);
      else { el.style.transform = 'none'; el.classList.add('is-visible'); }
    }
    requestAnimationFrame(step);
  }
  let revealQueued = false;
  function checkReveal() {
    revealQueued = false;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    for (let i = revealEls.length - 1; i >= 0; i--) {
      const el = revealEls[i];
      const r = el.getBoundingClientRect();
      if (r.top < vh * 0.92 && r.bottom > 0) {
        tween(el);
        revealEls.splice(i, 1);
      }
    }
  }
  function queueReveal() { if (!revealQueued) { revealQueued = true; requestAnimationFrame(checkReveal); } }
  document.addEventListener('scroll', queueReveal, { passive: true });
  window.addEventListener('resize', queueReveal);
  checkReveal();
  setTimeout(checkReveal, 120);
  setTimeout(checkReveal, 600);
  // some [data-reveal] content (auth/portal states) is unhidden later by
  // async JS (Supabase session checks) well after the timeouts above, so
  // re-check whenever anything's [hidden] attribute changes anywhere.
  if (revealEls.length && 'MutationObserver' in window) {
    new MutationObserver(queueReveal).observe(document.body, {
      attributes: true, attributeFilter: ['hidden'], subtree: true,
    });
  }

  // ---- count-up metrics (illustrative values, animated once
  // on scroll-into-view; final digits match the static markup) --
  (function () {
    const els = Array.from(document.querySelectorAll('[data-count]'));
    if (!els.length || prm || !('IntersectionObserver' in window)) return;
    const parsed = els.map((el) => {
      const m = el.getAttribute('data-count').match(/^([^\d\-−]*)([\-−]?)([\d.]+)(.*)$/);
      return m ? { el, prefix: m[1], sign: m[2], num: parseFloat(m[3]), decimals: (m[3].split('.')[1] || '').length, suffix: m[4] } : null;
    }).filter(Boolean);
    const render = (meta, v) => { meta.el.textContent = meta.prefix + meta.sign + v.toFixed(meta.decimals) + meta.suffix; };
    parsed.forEach((meta) => render(meta, 0));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        const meta = parsed.find((m) => m.el === entry.target);
        if (!meta) return;
        const dur = 1200;
        let start = null;
        function step(t) {
          if (start === null) start = t;
          const p = Math.min(1, (t - start) / dur);
          render(meta, meta.num * easeOutExpo(p));
          if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      });
    }, { threshold: 0.4 });
    parsed.forEach((meta) => io.observe(meta.el));
  })();

  // ---- live UTC clock --------------------------------------
  const clocks = document.querySelectorAll('[data-clock]');
  function pad(n) { return String(n).padStart(2, '0'); }
  function tick() {
    const d = new Date();
    const s = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
    clocks.forEach((c) => (c.textContent = s));
  }
  tick(); setInterval(tick, 1000);

  // ---- build label (static; no fake runtime counter) -------
  // Intentionally no uptime ticker; the corner label stays a
  // static build string so static/crawled output never shows a
  // zeroed "T+00:00:00".

  // ---- click ripple on buttons -------------------------------
  if (!prm) {
    document.querySelectorAll('.btn').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        const r = btn.getBoundingClientRect();
        const size = Math.max(r.width, r.height) * 1.4;
        const span = document.createElement('span');
        span.className = 'btn__ripple';
        span.style.width = span.style.height = size + 'px';
        span.style.left = (e.clientX - r.left - size / 2) + 'px';
        span.style.top = (e.clientY - r.top - size / 2) + 'px';
        btn.appendChild(span);
        span.addEventListener('animationend', () => span.remove());
      });
    });
  }

  // ---- magnetic hover --------------------------------------
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce) {
    document.querySelectorAll('[data-magnetic]').forEach((el) => {
      const strength = parseFloat(el.getAttribute('data-magnetic')) || 0.2;
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        el.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  // ---- access form -----------------------------------------
  const form = document.querySelector('.form');
  if (form) {
    const input = form.querySelector('input[type="email"]');
    const note = form.querySelector('.form__note');
    const valid = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    // recipient assembled at runtime - never rendered or stored as plain text
    const dest = 'jerry' + String.fromCharCode(64) + ['helicyn', 'com'].join('.');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = input.value.trim();
      note.classList.remove('ok', 'err');
      if (!valid(v)) {
        note.textContent = '// invalid address. check format and retry';
        note.classList.add('err');
        return;
      }
      // privately route the request to the operator
      const roleEl = form.querySelector('input[name="role"]:checked');
      const role = roleEl ? roleEl.value : 'unspecified';
      const subject = encodeURIComponent('Helicyn access request');
      const body = encodeURIComponent('Access request from: ' + v + '\nRole: ' + role);
      window.location.href = 'mailto:' + dest + '?subject=' + subject + '&body=' + body;
      note.textContent = '// request received. secure channel will follow';
      note.classList.add('ok');
      input.value = '';
      input.setAttribute('disabled', 'true');
      form.querySelector('button').setAttribute('disabled', 'true');
    });
    input.addEventListener('input', () => {
      if (note.classList.contains('err')) { note.classList.remove('err'); note.textContent = note.dataset.idle || ''; }
    });
  }
  // ---- footer/portal email links (assembled at runtime, same
  // anti-scrape pattern as the access form) -------------------
  document.querySelectorAll('[data-email-link]').forEach((a) => {
    const dest = 'jerry' + String.fromCharCode(64) + ['helicyn', 'com'].join('.');
    a.href = 'mailto:' + dest;
  });

  // ---- mobile nav toggle -------------------------------------
  const navToggle = document.querySelector('[data-nav-toggle]');
  const navMenu = document.querySelector('[data-nav-menu]');
  if (navToggle && navMenu) {
    const closeNav = () => { navMenu.classList.remove('is-open'); navToggle.setAttribute('aria-expanded', 'false'); };
    const openNav = () => { navMenu.classList.add('is-open'); navToggle.setAttribute('aria-expanded', 'true'); };
    navToggle.addEventListener('click', () => {
      if (navMenu.classList.contains('is-open')) closeNav(); else openNav();
    });
    navMenu.querySelectorAll('a').forEach((a) => a.addEventListener('click', closeNav));
    document.addEventListener('click', (e) => {
      if (!navMenu.classList.contains('is-open')) return;
      if (navMenu.contains(e.target) || navToggle.contains(e.target)) return;
      closeNav();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNav(); });
  }

  // ---- onboarding progress stepper --------------------------
  // Purely visual: highlights the .stepper step matching whichever
  // .formsection is currently most in view. No-ops if the page has
  // no .stepper (every page except /onboarding).
  (function () {
    const steps = Array.from(document.querySelectorAll('.stepper__step'));
    const sections = Array.from(document.querySelectorAll('.formsection'));
    if (!steps.length || !sections.length || !('IntersectionObserver' in window)) return;
    const byId = new Map(steps.map((s) => [s.getAttribute('data-step-for'), s]));
    function setActive(id) {
      steps.forEach((s) => s.classList.remove('is-active'));
      const idx = sections.findIndex((sec) => sec.id === id);
      steps.forEach((s, i) => s.classList.toggle('is-done', i < idx));
      const active = byId.get(id);
      if (active) active.classList.add('is-active');
    }
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (!visible.length) return;
        visible.sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        setActive(visible[0].target.id);
      },
      { rootMargin: '-15% 0px -55% 0px', threshold: [0.1, 0.3, 0.6] }
    );
    sections.forEach((sec) => io.observe(sec));
    setActive(sections[0].id);
  })();

  // ---- thesis status modal ---------------------------------
  const thesisModal = document.getElementById('thesis-modal');
  if (thesisModal) {
    let lastFocus = null;
    const focusable = () => Array.from(thesisModal.querySelectorAll('button'));
    function onKey(e) {
      if (e.key === 'Escape') { closeModal(); return; }
      if (e.key === 'Tab') {
        const f = focusable(); if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    function openModal() {
      lastFocus = document.activeElement;
      thesisModal.hidden = false;
      requestAnimationFrame(() => thesisModal.classList.add('is-open'));
      document.body.style.overflow = 'hidden';
      const f = focusable(); if (f.length) f[0].focus();
      document.addEventListener('keydown', onKey);
    }
    function closeModal() {
      thesisModal.classList.remove('is-open');
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      setTimeout(() => { thesisModal.hidden = true; }, 450);
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    document.querySelectorAll('[data-thesis-open]').forEach((b) => b.addEventListener('click', openModal));
    thesisModal.querySelectorAll('[data-modal-close]').forEach((b) => b.addEventListener('click', closeModal));
  }
})();
