/* ============================================================
   HELICYN — interactions
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

  // ---- reveal on enter (rAF tween — robust to throttling) --
  const prm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const revealEls = Array.from(document.querySelectorAll('[data-reveal]'));
  const easeOutExpo = (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));
  function tween(el) {
    if (prm) { el.style.opacity = '1'; el.style.transform = 'none'; el.classList.add('is-visible'); return; }
    const delay = (parseFloat(el.style.getPropertyValue('--i')) || 0) * 90;
    const dur = 900;
    let start = null;
    function step(t) {
      if (start === null) start = t;
      const e = t - start - delay;
      if (e < 0) { requestAnimationFrame(step); return; }
      const p = Math.min(1, e / dur);
      const k = easeOutExpo(p);
      el.style.opacity = String(k);
      el.style.transform = `translateY(${(1 - k) * 22}px)`;
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

  // ---- live UTC clock --------------------------------------
  const clocks = document.querySelectorAll('[data-clock]');
  function pad(n) { return String(n).padStart(2, '0'); }
  function tick() {
    const d = new Date();
    const s = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
    clocks.forEach((c) => (c.textContent = s));
  }
  tick(); setInterval(tick, 1000);

  // ---- uptime / session counter ----------------------------
  const up = document.querySelector('[data-uptime]');
  if (up) {
    const start = Date.now();
    setInterval(() => {
      const s = Math.floor((Date.now() - start) / 1000);
      up.textContent = `T+${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
    }, 1000);
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
    const input = form.querySelector('input');
    const note = form.querySelector('.form__note');
    const valid = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    // recipient assembled at runtime — never rendered or stored as plain text
    const dest = ['jerryhuang', 'hjr'].join('.') + String.fromCharCode(64) + ['gmail', 'com'].join('.');
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
      const subject = encodeURIComponent('Helicyn access request');
      const body = encodeURIComponent('Access request from: ' + v);
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
})();
