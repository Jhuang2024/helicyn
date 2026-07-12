/**
 * Progressive enhancement for ported static page bodies.
 *
 * The marketing/legal/document pages keep their original, verbatim markup
 * (rendered from a legacy HTML fragment). This module re-attaches every in-page
 * interaction the legacy scripts provided — scroll reveals, the architecture-
 * stack layer explainer, magnetic buttons, 3D tilt, count-up, typewriter /
 * decrypt text, floating tooltips, internal-link SPA routing, the runtime email
 * assembly, and the access/contact form — scoped to a root element and fully
 * torn down on cleanup. It runs once per mounted static page.
 *
 * Site-wide effects (the pointer backdrop, theme, nav) are owned by React
 * components in the shell and are intentionally NOT duplicated here.
 */

type NavigateFn = (path: string) => void;

interface EnhanceOptions {
  navigate: NavigateFn;
  reduce: boolean;
}

const ARCH_ORDER = ['workload', 'compute', 'region', 'facility', 'power', 'thermal', 'cooling', 'operator'];
const ARCH_DATA: Record<string, { tag: string; text: string }> = {
  workload: {
    tag: 'Not scheduler-only',
    text: 'Training, inference, and batch jobs enter with priority, SLA flexibility, and deadline constraints already attached. This is where a coordination decision starts.',
  },
  compute: {
    tag: 'GPU utilization',
    text: 'GPU clusters translate workload demand into utilization, thermal load, and power draw: the first physical cost of a placement decision.',
  },
  region: {
    tag: 'Regional capacity',
    text: 'Grid carbon intensity, power price, and spare capacity vary by region. The same job costs and emits differently depending on where it runs.',
  },
  facility: {
    tag: 'Facility limits',
    text: 'Each data center holds its own cooling and power ceiling. Regional headroom means nothing if the facility itself is constrained.',
  },
  power: {
    tag: 'Price exposure',
    text: 'Electricity price and availability set how much discretionary compute can run right now, and how much should wait for a cheaper window.',
  },
  thermal: {
    tag: 'Thermal headroom',
    text: 'Rack-level heat and headroom determine how much load a zone can safely absorb before cooling becomes the binding constraint.',
  },
  cooling: {
    tag: 'Not cooling-only',
    text: 'Cooling is a downstream effect, not the starting point. Setpoints and airflow respond to thermal load inside facility limits. Helicyn is not a cooling-only optimizer.',
  },
  operator: {
    tag: 'Operator-in-the-loop',
    text: 'Every recommended action is reviewed and approved by an operator before it changes anything. Helicyn recommends; it does not act alone.',
  },
};

