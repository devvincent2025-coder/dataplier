import type { ReactNode } from "react";

import { useScrollReveal } from "../../hooks/useScrollReveal";

type ScrollRevealProps = {
  children: ReactNode;
  className?: string;
  /** Stagger when multiple siblings reveal */
  delayMs?: number;
};

export function ScrollReveal({ children, className = "", delayMs = 0 }: ScrollRevealProps) {
  const { ref, visible } = useScrollReveal();

  return (
    <div
      ref={ref}
      className={`will-change-transform ${className} ${
        visible ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"
      } transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]`}
      style={{ transitionDelay: visible ? `${delayMs}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}
