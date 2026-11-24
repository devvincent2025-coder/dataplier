import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";

import brandLogo from "../assets/logo.svg";
import { useToast } from "../context/ToastContext";
import { authApi } from "../lib/api";

/* ─── Concept: "Signal Sent" ─────────────────────────────
   A lone radar dish pulses outward — searching for your
   account. On success, the rings turn green and a
   "signal received" state replaces the form entirely.
   Minimal, centered, dramatic negative space.
──────────────────────────────────────────────────────── */

function RadarPulse({ state }: { state: "idle" | "loading" | "success" | "error" }) {
  const ringColor =
    state === "success" ? "#22c55e" :
    state === "error"   ? "#ef4444" :
    "#FF6B1A";

  const centerColor =
    state === "success" ? "#22c55e" :
    state === "error"   ? "#ef4444" :
    "#FF6B1A";

  return (
    <svg
      viewBox="0 0 260 260"
      width="260"
      height="260"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ display: "block", margin: "0 auto" }}
    >
      <style>{`
        @keyframes ringPulse {
          0%   { r: 28; opacity: 0.7; }
          100% { r: 120; opacity: 0; }
        }
        @keyframes ringPulse2 {
          0%   { r: 28; opacity: 0.5; }
          100% { r: 120; opacity: 0; }
        }
        @keyframes ringPulse3 {
          0%   { r: 28; opacity: 0.3; }
          100% { r: 120; opacity: 0; }
        }
        @keyframes scanRotate {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes dotBlink {
          0%,100% { opacity: 1; }
          50%      { opacity: 0.3; }
        }
        @keyframes successBounce {
          0%   { transform: scale(0.6); opacity: 0; }
          60%  { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); }
        }
        .ring1 {
          animation: ringPulse 2.4s ease-out infinite;
        }
        .ring2 {
          animation: ringPulse2 2.4s ease-out infinite 0.8s;
        }
        .ring3 {
          animation: ringPulse3 2.4s ease-out infinite 1.6s;
        }
        .scan-arm {
          transform-origin: 130px 130px;
          animation: scanRotate 3s linear infinite;
        }
        .success-mark {
          transform-origin: 130px 130px;
          animation: successBounce 0.5s cubic-bezier(0.22,1,0.36,1) both;
        }
      `}</style>

      {/* Static concentric guide rings */}
      {[48, 72, 96, 118].map((r) => (
        <circle
          key={r}
          cx="130"
          cy="130"
          r={r}
          stroke={ringColor}
          strokeWidth="0.75"
          strokeOpacity="0.1"
        />
      ))}

      {/* Animated pulse rings — only when idle or loading */}
      {state !== "success" && state !== "error" && (
        <>
          <circle className="ring1" cx="130" cy="130" r="28" stroke={ringColor} strokeWidth="1.5" strokeOpacity="0.7" fill="none" />
          <circle className="ring2" cx="130" cy="130" r="28" stroke={ringColor} strokeWidth="1" strokeOpacity="0.5" fill="none" />
          <circle className="ring3" cx="130" cy="130" r="28" stroke={ringColor} strokeWidth="0.75" strokeOpacity="0.3" fill="none" />
        </>
      )}

      {/* Rotating scan arm — only when loading */}
      {state === "loading" && (
        <g className="scan-arm">
          <line x1="130" y1="130" x2="130" y2="20" stroke={ringColor} strokeWidth="1.5" strokeOpacity="0.5" strokeLinecap="round" />
          <circle cx="130" cy="20" r="3" fill={ringColor} fillOpacity="0.8" />
          <defs>
            <radialGradient id="sweep" cx="130" cy="130" r="110" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={ringColor} stopOpacity="0.15" />
              <stop offset="100%" stopColor={ringColor} stopOpacity="0" />
            </radialGradient>
          </defs>
          <path
            d="M 130 130 L 130 20 A 110 110 0 0 1 240 130 Z"
            fill="url(#sweep)"
          />
        </g>
      )}

      {/* Center dot / state indicator */}
      {state === "success" ? (
        <g className="success-mark">
          <circle cx="130" cy="130" r="26" fill="#dcfce7" />
          <circle cx="130" cy="130" r="26" stroke="#22c55e" strokeWidth="1.5" />
          <path
            d="M 118 130 L 126 138 L 143 120"
            stroke="#22c55e"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </g>
      ) : state === "error" ? (
        <g className="success-mark">
          <circle cx="130" cy="130" r="26" fill="#fef2f2" />
          <circle cx="130" cy="130" r="26" stroke="#ef4444" strokeWidth="1.5" />
          <path d="M 120 120 L 140 140 M 140 120 L 120 140" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      ) : (
        <>
          <circle cx="130" cy="130" r="20" fill={centerColor} fillOpacity="0.12" />
          <circle cx="130" cy="130" r="8" fill={centerColor} />
          <circle
            cx="130" cy="130" r="8"
            fill={centerColor}
            style={{ animation: state === "loading" ? "dotBlink 0.9s ease-in-out infinite" : "none" }}
          />
        </>
      )}

      {/* Cardinal tick marks */}
      {[0, 90, 180, 270].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x1 = 130 + 112 * Math.sin(rad);
        const y1 = 130 - 112 * Math.cos(rad);
        const x2 = 130 + 122 * Math.sin(rad);
        const y2 = 130 - 122 * Math.cos(rad);
        return (
          <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke={ringColor} strokeWidth="1.5" strokeOpacity="0.3" strokeLinecap="round" />
        );
      })}
    </svg>
  );
}

