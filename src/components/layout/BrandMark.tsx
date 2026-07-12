/** The Helicyn brand mark (ring + dot), matching the original inline SVG. */
export function BrandMark({ size }: { size?: number }) {
  const style = size ? { width: size, height: size } : undefined;
  return (
    <svg className="brand__mark" viewBox="0 0 18 18" fill="none" aria-hidden="true" style={style}>
      <circle className="ring" cx="9" cy="9" r="7.5" stroke="currentColor" strokeWidth="1" opacity="0.85" />
      <circle className="dot" cx="9" cy="9" r="2" fill="currentColor" />
    </svg>
  );
}
