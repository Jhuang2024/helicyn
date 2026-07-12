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

  // ---- scroll reveals -------------------------------------------------------
  const revealEls = $$('[data-reveal]');
  if (revealEls.length) {
    if (reduce || typeof IntersectionObserver === 'undefined') {
      revealEls.forEach((el) => el.classList.add('is-revealed', 'is-visible'));
    } else {
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              e.target.classList.add('is-revealed', 'is-visible');
              io.unobserve(e.target);
            }
          }
        },
        { threshold: 0.1, rootMargin: '0px 0px -6% 0px' },
      );
      revealEls.forEach((el) => io.observe(el));
      cleanups.push(() => io.disconnect());
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
    const runCount = (el: HTMLElement) => {
      const target = parseFloat(el.getAttribute('data-count') || '0');
      const dp = (el.getAttribute('data-count') || '').includes('.') ? 1 : 0;
      if (reduce) {
        el.textContent = target.toFixed(dp);
        return;
      }
      const dur = 900;
      const t0 = performance.now();
      const step = (t: number) => {
        const p = Math.min((t - t0) / dur, 1);
        const k = 1 - Math.pow(1 - p, 3);
        el.textContent = (target * k).toFixed(dp);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
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
  }

  // ---- typewriter (reveal the label without dropping the text) --------------
  $$('[data-typewriter]').forEach((el) => {
    // Content is already present in markup; add a class the CSS can animate.
    if (!reduce) el.classList.add('is-typed');
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
