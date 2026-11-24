import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Network, Search, Sparkles } from "lucide-react";

import {
  DEFAULT_ROUTING_OBJECTIVE_LABEL,
  ROUTING_OBJECTIVES,
  type RoutingObjectiveOption
} from "../data/routing-objectives";
import { useToast } from "../context/ToastContext";
import { useQueryErrorToast } from "../hooks/useQueryErrorToast";
import { intelligenceApi, tenantApi, type RoutingCostPreference } from "../lib/api";
import { useSessionStore } from "../store/session";

const inputClass =
  "mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100";

const COST_PREFERENCE_OPTIONS: { value: RoutingCostPreference; label: string }[] = [
  { value: "balanced", label: "Balanced" },
  { value: "min_cost", label: "Minimum Cost" },
  { value: "min_latency", label: "Minimum Latency" }
];

export function RoutingCenterPage() {
  const { token, user } = useSessionStore();
  const { showToast } = useToast();
  const workspaceId = user?.workspace_id ?? "";
  const dataSystemsQuery = useQuery({
    queryKey: ["data-systems", workspaceId],
    queryFn: () => tenantApi.dataSystems(token!, workspaceId),
    enabled: Boolean(token && workspaceId)
  });
  const systems = dataSystemsQuery.data?.items ?? [];

  const [objective, setObjective] = useState(DEFAULT_ROUTING_OBJECTIVE_LABEL);
  const [sourceSystem, setSourceSystem] = useState("");
  const [destinationSystem, setDestinationSystem] = useState("");

  useEffect(() => {
    if (!systems.length || sourceSystem) {
      return;
    }
    setSourceSystem(systems[0].slug);
    const dest = systems.find((s) => s.slug === "aws-s3") ?? systems[1] ?? systems[0];
    setDestinationSystem(dest.slug);
  }, [systems, sourceSystem]);
  const [datasetGb, setDatasetGb] = useState(120);
  const [bandwidthMbps, setBandwidthMbps] = useState(512);
  const [workerCapacity, setWorkerCapacity] = useState(12);
  const [costPreference, setCostPreference] = useState<RoutingCostPreference>("balanced");
  const [latencySlo, setLatencySlo] = useState(90);

  const mutation = useMutation({
    mutationFn: () =>
      intelligenceApi.createRoute(token!, user!.workspace_id, {
        objective,
        source_system: sourceSystem,
        destination_system: destinationSystem,
        dataset_size_gb: datasetGb,
        network_bandwidth_mbps: bandwidthMbps,
        worker_capacity: workerCapacity,
        cost_preference: costPreference,
        latency_slo_minutes: latencySlo
      }),
    onError: (error) => {
      showToast(error instanceof Error ? error.message : "Request failed", { variant: "error" });
    }
  });

  useQueryErrorToast(
    Boolean(dataSystemsQuery.isError),
    dataSystemsQuery.error,
    "Could not load systems.",
    showToast
  );

  const strategy = mutation.data;

  return (
    <div className="space-y-8">
      <section className="rounded border border-slate-200 bg-white p-8 shadow-panel">
        <div className="flex items-center gap-3">
          <Network className="h-8 w-8 text-orange-600" />
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-orange-600">Intelligence Plane</p>
            <h1 className="mt-1 text-3xl font-semibold text-slate-900">Routing center</h1>
          </div>
        </div>
        <p className="mt-4 text-slate-600">
          Describe how you want data to move—source and destination systems, how large the dataset is, your network and worker capacity, and whether you care more about
          cost, speed, or balance. Data Plier returns a recommended route: chunk sizes, compression, and the sequence of hops so you can align pipelines and jobs with a
          plan that fits your constraints.
        </p>
        <div className="mt-5 flex flex-wrap gap-2 text-sm">
          <Link
            to="/pipelines"
            className="rounded border border-slate-200 bg-white px-3 py-2 font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Pipelines
          </Link>
          <Link
            to="/jobs-monitor"
            className="rounded border border-slate-200 bg-white px-3 py-2 font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Jobs monitor
          </Link>
          <Link
            to="/observability"
            className="rounded border border-slate-200 bg-white px-3 py-2 font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Observability
          </Link>
          <Link
            to="/pipeline-builder"
            className="rounded border border-slate-200 bg-white px-3 py-2 font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Pipeline builder
          </Link>
        </div>
      </section>

      <div className="grid gap-8 xl:grid-cols-[1fr_1fr]">
        <form
          className="space-y-4 rounded border border-slate-200 bg-white p-6 shadow-panel"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Sparkles className="h-5 w-5 text-orange-600" />
            Request strategy
          </h2>
          <label className="block text-sm font-medium text-slate-700">
            Objective
            <p className="mt-0.5 text-xs font-normal text-slate-500">
              Choose a preset goal common in data platform teams; search by keyword (e.g. CDC, SLA, egress).
            </p>
            <SearchableObjectiveSelect value={objective} onChange={setObjective} options={ROUTING_OBJECTIVES} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Source system
              {dataSystemsQuery.isLoading ? (
                <p className="mt-1 text-sm text-slate-500">Loading systems…</p>
              ) : dataSystemsQuery.isError ? null : (
                <SearchableSystemSelect value={sourceSystem} onChange={setSourceSystem} systems={systems} placeholder="Select source system" />
              )}
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Destination system
              {dataSystemsQuery.isLoading ? (
                <p className="mt-1 text-sm text-slate-500">Loading systems…</p>
              ) : dataSystemsQuery.isError ? null : (
                <SearchableSystemSelect value={destinationSystem} onChange={setDestinationSystem} systems={systems} placeholder="Select destination system" />
              )}
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm font-medium text-slate-700">
              Dataset size (GB)
              <input
                type="number"
                min={1}
                value={datasetGb}
                onChange={(e) => setDatasetGb(Number(e.target.value))}
                className={inputClass}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Bandwidth (Mbps)
              <input
                type="number"
                min={1}
                value={bandwidthMbps}
                onChange={(e) => setBandwidthMbps(Number(e.target.value))}
                className={inputClass}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Worker capacity
              <input
                type="number"
                min={1}
                value={workerCapacity}
                onChange={(e) => setWorkerCapacity(Number(e.target.value))}
                className={inputClass}
              />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Cost Preference
              <select
                value={costPreference}
                onChange={(e) => setCostPreference(e.target.value as RoutingCostPreference)}
                className={inputClass}
              >
                {COST_PREFERENCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Latency SLO (minutes)
              <input
                type="number"
                min={1}
                value={latencySlo}
                onChange={(e) => setLatencySlo(Number(e.target.value))}
                className={inputClass}
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={
              mutation.isPending ||
              !token ||
              !user?.workspace_id ||
              dataSystemsQuery.isLoading ||
              !systems.length ||
              !sourceSystem ||
              !destinationSystem ||
              !objective
            }
            className="rounded bg-orange-500 px-5 py-3 font-medium text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {mutation.isPending ? "Computing…" : "Compute route"}
          </button>
        </form>

        <div className="rounded border border-slate-200 bg-white p-6 shadow-panel">
          <h2 className="text-lg font-semibold text-slate-900">Recommended strategy</h2>
          {!strategy && !mutation.isPending ? (
            <p className="mt-4 text-sm text-slate-500">Submit the form to see chunk targets, compression, and hop list.</p>
          ) : null}
          {mutation.isPending ? <p className="mt-4 text-sm text-slate-500">Calling routing engine…</p> : null}
          {strategy ? (
            <div className="mt-4 space-y-4 text-slate-700">
              <p className="text-sm text-slate-500">{strategy.objective}</p>
              <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                {strategy.strategy_id ? (
                  <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono" title="Strategy id">
                    {strategy.strategy_id.slice(0, 8)}…
                  </span>
                ) : null}
                {strategy.schema_version ? (
                  <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1">schema {strategy.schema_version}</span>
                ) : null}
                {strategy.decision_path ? (
                  <span className="rounded border border-orange-200 bg-orange-50 px-2 py-1 text-orange-900">
                    {strategy.decision_path === "ml_guardrailed" ? "ML + guardrails" : "Baseline policy"}
                  </span>
                ) : null}
                {strategy.model_version ? (
                  <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1">model {strategy.model_version}</span>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Chunk target</p>
                  <p className="text-lg font-semibold text-slate-900">{strategy.chunk_target_mb} MB</p>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Compression</p>
                  <p className="text-lg font-semibold text-slate-900">{strategy.compression}</p>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Confidence</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {typeof strategy.confidence === "number" ? `${Math.round(strategy.confidence * 100)}%` : "—"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Higher when live metrics, catalog, and ML all agree.</p>
                </div>
              </div>
              {strategy.sla_summary && typeof strategy.sla_summary === "object" ? (
                <div className="rounded border border-slate-200 bg-white p-3 text-sm text-slate-700">
                  <p className="font-medium text-slate-900">SLA snapshot (orchestration)</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600">
                    <li>
                      Wall-clock estimate:{" "}
                      <span className="font-mono text-slate-800">
                        {String((strategy.sla_summary as Record<string, unknown>).estimated_wall_clock_minutes ?? "—")} min
                      </span>{" "}
                      vs SLO{" "}
                      <span className="font-mono text-slate-800">
                        {String((strategy.sla_summary as Record<string, unknown>).latency_slo_minutes ?? "—")} min
                      </span>
                    </li>
                    <li>
                      Within SLO:{" "}
                      <span className="font-medium text-slate-900">
                        {String((strategy.sla_summary as Record<string, unknown>).within_slo ?? "—")}
                      </span>
                    </li>
                    <li>Staging hop: {(strategy.sla_summary as Record<string, unknown>).staging_included ? "yes" : "no"}</li>
                  </ul>
                  <p className="mt-2 text-xs text-slate-500">
                    {String((strategy.sla_summary as Record<string, unknown>).notes ?? "")}
                  </p>
                </div>
              ) : null}
              {strategy.cost_transparency && typeof strategy.cost_transparency === "object" ? (
                <div className="rounded border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-950">
                  <p className="font-medium text-emerald-950">Cost transparency (warehouse / FinOps)</p>
                  <p className="mt-2 text-xs">
                    Egress band (USD / month, illustrative):{" "}
                    <span className="font-mono">
                      ${String((strategy.cost_transparency as Record<string, unknown>).egress_usd_monthly_band_low ?? "?")} — $
                      {String((strategy.cost_transparency as Record<string, unknown>).egress_usd_monthly_band_high ?? "?")}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-emerald-900/90">
                    {(strategy.cost_transparency as Record<string, unknown>).methodology as string}
                  </p>
                </div>
              ) : null}
              {strategy.warnings && strategy.warnings.length > 0 ? (
                <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  <p className="font-medium text-amber-900">Warnings</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {strategy.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {strategy.signals_used && Object.keys(strategy.signals_used).length > 0 ? (
                <details className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
                  <summary className="cursor-pointer font-medium text-slate-800">Signals & diagnostics</summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-xs text-slate-600">
                    {JSON.stringify(strategy.signals_used, null, 2)}
                  </pre>
                </details>
              ) : null}
              <div>
                <p className="text-sm font-medium text-slate-900">Route hops</p>
                <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-slate-700">
                  {strategy.route.map((hop, i) => (
                    <li key={`${hop.system}-${i}`}>
                      <span className="font-medium text-slate-900">{hop.system}</span> — {hop.action}
                    </li>
                  ))}
                </ol>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">Rationale</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                  {strategy.rationale.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SearchableObjectiveSelect({
  value,
  onChange,
  options
}: {
  value: string;
  onChange: (label: string) => void;
  options: RoutingObjectiveOption[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((o) => o.label === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return options;
    }
    return options.filter((o) => `${o.label} ${o.search}`.toLowerCase().includes(q));
  }, [query, options]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    function onDocMouseDown(event: MouseEvent) {
      if (!rootRef.current) {
        return;
      }
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  const displayLabel = selected?.label ?? "Select an objective…";

  return (
    <div className="relative mt-1" ref={rootRef}>
      <button
        type="button"
        className={`${inputClass} mt-0 flex min-h-[2.75rem] items-center justify-between text-left`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="line-clamp-2 pr-2 text-sm leading-snug">{displayLabel}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 w-full rounded border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-200 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search objectives…"
                className="w-full rounded border border-slate-300 bg-white py-2 pl-8 pr-2 text-sm text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              />
            </div>
          </div>
          <ul className="max-h-72 overflow-y-auto py-1" role="listbox">
            {filtered.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.label);
                    setOpen(false);
                  }}
                  className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-orange-50"
                  role="option"
                  aria-selected={value === o.label}
                >
                  <span className="min-w-0 flex-1 leading-snug">{o.label}</span>
                  {value === o.label ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" /> : null}
                </button>
              </li>
            ))}
            {filtered.length === 0 ? <li className="px-3 py-2 text-sm text-slate-500">No matching objectives.</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function SearchableSystemSelect({
  value,
  onChange,
  systems,
  placeholder
}: {
  value: string;
  onChange: (slug: string) => void;
  systems: Array<{ slug: string; name: string; category: string }>;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = systems.find((s) => s.slug === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return systems;
    }
    return systems.filter((s) => `${s.name} ${s.slug} ${s.category}`.toLowerCase().includes(q));
  }, [query, systems]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    function onDocMouseDown(event: MouseEvent) {
      if (!rootRef.current) {
        return;
      }
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  return (
    <div className="relative mt-1" ref={rootRef}>
      <button
        type="button"
        className={`${inputClass} mt-0 flex items-center justify-between`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{selected?.name ?? placeholder}</span>
        <ChevronDown className="h-4 w-4 text-slate-500" />
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 w-full rounded border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-200 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search systems..."
                className="w-full rounded border border-slate-300 bg-white py-2 pl-8 pr-2 text-sm text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              />
            </div>
          </div>
          <ul className="max-h-64 overflow-y-auto py-1" role="listbox">
            {filtered.map((system) => (
              <li key={system.slug}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(system.slug);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-700 hover:bg-orange-50"
                  role="option"
                  aria-selected={value === system.slug}
                >
                  <span className="truncate">{system.name}</span>
                  {value === system.slug ? <Check className="h-4 w-4 text-orange-600" /> : null}
                </button>
              </li>
            ))}
            {filtered.length === 0 ? <li className="px-3 py-2 text-sm text-slate-500">No matching systems.</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
