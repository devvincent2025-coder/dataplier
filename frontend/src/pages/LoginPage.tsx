import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import brandLogo from "../assets/logo.svg";
import { useToast } from "../context/ToastContext";
import { authApi } from "../lib/api";
import { useSessionStore } from "../store/session";

type OAuthProvider = {
  id: string;
  label: string;
  status: string;
};

function OAuthLogo({ providerId }: { providerId: string }) {
  const id = providerId.toLowerCase();
  if (id === "google") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#EA4335"
          d="M12 10.2v3.9h5.4c-.2 1.2-1.4 3.6-5.4 3.6-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.8 0 3 .8 3.7 1.5l2.5-2.4C16.6 3.3 14.5 2.4 12 2.4 6.9 2.4 2.8 6.6 2.8 12s4.1 9.6 9.2 9.6c5.3 0 8.8-3.7 8.8-8.9 0-.6-.1-1-.2-1.5H12z"
        />
      </svg>
    );
  }
  if (id === "github") {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="#1f2937"
        aria-hidden="true"
      >
        <path d="M12 2C6.48 2 2 6.58 2 12.23c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.5 0-.24-.01-1.04-.01-1.89-2.78.62-3.37-1.21-3.37-1.21-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .08 1.53 1.05 1.53 1.05.9 1.56 2.36 1.11 2.94.85.09-.67.35-1.11.64-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.72 0 0 .84-.28 2.75 1.05A9.35 9.35 0 0 1 12 6.9c.85 0 1.71.12 2.51.35 1.91-1.33 2.75-1.05 2.75-1.05.55 1.42.2 2.46.1 2.72.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.67.95.67 1.92 0 1.39-.01 2.5-.01 2.84 0 .28.18.61.69.5A10.08 10.08 0 0 0 22 12.23C22 6.58 17.52 2 12 2z" />
      </svg>
    );
  }
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="#64748b"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

