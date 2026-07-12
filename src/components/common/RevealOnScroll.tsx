import { type ElementType, type ReactNode } from 'react';
import { useReveal } from '@/hooks/useReveal';

interface RevealOnScrollProps {
  children: ReactNode;
  /** Stagger index → CSS `--i`, matching the legacy reveal cadence. */
  index?: number;
  /** Render as a different element (default div). */
  as?: ElementType;
  className?: string;
  /** Mark as a display heading so the descender-safe rules apply. */
  heading?: boolean;
  id?: string;
}

/**
 * Shared scroll-reveal wrapper. Uses opacity + translate only (never clips
 * overflow), so it cannot shear heading descenders. Honors reduced motion via
 * CSS. Used across every route for consistent entrance animation.
 */
export function RevealOnScroll({
  children,
  index = 0,
  as: Tag = 'div',
  className,
  heading = false,
  id,
}: RevealOnScrollProps) {
  const ref = useReveal<HTMLElement>();
  const classes = ['reveal', heading ? 'reveal-heading' : '', className].filter(Boolean).join(' ');
  return (
    <Tag
      ref={ref}
      id={id}
      data-reveal=""
      className={classes || undefined}
      style={{ ['--i' as string]: index }}
    >
      {children}
    </Tag>
  );
}
