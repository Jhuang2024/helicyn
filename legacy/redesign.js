/* ============================================================
   HELICYN · REDESIGN LAYER (behavior)
   Additive only — no existing form/auth/scenario logic is
   touched. Provides: nav current-page state, footer system
   block, homepage chapter rail + scrollspy, hero operating-
   surface ticker (simulated, labeled), photo-layer parallax,
   and a cosmetic "recalculating" sweep on the control plane.
   Vanilla. Reduced-motion aware.
   ============================================================ */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---- 1 · nav: mark the current page ---------------------- */
  (function currentNav() {
    var path = location.pathname.replace(/\/index\.html?$/, '/').replace(/\.html$/, '');
    var page = path.split('/').pop() || '';
    $$('.nav__right .navlink').forEach(function (a) {
      var href = (a.getAttribute('href') || '').replace(/\.html$/, '');
      if (!href || href.charAt(0) === '#') return;
      if (href === page || (href === '/' && page === '')) a.setAttribute('aria-current', 'page');
    });
  })();

  /* ---- 2 · footer: compact system-status block -------------
     Injected on every page so the ten footers stay in sync.
     Content mirrors labels already in the static footer
     (research preview build string) — no new claims. */
  (function footerSys() {
    var base = $('.footer__base');
    if (!base || $('.footer__sys')) return;
    var sys = document.createElement('div');
    sys.className = 'footer__sys';
    sys.innerHTML =
      '<span class="sysmark" aria-hidden="true"><svg viewBox="0 0 18 18" fill="none">' +
      '<circle class="ring" cx="9" cy="9" r="7.5" stroke="currentColor" stroke-width="1" opacity="0.85"></circle>' +
      '<circle class="dot" cx="9" cy="9" r="2" fill="currentColor"></circle></svg></span>' +
      '<span class="sysitem"><span class="k">Status</span><span class="v">Research preview</span></span>' +
      '<span class="sysitem"><span class="k">Build</span><span class="v">v1.0.1 &middot; 2026.07</span></span>' +
      '<span class="sysitem"><span class="k">Clock</span><span class="v" data-clock>00:00:00 UTC</span></span>';
    base.parentNode.insertBefore(sys, base);
    // drive the injected clock (main.js grabbed its [data-clock] list earlier)
    var v = sys.querySelector('[data-clock]');
    function pad(n) { return String(n).padStart(2, '0'); }
    function tick() {
      var d = new Date();
      v.textContent = pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()) + ' UTC';
    }
    tick();
    setInterval(tick, 1000);
  })();

  /* ---- 3 · chapter rail + scrollspy (homepage) -------------- */
  (function chapters() {
    var secs = $$('[data-chapter]');
    if (secs.length < 2) return;
    var rail = document.createElement('nav');
    rail.className = 'chapterail';
    rail.setAttribute('aria-label', 'Page chapters');
    var items = secs.map(function (sec, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chapterail__item';
      btn.innerHTML = '<span class="chapterail__dot" aria-hidden="true"></span><span class="chapterail__lbl">' +
        String(i + 1).padStart(2, '0') + ' &middot; ' + sec.getAttribute('data-chapter') + '</span>';
      btn.addEventListener('click', function () {
        sec.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      });
      rail.appendChild(btn);
      return btn;
    });
    document.body.appendChild(rail);

    function spy() {
      var vh = window.innerHeight || document.documentElement.clientHeight;
      var active = -1;
      secs.forEach(function (sec, i) {
        var r = sec.getBoundingClientRect();
        if (r.top < vh * 0.45) active = i;
      });
      items.forEach(function (b, i) { b.classList.toggle('is-active', i === active); });
      rail.classList.toggle('is-shown', (window.scrollY || 0) > vh * 0.6);
    }
    var queued = false;
    function onScroll() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; spy(); });
    }
    document.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    spy();
  })();

  /* ---- 5 · physical layer parallax --------------------------
     Slow scroll-linked drift on the editorial photo band. */
  (function parallax() {
    if (reduce) return;
    var imgs = $$('.physband__img');
    if (!imgs.length) return;
    var queued = false;
    function paint() {
      queued = false;
      var vh = window.innerHeight || document.documentElement.clientHeight;
      imgs.forEach(function (img) {
        var r = img.parentElement.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) return;
        var p = (r.top + r.height / 2 - vh / 2) / vh; // -0.5 .. 0.5
        img.style.setProperty('--par', (p * -26).toFixed(1) + 'px');
      });
    }
    document.addEventListener('scroll', function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(paint);
    }, { passive: true });
    paint();
  })();

  /* ---- 6 · control plane: coordinated transition sweep ------
     Cosmetic only. When the operator picks a new scenario the
     affected modules get a single light sweep; scenario.js owns
     all real state. */
  (function cpTransitions() {
    var sel = $('#cp-scenario');
    if (!sel) return;
    var timer = null;
    function sweep() {
      document.body.classList.remove('cp-recalc');
      void document.body.offsetWidth;
      document.body.classList.add('cp-recalc');
      clearTimeout(timer);
      timer = setTimeout(function () { document.body.classList.remove('cp-recalc'); }, 1000);
    }
    $$('.cp-select__menu [role="option"], .cp-select__menu li', sel).forEach(function (opt) {
      opt.addEventListener('click', sweep);
    });
    // run button also recomputes downstream panels
    var run = $('#cp-run');
    if (run) run.addEventListener('click', sweep);
  })();
})();
