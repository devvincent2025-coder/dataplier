/**
 * Animated “product window” simulation: packets flow through the control plane hub to targets.
 * Inspired by enterprise data platform marketing demos (e.g. Databricks, dbt product storytelling).
 */
export function ControlPlaneSimulation() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50 to-white shadow-[0_24px_80px_-20px_rgba(15,23,42,0.12)]">
      <div className="flex items-center gap-2 border-b border-slate-200/80 bg-white/90 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/90" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/90" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/90" />
        <span className="ml-3 font-mono text-[11px] text-slate-500">dataplier — control_plane · live</span>
      </div>
      <div className="relative p-6 sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(249,115,22,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(249,115,22,0.03)_1px,transparent_1px)] bg-[size:24px_24px]" />
        <div className="relative flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <SourceCard label="Postgres" sub="OLTP" />
            <FlowRail className="hidden flex-1 sm:flex" />
            <HubCard />
            <FlowRail className="hidden flex-1 sm:flex" reverse />
            <div className="flex flex-wrap gap-2 sm:flex-col sm:gap-3">
              <TargetChip label="Snowflake" />
              <TargetChip label="Databricks" />
              <TargetChip label="AI store" dim />
            </div>
          </div>
          <PacketLayer />
          <div className="flex items-center justify-center gap-2 text-center font-mono text-[10px] uppercase tracking-widest text-slate-400">
            <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-ember" />
            Intelligent routing · chunk-aware · lineage on
          </div>
        </div>
      </div>
    </div>
  );
}

function SourceCard({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="relative z-10 w-[100px] shrink-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{sub}</p>
      <p className="mt-1 text-sm font-semibold text-slate-800">{label}</p>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100">
        <div className="sim-shimmer h-full w-1/2 rounded-full bg-ember/80" />
      </div>
    </div>
  );
}

function HubCard() {
  return (
    <div className="relative z-10 w-[140px] shrink-0 rounded-2xl border-2 border-ember/40 bg-gradient-to-br from-orange-50 to-amber-50 p-4 shadow-md shadow-orange-500/10">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ember">Data Plier</p>
      <p className="mt-2 text-xs font-medium text-slate-700">Route · optimize · govern</p>
      <div className="mt-3 flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-6 flex-1 animate-sim-pulse-bar rounded bg-ember/20"
            style={{ animationDelay: `${i * 0.25}s` }}
          />
        ))}
      </div>
    </div>
  );
}

function TargetChip({ label, dim }: { label: string; dim?: boolean }) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-center text-xs font-semibold ${
        dim ? "border-slate-200 bg-slate-50 text-slate-500" : "border-slate-200 bg-white text-slate-800 shadow-sm"
      }`}
    >
      {label}
    </div>
  );
}

function FlowRail({ className, reverse }: { className?: string; reverse?: boolean }) {
  return (
    <div className={`relative h-2 min-w-[40px] overflow-hidden rounded-full bg-slate-200/80 ${className ?? ""}`}>
      <div
        className={`absolute top-0 h-full w-1/3 rounded-full bg-gradient-to-r from-ember/40 via-ember to-amber-500 ${reverse ? "animate-sim-flow-reverse" : "animate-sim-flow"}`}
      />
    </div>
  );
}

function PacketLayer() {
  return (
    <div className="relative mt-2 h-14 overflow-hidden rounded-xl border border-dashed border-ember/25 bg-orange-50/30 sm:h-16">
      <svg className="h-full w-full" viewBox="0 0 600 64" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="sim-path" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.15" />
            <stop offset="50%" stopColor="#f97316" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#ea580c" stopOpacity="0.15" />
          </linearGradient>
        </defs>
        <path
          d="M 20 32 Q 150 8, 300 32 T 580 32"
          fill="none"
          stroke="url(#sim-path)"
          strokeWidth="2"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className="animate-dash-flow"
          strokeDasharray="10 14"
        />
      </svg>
      <span className="sim-packet sim-packet-a absolute left-[8%] top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-ember shadow-lg shadow-orange-500/40" />
      <span className="sim-packet sim-packet-b absolute left-[8%] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-amber-400 shadow-md" />
      <span className="sim-packet sim-packet-c absolute left-[8%] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-orange-600/90" />
    </div>
  );
}