/* ─── Animated data-flow background for the right panel ─── */
function DataFlowCanvas() {
  return (
    <svg
      viewBox="0 0 600 700"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        opacity: 0.92,
      }}
    >
      <style>{`
        @keyframes flowDash {
          from { stroke-dashoffset: 200; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes nodePulse {
          0%,100% { opacity: 1; r: 6; }
          50%      { opacity: 0.6; r: 9; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes rotateGear {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes counterGear {
          from { transform: rotate(0deg); }
          to   { transform: rotate(-360deg); }
        }
        .pipe { stroke-dasharray: 12 6; animation: flowDash 1.8s linear infinite; }
        .pipe-slow { stroke-dasharray: 12 6; animation: flowDash 3s linear infinite; }
        .pulse { animation: nodePulse 2.2s ease-in-out infinite; }
        .pulse2 { animation: nodePulse 2.2s ease-in-out infinite 0.7s; }
        .pulse3 { animation: nodePulse 2.2s ease-in-out infinite 1.4s; }
        .gear1 { transform-origin: 300px 200px; animation: rotateGear 12s linear infinite; }
        .gear2 { transform-origin: 370px 255px; animation: counterGear 8s linear infinite; }
        .label-fade { animation: fadeUp 0.8s ease both; }
      `}</style>

      {/* ── Background decoration ── */}
      <rect width="600" height="700" fill="url(#bg-grad)" />
      <defs>
        <linearGradient
          id="bg-grad"
          x1="0"
          y1="0"
          x2="600"
          y2="700"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#fff7f0" />
          <stop offset="100%" stopColor="#fff1e6" />
        </linearGradient>
        <linearGradient id="orange-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FF6B1A" />
          <stop offset="100%" stopColor="#FF9A4D" />
        </linearGradient>
      </defs>

      {/* Subtle grid */}
      {Array.from({ length: 12 }).map((_, i) => (
        <line
          key={`v${i}`}
          x1={i * 55}
          y1="0"
          x2={i * 55}
          y2="700"
          stroke="#FF6B1A"
          strokeOpacity="0.06"
          strokeWidth="1"
        />
      ))}
      {Array.from({ length: 13 }).map((_, i) => (
        <line
          key={`h${i}`}
          x1="0"
          y1={i * 55}
          x2="600"
          y2={i * 55}
          stroke="#FF6B1A"
          strokeOpacity="0.06"
          strokeWidth="1"
        />
      ))}

      {/* ── Source nodes (left column) ── */}
      {/* Databricks */}
      <rect
        x="30"
        y="80"
        width="110"
        height="44"
        rx="8"
        fill="white"
        stroke="#FF6B1A"
        strokeWidth="1.5"
      />
      <text
        x="85"
        y="98"
        textAnchor="middle"
        fill="#FF6B1A"
        fontSize="9"
        fontFamily="'DM Sans', sans-serif"
        fontWeight="600"
        letterSpacing="1"
      >
        SOURCE
      </text>
      <text
        x="85"
        y="114"
        textAnchor="middle"
        fill="#1a1a1a"
        fontSize="12"
        fontFamily="'DM Sans', sans-serif"
        fontWeight="600"
      >
        Databricks
      </text>

      {/* Snowflake */}
      <rect
        x="30"
        y="220"
        width="110"
        height="44"
        rx="8"
        fill="white"
        stroke="#FF6B1A"
        strokeWidth="1.5"
      />
      <text
        x="85"
        y="238"
        textAnchor="middle"
        fill="#FF6B1A"
        fontSize="9"
        fontFamily="'DM Sans', sans-serif"
        fontWeight="600"
        letterSpacing="1"
      >
        SOURCE
      </text>
      <text
        x="85"
        y="254"
        textAnchor="middle"
        fill="#1a1a1a"
        fontSize="12"
        fontFamily="'DM Sans', sans-serif"
        fontWeight="600"
      >
        Snowflake
      </text>

      {/* PostgreSQL */}
      <rect
        x="30"
        y="360"
        width="110"
        height="44"
        rx="8"
        fill="white"
        stroke="#FF6B1A"
        strokeWidth="1.5"
      />
      <text
        x="85"
        y="378"
        textAnchor="middle"
        fill="#FF6B1A"
        fontSize="9"
        fontFamily="'DM Sans', sans-serif"
        fontWeight="600"
        letterSpacing="1"
      >
        SOURCE
      </text>
      <text
        x="85"
        y="394"
        textAnchor="middle"
        fill="#1a1a1a"
        fontSize="12"
        fontFamily="'DM Sans', sans-serif"
        fontWeight="600"
      >
        PostgreSQL
      </text>

      {/* BigQuery */}
      <rect
        x="30"
        y="500"
        width="110"
        height="44"
        rx="8"
        fill="white"
        stroke="#FF6B1A"
        strokeWidth="1.5"
      />
      <text
        x="85"
        y="518"
        textAnchor="middle"
        fill="#FF6B1A"
        fontSize="9"
        fontFamily="'DM Sans', sans-serif"
        fontWeight="600"
        letterSpacing="1"
      >
        SOURCE
      </text>
      <text
        x="85"
        y="534"
        textAnchor="middle"
        fill="#1a1a1a"
        fontSize="12"
        fontFamily="'DM Sans', sans-serif"
        fontWeight="600"
      >
        BigQuery
      </text>

      {/* ── Pipe lines from sources to hub ── */}
      <path
        d="M 140 102 C 220 102, 220 310, 280 310"
        stroke="#FF6B1A"
        strokeWidth="2"
        className="pipe"
        strokeOpacity="0.7"
      />
      <path
        d="M 140 242 C 220 242, 220 310, 280 310"
        stroke="#FF9A4D"
        strokeWidth="2"
        className="pipe"
        strokeOpacity="0.7"
        style={{ animationDelay: "-0.6s" }}
      />
      <path
        d="M 140 382 C 220 382, 220 310, 280 310"
        stroke="#FF6B1A"
        strokeWidth="2"
        className="pipe"
        strokeOpacity="0.7"
        style={{ animationDelay: "-1.2s" }}
      />
      <path
        d="M 140 522 C 220 522, 220 310, 280 310"
        stroke="#FF9A4D"
        strokeWidth="2"
        className="pipe"
        strokeOpacity="0.7"
        style={{ animationDelay: "-1.8s" }}
      />

      {/* ── Central Hub: Data Plier Router ── */}
      {/* Outer glow ring */}
      <circle cx="320" cy="310" r="72" fill="#FF6B1A" fillOpacity="0.08" />
      <circle cx="320" cy="310" r="58" fill="#FF6B1A" fillOpacity="0.12" />
      {/* Hub body */}
      <circle cx="320" cy="310" r="46" fill="url(#orange-grad)" />
      {/* Plier icon silhouette */}

      <g transform="translate(320 310) scale(0.08) translate(-256 -256)">
          <path
            d="M407.16,283.638c-13.55-32.176-31.445-58.877-53.19-79.36c-5.233-4.93-10.711-9.501-16.37-13.667
			c0.974-5.345,1.414-10.778,1.316-16.233c12.892-13.801,22.233-30.933,27.197-50.015c13.358-51.345-9.244-103.94-52.573-122.34
			c-6.862-2.915-14.573-2.641-21.135,0.581c-6.637,3.264-11.51,9.239-13.37,16.394l-19.162,73.655
			c-1.462-0.071-7.548-0.042-8.46,0.006L232.25,18.996c-1.862-7.158-6.739-13.133-13.372-16.393
			c-6.48-3.186-14.192-3.528-21.134-0.581c-43.329,18.399-65.93,70.994-52.573,122.34c4.971,19.109,14.324,36.255,27.235,50.06
			c-0.09,5.639,0.404,11.199,1.429,16.611c-5.459,4.053-10.747,8.48-15.802,13.243c-21.744,20.482-39.64,47.183-53.19,79.36
			c-24.296,57.698-32.758,129.776-23.828,202.958c0.94,7.691,5.013,14.796,11.181,19.494c5.007,3.813,11.228,5.913,17.516,5.913
			c2.945,0,0.809,0.199,42.735-6.056c15.572-2.323,26.3-16.391,24.426-32.025c-6.752-56.321-0.686-110.571,17.078-152.759
			c14.531-34.508,34.932-56.537,57.637-62.336c0.021,0.001,3.014-0.611,4.412-0.611c1.437,0,3.158,0.279,4.293,0.58
			c22.753,5.753,43.196,27.792,57.756,62.369c17.764,42.188,23.83,96.438,17.079,152.758c-1.876,15.636,8.854,29.704,24.426,32.026
			c41.795,6.234,39.788,6.056,42.734,6.056h0.001c6.29,0,12.511-2.1,17.516-5.913c6.166-4.695,10.241-11.801,11.181-19.494
			C439.918,413.413,431.455,341.334,407.16,283.638z M308.848,37.354c22.52,14.932,33.115,46.884,24.869,78.582
			c-1.581,6.077-3.767,11.862-6.508,17.271c-8.309-13.968-20.496-25.136-34.919-32.205L308.848,37.354z M163.102,308.171
			c-19.509,46.331-26.561,104.878-19.969,165.319l-29.431,4.391c-7.333-65.858,0.434-130.052,21.993-181.251
			c11.727-27.849,26.965-50.723,45.292-67.984c2.052-1.934,4.149-3.796,6.283-5.586c5.684,8.2,12.829,15.386,21.135,21.137
			C190.321,258.63,174.816,280.353,163.102,308.171z M302.626,192.216c-7.059,20.008-25.916,33.236-46.972,33.236v-0.004
			c-0.372,0-1.09-0.025-1.511-0.037v0.009c-22.02-0.68-41.011-16.015-46.515-37.173c-1.557-5.982-1.983-12.126-1.266-18.258
			l0.993-8.507v-0.002c-7.853-7.185-22.93-19.183-29.789-45.547c-8.245-31.696,2.348-63.648,24.87-78.578l20.365,78.28l4.163,16.229
			l0.055-0.015v0.001c17.339-4.511,20.849-5.822,29.005-5.822v-0.004c23.234,0.115,45.813,16.807,49.18,44.928
			c0.71,7.186-0.152,14.383-2.539,21.173C302.654,192.155,302.638,192.185,302.626,192.216z M398.302,477.88l-29.43-4.391
			c6.591-60.44-0.46-118.988-19.969-165.319c-11.774-27.963-27.37-49.76-45.567-64.191c8.499-5.922,15.599-13.31,21.026-21.235
			c2.263,1.885,4.485,3.853,6.658,5.901c18.326,17.263,33.564,40.135,45.292,67.985C397.867,347.828,405.636,412.024,398.302,477.88
			z"
            fill="white"
          />
          <circle cx="256.075" cy="176.013" r="20.642" fill="white" />
      </g>

      {/* Gear decorations around hub */}
      <g className="gear1">
        <circle
          cx="300"
          cy="200"
          r="18"
          fill="none"
          stroke="#FF6B1A"
          strokeWidth="1.5"
          strokeOpacity="0.25"
          strokeDasharray="4 3"
        />
      </g>
      <g className="gear2">
        <circle
          cx="370"
          cy="255"
          r="12"
          fill="none"
          stroke="#FF9A4D"
          strokeWidth="1"
          strokeOpacity="0.3"
          strokeDasharray="3 2"
        />
      </g>

      {/* Flowing data packets on pipes */}
      <circle
        cx="0"
        cy="0"
        r="5"
        fill="#FF6B1A"
        fillOpacity="0.9"
        className="pulse"
      >
        <animateMotion
          dur="1.8s"
          repeatCount="indefinite"
          path="M 140 102 C 220 102, 220 310, 280 310"
        />
      </circle>
      <circle
        cx="0"
        cy="0"
        r="5"
        fill="#FF9A4D"
        fillOpacity="0.9"
        className="pulse2"
      >
        <animateMotion
          dur="2.4s"
          repeatCount="indefinite"
          begin="-0.5s"
          path="M 140 242 C 220 242, 220 310, 280 310"
        />
      </circle>
      <circle
        cx="0"
        cy="0"
        r="5"
        fill="#FF6B1A"
        fillOpacity="0.9"
        className="pulse3"
      >
        <animateMotion
          dur="2s"
          repeatCount="indefinite"
          begin="-1s"
          path="M 140 382 C 220 382, 220 310, 280 310"
        />
      </circle>
      <circle cx="0" cy="0" r="5" fill="#FF9A4D" fillOpacity="0.9">
        <animateMotion
          dur="2.6s"
          repeatCount="indefinite"
          begin="-1.5s"
          path="M 140 522 C 220 522, 220 310, 280 310"
        />
      </circle>

      {/* ── Pipe lines from hub to destinations ── */}
      <path
        d="M 360 310 C 420 310, 420 140, 470 140"
        stroke="#FF6B1A"
        strokeWidth="2"
        className="pipe-slow"
        strokeOpacity="0.7"
        style={{ animationDelay: "-0.3s" }}
      />
      <path
        d="M 360 310 C 420 310, 420 290, 470 290"
        stroke="#FF9A4D"
        strokeWidth="2"
        className="pipe-slow"
        strokeOpacity="0.7"
        style={{ animationDelay: "-1s" }}
      />
      <path
        d="M 360 310 C 420 310, 420 430, 470 430"
        stroke="#FF6B1A"
        strokeWidth="2"
        className="pipe-slow"
        strokeOpacity="0.7"
        style={{ animationDelay: "-1.7s" }}
      />
      <path
        d="M 360 310 C 420 310, 420 570, 470 570"
        stroke="#FF9A4D"
        strokeWidth="2"
        className="pipe-slow"
        strokeOpacity="0.7"
        style={{ animationDelay: "-0.9s" }}
      />

      {/* ── Destination nodes (right column) ── */}
      {[
        { y: 118, label: "Analytics", tag: "DEST" },
        { y: 268, label: "AI Platform", tag: "DEST" },
        { y: 408, label: "Data Lake", tag: "DEST" },
        { y: 548, label: "Reporting", tag: "DEST" },
      ].map(({ y, label, tag }) => (
        <g key={label}>
          <rect
            x="470"
            y={y}
            width="110"
            height="44"
            rx="8"
            fill="#FF6B1A"
            fillOpacity="0.1"
            stroke="#FF6B1A"
            strokeWidth="1.5"
          />
          <text
            x="525"
            y={y + 18}
            textAnchor="middle"
            fill="#FF6B1A"
            fontSize="9"
            fontFamily="'DM Sans', sans-serif"
            fontWeight="600"
            letterSpacing="1"
          >
            {tag}
          </text>
          <text
            x="525"
            y={y + 33}
            textAnchor="middle"
            fill="#1a1a1a"
            fontSize="12"
            fontFamily="'DM Sans', sans-serif"
            fontWeight="600"
          >
            {label}
          </text>
        </g>
      ))}

      {/* Outgoing data packets */}
      <circle cx="0" cy="0" r="5" fill="#FF6B1A" fillOpacity="0.85">
        <animateMotion
          dur="2.1s"
          repeatCount="indefinite"
          path="M 360 310 C 420 310, 420 140, 470 140"
        />
      </circle>
      <circle cx="0" cy="0" r="5" fill="#FF9A4D" fillOpacity="0.85">
        <animateMotion
          dur="2.7s"
          repeatCount="indefinite"
          begin="-0.8s"
          path="M 360 310 C 420 310, 420 290, 470 290"
        />
      </circle>
      <circle cx="0" cy="0" r="5" fill="#FF6B1A" fillOpacity="0.85">
        <animateMotion
          dur="2.3s"
          repeatCount="indefinite"
          begin="-1.4s"
          path="M 360 310 C 420 310, 420 430, 470 430"
        />
      </circle>
      <circle cx="0" cy="0" r="5" fill="#FF9A4D" fillOpacity="0.85">
        <animateMotion
          dur="3s"
          repeatCount="indefinite"
          begin="-0.4s"
          path="M 360 310 C 420 310, 420 570, 470 570"
        />
      </circle>

      {/* ── Labels at bottom ── */}
      <text
        x="300"
        y="660"
        textAnchor="middle"
        fill="#FF6B1A"
        fontSize="11"
        fontFamily="'DM Sans', sans-serif"
        fontWeight="500"
        letterSpacing="3"
        fillOpacity="0.7"
      >
        GRIP · CUT · TWIST · PULL
      </text>
    </svg>
  );
}

