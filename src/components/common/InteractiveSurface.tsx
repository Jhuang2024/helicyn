import { useCallback, useRef, type ElementType, type PointerEvent, type ReactNode } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

interface InteractiveSurfaceProps {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  id?: string;
  role?: string;
  tabIndex?: number;
  onClick?: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  ariaLabel?: string;
  ariaPressed?: boolean;
  ariaExpanded?: boolean;
}

/**
 * A surface with a cursor-tracked spotlight. Writes `--card-x/y` custom
 * properties on pointer move (rAF-throttled, no React rerender), so cards glow
 * under the cursor consistently with the site pointer backdrop. The spotlight
 * layer is CSS-only and never captures pointer events.
 */
export function InteractiveSurface({
  children,
  as: Tag = 'div',
  className,
  id,
  role,
  tabIndex,
  onClick,
  onKeyDown,
  ariaLabel,
  ariaPressed,
  ariaExpanded,
}: InteractiveSurfaceProps) {
  const frame = useRef<number>(0);
  const reduced = usePrefersReducedMotion();

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (reduced) return;
      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        el.style.setProperty('--card-x', x.toFixed(1) + '%');
        el.style.setProperty('--card-y', y.toFixed(1) + '%');
      });
    },
    [reduced],
  );

  return (
    <Tag
      id={id}
      role={role}
      tabIndex={tabIndex}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      aria-expanded={ariaExpanded}
      className={['interactive-surface', className].filter(Boolean).join(' ')}
      onPointerMove={onPointerMove}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {children}
    </Tag>
  );
}
