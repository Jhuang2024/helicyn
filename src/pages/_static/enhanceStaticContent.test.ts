import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enhanceStaticContent } from './enhanceStaticContent';

describe('legacy static-content parity', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'scrollTo', { value: vi.fn(), configurable: true });
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
      configurable: true,
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('activates parent-driven nested reveals and preserves formatted counters', () => {
    document.body.innerHTML = `
      <main id="root">
        <div class="compare__grid" data-reveal><ul class="compare__list"><li>Visible row</li></ul></div>
        <a class="cpcta__panel" data-reveal>
          <span class="fill" style="--w:84%"></span>
          <span data-count="1.18">1.18</span>
          <span data-count="87%">87%</span>
          <span data-count="−32%">−32%</span>
          <span data-count="$10.0M">$10.0M</span>
        </a>
      </main>`;
    const root = document.querySelector<HTMLElement>('#root')!;
    const dispose = enhanceStaticContent(root, { navigate: vi.fn(), reduce: true });

    expect(root.querySelector('.compare__grid')).toHaveClass('is-revealing', 'is-visible');
    expect(root.querySelector('.cpcta__panel')).toHaveClass('is-revealing', 'is-visible');
    expect(Array.from(root.querySelectorAll('[data-count]')).map((el) => el.textContent)).toEqual([
      '1.18', '87%', '−32%', '$10.0M',
    ]);

    dispose();
  });

  it('restores the extracted thesis modal controls', () => {
    document.body.innerHTML = `
      <main id="root">
        <button data-thesis-open>Open</button>
        <div id="thesis-modal" hidden><button data-modal-close>Close</button></div>
      </main>`;
    const root = document.querySelector<HTMLElement>('#root')!;
    const dispose = enhanceStaticContent(root, { navigate: vi.fn(), reduce: true });
    const modal = root.querySelector<HTMLElement>('#thesis-modal')!;

    root.querySelector<HTMLElement>('[data-thesis-open]')!.click();
    expect(modal.hidden).toBe(false);
    root.querySelector<HTMLElement>('[data-modal-close]')!.click();

    dispose();
  });
});
