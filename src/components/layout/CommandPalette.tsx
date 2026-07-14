import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface Command {
  label: string;
  path: string;
  hint: string;
}

const COMMANDS: Command[] = [
  { label: 'Home', path: '/', hint: 'Overview' },
  { label: 'Research', path: '/research', hint: 'Thesis summary' },
  { label: 'Technical Report', path: '/report', hint: 'Full thesis' },
  { label: 'Patch Notes', path: '/patch-notes', hint: 'Changelog' },
  { label: 'Founding Partners', path: '/partners', hint: 'Program' },
  { label: 'Careers', path: '/careers', hint: "We're hiring" },
  { label: 'Control Plane', path: '/control-plane', hint: 'Live simulation' },
  { label: 'Apply as partner', path: '/onboarding', hint: 'Application' },
  { label: 'Login', path: '/login', hint: 'Partner access' },
  { label: 'Terms and Conditions', path: '/terms', hint: 'Legal' },
];

/**
 * Command palette (Ctrl/Cmd-K) for keyboard navigation. Fully functional: it
 * filters routes and navigates on selection, preserving the legacy search
 * affordance rather than leaving a dead button.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter((c) => c.label.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q));
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      // Focus after paint.
      const id = window.setTimeout(() => inputRef.current?.focus(), 20);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <div
      className="cmdk-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cmdk-panel">
        <input
          ref={inputRef}
          className="cmdk-input"
          type="text"
          placeholder="Search pages…"
          value={query}
          aria-label="Search pages"
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const target = results[active];
              if (target) go(target.path);
            }
          }}
        />
        <ul className="cmdk-list" role="listbox" aria-label="Pages">
          {results.map((c, i) => (
            <li key={c.path}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                className={'cmdk-item' + (i === active ? ' is-active' : '')}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(c.path)}
              >
                <span className="cmdk-item__label">{c.label}</span>
                <span className="cmdk-item__hint mono">{c.hint}</span>
              </button>
            </li>
          ))}
          {results.length === 0 && <li className="cmdk-empty mono">No matches</li>}
        </ul>
      </div>
    </div>
  );
}
