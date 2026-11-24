import { useQuery } from "@tanstack/react-query";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import brandLogo from "../assets/logo.svg";
import { useToast } from "../context/ToastContext";
import { authApi } from "../lib/api";
import { useSessionStore } from "../store/session";

/* ─── Concept: "Control Tower" ───────────────────────────
   Left: A vertical infrastructure stack — layers of the
   data plane lit up from top to bottom, like a building
   powering on. Each layer represents what the user unlocks.
   Right: Clean, stepped form with plan selector cards.
──────────────────────────────────────────────────────── */

const LAYERS = [
  {
    icon: "◈",
    title: "AI Traffic Controller",
    desc: "Predictive routing & congestion avoidance across clouds",
    color: "#FF6B1A",
  },
  {
    icon: "⬡",
    title: "Schema Translator",
    desc: "Auto-convert between Snowflake, BigQuery, Postgres & more",
    color: "#FF8C42",
  },
  {
    icon: "▣",
    title: "Chunk Teleportation",
    desc: "Parallel petabyte-scale transfer with smart partitioning",
    color: "#FFA566",
  },
  {
    icon: "◉",
    title: "Data Time Machine",
    desc: "Versioned snapshots, rollback and full pipeline replay",
    color: "#FFB880",
  },
  {
    icon: "◎",
    title: "Enterprise Lineage",
    desc: "End-to-end graph: origin → movement → transformation",
    color: "#FFCA99",
  },
];

const PLANS = [
  { id: "starter", name: "Starter", trial: "14-day", price: "Free to start", note: "Up to 5 connectors" },
  { id: "growth", name: "Growth", trial: "14-day", price: "Most popular", note: "Unlimited pipelines" },
  { id: "enterprise", name: "Enterprise", trial: "30-day", price: "Custom pricing", note: "SLA + dedicated support" },
];