export function enhanceStaticContent(root: HTMLElement, options: EnhanceOptions): () => void {
  const { navigate, reduce } = options;
  const cleanups: Array<() => void> = [];
  const $$ = <T extends Element = HTMLElement>(sel: string) =>
    Array.from(root.querySelectorAll<T>(sel));

  // ---- reactive hero field -------------------------------------------------
  // The canvas markup survived the migration, but hero.js did not. Keep the
  // original visual idea (a responsive signal field) while owning every
  // listener and animation frame from this route's lifecycle.
  const canvas = root.querySelector<HTMLCanvasElement>('#field');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      let width = 0;
      let height = 0;
      let raf = 0;
      let pointerX = -10_000;
      let pointerY = -10_000;
      let active = false;
      let points: Array<{ x: number; y: number; phase: number }> = [];

      const resize = () => {
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        width = rect.width;
        height = rect.height;
        canvas.width = Math.max(1, Math.round(width * dpr));
        canvas.height = Math.max(1, Math.round(height * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        points = [];
        for (let y = 25; y < height + 25; y += 50) {
          for (let x = 25; x < width + 25; x += 50) points.push({ x, y, phase: x * 0.011 + y * 0.017 });
        }
      };
      const color = () => getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#e8eef6';
      const signal = () => getComputedStyle(document.documentElement).getPropertyValue('--signal').trim() || '#46cecd';
      const draw = (now: number) => {
        ctx.clearRect(0, 0, width, height);
        const t = now / 1000;
        for (const p of points) {
          const dx = p.x - pointerX;
          const dy = p.y - pointerY;
          const dist = Math.hypot(dx, dy);
          const influence = active ? Math.max(0, 1 - dist / 155) : 0;
          const push = influence * influence * 14;
          const inv = dist || 1;
          const x = p.x + (dx / inv) * push;
          const y = p.y + (dy / inv) * push + (reduce ? 0 : Math.sin(t * 0.55 + p.phase) * 1.1);
          ctx.globalAlpha = 0.13 + influence * 0.55;
          ctx.fillStyle = influence > 0.72 ? signal() : color();
          ctx.beginPath();
          ctx.arc(x, y, 0.9 + influence * 1.3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        if (!reduce || active) raf = requestAnimationFrame(draw);
      };
      const move = (event: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        pointerX = event.clientX - rect.left;
        pointerY = event.clientY - rect.top;
        active = true;
        if (reduce && !raf) raf = requestAnimationFrame(draw);
      };
      const leave = () => { active = false; };
      resize();
      raf = requestAnimationFrame(draw);
      const observer = new ResizeObserver(resize);
      observer.observe(canvas);
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerleave', leave);
      cleanups.push(() => {
        cancelAnimationFrame(raf);
        observer.disconnect();
        canvas.removeEventListener('pointermove', move);
        canvas.removeEventListener('pointerleave', leave);
      });
    }
  }

  // ---- scroll reveals -------------------------------------------------------
  // Uses getBoundingClientRect on scroll (the approach the original site used)
  // rather than IntersectionObserver, which proved unreliable for the
  // clip-path/will-change reveal elements. Content is therefore never left
  // hidden: anything in or above the viewport reveals immediately.
  const revealEls = $$('[data-reveal]');
  if (revealEls.length) {
    if (reduce) {
      revealEls.forEach((el) => el.classList.add('is-revealing', 'is-revealed', 'is-visible'));
    } else {
      let ticking = false;
      const check = () => {
        ticking = false;
        const vh = window.innerHeight || document.documentElement.clientHeight;
        for (const el of revealEls) {
          if (el.classList.contains('is-revealed')) continue;
          const r = el.getBoundingClientRect();
          if (r.top < vh * 0.92 && r.bottom > -80) el.classList.add('is-revealing', 'is-revealed', 'is-visible');
        }
      };
      const onScroll = () => {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(check);
        }
      };
      check();
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll);
      // Safety: reveal everything shortly after load so nothing can stay hidden.
      const safety = window.setTimeout(() => revealEls.forEach((el) => el.classList.add('is-revealing', 'is-revealed', 'is-visible')), 2500);
      cleanups.push(() => {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
        window.clearTimeout(safety);
      });
    }
  }

  // ---- architecture-stack layer explainer -----------------------------------
  const archBody = root.querySelector<HTMLElement>('.archstack__body');
  if (archBody) {
    const buttons = Array.from(archBody.querySelectorAll<HTMLElement>('.archstack__layer'));
    const idxEl = archBody.querySelector<HTMLElement>('[data-archstack-idx]');
    const textEl = archBody.querySelector<HTMLElement>('[data-archstack-text]');
    const tagEl = archBody.querySelector<HTMLElement>('[data-archstack-tag]');
    let swapTimer = 0;
    const setActive = (id: string | undefined) => {
      if (!id) return;
      const idx = ARCH_ORDER.indexOf(id);
      if (idx < 0) return;
      buttons.forEach((b) => {
        const bi = ARCH_ORDER.indexOf(b.dataset.layer ?? '');
        const active = b.dataset.layer === id;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', String(active));
        b.classList.toggle('is-related', !active && Math.abs(bi - idx) === 1);
      });
      const d = ARCH_DATA[id];
      if (!d) return;
      if (idxEl) idxEl.textContent = `${String(idx + 1).padStart(2, '0')} / ${String(ARCH_ORDER.length).padStart(2, '0')}`;
      if (tagEl) tagEl.textContent = d.tag;
      if (textEl) {
        window.clearTimeout(swapTimer);
        if (reduce) {
          textEl.textContent = d.text;
        } else {
          textEl.classList.add('is-swapping');
          swapTimer = window.setTimeout(() => {
            textEl.textContent = d.text;
            textEl.classList.remove('is-swapping');
          }, 140);
        }
      }
    };
    buttons.forEach((b) => {
      const onClick = () => setActive(b.dataset.layer);
      const onEnter = () => setActive(b.dataset.layer);
      b.addEventListener('click', onClick);
      b.addEventListener('pointerenter', onEnter);
      b.addEventListener('focus', onEnter);
      cleanups.push(() => {
        b.removeEventListener('click', onClick);
        b.removeEventListener('pointerenter', onEnter);
        b.removeEventListener('focus', onEnter);
      });
    });
    const list = archBody.querySelector<HTMLElement>('.archstack__layers');
    if (list) {
      const onKey = (e: KeyboardEvent) => {
        const cur = buttons.findIndex((b) => b.classList.contains('is-active'));
        let next = cur;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = Math.min(buttons.length - 1, cur + 1);
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = Math.max(0, cur - 1);
        else return;
        e.preventDefault();
        buttons[next]?.focus();
        setActive(buttons[next]?.dataset.layer);
      };
      list.addEventListener('keydown', onKey);
      cleanups.push(() => list.removeEventListener('keydown', onKey));
    }
    cleanups.push(() => window.clearTimeout(swapTimer));
  }

  // ---- magnetic buttons -----------------------------------------------------
  if (!reduce) {
    $$('[data-magnetic]').forEach((el) => {
      let raf = 0;
      const onMove = (e: PointerEvent) => {
        const rect = el.getBoundingClientRect();
        const mx = e.clientX - (rect.left + rect.width / 2);
        const my = e.clientY - (rect.top + rect.height / 2);
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          el.style.transform = `translate(${(mx * 0.15).toFixed(2)}px, ${(my * 0.15).toFixed(2)}px)`;
        });
      };
      const onLeave = () => {
        if (raf) cancelAnimationFrame(raf);
        el.style.transform = '';
      };
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerleave', onLeave);
      cleanups.push(() => {
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerleave', onLeave);
        if (raf) cancelAnimationFrame(raf);
      });
    });

    // ---- 3D tilt ------------------------------------------------------------
    $$('[data-tilt]').forEach((el) => {
      let raf = 0;
      const onMove = (e: PointerEvent) => {
        const rect = el.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          el.style.setProperty('--tiltx', (py * -6).toFixed(2) + 'deg');
          el.style.setProperty('--tilty', (px * 6).toFixed(2) + 'deg');
          el.style.setProperty('--cx', (px * 100 + 50).toFixed(1) + '%');
          el.style.setProperty('--cy', (py * 100 + 50).toFixed(1) + '%');
        });
      };
      const onLeave = () => {
        if (raf) cancelAnimationFrame(raf);
        el.style.setProperty('--tiltx', '0deg');
        el.style.setProperty('--tilty', '0deg');
      };
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerleave', onLeave);
      cleanups.push(() => {
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerleave', onLeave);
        if (raf) cancelAnimationFrame(raf);
      });
    });
  }

  // ---- count-up -------------------------------------------------------------
  const counters = $$('[data-count]');
  if (counters.length) {
    const animations = new Set<number>();
    const runCount = (el: HTMLElement) => {
      const raw = el.getAttribute('data-count') || '0';
      const match = raw.match(/^([^\d−-]*)([-−]?)([\d.]+)(.*)$/);
      if (!match) return;
      const [, prefix, sign, digits, suffix] = match;
      const target = Number.parseFloat(digits!);
      const dp = (digits!.split('.')[1] || '').length;
      const render = (value: number) => {
        el.textContent = `${prefix}${sign}${value.toFixed(dp)}${suffix}`;
      };
      if (reduce) {
        render(target);
        return;
      }
      const dur = 900;
      const t0 = performance.now();
      const step = (t: number) => {
        const p = Math.min((t - t0) / dur, 1);
        const k = 1 - Math.pow(1 - p, 3);
        render(target * k);
        if (p < 1) {
          const id = requestAnimationFrame(step);
          animations.add(id);
        }
      };
      const id = requestAnimationFrame(step);
      animations.add(id);
    };
    if (typeof IntersectionObserver === 'undefined') {
      counters.forEach(runCount);
    } else {
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              runCount(e.target as HTMLElement);
              io.unobserve(e.target);
            }
          }
        },
        { threshold: 0.5 },
      );
      counters.forEach((el) => io.observe(el));
      cleanups.push(() => io.disconnect());
    }
    cleanups.push(() => animations.forEach(cancelAnimationFrame));
  }

  // ---- live clocks in ported page bodies ----------------------------------
  const clocks = $$<HTMLElement>('[data-clock]');
  if (clocks.length) {
    const tick = () => {
      const date = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const value = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`;
      clocks.forEach((clock) => { clock.textContent = value; });
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    cleanups.push(() => window.clearInterval(timer));
  }

  // ---- sequential diagrams -------------------------------------------------
  const installWalker = (items: HTMLElement[], interval: number) => {
    if (items.length < 2) return;
    let index = 0;
    let paused = false;
    const paint = (next: number) => items.forEach((item, i) => item.classList.toggle('is-active', i === next));
    paint(0);
    items.forEach((item, i) => {
      const enter = () => { paused = true; index = i; paint(i); };
      const leave = () => { paused = false; };
      item.addEventListener('pointerenter', enter);
      item.addEventListener('pointerleave', leave);
      cleanups.push(() => {
        item.removeEventListener('pointerenter', enter);
        item.removeEventListener('pointerleave', leave);
      });
    });
    if (reduce) return;
    const timer = window.setInterval(() => {
      const bounds = items[0]!.parentElement?.getBoundingClientRect();
      if (paused || !bounds || bounds.top > innerHeight * 0.9 || bounds.bottom < innerHeight * 0.1) return;
      index = (index + 1) % items.length;
      paint(index);
    }, interval);
    cleanups.push(() => window.clearInterval(timer));
  };
  installWalker($$('.loop__step'), 1300);
  installWalker($$('.cpflow__step'), 1050);
  installWalker($$('.cp-hier__step'), 950);

  // ---- paired comparison + causal-chain hover states -----------------------
  const compareCols = $$('.compare__col');
  if (compareCols.length === 2) {
    const left = Array.from(compareCols[0]!.querySelectorAll<HTMLElement>('.compare__list li'));
    const right = Array.from(compareCols[1]!.querySelectorAll<HTMLElement>('.compare__list li'));
    for (let i = 0; i < Math.min(left.length, right.length); i++) {
      for (const row of [left[i]!, right[i]!]) {
        const enter = () => { left[i]?.classList.add('is-linked'); right[i]?.classList.add('is-linked'); };
        const leave = () => { left[i]?.classList.remove('is-linked'); right[i]?.classList.remove('is-linked'); };
        row.addEventListener('pointerenter', enter);
        row.addEventListener('pointerleave', leave);
        cleanups.push(() => { row.removeEventListener('pointerenter', enter); row.removeEventListener('pointerleave', leave); });
      }
    }
  }
  const causal = $$('.cp-demolist li');
  causal.forEach((item, i) => {
    const enter = () => causal.forEach((node, k) => node.classList.toggle('is-lit', k <= i));
    const leave = () => causal.forEach((node) => node.classList.remove('is-lit'));
    item.addEventListener('pointerenter', enter);
    item.addEventListener('pointerleave', leave);
    cleanups.push(() => { item.removeEventListener('pointerenter', enter); item.removeEventListener('pointerleave', leave); });
  });

  // ---- chapter rail / scrollspy --------------------------------------------
  const chapters = $$<HTMLElement>('[data-chapter]');
  if (chapters.length > 1) {
    const rail = document.createElement('nav');
    rail.className = 'chapterail';
    rail.setAttribute('aria-label', 'Page chapters');
    const buttons = chapters.map((section, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chapterail__item';
      button.innerHTML = `<span class="chapterail__dot" aria-hidden="true"></span><span class="chapterail__lbl">${String(i + 1).padStart(2, '0')} · ${section.dataset.chapter ?? ''}</span>`;
      button.addEventListener('click', () => section.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }));
      rail.appendChild(button);
      return button;
    });
    document.body.appendChild(rail);
    let queued = false;
    const update = () => {
      queued = false;
      let current = -1;
      chapters.forEach((section, i) => { if (section.getBoundingClientRect().top < innerHeight * 0.45) current = i; });
      buttons.forEach((button, i) => button.classList.toggle('is-active', i === current));
      rail.classList.toggle('is-shown', scrollY > innerHeight * 0.6);
    };
    const onViewport = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
    update();
    window.addEventListener('scroll', onViewport, { passive: true });
    window.addEventListener('resize', onViewport);
    cleanups.push(() => {
      window.removeEventListener('scroll', onViewport);
      window.removeEventListener('resize', onViewport);
      rail.remove();
    });
  }

  // ---- editorial image parallax --------------------------------------------
  if (!reduce) {
    const images = $$<HTMLElement>('.physband__img');
    if (images.length) {
      let queued = false;
      const paint = () => {
        queued = false;
        images.forEach((img) => {
          const bounds = img.parentElement?.getBoundingClientRect();
          if (!bounds || bounds.bottom < 0 || bounds.top > innerHeight) return;
          const progress = (bounds.top + bounds.height / 2 - innerHeight / 2) / innerHeight;
          img.style.setProperty('--par', `${(progress * -26).toFixed(1)}px`);
        });
      };
      const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(paint); } };
      paint();
      window.addEventListener('scroll', onScroll, { passive: true });
      cleanups.push(() => window.removeEventListener('scroll', onScroll));
    }
  }

  // ---- card spotlights ------------------------------------------------------
  if (!reduce && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const surfaces = $$('.demo-metric, .demo-region, .demo-rec, .cp-lifecell, .cp-rnode, .wl-staged__card, .demo-panel, .cp-queue__list li, .cp-assume, .archstack__panel, .compare__col, .cpcta__panel, .cap, .rolecard, .stagecard, .portalcard, .benefitcard, .signalboard__tile, .enginediagram__step, .patchcard');
    surfaces.forEach((surface) => {
      const move = (event: PointerEvent) => {
        const bounds = surface.getBoundingClientRect();
        surface.style.setProperty('--cx', `${(((event.clientX - bounds.left) / bounds.width) * 100).toFixed(1)}%`);
        surface.style.setProperty('--cy', `${(((event.clientY - bounds.top) / bounds.height) * 100).toFixed(1)}%`);
      };
      surface.addEventListener('pointermove', move);
      cleanups.push(() => surface.removeEventListener('pointermove', move));
    });
  }

  // ---- typewriter + decrypt -------------------------------------------------
  $$('[data-typewriter]').forEach((el) => {
    // Content is already present in markup; add a class the CSS can animate.
    if (!reduce) el.classList.add('is-typed');
  });
  $$<HTMLElement>('[data-decrypt]').forEach((el) => {
    if (reduce || el.dataset.enhancedDecrypt === 'true') return;
    el.dataset.enhancedDecrypt = 'true';
    const finalText = el.textContent ?? '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789·/';
    let frame = 0;
    const timer = window.setInterval(() => {
      const revealed = Math.floor(frame / 2);
      el.textContent = Array.from(finalText).map((ch, i) => (ch === ' ' || i < revealed ? ch : chars[(i + frame * 7) % chars.length])).join('');
      frame++;
      if (revealed >= finalText.length) { el.textContent = finalText; window.clearInterval(timer); }
    }, 28);
    cleanups.push(() => { window.clearInterval(timer); el.textContent = finalText; });
  });

  // ---- thesis-status modal -------------------------------------------------
  const modal = root.querySelector<HTMLElement>('#thesis-modal');
  if (modal) {
    let lastFocus: HTMLElement | null = null;
    let closeTimer = 0;
    const focusable = () => Array.from(modal.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])'));
    const close = () => {
      modal.classList.remove('is-open');
      document.body.style.overflow = '';
      window.clearTimeout(closeTimer);
      closeTimer = window.setTimeout(() => { modal.hidden = true; }, reduce ? 0 : 450);
      lastFocus?.focus();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { close(); return; }
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const open = () => {
      lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      window.clearTimeout(closeTimer);
      modal.hidden = false;
      requestAnimationFrame(() => modal.classList.add('is-open'));
      document.body.style.overflow = 'hidden';
      focusable()[0]?.focus();
    };
    const openers = $$<HTMLElement>('[data-thesis-open]');
    const closers = Array.from(modal.querySelectorAll<HTMLElement>('[data-modal-close]'));
    openers.forEach((button) => button.addEventListener('click', open));
    closers.forEach((button) => button.addEventListener('click', close));
    document.addEventListener('keydown', onKey);
    cleanups.push(() => {
      window.clearTimeout(closeTimer);
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      openers.forEach((button) => button.removeEventListener('click', open));
      closers.forEach((button) => button.removeEventListener('click', close));
    });
  }

  // ---- button ripple -------------------------------------------------------
  if (!reduce) {
    $$<HTMLElement>('.btn, .btn-ghost, .nav__cta').forEach((button) => {
      const ripple = (event: PointerEvent) => {
        const bounds = button.getBoundingClientRect();
        const dot = document.createElement('span');
        dot.className = 'ripple';
        const size = Math.max(bounds.width, bounds.height) * 1.35;
        Object.assign(dot.style, {
          width: `${size}px`, height: `${size}px`,
          left: `${event.clientX - bounds.left - size / 2}px`,
          top: `${event.clientY - bounds.top - size / 2}px`,
        });
        button.appendChild(dot);
        window.setTimeout(() => dot.remove(), 650);
      };
      button.addEventListener('pointerdown', ripple);
      cleanups.push(() => button.removeEventListener('pointerdown', ripple));
    });
  }

  // ---- back to top ---------------------------------------------------------
  const backToTop = document.createElement('button');
  backToTop.type = 'button';
  backToTop.className = 'backtotop';
  backToTop.setAttribute('aria-label', 'Back to top');
  backToTop.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 15l6-6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  document.body.appendChild(backToTop);
  const updateBackToTop = () => backToTop.classList.toggle('is-visible', window.scrollY > 480);
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  updateBackToTop();
  window.addEventListener('scroll', updateBackToTop, { passive: true });
  backToTop.addEventListener('click', scrollToTop);
  cleanups.push(() => {
    window.removeEventListener('scroll', updateBackToTop);
    backToTop.removeEventListener('click', scrollToTop);
    backToTop.remove();
  });

  // ---- internal-link SPA routing --------------------------------------------
  const onClick = (e: MouseEvent) => {
    const anchor = (e.target as HTMLElement).closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href) return;
    if (anchor.target === '_blank' || href.startsWith('http') || href.startsWith('mailto:')) return;
    if (href.startsWith('#')) return; // let anchor scrolling behave natively
    e.preventDefault();
    const path = href.startsWith('/') ? href : '/' + href;
    navigate(path);
  };
  root.addEventListener('click', onClick);
  cleanups.push(() => root.removeEventListener('click', onClick));

  // ---- runtime email assembly (anti-scrape) ---------------------------------
  const dest = 'jerry' + String.fromCharCode(64) + ['helicyn', 'com'].join('.');
  $$('[data-email-link]').forEach((a) => {
    (a as HTMLAnchorElement).href = 'mailto:' + dest;
  });

  // ---- access / contact form (home #access) ---------------------------------
  const form = root.querySelector<HTMLFormElement>('form[data-access-form], #access form, .accessform');
  if (form) {
    const input = form.querySelector<HTMLInputElement>('input[type="email"], input[name="email"]');
    const note = form.querySelector<HTMLElement>('[data-note], .accessform__note, .form-note');
    const onSubmit = (e: SubmitEvent) => {
      e.preventDefault();
      const v = (input?.value ?? '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
        if (note) {
          note.textContent = '// enter a valid email address';
          note.classList.add('err');
        }
        return;
      }
      const roleEl = form.querySelector<HTMLInputElement>('input[name="role"]:checked');
      const role = roleEl ? roleEl.value : 'unspecified';
      const subject = encodeURIComponent('Helicyn access request');
      const body = encodeURIComponent('Access request from: ' + v + '\nRole: ' + role);
      window.location.href = 'mailto:' + dest + '?subject=' + subject + '&body=' + body;
      if (note) {
        note.textContent = '// request received. secure channel will follow';
        note.classList.remove('err');
        note.classList.add('ok');
      }
      if (input) {
        input.value = '';
        input.setAttribute('disabled', 'true');
      }
      form.querySelector('button')?.setAttribute('disabled', 'true');
    };
    form.addEventListener('submit', onSubmit);
    cleanups.push(() => form.removeEventListener('submit', onSubmit));
  }

  // ---- patch-notes filter tabs ----------------------------------------------
  const patchTabs = root.querySelector<HTMLElement>('#patchFilterTabs');
  if (patchTabs) {
    const tabButtons = Array.from(patchTabs.querySelectorAll<HTMLButtonElement>('[data-filter-tag]'));
    const cards = $$('.patchcard');
    const onTab = (btn: HTMLButtonElement) => {
      const tag = btn.getAttribute('data-filter-tag') ?? 'all';
      tabButtons.forEach((b) => b.classList.toggle('is-active', b === btn));
      cards.forEach((c) => {
        const match = tag === 'all' || c.getAttribute('data-tag') === tag;
        (c as HTMLElement).style.display = match ? '' : 'none';
      });
    };
    tabButtons.forEach((btn) => {
      const handler = () => onTab(btn);
      btn.addEventListener('click', handler);
      cleanups.push(() => btn.removeEventListener('click', handler));
    });
  }

  return () => {
    for (const c of cleanups) c();
  };
}
