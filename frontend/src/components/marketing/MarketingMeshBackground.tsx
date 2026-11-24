/**
 * Soft animated mesh for marketing hero/header — no external assets.
 */
export function MarketingMeshBackground({ className = "" }: { className?: string }) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden
    >
      <div
        className="absolute -inset-[40%] bg-[length:180%_180%] animate-hero-mesh opacity-90"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 50% 40% at 35% 25%, rgba(249, 115, 22, 0.11), transparent),
            radial-gradient(ellipse 45% 35% at 78% 12%, rgba(99, 102, 241, 0.09), transparent),
            radial-gradient(ellipse 40% 45% at 12% 72%, rgba(14, 165, 233, 0.07), transparent),
            radial-gradient(ellipse 35% 30% at 88% 78%, rgba(249, 115, 22, 0.06), transparent)
          `
        }}
      />
    </div>
  );
}
