import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, Database, GitBranch, Logs, Network, Timer } from "lucide-react";

import { useToast } from "../context/ToastContext";
import { governanceApi } from "../lib/api";
import { useSessionStore } from "../store/session";

export function DashboardPage() {
  const { token, user } = useSessionStore();
  const { showToast } = useToast();
  const enabled = Boolean(token && user?.workspace_id);

  const metricsQuery = useQuery({
    queryKey: ["dashboard-observability-summary", user?.workspace_id],
    queryFn: () => governanceApi.observabilitySummary(token!, user!.workspace_id),
    enabled
  });
  const metadataQuery = useQuery({
    queryKey: ["dashboard-metadata-summary", user?.workspace_id],
    queryFn: () => governanceApi.metadataSummary(token!, user!.workspace_id),
    enabled
  });
  const lineageQuery = useQuery({
    queryKey: ["dashboard-lineage-graph", user?.workspace_id],
    queryFn: () => governanceApi.lineageGraph(token!, user!.workspace_id),
    enabled
  });
  const policyQuery = useQuery({
    queryKey: ["dashboard-policy-summary", user?.workspace_id],
    queryFn: () => governanceApi.policySummary(token!, user!.workspace_id),
    enabled
  });

  const anyBlockError =
    metricsQuery.isError || metadataQuery.isError || lineageQuery.isError || policyQuery.isError;
  const dashboardErrorToasted = useRef(false);
  useEffect(() => {
    if (!anyBlockError) {
      dashboardErrorToasted.current = false;
      return;
    }
    if (dashboardErrorToasted.current) {
      return;
    }
    dashboardErrorToasted.current = true;
    showToast("Unable to load one or more analytics blocks.", { variant: "error" });
  }, [anyBlockError, showToast]);

  const observability = metricsQuery.data;
  const metadata = metadataQuery.data;

  const analyticsSeries = [
    { name: "Worker Utilization", value: observability ? Math.round(observability.worker_utilization * 100) : 0 },
    { name: "Transfer Speed", value: observability?.transfer_speed_mb_s ?? 0 },
    { name: "Queue Backlog", value: observability?.queue_backlog ?? 0 },
    { name: "Chunk Failures", value: observability?.chunk_failures ?? 0 },
    { name: "Pipeline Latency", value: observability?.pipeline_latency_s ?? 0 }
  ];

  return (
    <div className="space-y-6">
      <section className="rounded border border-slate-200 bg-white p-8 shadow-panel">
        <p className="text-xs uppercase tracking-[0.24em] text-orange-600">Live Workspace Analytics</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{user?.company || "Data Plier"} metrics dashboard</h1>
        <p className="mt-3 max-w-3xl text-slate-600">Only backend-powered observability, metadata, and lineage analytics for this workspace.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={<Activity className="h-4 w-4 text-orange-600" />} label="Worker Utilization" value={observability ? `${Math.round(observability.worker_utilization * 100)}%` : "..."} />
        <MetricCard icon={<Timer className="h-4 w-4 text-orange-600" />} label="Transfer Speed" value={observability ? `${observability.transfer_speed_mb_s} MB/s` : "..."} />
        <MetricCard icon={<Logs className="h-4 w-4 text-orange-600" />} label="Queue Backlog" value={observability ? `${observability.queue_backlog}` : "..."} />
        <MetricCard icon={<GitBranch className="h-4 w-4 text-orange-600" />} label="Chunk Failures" value={observability ? `${observability.chunk_failures}` : "..."} />
        <MetricCard icon={<Network className="h-4 w-4 text-orange-600" />} label="Pipeline Latency" value={observability ? `${observability.pipeline_latency_s}s` : "..."} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.45fr_0.55fr]">
        <div className="rounded border border-slate-200 bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Backend Analytics</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">Operational signal profile</h2>
            </div>
          </div>
          <div className="mt-6 h-80">
            <ResponsiveContainer>
              <AreaChart data={analyticsSeries}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip />
                <Area type="monotone" dataKey="value" stroke="#f97316" fill="#fdba74" fillOpacity={0.28} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded border border-slate-200 bg-white p-6 shadow-panel">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Inventory Analytics</p>
          <div className="mt-5 space-y-3">
            <MetricLine label="Connections" value={metadata?.counts.connections ?? 0} />
            <MetricLine label="Datasets" value={metadata?.counts.datasets ?? 0} />
            <MetricLine label="Pipelines" value={metadata?.counts.pipelines ?? 0} />
            <MetricLine label="Jobs" value={metadata?.counts.jobs ?? 0} />
            <MetricLine label="Logs" value={metadata?.counts.logs ?? 0} />
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded border border-slate-200 bg-white p-6 shadow-panel">
          <h2 className="text-xl font-semibold text-slate-950">Recent Platform Logs</h2>
          <div className="mt-5 space-y-3">
            {metadata?.recent_logs.map((log) => (
              <div key={`${log.created_at}-${log.message}`} className="rounded border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-900">
                    {log.entity_type} · {log.level}
                  </p>
                  <p className="mono text-xs text-slate-500">{log.created_at}</p>
                </div>
                <p className="mono mt-3 text-sm text-slate-700">{log.message}</p>
              </div>
            ))}
            {!metadata?.recent_logs?.length ? <p className="text-sm text-slate-500">No recent logs.</p> : null}
          </div>
        </div>

        <div className="rounded border border-slate-200 bg-white p-6 shadow-panel">
          <h2 className="text-xl font-semibold text-slate-950">Lineage Activity</h2>
          <div className="mt-5 space-y-3">
            {lineageQuery.data?.edges.map((edge) => (
              <div key={`${edge.source}-${edge.target}-${edge.operation}`} className="rounded border border-slate-200 bg-slate-50 p-4">
                <p className="mono text-sm text-slate-900">
                  {edge.source} {"->"} {edge.target}
                </p>
                <p className="mt-2 text-sm text-slate-600">{edge.operation}</p>
              </div>
            ))}
            {!lineageQuery.data?.edges?.length ? <p className="text-sm text-slate-500">No lineage edges yet.</p> : null}
          </div>
        </div>
      </section>

      <section className="rounded border border-slate-200 bg-white p-6 shadow-panel">
        <p className="text-xs uppercase tracking-[0.2em] text-orange-600">Governance plane</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-950">Policy &amp; data contracts</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          RBAC posture, masking recommendations, egress rules, and integration hooks—aligned with multi-vendor control without replacing your warehouse.
        </p>
        {policyQuery.isLoading ? <p className="mt-4 text-sm text-slate-500">Loading policy snapshot…</p> : null}
        {policyQuery.data ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-medium text-slate-900">Masking rules</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {policyQuery.data.masking.map((m) => (
                  <li key={m.scope}>
                    <span className="font-mono text-xs">{m.scope}</span> — {m.rule} ({m.status})
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-medium text-slate-900">Integrations &amp; DAG export</p>
              <pre className="mt-2 max-h-40 overflow-auto rounded bg-slate-900/90 p-3 font-mono text-xs text-slate-100">
                {JSON.stringify(policyQuery.data.integrations, null, 2)}
              </pre>
            </div>
          </div>
        ) : null}
      </section>

      {(metricsQuery.isLoading || metadataQuery.isLoading || lineageQuery.isLoading || policyQuery.isLoading) ? (
        <p className="text-sm text-slate-500">Loading dashboard analytics...</p>
      ) : null}
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: JSX.Element; label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4 shadow-panel">
      <div className="flex items-center gap-2 text-slate-600">
        {icon}
        <p className="text-xs uppercase tracking-[0.18em]">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function MetricLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
      <span className="font-medium text-slate-900">{label}</span>: {value}
    </div>
  );
}