/* ─── Login Page ─── */
export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("invite")?.trim() ?? "";
  const setSession = useSessionStore((state) => state.setSession);
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [oauthProviders, setOauthProviders] = useState<OAuthProvider[]>([]);
  const [focused, setFocused] = useState<string | null>(null);

  useEffect(() => {
    void authApi
      .oauthProviders()
      .then((result) => setOauthProviders(result.providers))
      .catch(() => setOauthProviders([]));
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const session = await authApi.login({ email, password });
      setSession(session);
      if (inviteToken) {
        try {
          const merged = await authApi.inviteAccept({ token: inviteToken }, session.token);
          setSession(merged);
        } catch (inviteErr) {
          showToast(inviteErr instanceof Error ? inviteErr.message : "Could not accept workspace invite", { variant: "error" });
        }
      }
      const raw = (location.state as { from?: string } | null)?.from ?? "/dashboard";
      const from = raw === "/" ? "/dashboard" : raw;
      navigate(from);
    } catch (submitError) {
      showToast(submitError instanceof Error ? submitError.message : "Unable to sign in", { variant: "error" });
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputStyle = (field: string): React.CSSProperties => ({
    width: "100%",
    padding: "14px 16px",
    fontSize: "14px",
    fontFamily: "'DM Sans', sans-serif",
    background: focused === field ? "#ffffff" : "#fafafa",
    border: focused === field ? "1.5px solid #FF6B1A" : "1.5px solid #e8e2dc",
    borderRadius: "10px",
    color: "#1a1a1a",
    outline: "none",
    transition: "all 0.2s ease",
    boxShadow: focused === field ? "0 0 0 3px rgba(255,107,26,0.1)" : "none",
  });

  return (
    <>
      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&family=Syne:wght@700;800&display=swap');

        * { box-sizing: border-box; }

        .dp-root {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 1fr 1fr;
          font-family: 'DM Sans', sans-serif;
          background: #ffffff;
        }

        @media (max-width: 900px) {
          .dp-root { grid-template-columns: 1fr; }
          .dp-panel { display: none !important; }
        }

        .dp-form-section {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 48px 40px;
          background: #ffffff;
          position: relative;
          z-index: 2;
        }

        .dp-form-section::after {
          content: '';
          position: absolute;
          top: 0; right: 0; bottom: 0;
          width: 1px;
          background: linear-gradient(to bottom, transparent, #f0e8e0 20%, #f0e8e0 80%, transparent);
        }

        .dp-card {
          width: 100%;
          max-width: 420px;
          animation: cardReveal 0.7s cubic-bezier(0.22,1,0.36,1) both;
        }

        @keyframes cardReveal {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .dp-wordmark {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 36px;
        }

        .dp-wordmark-icon {
          width: 34px;
          height: 34px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        .dp-wordmark-icon img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .dp-wordmark-text {
          font-family: 'Syne', sans-serif;
          font-weight: 800;
          font-size: 18px;
          color: #1a1a1a;
          letter-spacing: -0.3px;
        }

        .dp-wordmark-text span {
          color: #FF6B1A;
        }

        .dp-headline {
          font-family: 'Syne', sans-serif;
          font-weight: 700;
          font-size: 28px;
          line-height: 1.2;
          color: #1a1a1a;
          letter-spacing: -0.5px;
          margin-bottom: 10px;
        }

        .dp-sub {
          font-size: 14px;
          color: #7a7060;
          line-height: 1.6;
          margin-bottom: 36px;
          font-weight: 400;
        }

        .dp-label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          color: #5a5048;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          margin-bottom: 7px;
        }

        .dp-field {
          margin-bottom: 20px;
        }

        .dp-submit {
          width: 100%;
          padding: 15px;
          background: #FF6B1A;
          color: white;
          border: none;
          border-radius: 10px;
          font-family: 'DM Sans', sans-serif;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          margin-top: 8px;
          letter-spacing: 0.2px;
          position: relative;
          overflow: hidden;
        }

        .dp-submit:hover:not(:disabled) {
          background: #e85c0d;
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(255,107,26,0.35);
        }

        .dp-submit:active:not(:disabled) {
          transform: translateY(0);
        }

        .dp-submit:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .dp-divider {
          display: flex;
          align-items: center;
          gap: 14px;
          margin: 24px 0;
        }

        .dp-divider-line {
          flex: 1;
          height: 1px;
          background: #ede7df;
        }

        .dp-divider-text {
          font-size: 12px;
          color: #a89880;
          font-weight: 500;
          letter-spacing: 0.5px;
        }

        .dp-oauth-btn {
          width: 100%;
          padding: 13px 16px;
          background: #fafafa;
          border: 1.5px solid #e8e2dc;
          border-radius: 10px;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          color: #3a3028;
          cursor: pointer;
          transition: all 0.2s ease;
          margin-bottom: 10px;
          font-weight: 500;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }

        .dp-oauth-btn:hover {
          background: #fff5f0;
          border-color: #FF6B1A;
          color: #FF6B1A;
        }

        .dp-footer-links {
          display: flex;
          justify-content: space-between;
          margin-top: 28px;
          padding-top: 22px;
          border-top: 1px solid #f0e8e0;
        }

        .dp-footer-links a {
          font-size: 13px;
          color: #a89880;
          text-decoration: none;
          transition: color 0.2s;
        }

        .dp-footer-links a:hover {
          color: #FF6B1A;
        }

        .dp-error {
          font-size: 13px;
          color: #d94f2b;
          background: #fff5f2;
          border: 1px solid #ffd5c8;
          border-radius: 8px;
          padding: 10px 14px;
          margin-bottom: 16px;
        }

        .dp-panel {
          position: relative;
          overflow: hidden;
          background: #fff8f3;
        }

        .dp-panel-content {
          position: absolute;
          bottom: 48px;
          left: 0;
          right: 0;
          padding: 0 48px;
          z-index: 2;
        }

        .dp-tag {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(255,107,26,0.12);
          color: #FF6B1A;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 1.5px;
          padding: 5px 12px;
          border-radius: 100px;
          margin-bottom: 16px;
          text-transform: uppercase;
        }

        .dp-panel-headline {
          font-family: 'Syne', sans-serif;
          font-weight: 700;
          font-size: 32px;
          line-height: 1.15;
          color: #1a1a1a;
          letter-spacing: -0.5px;
          margin-bottom: 16px;
        }

        .dp-panel-headline em {
          color: #FF6B1A;
          font-style: normal;
        }

        .dp-capabilities {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 8px;
        }

        .dp-cap-pill {
          background: white;
          border: 1px solid #e8e2dc;
          border-radius: 100px;
          padding: 5px 14px;
          font-size: 12px;
          color: #5a5048;
          font-weight: 500;
        }
      `}</style>

      <div className="dp-root">
        {/* ── Left: Form ── */}
        <section className="dp-form-section">
          <div className="dp-card">
            {/* Wordmark */}
            <div className="dp-wordmark">
              <div className="dp-wordmark-icon">
                <img src={brandLogo} alt="Data Plier logo" />
              </div>
              <span className="dp-wordmark-text">
                Data<span>Plier</span>
              </span>
            </div>

            <h1 className="dp-headline">
              Welcome back.
              <br />
              Your data awaits.
            </h1>
            <p className="dp-sub">
              Sign in to access your intelligent data control plane.
            </p>

            <form onSubmit={handleSubmit}>
              <div className="dp-field">
                <label className="dp-label">Work email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  style={inputStyle("email")}
                  onFocus={() => setFocused("email")}
                  onBlur={() => setFocused(null)}
                />
              </div>
              <div className="dp-field">
                <label className="dp-label">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••"
                  required
                  style={inputStyle("password")}
                  onFocus={() => setFocused("password")}
                  onBlur={() => setFocused(null)}
                />
              </div>


              <button
                className="dp-submit"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Signing in…" : "Sign In →"}
              </button>
            </form>

            {oauthProviders.length > 0 && (
              <>
                <div className="dp-divider">
                  <div className="dp-divider-line" />
                  <span className="dp-divider-text">OR CONTINUE WITH</span>
                  <div className="dp-divider-line" />
                </div>
                <div>
                  {oauthProviders.map((provider) => (
                    <button key={provider.id} className="dp-oauth-btn">
                      <OAuthLogo providerId={provider.id} />
                      <span>{provider.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="dp-footer-links">
              <Link to="/forgot-password">Forgot password?</Link>
              <Link to="/signup">Create account</Link>
            </div>
          </div>
        </section>

        {/* ── Right: Animated data flow panel ── */}
        <section className="dp-panel">
          <DataFlowCanvas />
          <div className="dp-panel-content">
            {/* <div className="dp-tag">
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#FF6B1A", display: "inline-block" }} />
              Live routing engine
            </div> */}
            <h2 className="dp-panel-headline">
              The intelligent
              <br />
              layer for <em>multi-cloud</em>
              <br />
              data control.
            </h2>
            {/* <div className="dp-capabilities">
              {["Grip", "Cut", "Twist", "Pull"].map((word) => (
                <span key={word} className="dp-cap-pill">{word}</span>
              ))}
            </div> */}
          </div>
        </section>
      </div>
    </>
  );
}
