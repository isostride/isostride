/** The mark: a prism on a gradient tile, a beam entering and leaving it split in three. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" style={{ width: size, height: size }}>
      <defs>
        <linearGradient id="brand-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--series-2)" />
        </linearGradient>
      </defs>
      <rect width="28" height="28" rx="8" fill="url(#brand-g)" />
      <path d="M9 19.5 14 8.5l5 11z" fill="none" stroke="var(--on-series)" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M2.5 15h7" stroke="var(--on-series)" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M18.5 13.5l7-3M18.5 16h7M18.5 18.5l7 3" stroke="var(--on-series)" strokeWidth="1.5" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
}
