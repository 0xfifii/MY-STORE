import { useId } from "react";

/** MY STORE mark: a packed box on a burgundy tile. Same artwork as /icon.svg (the favicon). */
export function LogoMark({ className = "size-9" }: { className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "") + "lg";
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9c2a45" />
          <stop offset="1" stopColor="#4f1022" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${id})`} />
      <path d="M32 13 49 22.5 32 32 15 22.5z" fill="#fff" />
      <path d="M15 25.5 30.5 34.2V52L15 43.3z" fill="#fff" fillOpacity=".82" />
      <path d="M49 25.5 33.5 34.2V52L49 43.3z" fill="#f2c3cf" />
      <path d="M23.5 17.8 40.5 27.3" stroke="#9c2a45" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