function InfraStack() {
  return (
    <svg
      viewBox="0 0 520 680"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.15 }}
    >
      <style>{`
        @keyframes scanline {
          from { transform: translateY(-100%); }
          to   { transform: translateY(800%); }
        }
        .scan { animation: scanline 4s linear infinite; }
      `}</style>
      {/* Vertical circuit lines */}
      {[60, 130, 200, 270, 340, 410, 480].map((x) => (
        <line key={x} x1={x} y1="0" x2={x} y2="680" stroke="#FF6B1A" strokeWidth="0.5" />
      ))}
      {[80, 160, 240, 320, 400, 480, 560, 640].map((y) => (
        <line key={y} x1="0" y1={y} x2="520" y2={y} stroke="#FF6B1A" strokeWidth="0.5" />
      ))}
      {/* Scan effect */}
      <rect x="0" y="0" width="520" height="60" fill="url(#scan-grad)" className="scan" />
      <defs>
        <linearGradient id="scan-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FF6B1A" stopOpacity="0" />
          <stop offset="50%" stopColor="#FF6B1A" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#FF6B1A" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function SignupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("invite")?.trim() ?? "";
  const setSession = useSessionStore((state) => state.setSession);
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    company: "",
    plan_id: "growth",
    start_trial: true,
  });

  const trialLabel = useMemo(
    () => (form.plan_id === "enterprise" ? "30-day free trial" : "14-day free trial"),
    [form.plan_id]
  );

  const selectedPlan = PLANS.find((p) => p.id === form.plan_id);

  const invitePreviewQuery = useQuery({
    queryKey: ["invite-preview", inviteToken],
    queryFn: () => authApi.invitePreview(inviteToken),
    enabled: Boolean(inviteToken)
  });

  useEffect(() => {
    const email = invitePreviewQuery.data?.email;
    if (!email) return;
    setForm((f) => (f.email === email ? f : { ...f, email }));
  }, [invitePreviewQuery.data?.email]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      if (inviteToken) {
        const session = await authApi.inviteAccept({
          token: inviteToken,
          full_name: form.full_name,
          password: form.password,
          company: form.company,
          plan_id: form.plan_id,
          start_trial: form.start_trial
        });
        setSession(session);
        navigate("/dashboard");
        return;
      }
      const session = await authApi.signup(form);
      setSession(session);
      navigate("/dashboard");
    } catch (submitError) {
      const msg = submitError instanceof Error ? submitError.message : "Unable to create account";
      if (inviteToken && (msg === "account_exists" || msg.toLowerCase().includes("account_exists"))) {
        showToast("An account already exists for this email. Sign in, then open your invite link again.", { variant: "error" });
      } else {
        showToast(msg, { variant: "error" });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const field = (name: string): React.CSSProperties => ({
    width: "100%",
    padding: "13px 16px",
    fontSize: "14px",
    fontFamily: "'DM Sans', sans-serif",
    background: focused === name ? "#ffffff" : "#fafaf9",
    border: focused === name ? "1.5px solid #FF6B1A" : "1.5px solid #ede7df",
    borderRadius: "10px",
    color: "#1a1a1a",
    outline: "none",
    transition: "all 0.18s ease",
    boxShadow: focused === name ? "0 0 0 3px rgba(255,107,26,0.1)" : "none",
  });

  const fp = (name: string) => ({ onFocus: () => setFocused(name), onBlur: () => setFocused(null) });

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; }

        .su-root {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 0.9fr 1.1fr;
          font-family: 'DM Sans', sans-serif;
          background: #ffffff;
        }
        @media (max-width: 960px) {
          .su-root { grid-template-columns: 1fr; }
          .su-panel { display: none !important; }
        }

        /* ── Left panel ── */
        .su-panel {
          background: #0f0a06;
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          padding: 52px 48px;
        }

        .su-panel-inner { position: relative; z-index: 2; }

        .su-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 48px;
        }
        .su-brand-icon {
          width: 32px; height: 32px;
          border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          overflow: hidden;
        }
        .su-brand-icon img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        .su-brand-name {
          font-family: 'Syne', sans-serif;
          font-weight: 800;
          font-size: 17px;
          color: #ffffff;
          letter-spacing: -0.2px;
        }
        .su-brand-name span { color: #FF6B1A; }

        .su-panel-label {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 2px;
          color: #FF6B1A;
          text-transform: uppercase;
          margin-bottom: 14px;
        }

        .su-panel-title {
          font-family: 'Syne', sans-serif;
          font-weight: 700;
          font-size: 26px;
          line-height: 1.2;
          color: #ffffff;
          letter-spacing: -0.4px;
          margin-bottom: 36px;
        }
        .su-panel-title em { color: #FF6B1A; font-style: normal; }

        /* Layer stack */
        .su-layers { display: flex; flex-direction: column; gap: 0; }

        .su-layer {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          padding: 16px 0;
          border-top: 1px solid rgba(255,255,255,0.06);
          animation: layerReveal 0.5s ease both;
        }

        @keyframes layerReveal {
          from { opacity: 0; transform: translateX(-12px); }
          to   { opacity: 1; transform: translateX(0); }
        }

        .su-layer-icon {
          width: 36px; height: 36px;
          border-radius: 8px;
          background: rgba(255,107,26,0.15);
          display: flex; align-items: center; justify-content: center;
          font-size: 16px;
          flex-shrink: 0;
          margin-top: 1px;
        }

        .su-layer-title {
          font-size: 13px;
          font-weight: 600;
          color: #ffffff;
          margin-bottom: 3px;
        }
        .su-layer-desc {
          font-size: 12px;
          color: rgba(255,255,255,0.45);
          line-height: 1.5;
        }

        /* ── Right panel ── */
        .su-form-wrap {
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 52px 40px;
          overflow-y: auto;
          background: #ffffff;
        }

        .su-form-inner {
          width: 100%;
          max-width: 460px;
          animation: formReveal 0.65s cubic-bezier(0.22,1,0.36,1) both;
        }

        @keyframes formReveal {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .su-wordmark {
          display: flex; align-items: center; gap: 10px;
          margin-bottom: 32px;
        }
        .su-wordmark-icon {
          width: 30px; height: 30px;
          border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          overflow: hidden;
        }
        .su-wordmark-icon img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        .su-wordmark-name {
          font-family: 'Syne', sans-serif;
          font-weight: 800; font-size: 16px;
          color: #1a1a1a; letter-spacing: -0.2px;
        }
        .su-wordmark-name span { color: #FF6B1A; }

        .su-headline {
          font-family: 'Syne', sans-serif;
          font-weight: 700; font-size: 24px;
          line-height: 1.25; color: #1a1a1a;
          letter-spacing: -0.4px; margin-bottom: 8px;
        }
        .su-sub {
          font-size: 14px; color: #7a7060;
          line-height: 1.6; margin-bottom: 32px;
        }

        .su-section-label {
          font-size: 11px; font-weight: 700;
          letter-spacing: 1.5px; color: #b0a090;
          text-transform: uppercase; margin-bottom: 14px;
          margin-top: 28px;
        }
        .su-section-label:first-of-type { margin-top: 0; }

        .su-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 12px;
        }
        .su-full { margin-bottom: 12px; }

        /* Plan cards */
        .su-plans {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-bottom: 16px;
        }
        .su-plan-card {
          border: 1.5px solid #ede7df;
          border-radius: 12px;
          padding: 14px 12px;
          cursor: pointer;
          transition: all 0.18s ease;
          background: #fafaf9;
          text-align: left;
        }
        .su-plan-card:hover { border-color: #FF6B1A; background: #fff8f4; }
        .su-plan-card.active {
          border-color: #FF6B1A;
          background: #fff5ef;
          box-shadow: 0 0 0 3px rgba(255,107,26,0.1);
        }
        .su-plan-name {
          font-size: 13px; font-weight: 700;
          color: #1a1a1a; margin-bottom: 4px;
        }
        .su-plan-price {
          font-size: 11px; font-weight: 600;
          color: #FF6B1A; margin-bottom: 3px;
        }
        .su-plan-note {
          font-size: 11px; color: #9a8878; line-height: 1.4;
        }

        /* Trial toggle */
        .su-trial-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #fafaf9;
          border: 1.5px solid #ede7df;
          border-radius: 10px;
          padding: 13px 16px;
          margin-bottom: 24px;
          cursor: pointer;
          transition: all 0.18s ease;
        }
        .su-trial-row:hover { border-color: #FF6B1A; }
        .su-trial-row.active { border-color: #FF6B1A; background: #fff5ef; }
        .su-trial-label { font-size: 13px; font-weight: 500; color: #3a3028; }
        .su-trial-badge {
          font-size: 11px; font-weight: 700;
          background: #FF6B1A; color: white;
          padding: 3px 10px; border-radius: 100px;
          letter-spacing: 0.3px;
        }

        /* Toggle switch */
        .su-toggle {
          width: 38px; height: 22px;
          border-radius: 100px;
          background: #ede7df;
          position: relative;
          transition: background 0.2s;
          flex-shrink: 0;
          margin-left: 12px;
        }
        .su-toggle.on { background: #FF6B1A; }
        .su-toggle::after {
          content: '';
          position: absolute;
          top: 3px; left: 3px;
          width: 16px; height: 16px;
          border-radius: 50%;
          background: white;
          transition: transform 0.2s;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }
        .su-toggle.on::after { transform: translateX(16px); }

        .su-submit {
          width: 100%;
          padding: 15px;
          background: #FF6B1A;
          color: white;
          border: none; border-radius: 10px;
          font-family: 'DM Sans', sans-serif;
          font-size: 15px; font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          letter-spacing: 0.2px;
        }
        .su-submit:hover:not(:disabled) {
          background: #e85c0d;
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(255,107,26,0.35);
        }
        .su-submit:active:not(:disabled) { transform: translateY(0); }
        .su-submit:disabled { opacity: 0.6; cursor: not-allowed; }

        .su-error {
          font-size: 13px; color: #d94f2b;
          background: #fff5f2;
          border: 1px solid #ffd5c8;
          border-radius: 8px;
          padding: 10px 14px;
          margin-bottom: 16px;
        }

        .su-footer {
          display: flex;
          justify-content: space-between;
          margin-top: 22px;
          padding-top: 18px;
          border-top: 1px solid #f0e8e0;
        }
        .su-footer a {
          font-size: 13px; color: #a89880;
          text-decoration: none; transition: color 0.2s;
        }
        .su-footer a:hover { color: #FF6B1A; }

        label.su-field-label {
          display: block;
          font-size: 12px; font-weight: 600;
          color: #5a5048; letter-spacing: 0.4px;
          text-transform: uppercase; margin-bottom: 6px;
        }
      `}</style>

      <div className="su-root">

        {/* ── LEFT: Dark Infrastructure Panel ── */}
        <section className="su-panel">
          <InfraStack />
          <div className="su-panel-inner">
            <div className="su-brand">
              <div className="su-brand-icon">
                <img src={brandLogo} alt="Data Plier logo" />
              </div>
              <span className="su-brand-name">Data<span>Plier</span></span>
            </div>

            <p className="su-panel-label">Your data infrastructure</p>
            <h2 className="su-panel-title">
              Everything you need to<br /><em>grip, cut, twist & pull</em><br />data across any cloud.
            </h2>

            <div className="su-layers">
              {LAYERS.map((layer, i) => (
                <div
                  key={layer.title}
                  className="su-layer"
                  style={{ animationDelay: `${i * 0.1}s` }}
                >
                  <div className="su-layer-icon" style={{ color: layer.color }}>
                    {layer.icon}
                  </div>
                  <div>
                    <div className="su-layer-title">{layer.title}</div>
                    <div className="su-layer-desc">{layer.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── RIGHT: Signup Form ── */}
        <section className="su-form-wrap">
          <div className="su-form-inner">

            {/* Mobile-only wordmark */}
            <div className="su-wordmark" style={{ display: "none" }}>
              <div className="su-wordmark-icon">
                <img src={brandLogo} alt="Data Plier logo" />
              </div>
              <span className="su-wordmark-name">Data<span>Plier</span></span>
            </div>

            <h1 className="su-headline">{inviteToken ? "Join your team workspace." : "Provision your workspace."}</h1>
            <p className="su-sub">
              {inviteToken
                ? "Finish account setup to access the workspace you were invited to."
                : "Set up your account and choose a plan. You can invite teammates and connect data sources right after."}
            </p>
            {inviteToken && invitePreviewQuery.isError ? (
              <p className="su-sub" style={{ color: "#b91c1c", marginTop: 8 }}>
                This invite link is invalid or has expired. Ask an admin to send a new invitation.
              </p>
            ) : null}
            {inviteToken && invitePreviewQuery.data ? (
              <div
                className="su-sub"
                style={{
                  marginTop: 12,
                  padding: "12px 14px",
                  borderRadius: 10,
                  background: "rgba(255,107,26,0.08)",
                  border: "1px solid rgba(255,107,26,0.25)",
                  color: "#1a1a1a"
                }}
              >
                You are joining <strong>{invitePreviewQuery.data.workspace_name}</strong> as{" "}
                <strong className="capitalize">{invitePreviewQuery.data.role}</strong>.
              </div>
            ) : null}

            <form onSubmit={handleSubmit}>

              {/* ── Section: Identity ── */}
              <p className="su-section-label">Your details</p>
              <div className="su-grid-2">
                <div>
                  <label className="su-field-label">Full name</label>
                  <input
                    style={field("full_name")}
                    placeholder="Ada Lovelace"
                    value={form.full_name}
                    onChange={(e) => setForm((s) => ({ ...s, full_name: e.target.value }))}
                    required
                    {...fp("full_name")}
                  />
                </div>
                <div>
                  <label className="su-field-label">Company</label>
                  <input
                    style={field("company")}
                    placeholder="Acme Corp"
                    value={form.company}
                    onChange={(e) => setForm((s) => ({ ...s, company: e.target.value }))}
                    required
                    {...fp("company")}
                  />
                </div>
              </div>
              <div className="su-full">
                <label className="su-field-label">Work email</label>
                <input
                  style={field("email")}
                  type="email"
                  placeholder="ada@acme.com"
                  value={form.email}
                  onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
                  required
                  readOnly={Boolean(inviteToken && invitePreviewQuery.data?.email)}
                  {...fp("email")}
                />
              </div>
              <div className="su-full">
                <label className="su-field-label">Password</label>
                <input
                  style={field("password")}
                  type="password"
                  placeholder="••••••••••"
                  value={form.password}
                  onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))}
                  required
                  {...fp("password")}
                />
              </div>

              {/* ── Section: Plan ── */}
              <p className="su-section-label" style={{ marginTop: 28 }}>Choose a plan</p>
              <div className="su-plans">
                {PLANS.map((plan) => (
                  <div
                    key={plan.id}
                    className={`su-plan-card${form.plan_id === plan.id ? " active" : ""}`}
                    onClick={() => setForm((s) => ({ ...s, plan_id: plan.id }))}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && setForm((s) => ({ ...s, plan_id: plan.id }))}
                  >
                    <div className="su-plan-name">{plan.name}</div>
                    <div className="su-plan-price">{plan.price}</div>
                    <div className="su-plan-note">{plan.note}</div>
                  </div>
                ))}
              </div>

              {/* ── Trial toggle ── */}
              <div
                className={`su-trial-row${form.start_trial ? " active" : ""}`}
                onClick={() => setForm((s) => ({ ...s, start_trial: !s.start_trial }))}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && setForm((s) => ({ ...s, start_trial: !s.start_trial }))}
              >
                <div>
                  <div className="su-trial-label">Start free trial</div>
                  <div style={{ fontSize: 12, color: "#a89880", marginTop: 2 }}>
                    No credit card required · Cancel anytime
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {form.start_trial && (
                    <span className="su-trial-badge">{selectedPlan?.trial}</span>
                  )}
                  <div className={`su-toggle${form.start_trial ? " on" : ""}`} />
                </div>
              </div>


              <button
                className="su-submit"
                type="submit"
                disabled={isSubmitting || (Boolean(inviteToken) && (invitePreviewQuery.isError || invitePreviewQuery.isLoading))}
              >
                {isSubmitting ? "Creating workspace…" : `Create ${form.plan_id.charAt(0).toUpperCase() + form.plan_id.slice(1)} workspace →`}
              </button>
            </form>

            <div className="su-footer">
              <Link to="/login">Already have an account?</Link>
              <Link to="/pricing">Compare plans</Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}