export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        steel: "#475569",
        mist: "#f8fafc",
        ember: "#f97316",
        teal: "#ea580c",
        panel: "#ffffff",
        line: "#e2e8f0",
        soft: "#f8fafc"
      },
      boxShadow: {
        shell: "0 18px 50px rgba(15, 23, 42, 0.08)",
        panel: "0 8px 24px rgba(15, 23, 42, 0.06)"
      },
      fontFamily: {
        sans: ["IBM Plex Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" }
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-12px)" }
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.9" }
        },
        "dash-flow": {
          to: { strokeDashoffset: "-100" }
        },
        "sim-flow": {
          "0%": { transform: "translateX(-120%)" },
          "100%": { transform: "translateX(420%)" }
        },
        "sim-flow-reverse": {
          "0%": { transform: "translateX(120%)" },
          "100%": { transform: "translateX(-420%)" }
        },
        "sim-pulse-bar": {
          "0%, 100%": { opacity: "0.35", transform: "scaleY(0.6)" },
          "50%": { opacity: "1", transform: "scaleY(1)" }
        },
        "hero-mesh": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" }
        },
        "hero-orbit": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" }
        },
        "hero-drift": {
          "0%, 100%": { transform: "translate(0, 0)" },
          "33%": { transform: "translate(4px, -6px)" },
          "66%": { transform: "translate(-3px, 4px)" }
        },
        "hero-beacon": {
          "0%, 100%": { opacity: "0.35", transform: "scale(0.92)" },
          "50%": { opacity: "1", transform: "scale(1)" }
        }
      },
      animation: {
        "fade-up": "fade-up 0.8s ease-out forwards",
        "fade-up-delay": "fade-up 0.8s ease-out 0.15s forwards",
        "fade-up-delay-2": "fade-up 0.8s ease-out 0.3s forwards",
        "fade-in": "fade-in 1s ease-out forwards",
        float: "float 5s ease-in-out infinite",
        "pulse-glow": "pulse-glow 3s ease-in-out infinite",
        "dash-flow": "dash-flow 2.5s linear infinite",
        "sim-flow": "sim-flow 2.8s ease-in-out infinite",
        "sim-flow-reverse": "sim-flow-reverse 3.2s ease-in-out infinite",
        "sim-pulse-bar": "sim-pulse-bar 2.4s ease-in-out infinite",
        "hero-mesh": "hero-mesh 18s ease-in-out infinite",
        "hero-orbit": "hero-orbit 28s linear infinite",
        "hero-drift": "hero-drift 6s ease-in-out infinite",
        "hero-beacon": "hero-beacon 3.2s ease-in-out infinite"
      }
    }
  },
  plugins: []
};
