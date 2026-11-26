/**
 * The Palm Store helper: a cheerful shopping bag (the brand mark) with a teal handle, drawn in terracotta line on cream.
 * Pure SVG + CSS animation (blink, bob, wave, jump), so it costs nothing to load and respects
 * reduced-motion settings.
 */
export type MascotMood = "happy" | "wave" | "excited" | "worried" | "sleepy" | "thinking";

export function Mascot({ mood = "happy", className = "size-28", label }: { mood?: MascotMood; className?: string; label?: string }) {
  const ink = "#C4553A";
  const eyes =
    mood === "excited" ? (
      <g fill="none" stroke={ink} strokeWidth="3.6" strokeLinecap="round">
        <path d="M43 80q5-7 10 0" /><path d="M67 80q5-7 10 0" />
      </g>
    ) : mood === "sleepy" ? (
      <g fill="none" stroke={ink} strokeWidth="3.4" strokeLinecap="round">
        <path d="M43 79q5 4 10 0" /><path d="M67 79q5 4 10 0" />
      </g>
    ) : (
      <g className="velvy-eyes" fill={ink}>
        <ellipse cx="48" cy="78" rx="4.6" ry="5.4" />
        <ellipse cx="72" cy="78" rx="4.6" ry="5.4" />
        <circle cx="49.6" cy="76.2" r="1.5" fill="#ffffff" />
        <circle cx="73.6" cy="76.2" r="1.5" fill="#ffffff" />
      </g>
    );
  const brows = mood === "worried" ? (
    <g fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round"><path d="M42 68l10-3" /><path d="M78 68l-10-3" /></g>
  ) : mood === "thinking" ? (
    <g fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round"><path d="M42 67q5-3 10 0" /><path d="M67 64l10 2" /></g>
  ) : null;
  const mouth =
    mood === "excited" ? <path d="M50 92h20q-1.5 12-10 12t-10-12z" fill={ink} stroke={ink} strokeWidth="3" strokeLinejoin="round" />
    : mood === "worried" ? <path d="M51 99q9-7 18 0" fill="none" stroke={ink} strokeWidth="3.6" strokeLinecap="round" />
    : mood === "sleepy" ? <ellipse cx="60" cy="96" rx="4" ry="3" fill={ink} />
    : mood === "thinking" ? <path d="M52 96h14" fill="none" stroke={ink} strokeWidth="3.6" strokeLinecap="round" />
    : <path d="M51 92q9 10 18 0" fill="none" stroke={ink} strokeWidth="3.6" strokeLinecap="round" />;
  const anim = mood === "excited" ? "velvy-jump" : mood === "sleepy" ? "velvy-breathe" : "velvy-bob";

  return (
    <svg viewBox="0 0 120 150" className={className} role="img" aria-label={label ?? "The Palm Store helper"}>
      <ellipse cx="60" cy="143" rx="34" ry="4.5" fill={ink} opacity="0.12" className="velvy-shadow" />
      <g className={anim}>
        {/* left arm */}
        <g className={mood === "worried" ? "velvy-fidget" : ""}>
          <path d="M19 92c-8-2-12 4-12 10" fill="none" stroke={ink} strokeWidth="4" strokeLinecap="round" />
          <circle cx="7" cy="104" r="4" fill="#ffffff" stroke={ink} strokeWidth="3" />
        </g>
        {/* right arm (waves) */}
        <g className={mood === "wave" || mood === "excited" ? "velvy-wave" : ""} style={{ transformOrigin: "100px 90px" }}>
          <path d={mood === "wave" || mood === "excited" ? "M101 90c8-4 12-12 12-20" : "M101 92c8-2 12 4 12 10"} fill="none" stroke={ink} strokeWidth="4" strokeLinecap="round" />
          <circle cx={113} cy={mood === "wave" || mood === "excited" ? 67 : 104} r="4" fill="#ffffff" stroke={ink} strokeWidth="3" />
        </g>
        {/* teal handle */}
        <path d="M44 54V41a16 16 0 0 1 32 0v13" fill="none" stroke="#006D77" strokeWidth="5" strokeLinecap="round" />
        {/* shopping bag body */}
        <path d="M27 50h66a4.5 4.5 0 0 1 4.5 4.2l4.6 72.8a6.5 6.5 0 0 1-6.5 7H23.4a6.5 6.5 0 0 1-6.5-7l4.6-72.8A4.5 4.5 0 0 1 27 50z"
          fill="#FFFBF5" stroke={ink} strokeWidth="4" strokeLinejoin="round" />
        {/* folded top band and handle holes */}
        <path d="M21.2 61h77.6" fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round" opacity=".35" />
        <circle cx="44" cy="56" r="2.6" fill={ink} /><circle cx="76" cy="56" r="2.6" fill={ink} />
        {/* soft shine */}
        <path d="M27 70v40" fill="none" stroke={ink} strokeWidth="2.4" strokeLinecap="round" opacity=".15" />
        {/* face */}
        <ellipse cx="39" cy="90" rx="6" ry="3.6" fill="#F4A261" opacity="0.55" />
        <ellipse cx="81" cy="90" rx="6" ry="3.6" fill="#F4A261" opacity="0.55" />
        {brows}
        {eyes}
        {mouth}
        {mood === "sleepy" && (
          <g fill={ink} fontFamily="'Plus Jakarta Sans Variable', sans-serif" fontWeight="700" className="velvy-zz">
            <text x="94" y="36" fontSize="12">z</text><text x="103" y="24" fontSize="9">z</text>
          </g>
        )}
        {mood === "excited" && (
          <g stroke={ink} strokeWidth="2.6" strokeLinecap="round" className="velvy-sparkle">
            <path d="M14 46l-6-4M12 58H5M104 34l6-5" />
          </g>
        )}
        {mood === "thinking" && <text x="96" y="38" fontSize="20" fontWeight="700" fill={ink} fontFamily="'Plus Jakarta Sans Variable', sans-serif" className="velvy-zz">?</text>}
      </g>
    </svg>
  );
}

/** Mascot with a speech bubble. */
export function MascotSays({ mood = "happy", children, className = "", size = "size-24" }: { mood?: MascotMood; children: React.ReactNode; className?: string; size?: string }) {
  return (
    <div className={`flex items-end gap-3 ${className}`}>
      <Mascot mood={mood} className={`${size} shrink-0`} />
      <div className="relative mb-6 rounded-3xl rounded-bl-md bg-paper px-4 py-3 text-sm shadow-[0_10px_24px_-16px_rgb(0_0_0/0.5)] ring-1 ring-kraft">
        {children}
      </div>
    </div>
  );
}
