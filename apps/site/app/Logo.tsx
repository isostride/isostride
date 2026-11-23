/** The mark of Isostride, as the app draws it: a faceted prism heading forward, three lines of speed behind it. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="brand-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4f46e5" />
          <stop offset="0.55" stopColor="#7c3aed" />
          <stop offset="1" stopColor="#db2777" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#brand-g)" />
      <g stroke="#fff" strokeWidth="2" strokeLinecap="round">
        <path d="M5.5 20.7L8.8 17.9" opacity="0.55" />
        <path d="M7.1 25.5L11.8 21.3" opacity="0.85" />
        <path d="M11.6 27.6L14.8 24.8" opacity="0.55" />
      </g>
      <g fill="#fff" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round">
        <path d="M9.4 13.8 26.2 8.6 17.2 16.6z" />
        <path d="M19 24.6 26.2 8.6 17.2 16.6z" opacity="0.72" />
        <path d="M9.4 13.8 17.2 16.6 19 24.6z" opacity="0.45" />
      </g>
    </svg>
  );
}
