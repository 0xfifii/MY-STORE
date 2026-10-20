/**
 * The Velvet Store brand.
 * Wordmark: monoline VELVET where the first E's middle stroke is a striped shop awning.
 * Mark: a V under an awning, for the app icon and small spaces.
 */
export function VelvetWordmark({ className = "h-10", ink = "#9e1018", paper = "#f4e8d8", tagline = true, title = "The Velvet Store" }: {
  className?: string; ink?: string; paper?: string; tagline?: boolean; title?: string;
}) {
  return (
    <svg viewBox={tagline ? "-8 -34 306 136" : "-6 -6 302 72"} className={className} role="img" aria-label={title}>
      <g fill="none" stroke={ink} strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M0 0 19 60 38 0" />
        <path d="M56 0v60M56 0h28M56 60h28" />
        <path d="M104 0v60h27" />
        <path d="M149 0l19 60 19-60" />
        <path d="M205 0v60M205 0h28M205 30h24M205 60h28" />
        <path d="M252 0h36M270 0v60" />
      </g>
      <g className="velvet-awning" stroke={ink} strokeWidth="1.8" strokeLinejoin="round">
        <path d="M56 21h11v9H56z" fill={ink} />
        <path d="M67 21h11v9H67z" fill={paper} />
        <path d="M78 21h11v9H78z" fill={ink} />
        <path d="M56 30h11a5.5 5.5 0 0 1-11 0z" fill={ink} />
        <path d="M67 30h11a5.5 5.5 0 0 1-11 0z" fill={paper} />
        <path d="M78 30h11a5.5 5.5 0 0 1-11 0z" fill={ink} />
      </g>
      {tagline && (
        <g fill={ink} fontFamily="'DM Sans Variable', 'DM Sans', sans-serif" fontSize="17" fontWeight="700" letterSpacing="8">
          <text x="0" y="-14">THE</text>
          <text x="292" y="94" textAnchor="end">STORE</text>
        </g>
      )}
    </svg>
  );
}

/** Square app mark (same artwork as /icon.svg, the favicon). */
export function LogoMark({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="16" fill="#9e1018" />
      <g stroke="#f4e8d8" strokeWidth="1.6" strokeLinejoin="round">
        <path d="M12 13h10v7H12z" fill="#f4e8d8" />
        <path d="M22 13h10v7H22z" fill="#9e1018" />
        <path d="M32 13h10v7H32z" fill="#f4e8d8" />
        <path d="M42 13h10v7H42z" fill="#9e1018" />
        <path d="M12 20h10a5 5 0 0 1-10 0z" fill="#f4e8d8" />
        <path d="M22 20h10a5 5 0 0 1-10 0z" fill="#9e1018" />
        <path d="M32 20h10a5 5 0 0 1-10 0z" fill="#f4e8d8" />
        <path d="M42 20h10a5 5 0 0 1-10 0z" fill="#9e1018" />
      </g>
      <path d="M19 33l13 20 13-20" fill="none" stroke="#f4e8d8" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
