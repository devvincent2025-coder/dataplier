/**
 * Decorative SVG: abstract plier + multi-cloud data flow (no external assets).
 */
export function HeroIllustration() {
  return (
    <svg
      className="h-auto w-full max-w-lg animate-float opacity-95 drop-shadow-xl"
      viewBox="0 0 480 420"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="dp-hero-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fb923c" />
          <stop offset="55%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#ea580c" />
        </linearGradient>
        <linearGradient id="dp-flow" x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#f97316" stopOpacity="0.2" />
          <stop offset="50%" stopColor="#f97316" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0.2" />
        </linearGradient>
      </defs>

      {/* Soft grid */}
      <g opacity="0.12" stroke="#64748b" strokeWidth="0.5">
        {Array.from({ length: 9 }).map((_, i) => (
          <line key={`h${i}`} x1="40" y1={60 + i * 40} x2="440" y2={60 + i * 40} />
        ))}
        {Array.from({ length: 11 }).map((_, i) => (
          <line key={`v${i}`} x1={40 + i * 40} y1="60" x2={40 + i * 40} y2="380" />
        ))}
      </g>

      {/* Animated flow paths */}
      <path
        d="M 60 200 C 120 120, 200 100, 280 140 S 400 180, 420 220"
        stroke="url(#dp-flow)"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        strokeDasharray="12 10"
        className="animate-dash-flow"
        style={{ strokeDashoffset: 0 }}
      />
      <path
        d="M 70 260 C 140 320, 240 340, 320 300 S 410 240, 400 200"
        stroke="#f97316"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        strokeOpacity="0.35"
        strokeDasharray="8 12"
        className="animate-dash-flow"
        style={{ strokeDashoffset: 40, animationDelay: "0.5s" }}
      />

      {/* Pliers silhouette (simplified) */}
      <g transform="translate(200, 160) rotate(-8)">
        <path
          d="M 0 0 L 28 80 L 8 88 L -12 20 Z M 0 0 L -28 80 L -8 88 L 12 20 Z"
          fill="url(#dp-hero-grad)"
          opacity="0.92"
        />
        <circle cx="0" cy="8" r="14" fill="#fff7ed" stroke="#f97316" strokeWidth="2" />
        <circle cx="0" cy="8" r="5" fill="#f97316" className="animate-pulse-glow" />
      </g>

      {/* Cloud / platform nodes */}
      {[
        { cx: 90, cy: 100, label: "AWS" },
        { cx: 390, cy: 95, label: "GCP" },
        { cx: 400, cy: 300, label: "SF" },
        { cx: 85, cy: 310, label: "DB" }
      ].map((n, i) => (
        <g key={n.label} className="animate-fade-in" style={{ animationDelay: `${0.2 + i * 0.1}s`, opacity: 0, animationFillMode: "forwards" }}>
          <rect
            x={n.cx - 32}
            y={n.cy - 22}
            width={64}
            height={44}
            rx="10"
            fill="white"
            stroke="#e2e8f0"
            strokeWidth="1.5"
          />
          <text x={n.cx} y={n.cy + 6} textAnchor="middle" className="fill-slate-600 text-[11px] font-semibold" style={{ fontFamily: "IBM Plex Sans, sans-serif" }}>
            {n.label}
          </text>
        </g>
      ))}

      <text
        x="240"
        y="395"
        textAnchor="middle"
        fill="#f97316"
        fillOpacity="0.75"
        style={{ fontFamily: "IBM Plex Sans, sans-serif", fontSize: "11px", fontWeight: 600, letterSpacing: "0.28em" }}
      >
        GRIP · CUT · TWIST · PULL
      </text>
    </svg>
  );
}
