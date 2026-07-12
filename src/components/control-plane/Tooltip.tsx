import { useId, useState } from 'react';

/**
 * Accessible information tooltip. An "i" button toggles a popup on hover/focus
 * and click; the popup is associated via aria-describedby and dismissible with
 * Escape. Definitions are shown as plain text (no color-only meaning).
 */
export function Tooltip({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="cp-tip">
      <button
        type="button"
        className="cp-tip__btn"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      >
        i
      </button>
      {open && (
        <span className="cp-tip__pop" id={id} role="tooltip">
          {text}
        </span>
      )}
    </span>
  );
}
