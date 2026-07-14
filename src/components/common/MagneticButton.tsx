import { useCallback, useRef, type PointerEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

interface CommonProps {
  children: ReactNode;
  className?: string;
  /** Magnetic pull strength in px. */
  strength?: number;
}

type MagneticButtonProps =
  | (CommonProps & { as: 'link'; to: string; onClick?: () => void })
  | (CommonProps & { as?: 'button'; type?: 'button' | 'submit'; onClick?: () => void; disabled?: boolean });

/**
 * A button/link that eases slightly toward the pointer (magnetic effect) and
 * settles back on leave. Transform is applied directly to the node inside rAF :
 * no rerenders. Disabled under reduced motion. Shared across every route.
 */
export function MagneticButton(props: MagneticButtonProps) {
  const { children, className, strength = 8 } = props;
  const frame = useRef<number>(0);
  const reduced = usePrefersReducedMotion();

  const onMove = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (reduced) return;
      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - (rect.left + rect.width / 2);
      const my = e.clientY - (rect.top + rect.height / 2);
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const dx = (mx / rect.width) * strength;
        const dy = (my / rect.height) * strength;
        el.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)`;
      });
    },
    [reduced, strength],
  );

  const onLeave = useCallback((e: PointerEvent<HTMLElement>) => {
    const el = e.currentTarget;
    if (frame.current) cancelAnimationFrame(frame.current);
    el.style.transform = '';
  }, []);

  const shared = {
    className,
    onPointerMove: onMove,
    onPointerLeave: onLeave,
    'data-magnetic': '',
  };

  if (props.as === 'link') {
    return (
      <Link to={props.to} onClick={props.onClick} {...shared}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type={props.type ?? 'button'}
      onClick={props.onClick}
      disabled={props.disabled}
      {...shared}
    >
      {children}
    </button>
  );
}
