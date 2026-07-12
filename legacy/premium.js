/* ============================================================
   HELICYN PREMIUM LAYER (behavior)
   Command palette, toasts, confetti, tilt, typewriter, and
   decrypt-in text. Purely additive: no existing form/auth logic
   is touched, so functional behavior elsewhere is unchanged.
   ============================================================ */
(function () {
  const prm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- toast system (shadcn Sonner-style) ---------------------
  const toastViewport = document.createElement('div');
  toastViewport.className = 'ptoast-viewport';
  toastViewport.setAttribute('aria-live', 'polite');
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(toastViewport));

  window.premiumToast = function premiumToast(message, ms) {
    const el = document.createElement('div');
    el.className = 'ptoast';
    el.innerHTML = '<span class="ptoast__dot" aria-hidden="true"></span><span class="ptoast__body"></span>';
    el.querySelector('.ptoast__body').textContent = message;
    toastViewport.appendChild(el);
    const life = ms || 3200;
    setTimeout(() => {
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 260);
    }, life);
  };

  // fire a friendly toast on outbound "email us" links -- purely
  // additive (does not preventDefault, so the mailto: navigation
  // set up by main.js/nav-auth.js still happens exactly as before)
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-email-link]');
    if (link) window.premiumToast('Opening your email client...');
  });

  // ---- confetti burst (magic-ui style, div-based, no canvas) --
  window.premiumConfetti = function premiumConfetti(originEl) {
    if (prm) return;
    const cs = getComputedStyle(document.documentElement);
    const ink = cs.getPropertyValue('--text').trim() || '#f5f6f8';
    const sig = cs.getPropertyValue('--signal').trim() || 'oklch(0.78 0.115 194)';
    const colors = [sig, 'oklch(0.8 0.12 85)', ink, sig];
    const r = originEl ? originEl.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight / 3, width: 0, height: 0 };
    const cx = r.left + r.width / 2;
    const cy = r.top + Math.min(r.height, 40) / 2;
    for (let i = 0; i < 26; i++) {
      const piece = document.createElement('span');
      piece.className = 'pconfetti-piece';
      const angle = Math.random() * Math.PI * 2;
      const dist = 90 + Math.random() * 140;
      piece.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      piece.style.setProperty('--dy', `${Math.sin(angle) * dist - 40}px`);
      piece.style.setProperty('--rot', `${(Math.random() * 720 - 360).toFixed(0)}deg`);
      piece.style.left = cx + 'px';
      piece.style.top = cy + 'px';
      piece.style.background = colors[i % colors.length];
      piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      document.body.appendChild(piece);
      piece.addEventListener('animationend', () => piece.remove());
    }
  };

  // fire confetti automatically the moment a "success" panel
  // becomes visible anywhere on the site (onboarding, careers,
  // login, etc.) -- watches [hidden] flips already driven by the
  // existing auth/form JS, so no other file needs to change.
  const successSelectors = '#successView, .hirecard__already, #signedInView';
  const seen = new WeakSet();
  function checkSuccess(root) {
    (root || document).querySelectorAll(successSelectors).forEach((el) => {
      if (!el.hasAttribute('hidden') && !seen.has(el)) {
        seen.add(el);
        window.premiumConfetti(el);
      }
    });
  }
  if ('MutationObserver' in window) {
    new MutationObserver((muts) => {
      muts.forEach((m) => { if (m.target && m.target.nodeType === 1) checkSuccess(document); });
    }).observe(document.body, { attributes: true, attributeFilter: ['hidden'], subtree: true });
  }

  // ---- command palette (shadcn Command / cmdk) -----------------
  const PAGES = [
    { label: 'Homepage', href: '/', group: 'Navigate' },
    { label: 'Research', href: 'research', group: 'Navigate' },
    { label: 'Read the Report', href: 'report', group: 'Navigate' },
    { label: 'Control Plane demo', href: 'control-plane', group: 'Navigate' },
    { label: 'Founding Partners', href: 'partners', group: 'Navigate' },
    { label: 'Careers / We’re hiring', href: 'careers', group: 'Navigate' },
    { label: 'Patch Notes', href: 'patch-notes', group: 'Navigate' },
    { label: 'Apply as founding partner', href: 'onboarding', group: 'Actions' },
    { label: 'Sign in / create account', href: 'login', group: 'Actions' },
    { label: 'Partner portal', href: 'partner-portal', group: 'Actions' },
    { label: 'Account & profile', href: 'profile', group: 'Actions' },
    { label: 'Terms and Conditions', href: 'terms', group: 'Navigate' },
  ];

  const backdrop = document.createElement('div');
  backdrop.className = 'pcmdk-backdrop';
  backdrop.innerHTML = `
    <div class="pcmdk" role="dialog" aria-modal="true" aria-label="Command menu">
      <div class="pcmdk__input-wrap">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.6"/><path d="M21 21l-4.3-4.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        <input class="pcmdk__input" type="text" placeholder="Jump to a page or action..." aria-label="Search" autocomplete="off" />
        <span class="pcmdk__esc">ESC</span>
      </div>
      <div class="pcmdk__list"></div>
    </div>`;
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(backdrop));

  const input = backdrop.querySelector('.pcmdk__input');
  const list = backdrop.querySelector('.pcmdk__list');
  let activeIdx = 0;
  let filtered = PAGES;

  function renderList() {
    list.innerHTML = '';
    if (!filtered.length) {
      list.innerHTML = '<div class="pcmdk__empty">No matches.</div>';
      return;
    }
    let lastGroup = null;
    filtered.forEach((page, i) => {
      if (page.group !== lastGroup) {
        lastGroup = page.group;
        const label = document.createElement('div');
        label.className = 'pcmdk__group-label';
        label.textContent = page.group;
        list.appendChild(label);
      }
      const item = document.createElement('div');
      item.className = 'pcmdk__item' + (i === activeIdx ? ' is-active' : '');
      item.innerHTML = `<span>${page.label}</span><span class="arr" aria-hidden="true">→</span>`;
      // mousedown (not click) so selection still registers even if a
      // mouseenter-driven highlight update runs between press and release;
      // also avoids ever rebuilding the DOM node the pointer is over,
      // which previously caused a mouseenter/rebuild loop that ate clicks
      item.addEventListener('mousedown', (e) => { e.preventDefault(); go(page); });
      item.addEventListener('mouseenter', () => {
        activeIdx = i;
        list.querySelectorAll('.pcmdk__item').forEach((el, idx) => el.classList.toggle('is-active', idx === i));
      });
      list.appendChild(item);
    });
  }

  function go(page) {
    close();
    window.location.href = page.href;
  }

  function filterPages(q) {
    const query = q.trim().toLowerCase();
    filtered = !query ? PAGES : PAGES.filter((p) => p.label.toLowerCase().includes(query));
    activeIdx = 0;
    renderList();
  }

  function open() {
    backdrop.classList.add('is-open');
    input.value = '';
    filterPages('');
    setTimeout(() => input.focus(), 30);
    document.body.style.overflow = 'hidden';
  }
  function close() {
    backdrop.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  input.addEventListener('input', () => filterPages(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, filtered.length - 1); renderList(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); renderList(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[activeIdx]) go(filtered[activeIdx]); }
    else if (e.key === 'Escape') { close(); }
  });
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-cmdk-open]');
    if (trigger) { e.preventDefault(); open(); }
  });
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (backdrop.classList.contains('is-open')) close(); else open();
    }
  });

  // ---- tilt card (magic-ui 3D tilt on mousemove) ----------------
  if (!prm) {
    document.querySelectorAll('[data-tilt]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `perspective(700px) rotateX(${(-py * 7).toFixed(2)}deg) rotateY(${(px * 9).toFixed(2)}deg) translateZ(0)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  // ---- typewriter (magic-ui Typing Animation) -------------------
  document.querySelectorAll('[data-typewriter]').forEach((el) => {
    const text = el.getAttribute('data-typewriter') || el.textContent;
    if (prm) { el.textContent = text; return; }
    el.textContent = '';
    el.classList.add('ptypewriter');
    let i = 0;
    function typeStep() {
      el.textContent = text.slice(0, i);
      i++;
      if (i <= text.length) setTimeout(typeStep, 34);
      else el.classList.remove('ptypewriter');
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) { io.disconnect(); typeStep(); } });
    }, { threshold: 0.5 });
    io.observe(el);
  });

  // ---- decrypt / scramble text-in (magic-ui Hyper Text) --------
  const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  document.querySelectorAll('[data-decrypt]').forEach((el) => {
    const final = el.textContent;
    if (prm) return;
    function run() {
      let frame = 0;
      const totalFrames = 14;
      const revealAt = final.split('').map((_, i) => Math.floor((i / final.length) * totalFrames * 0.6) + Math.floor(Math.random() * totalFrames * 0.4));
      const timer = setInterval(() => {
        frame++;
        el.textContent = final.split('').map((ch, i) => {
          if (ch === ' ') return ' ';
          return frame >= revealAt[i] ? ch : SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
        }).join('');
        if (frame >= totalFrames + 6) { el.textContent = final; clearInterval(timer); }
      }, 40);
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) { io.disconnect(); run(); } });
    }, { threshold: 0.5 });
    io.observe(el);
  });
})();