type PageState = "idle" | "loading" | "success" | "error";

export function ForgotPasswordPage() {
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [pageState, setPageState] = useState<PageState>("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPageState("loading");

    try {
      const result = await authApi.forgotPassword({ email });
      showToast(result.message, { variant: "success" });
      setPageState("success");
    } catch (submitError) {
      showToast(submitError instanceof Error ? submitError.message : "Unable to process request", { variant: "error" });
      setPageState("error");
    }
  }

  const isSubmitting = pageState === "loading";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; }

        .fp-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #ffffff;
          font-family: 'DM Sans', sans-serif;
          padding: 40px 24px;
          position: relative;
          overflow: hidden;
        }

        /* Faint dot-grid background */
        .fp-root::before {
          content: '';
          position: fixed;
          inset: 0;
          background-image: radial-gradient(circle, #FF6B1A 1px, transparent 1px);
          background-size: 32px 32px;
          opacity: 0.04;
          pointer-events: none;
        }

        .fp-card {
          width: 100%;
          max-width: 400px;
          text-align: center;
          position: relative;
          z-index: 1;
          animation: cardIn 0.7s cubic-bezier(0.22,1,0.36,1) both;
        }

        @keyframes cardIn {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Wordmark */
        .fp-wordmark {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          margin-bottom: 44px;
        }
        .fp-icon {
          width: 30px; height: 30px;
          border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          overflow: hidden;
        }
        .fp-icon img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        .fp-brand {
          font-family: 'Syne', sans-serif;
          font-weight: 800; font-size: 16px;
          color: #1a1a1a; letter-spacing: -0.2px;
        }
        .fp-brand span { color: #FF6B1A; }

        /* Radar area */
        .fp-radar { margin-bottom: 36px; }

        /* Status label under radar */
        .fp-status {
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 2px;
          text-transform: uppercase;
          margin-top: 18px;
          margin-bottom: 0;
          transition: color 0.3s;
        }

        /* Headline */
        .fp-headline {
          font-family: 'Syne', sans-serif;
          font-weight: 700;
          font-size: 22px;
          line-height: 1.25;
          color: #1a1a1a;
          letter-spacing: -0.3px;
          margin-bottom: 10px;
          margin-top: 28px;
        }

        .fp-sub {
          font-size: 14px;
          color: #7a7060;
          line-height: 1.65;
          margin-bottom: 32px;
          max-width: 320px;
          margin-left: auto;
          margin-right: auto;
        }

        /* Input */
        .fp-input {
          width: 100%;
          padding: 14px 18px;
          font-size: 15px;
          font-family: 'DM Sans', sans-serif;
          background: #fafaf9;
          border: 1.5px solid #ede7df;
          border-radius: 12px;
          color: #1a1a1a;
          outline: none;
          text-align: center;
          transition: all 0.18s ease;
          margin-bottom: 14px;
          letter-spacing: 0.1px;
        }
        .fp-input:focus {
          background: #ffffff;
          border-color: #FF6B1A;
          box-shadow: 0 0 0 3px rgba(255,107,26,0.1);
        }
        .fp-input::placeholder { color: #bbb0a0; }

        /* Submit */
        .fp-submit {
          width: 100%;
          padding: 14px;
          background: #FF6B1A;
          color: white;
          border: none; border-radius: 12px;
          font-family: 'DM Sans', sans-serif;
          font-size: 15px; font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          letter-spacing: 0.2px;
        }
        .fp-submit:hover:not(:disabled) {
          background: #e85c0d;
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(255,107,26,0.35);
        }
        .fp-submit:active:not(:disabled) { transform: translateY(0); }
        .fp-submit:disabled { opacity: 0.6; cursor: not-allowed; }

        /* Error / success messages */
        .fp-msg-error {
          font-size: 13px; color: #d94f2b;
          background: #fff5f2;
          border: 1px solid #ffd5c8;
          border-radius: 10px;
          padding: 10px 16px;
          margin-bottom: 14px;
          text-align: left;
        }

        /* Success state */
        .fp-success-msg {
          font-size: 14px;
          color: #166534;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 10px;
          padding: 14px 18px;
          line-height: 1.6;
          text-align: left;
          margin-bottom: 24px;
          animation: cardIn 0.4s ease both;
        }

        /* Footer links */
        .fp-footer {
          display: flex;
          justify-content: center;
          gap: 32px;
          margin-top: 28px;
          padding-top: 24px;
          border-top: 1px solid #f0e8e0;
        }
        .fp-footer a {
          font-size: 13px; color: #a89880;
          text-decoration: none; transition: color 0.2s;
        }
        .fp-footer a:hover { color: #FF6B1A; }

        /* Try again link */
        .fp-retry {
          display: inline-block;
          margin-top: 4px;
          font-size: 13px;
          color: #FF6B1A;
          cursor: pointer;
          font-weight: 500;
          background: none;
          border: none;
          font-family: 'DM Sans', sans-serif;
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .fp-retry:hover { color: #e85c0d; }
      `}</style>

      <div className="fp-root">
        <div className="fp-card">

          {/* Wordmark */}
          <div className="fp-wordmark">
            <div className="fp-icon">
              <img src={brandLogo} alt="Data Plier logo" />
            </div>
            <span className="fp-brand">Data<span>Plier</span></span>
          </div>

          {/* Radar */}
          <div className="fp-radar">
            <RadarPulse state={pageState} />
            <p
              className="fp-status"
              style={{
                color:
                  pageState === "success" ? "#22c55e" :
                  pageState === "error"   ? "#ef4444" :
                  pageState === "loading" ? "#FF6B1A" :
                  "#d0c4b8",
              }}
            >
              {pageState === "success" ? "Signal received" :
               pageState === "error"   ? "Signal lost" :
               pageState === "loading" ? "Scanning…" :
               "Awaiting signal"}
            </p>
          </div>

          {/* Content: idle / loading */}
          {pageState !== "success" && (
            <>
              <h1 className="fp-headline">
                {pageState === "error" ? "Couldn't locate your account." : "Reset workspace access."}
              </h1>
              <p className="fp-sub">
                {pageState === "error"
                  ? "Double-check your email address and try again."
                  : "Enter your work email and we'll send reset instructions to your Data Plier workspace."}
              </p>

              <form onSubmit={handleSubmit}>
                <input
                  className="fp-input"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <button className="fp-submit" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Scanning for account…" : "Send reset instructions →"}
                </button>
              </form>
            </>
          )}

          {/* Content: success */}
          {pageState === "success" && (
            <>
              <h1 className="fp-headline">Check your inbox.</h1>
              <p className="fp-sub">
                Reset instructions are on their way to<br />
                <strong style={{ color: "#1a1a1a" }}>{email}</strong>
              </p>
              <button
                className="fp-retry"
                onClick={() => {
                  setPageState("idle");
                  setEmail("");
                }}
              >
                Use a different email
              </button>
            </>
          )}

          {/* Footer */}
          <div className="fp-footer">
            <Link to="/login">Back to login</Link>
            <Link to="/signup">Create account</Link>
          </div>
        </div>
      </div>
    </>
  );
}