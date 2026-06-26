// Logo Nzoko Transport — Éléphant stylisé en SVG
// Couleurs : bleu de nuit + jaune doré

export function Logo({ size = "md", showText = true }: { size?: "sm" | "md" | "lg"; showText?: boolean }) {
  const dimensions = {
    sm: { box: "w-8 h-8", text: "text-sm" },
    md: { box: "w-10 h-10", text: "text-lg" },
    lg: { box: "w-20 h-20", text: "text-3xl" },
  };

  const d = dimensions[size];

  return (
    <div className="flex items-center gap-3">
      <div className={`${d.box} relative flex-shrink-0`}>
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
          {/* Fond cercle */}
          <circle cx="50" cy="50" r="48" fill="#ffd700" />
          {/* Corps éléphant */}
          <ellipse cx="52" cy="58" rx="22" ry="18" fill="#0f2340" />
          {/* Tête */}
          <circle cx="35" cy="42" r="14" fill="#0f2340" />
          {/* Oreille */}
          <ellipse cx="24" cy="38" rx="10" ry="13" fill="#1a3a6b" />
          {/* Trompe */}
          <path d="M 28 50 Q 20 60, 22 72 Q 24 76, 28 74 Q 30 68, 32 58" fill="#0f2340" />
          {/* Défense */}
          <path d="M 38 52 Q 36 58, 38 62" stroke="#ffd700" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          {/* Oeil */}
          <circle cx="33" cy="40" r="2.5" fill="#ffd700" />
          {/* Pattes */}
          <rect x="38" y="70" width="7" height="12" rx="3" fill="#0f2340" />
          <rect x="50" y="70" width="7" height="12" rx="3" fill="#0f2340" />
          <rect x="60" y="70" width="7" height="12" rx="3" fill="#0f2340" />
          {/* Queue */}
          <path d="M 74 55 Q 80 52, 78 48" stroke="#0f2340" strokeWidth="3" fill="none" strokeLinecap="round" />
        </svg>
      </div>
      {showText && (
        <div>
          <span className={`font-bold ${d.text} tracking-tight`}>Nzoko Transport</span>
          {size !== "sm" && (
            <span className="hidden sm:block text-xs text-accent-400">
              Voyagez en toute sécurité
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function LogoIcon({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="50" cy="50" r="48" fill="#ffd700" />
      <ellipse cx="52" cy="58" rx="22" ry="18" fill="#0f2340" />
      <circle cx="35" cy="42" r="14" fill="#0f2340" />
      <ellipse cx="24" cy="38" rx="10" ry="13" fill="#1a3a6b" />
      <path d="M 28 50 Q 20 60, 22 72 Q 24 76, 28 74 Q 30 68, 32 58" fill="#0f2340" />
      <path d="M 38 52 Q 36 58, 38 62" stroke="#ffd700" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <circle cx="33" cy="40" r="2.5" fill="#ffd700" />
      <rect x="38" y="70" width="7" height="12" rx="3" fill="#0f2340" />
      <rect x="50" y="70" width="7" height="12" rx="3" fill="#0f2340" />
      <rect x="60" y="70" width="7" height="12" rx="3" fill="#0f2340" />
      <path d="M 74 55 Q 80 52, 78 48" stroke="#0f2340" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}
