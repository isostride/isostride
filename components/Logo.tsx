/**
 * The mark (the runner's request of 21 Nov 2026: "popracuj nad logo ... chodzi mi o to co jest w
 * nim i kolor"): a faceted prism heading up and forward, three faces in three strengths of white,
 * with three lines of speed behind it, the stride, on a tile of the brand's colours (indigo, violet,
 * magenta), the same in both themes. app/icon.svg is the same drawing for the browser's tab.
 */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" style={{ width: size, height: size }}>
      <defs>
        <linearGradient id="brand-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--brand-1)" />
          <stop offset="0.55" stopColor="var(--brand-2)" />
          <stop offset="1" stopColor="var(--brand-3)" />
        </linearGradient>
        <radialGradient id="brand-shine" cx="0.2" cy="0.1" r="0.75">
          <stop offset="0" stopColor="var(--on-series)" stopOpacity="0.32" />
          <stop offset="1" stopColor="var(--on-series)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#brand-g)" />
      <rect width="32" height="32" rx="9" fill="url(#brand-shine)" />
      <g stroke="var(--on-series)" strokeWidth="2" strokeLinecap="round">
        <path d="M5.5 20.7L8.8 17.9" opacity="0.55" />
        <path d="M7.1 25.5L11.8 21.3" opacity="0.85" />
        <path d="M11.6 27.6L14.8 24.8" opacity="0.55" />
      </g>
      <g fill="var(--on-series)" stroke="var(--on-series)" strokeWidth="1.2" strokeLinejoin="round">
        <path d="M9.4 13.8 26.2 8.6 17.2 16.6z" />
        <path d="M19 24.6 26.2 8.6 17.2 16.6z" opacity="0.72" />
        <path d="M9.4 13.8 17.2 16.6 19 24.6z" opacity="0.45" />
      </g>
    </svg>
  );
}
