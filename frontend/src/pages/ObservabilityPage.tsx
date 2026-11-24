import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Bell, Check, ChevronDown, ExternalLink, Search, X } from "lucide-react";

import { useToast } from "../context/ToastContext";
import type {
  ObservabilityAlertChannel,
  ObservabilityAlertRoutingState,
  ObservabilityRecentJob,
  ObservabilitySLOItem,
  ObservabilitySummary,
  ObservabilityTraceDetail,
  ObservabilityTraceListItem
} from "../lib/api";
import { governanceApi } from "../lib/api";
import { useSessionStore } from "../store/session";

const REFRESH_MS = 25_000;

const RANGE_OPTIONS = [
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
  { label: "48h", hours: 48 },
  { label: "7d", hours: 168 }
] as const;

type ModalKind = "logs" | "lineage" | "alerts" | "metric" | "correlation" | null;

type ObservabilityTab = "overview" | "traces" | "slos" | "alerting";

/** In-app routes use React Router; absolute http(s) URLs open in a new tab. */
function ObservabilitySignalHrefLink({
  href,
  className,
  children
}: {
  href: string;
  className: string;
  children: ReactNode;
}) {
  if (/^https?:\/\//i.test(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link to={href} className={className}>
      {children}
    </Link>
  );
}

export function ObservabilityPage() {
  const { token, user } = useSessionStore();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabRaw = (searchParams.get("tab") ?? "overview").toLowerCase();
  const tab: ObservabilityTab =
    tabRaw === "traces" || tabRaw === "slos" || tabRaw === "alerting" ? (tabRaw as ObservabilityTab) : "overview";
  const traceFromUrl = searchParams.get("trace") ?? "";

  const setTab = useCallback(
    (next: ObservabilityTab, trace?: string) => {
      const n = new URLSearchParams(searchParams);
      n.set("tab", next);
      if (trace) {
        n.set("trace", trace);
      } else if (next !== "traces") {
        n.delete("trace");
      }
      setSearchParams(n, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const enabled = Boolean(token && user?.workspace_id);
  const [windowHours, setWindowHours] = useState<number>(24);
  const [modal, setModal] = useState<ModalKind>(null);
  const [metricFocus, setMetricFocus] = useState<string | null>(null);
  const [correlationJobId, setCorrelationJobId] = useState<string>("");

  const metricsQuery = useQuery({
    queryKey: ["observability-summary", user?.workspace_id],
    queryFn: () => governanceApi.observabilitySummary(token!, user!.workspace_id),
    enabled,
    refetchInterval: REFRESH_MS
  });
  const timeseriesQuery = useQuery({
    queryKey: ["observability-timeseries", user?.workspace_id, windowHours],
    queryFn: () => governanceApi.observabilityTimeseries(token!, user!.workspace_id, windowHours),
    enabled,
    refetchInterval: REFRESH_MS
  });
  const recentJobsQuery = useQuery({
    queryKey: ["observability-recent-jobs", user?.workspace_id],
    queryFn: () => governanceApi.observabilityRecentJobs(token!, user!.workspace_id, { limit: 12 }),
    enabled,
    refetchInterval: REFRESH_MS
  });
  const alertsQuery = useQuery({
    queryKey: ["observability-alerts", user?.workspace_id],
    queryFn: () => governanceApi.observabilityAlerts(token!, user!.workspace_id),
    enabled,
    refetchInterval: REFRESH_MS
  });
  const metadataQuery = useQuery({
    queryKey: ["metadata-summary", user?.workspace_id],
    queryFn: () => governanceApi.metadataSummary(token!, user!.workspace_id),
    enabled,
    refetchInterval: REFRESH_MS
  });
  const lineageQuery = useQuery({
    queryKey: ["lineage-graph", user?.workspace_id],
    queryFn: () => governanceApi.lineageGraph(token!, user!.workspace_id),
    enabled,
    refetchInterval: REFRESH_MS
  });
  const slosQuery = useQuery({
    queryKey: ["observability-slos", user?.workspace_id],
    queryFn: () => governanceApi.observabilitySLOs(token!, user!.workspace_id),
    enabled,
    refetchInterval: REFRESH_MS
  });
  const tracesQuery = useQuery({
    queryKey: ["observability-traces", user?.workspace_id],
    queryFn: () => governanceApi.observabilityTraces(token!, user!.workspace_id, 50),
    enabled: enabled && tab === "traces",
    refetchInterval: tab === "traces" ? REFRESH_MS : false
  });
  const traceDetailQuery = useQuery({
    queryKey: ["observability-trace", user?.workspace_id, traceFromUrl],
    queryFn: () => governanceApi.observabilityTraceDetail(token!, user!.workspace_id, traceFromUrl),
    enabled: enabled && Boolean(traceFromUrl) && tab === "traces",
    refetchInterval: REFRESH_MS
  });
  const alertRoutingQuery = useQuery({
    queryKey: ["observability-alert-routing", user?.workspace_id],
    queryFn: () => governanceApi.observabilityAlertRouting(token!, user!.workspace_id),
    enabled: enabled && tab === "alerting",
    refetchInterval: tab === "alerting" ? REFRESH_MS : false
  });
  const correlationQuery = useQuery({
    queryKey: ["observability-correlation", user?.workspace_id, correlationJobId],
    queryFn: () => governanceApi.observabilityCorrelation(token!, user!.workspace_id, correlationJobId),
    enabled: enabled && Boolean(correlationJobId) && modal === "correlation",
    refetchInterval: false
  });

  const incidentMut = useMutation({
    mutationFn: (args: { id: string; status: "acknowledged" | "closed" }) =>
      governanceApi.observabilityIncidentUpdate(token!, user!.workspace_id!, args.id, args.status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["observability-alert-routing", user?.workspace_id] });
      showToast("Open issue updated.", { variant: "success" });
    },
    onError: (e) => showToast(e instanceof Error ? e.message : "Could not save that change.", { variant: "error" })
  });

  const channelMut = useMutation({
    mutationFn: (body: { name: string; channel_kind: string; destination: string }) =>
      governanceApi.observabilityAlertChannelCreate(token!, user!.workspace_id!, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["observability-alert-routing", user?.workspace_id] });
      showToast("Notification destination added.", { variant: "success" });
    },
    onError: (e) => showToast(e instanceof Error ? e.message : "Could not add this destination.", { variant: "error" })
  });

  const ruleMut = useMutation({
    mutationFn: (body: {
      name: string;
      description?: string;
      threshold_kind: string;
      threshold_json?: Record<string, unknown>;
      channel_id?: string;
      cooldown_minutes?: number;
    }) => governanceApi.observabilityAlertRuleCreate(token!, user!.workspace_id!, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["observability-alert-routing", user?.workspace_id] });
      showToast("Notification rule saved.", { variant: "success" });
    },
    onError: (e) => showToast(e instanceof Error ? e.message : "Could not save this rule.", { variant: "error" })
  });

  const webhookTestMut = useMutation({
    mutationFn: (channelId: string) => governanceApi.observabilityWebhookDispatchTest(token!, user!.workspace_id!, channelId),
    onSuccess: (d) => {
      showToast("Test notification queued. It will send shortly.", { variant: "success" });
    },
    onError: (e) => showToast(e instanceof Error ? e.message : "Could not queue the test.", { variant: "error" })
  });

  const metrics = metricsQuery.data;
  const metadata = metadataQuery.data;
  const lineage = lineageQuery.data;
  const logs = metadata?.recent_logs ?? [];
  const edges = lineage?.edges ?? [];
  const alerts = alertsQuery.data?.items ?? [];
  const recentJobs = recentJobsQuery.data?.items ?? [];

  const throughputChart = useMemo(
    () =>
      (timeseriesQuery.data?.throughput ?? []).map((p) => ({
        label: formatChartTime(p.t),
        mb: p.mb_per_s
      })),
    [timeseriesQuery.data?.throughput]
  );

  const latencyChart = useMemo(
    () =>
      (timeseriesQuery.data?.latency ?? []).map((p) => ({
        label: formatChartTime(p.t),
        sec: p.latency_s
      })),
    [timeseriesQuery.data?.latency]
  );

  const anyObsErr =
    metricsQuery.isError ||
    metadataQuery.isError ||
    lineageQuery.isError ||
    timeseriesQuery.isError ||
    recentJobsQuery.isError ||
    alertsQuery.isError ||
    slosQuery.isError;
  const obsErrToasted = useRef(false);
  useEffect(() => {
    if (!anyObsErr) {
      obsErrToasted.current = false;
      return;
    }
    if (obsErrToasted.current) {
      return;
    }
    obsErrToasted.current = true;
    const first =
      metricsQuery.error ??
      metadataQuery.error ??
      lineageQuery.error ??
      timeseriesQuery.error ??
      recentJobsQuery.error ??
      alertsQuery.error ??
      slosQuery.error;
    showToast(first instanceof Error ? first.message : "We could not load this page. Try again in a moment.", { variant: "error" });
  }, [
    anyObsErr,
    metricsQuery.error,
    metadataQuery.error,
    lineageQuery.error,
    timeseriesQuery.error,
    recentJobsQuery.error,
    alertsQuery.error,
    slosQuery.error,
    showToast
  ]);

  const openMetricModal = useCallback((key: string) => {
    setMetricFocus(key);
    setModal("metric");
  }, []);

  const closeModal = useCallback(() => {
    setModal(null);
    setMetricFocus(null);
  }, []);

  useEffect(() => {
    if (!modal) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeModal();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modal, closeModal]);

  const topAlerts = alerts.slice(0, 2);
  const previewLogs = logs.slice(0, 2);
  const previewEdges = edges.slice(0, 3);

  return (
    <div className="space-y-6">
      <section className="rounded border border-slate-200 bg-white p-8 shadow-panel">
        <p className="text-xs uppercase tracking-[0.24em] text-orange-600">Monitoring</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">How your workspace is running</h1>
        <p className="mt-3 max-w-3xl text-slate-600">
          Charts and tables for {user?.company ?? "your organization"}: job activity, data movement, and reliability. Numbers update about every {REFRESH_MS / 1000}{" "}
          seconds. Pick a time range for the charts below.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Chart time range</span>
          <div className="flex flex-wrap gap-2">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.hours}
                type="button"
                onClick={() => setWindowHours(opt.hours)}
                className={`rounded border px-3 py-1.5 text-sm font-medium ${
                  windowHours === opt.hours
                    ? "border-orange-400 bg-orange-50 text-orange-950"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
       
        <div className="mt-8 border-t border-slate-100 pt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Sections</p>
          <nav className="mt-3 flex flex-wrap gap-2" aria-label="Monitoring sections">
            {(
              [
                ["overview", "Overview"],
                ["traces", "Traces"],
                ["slos", "Reliability goals"],
                ["alerting", "Notifications"]
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`rounded-full border px-4 py-2 text-sm font-medium ${
                  tab === id ? "border-orange-500 bg-orange-50 text-orange-950" : "border-slate-200 bg-white text-slate-700 hover:border-orange-200"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </section>

      {tab === "overview" ? (
        <>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Worker load"
          value={metricsQuery.isLoading ? "…" : metrics ? `${Math.round(metrics.worker_utilization * 100)}%` : "—"}
          sub={metrics?.running_jobs != null ? `${metrics.running_jobs} job${metrics.running_jobs === 1 ? "" : "s"} running now` : undefined}
          onDetails={() => openMetricModal("utilization")}
        />
        <MetricCard
          label="Processing speed"
          value={metricsQuery.isLoading ? "…" : metrics ? `${metrics.transfer_speed_mb_s} MB/s` : "—"}
          sub={
            metrics?.throughput_window_hours != null
              ? `Based on finished work over the last ${metrics.throughput_window_hours} hours`
              : "Based on finished work over the last 24 hours"
          }
          onDetails={() => openMetricModal("throughput")}
        />
        <MetricCard
          label="Work waiting"
          value={metricsQuery.isLoading ? "…" : metrics ? `${metrics.queue_backlog}` : "—"}
          sub="Pipeline steps not finished yet, across jobs"
          onDetails={() => openMetricModal("backlog")}
        />
        <MetricCard
          label="Failed steps"
          value={metricsQuery.isLoading ? "…" : metrics ? `${metrics.chunk_failures}` : "—"}
          sub={metrics?.failed_jobs_24h != null && metrics.failed_jobs_24h > 0 ? `${metrics.failed_jobs_24h} failed job${metrics.failed_jobs_24h === 1 ? "" : "s"} in the last 24h` : undefined}
          onDetails={() => openMetricModal("failures")}
        />
        <MetricCard
          label="Typical run time"
          value={metricsQuery.isLoading ? "…" : metrics ? `${metrics.pipeline_latency_s}s` : "—"}
          sub={metrics?.latency_window_days != null ? `Average for completed jobs over the last ${metrics.latency_window_days} days` : "Average for completed jobs over the last 7 days"}
          onDetails={() => openMetricModal("latency")}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ChartPanel
          title="Processing speed over time"
          description="Megabytes per second, averaged each hour from work that already finished."
          loading={timeseriesQuery.isLoading}
          data={throughputChart}
          dataKey="mb"
          stroke="#ea580c"
          emptyHint="Nothing finished in this time range yet, so there is no chart."
        />
        <ChartPanel
          title="How long jobs took"
          description="Average completion time per hour for jobs that finished successfully."
          loading={timeseriesQuery.isLoading}
          data={latencyChart}
          dataKey="sec"
          stroke="#0d9488"
          emptyHint="No completed jobs in this time range yet."
        />
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded border border-slate-200 bg-white p-5 shadow-panel">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Automated checks</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-950">Workspace status</h2>
            </div>
            <Bell className="h-5 w-5 shrink-0 text-orange-500" aria-hidden />
          </div>
          <ul className="mt-4 space-y-3">
            {alertsQuery.isLoading ? <li className="text-sm text-slate-500">Loading…</li> : null}
            {!alertsQuery.isLoading &&
              topAlerts.map((a) => (
                <li key={a.id} className="rounded border border-slate-100 bg-slate-50 p-3 text-sm">
                  <p className="font-medium text-slate-900">{a.title}</p>
                  <p className="mt-1 text-slate-600">{a.detail}</p>
                  {a.href ? (
                    <ObservabilitySignalHrefLink
                      href={a.href}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-orange-700 underline"
                    >
                      Go <ExternalLink className="h-3 w-3" aria-hidden />
                    </ObservabilitySignalHrefLink>
                  ) : null}
                </li>
              ))}
          </ul>
          <button type="button" className="mt-4 text-sm font-medium text-orange-700 underline" onClick={() => setModal("alerts")}>
            View all checks
          </button>
        </div>

        <div className="rounded border border-slate-200 bg-white p-5 shadow-panel md:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-950">Recent jobs</h2>
            <Link to="/jobs-monitor" className="text-sm font-medium text-orange-700 underline">
              Open jobs monitor
            </Link>
          </div>
          {recentJobsQuery.isLoading ? <p className="mt-4 text-sm text-slate-500">Loading…</p> : null}
          {!recentJobsQuery.isLoading && !recentJobs.length ? (
            <p className="mt-4 text-sm text-slate-500">No recent jobs to show yet.</p>
          ) : null}
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="border-b border-slate-200 py-2 pr-4">Pipeline</th>
                  <th className="border-b border-slate-200 py-2 pr-4">Status</th>
                  <th className="border-b border-slate-200 py-2 pr-4">Chunks</th>
                  <th className="border-b border-slate-200 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.map((j) => (
                  <RecentJobRow key={j.id} job={j} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded border border-slate-200 bg-white p-6 shadow-panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-slate-950">Workspace snapshot</h2>
            <div className="flex items-center gap-2">
              {metadataQuery.isFetching ? <span className="text-xs text-slate-400">Updating…</span> : null}
              {user?.workspace_slug ? (
                <span className="text-xs text-slate-500">
                  Workspace: <span className="mono text-slate-600">{user.workspace_slug}</span>
                </span>
              ) : null}
            </div>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-5">
            <MetricCard label="Connections" value={`${metadata?.counts.connections ?? 0}`} />
            <MetricCard label="Datasets" value={`${metadata?.counts.datasets ?? 0}`} />
            <MetricCard label="Pipelines" value={`${metadata?.counts.pipelines ?? 0}`} />
            <MetricCard label="Jobs" value={`${metadata?.counts.jobs ?? 0}`} />
            <MetricCard label="Logs" value={`${metadata?.counts.logs ?? 0}`} />
          </div>

          <div className="mt-6 space-y-3">
            {previewLogs.map((log) => (
              <div key={`${log.created_at}-${log.message}`} className="trace-surface rounded p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-950">
                    {log.entity_type} · {log.level}
                  </p>
                  <p className="mono text-xs text-slate-500">{log.created_at}</p>
                </div>
                <p className="mono mt-3 text-sm text-slate-700">{log.message}</p>
              </div>
            ))}
          </div>
          {metadataQuery.isLoading ? <p className="mt-4 text-sm text-slate-500">Loading activity…</p> : null}
          {!metadataQuery.isLoading && !logs.length && !metadataQuery.isError ? (
            <p className="mt-4 text-sm text-slate-500">No recent audit entries yet.</p>
          ) : null}
          {logs.length > previewLogs.length ? (
            <button type="button" className="mt-4 text-sm font-medium text-orange-700 underline" onClick={() => setModal("logs")}>
              Show all {logs.length} entries
            </button>
          ) : null}
        </div>

        <div className="rounded border border-slate-200 bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-slate-950">How data moved</h2>
            {lineageQuery.isFetching ? <span className="text-xs text-slate-400">Updating…</span> : null}
          </div>
          <div className="mt-5 space-y-3">
            {previewEdges.map((edge) => (
              <div key={`${edge.source}-${edge.target}-${edge.operation}`} className="rounded border border-slate-200 bg-slate-50 p-4">
                <p className="mono text-sm text-slate-900">
                  {edge.source} {"->"} {edge.target}
                </p>
                <p className="mt-2 text-sm text-slate-600">{edge.operation}</p>
              </div>
            ))}
          </div>
          {lineageQuery.isLoading ? <p className="mt-4 text-sm text-slate-500">Loading data flow…</p> : null}
          {!lineageQuery.isLoading && !edges.length && !lineageQuery.isError ? (
            <p className="mt-4 text-sm text-slate-500">
              No connections in this snapshot.{" "}
              <Link to="/jobs-monitor?lineage=1" className="font-medium text-orange-700 underline">
                View lineage on the jobs page
              </Link>
            </p>
          ) : null}
          {edges.length > previewEdges.length ? (
            <button type="button" className="mt-4 text-sm font-medium text-orange-700 underline" onClick={() => setModal("lineage")}>
              Show all {edges.length} connections
            </button>
          ) : null}
        </div>
      </section>

      <section className="rounded border border-slate-200 bg-white p-6 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Reliability</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950">Goals and headroom</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Each goal compares actual performance to a target (for example, jobs finishing on time). You can see how much “room” is left before you miss the goal, and how fast issues are eating that room.
            </p>
          </div>
          <button type="button" className="text-sm font-medium text-orange-700 underline" onClick={() => setTab("slos")}>
            See full reliability view
          </button>
        </div>
        {slosQuery.isLoading ? <p className="mt-4 text-sm text-slate-500">Loading goals…</p> : null}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {(slosQuery.data?.items ?? []).map((s) => (
            <SLOSnapshotCard key={s.id} slo={s} onOpen={() => setTab("slos")} />
          ))}
        </div>
        {!slosQuery.isLoading && !(slosQuery.data?.items.length ?? 0) ? (
          <p className="mt-4 text-sm text-amber-800">
            No reliability goals are set up for this workspace yet. Your platform admin may need to enable this feature and restart the monitoring service.
          </p>
        ) : null}
      </section>
        </>
      ) : null}

      {tab === "traces" ? (
        <TracesEnterprisePanel
          traces={tracesQuery.data?.items ?? []}
          loading={tracesQuery.isLoading}
          traceFromUrl={traceFromUrl}
          traceDetail={traceDetailQuery.data}
          traceDetailLoading={traceDetailQuery.isLoading}
          onSelectTrace={(id) => setTab("traces", id)}
          onCorrelate={(id) => {
            setCorrelationJobId(id);
            setModal("correlation");
          }}
        />
      ) : null}

      {tab === "slos" ? <SLOEnterprisePanel items={slosQuery.data?.items ?? []} loading={slosQuery.isLoading} /> : null}

      {tab === "alerting" ? (
        <AlertRoutingPanel
          data={alertRoutingQuery.data}
          loading={alertRoutingQuery.isLoading}
          incidentPending={incidentMut.isPending}
          dispatchPending={webhookTestMut.isPending}
          onAck={(id) => incidentMut.mutate({ id, status: "acknowledged" })}
          onCloseInc={(id) => incidentMut.mutate({ id, status: "closed" })}
          onCreateChannel={(b) => channelMut.mutate(b)}
          onCreateRule={(b) => ruleMut.mutate(b)}
          onDispatchTest={(channelId) => webhookTestMut.mutate(channelId)}
        />
      ) : null}

      {modal === "logs" ? (
        <ObsModal title="Recent activity" description="Who did what in this workspace, newest first." onClose={closeModal}>
          <ul className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            {logs.map((log) => (
              <li key={`${log.created_at}-${log.message}`} className="rounded border border-slate-100 bg-slate-50 p-4">
                <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
                  <span className="font-medium text-slate-800">
                    {log.entity_type} · {log.level}
                  </span>
                  <span className="mono">{log.created_at}</span>
                </div>
                <p className="mono mt-2 text-sm text-slate-800">{log.message}</p>
              </li>
            ))}
          </ul>
        </ObsModal>
      ) : null}

      {modal === "lineage" ? (
        <ObsModal title="Data connections" description="A snapshot of how datasets linked together when this was saved." onClose={closeModal}>
          <ul className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            {edges.map((edge) => (
              <li key={`${edge.source}-${edge.target}-${edge.operation}`} className="rounded border border-slate-100 bg-slate-50 p-4">
                <p className="mono text-sm text-slate-900">
                  {edge.source} → {edge.target}
                </p>
                <p className="mt-1 text-sm text-slate-600">{edge.operation}</p>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link to="/jobs-monitor?lineage=1" className="font-medium text-orange-700 underline">
              Jobs — lineage view
            </Link>
            <Link to="/pipelines" className="font-medium text-orange-700 underline">
              Pipelines
            </Link>
          </div>
        </ObsModal>
      ) : null}

      {modal === "alerts" ? (
        <ObsModal
          title="All automated checks"
          description="Short list of what we noticed about this workspace. Follow a link to dig in, or open Notifications to set up email, Slack, or webhooks."
          onClose={closeModal}
        >
          <ul className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            {alerts.map((a) => (
              <li key={a.id} className="rounded border border-slate-200 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">{checkSeverityLabel(a.severity)}</p>
                <p className="mt-1 font-semibold text-slate-900">{a.title}</p>
                <p className="mt-2 text-sm text-slate-600">{a.detail}</p>
                {a.href ? (
                  <ObservabilitySignalHrefLink
                    href={a.href}
                    className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-orange-700 underline"
                  >
                    Go to details <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </ObservabilitySignalHrefLink>
                ) : null}
              </li>
            ))}
          </ul>
        </ObsModal>
      ) : null}

      {modal === "correlation" ? (
        <ObsModal
          title="Related logs and shortcuts"
          description={`Activity and quick links for job ${correlationJobId.slice(0, 8)}…`}
          onClose={() => {
            setModal(null);
            setCorrelationJobId("");
          }}
        >
          {correlationQuery.isLoading ? <p className="text-sm text-slate-500">Loading…</p> : null}
          {correlationQuery.data?.links ? (
            <div className="mb-4 flex flex-wrap gap-2">
              {Object.entries(correlationQuery.data.links).map(([k, href]) => (
                <Link key={k} to={href} className="rounded border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-orange-50">
                  {k}
                </Link>
              ))}
            </div>
          ) : null}
          <ul className="max-h-[50vh] space-y-2 overflow-y-auto text-sm">
            {(correlationQuery.data?.logs ?? []).map((log, i) => (
              <li key={`${log.created_at}-${i}`} className="rounded border border-slate-100 bg-slate-50 p-3">
                <span className="text-xs text-slate-500">{log.created_at}</span>
                <p className="mt-1 font-medium text-slate-900">
                  {log.entity_type} · {log.level}
                </p>
                <p className="mt-1 text-slate-700">{log.message}</p>
              </li>
            ))}
          </ul>
        </ObsModal>
      ) : null}

      {modal === "metric" && metrics ? (
        <MetricDrilldownModal
          metricKey={metricFocus}
          metrics={metrics}
          windowHours={windowHours}
          throughput={throughputChart}
          latency={latencyChart}
          onClose={closeModal}
        />
      ) : null}
    </div>
  );
}

function sloStatusLabel(status: string) {
  const s = status.toLowerCase();
  if (s === "healthy") return "On track";
  if (s === "at_risk") return "Needs attention";
  if (s === "breached" || s === "violated") return "Missing goal";
  return status.replace(/_/g, " ");
}

function checkSeverityLabel(severity: string) {
  const s = severity.toLowerCase();
  if (s === "success") return "All clear";
  if (s === "warning") return "Needs attention";
  if (s === "info") return "Heads up";
  return severity;
}

function ruleThresholdSummary(kind: string) {
  switch (kind) {
    case "failed_jobs_24h":
      return "When jobs fail within 24 hours";
    case "queue_backlog":
      return "When too much work is waiting";
    case "slo_burn_fast":
      return "When a reliability goal is slipping quickly";
    default:
      return kind.replace(/_/g, " ");
  }
}

function SLOSnapshotCard({ slo, onOpen }: { slo: ObservabilitySLOItem; onOpen: () => void }) {
  const budgetPct = Math.round(Math.min(100, Math.max(0, slo.error_budget_remaining_ratio * 100)));
  const burnHot = slo.burn_rate_1h > 2 || slo.burn_rate_6h > 2;
  return (
    <div className="rounded border border-slate-200 bg-slate-50/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-950">{slo.name}</p>
          <p className="mt-1 text-xs text-slate-600">{slo.sli_kind.replace(/_/g, " ")}</p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            slo.slo_status === "healthy"
              ? "bg-emerald-100 text-emerald-900"
              : slo.slo_status === "at_risk"
                ? "bg-amber-100 text-amber-950"
                : "bg-rose-100 text-rose-900"
          }`}
        >
          {sloStatusLabel(slo.slo_status)}
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold text-slate-950">
        Current measure {(slo.sli_value * (slo.sli_kind.includes("ratio") ? 100 : 1)).toFixed(slo.sli_kind.includes("ratio") ? 3 : 1)}
        {slo.sli_kind.includes("ratio") ? "%" : "s"}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Goal: {slo.comparison === "gte" ? "at least" : "at most"} {slo.target_numeric}
        {slo.sli_kind.includes("ratio") ? "" : "s"} · rolling {slo.window_hours}-hour window
      </p>
      <div className="mt-3">
        <div className="flex justify-between text-xs text-slate-600">
          <span>Room left before you miss the goal</span>
          <span>{budgetPct}%</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200">
          <div className="h-2 rounded-full bg-teal-500" style={{ width: `${budgetPct}%` }} />
        </div>
      </div>
      <p className={`mt-2 text-xs ${burnHot ? "font-medium text-amber-800" : "text-slate-500"}`}>
        How fast you are using that room (1h / 6h / 24h): {slo.burn_rate_1h}× · {slo.burn_rate_6h}× · {slo.burn_rate_24h}× — 1× means “on track.”
      </p>
      <button type="button" className="mt-3 text-xs font-medium text-orange-700 underline" onClick={onOpen}>
        Open full reliability view
      </button>
    </div>
  );
}

function TracesEnterprisePanel({
  traces,
  loading,
  traceFromUrl,
  traceDetail,
  traceDetailLoading,
  onSelectTrace,
  onCorrelate
}: {
  traces: ObservabilityTraceListItem[];
  loading: boolean;
  traceFromUrl: string;
  traceDetail?: ObservabilityTraceDetail;
  traceDetailLoading: boolean;
  onSelectTrace: (id: string) => void;
  onCorrelate: (jobId: string) => void;
}) {
  return (
    <div className="space-y-6">
      <section className="rounded border border-slate-200 bg-white p-6 shadow-panel">
        <p className="text-xs uppercase tracking-[0.2em] text-orange-600">Traces</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-950">Step-by-step job timeline</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Each row is one pipeline run. Open the timeline to see which parts ran, how long they took, and jump to the job or related logs.
        </p>
      </section>
      <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
        <div className="rounded border border-slate-200 bg-white p-5 shadow-panel">
          <h3 className="text-lg font-semibold text-slate-950">Recent runs</h3>
          {loading ? <p className="mt-4 text-sm text-slate-500">Loading…</p> : null}
          <div className="mt-4 max-h-[480px] overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-white text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="border-b border-slate-200 py-2 pr-3">Pipeline</th>
                  <th className="border-b border-slate-200 py-2 pr-3">Status</th>
                  <th className="border-b border-slate-200 py-2 pr-3">Duration</th>
                  <th className="border-b border-slate-200 py-2">Timeline</th>
                </tr>
              </thead>
              <tbody>
                {traces.map((t) => (
                  <tr key={t.trace_id} className={t.trace_id === traceFromUrl ? "bg-orange-50/80" : ""}>
                    <td className="border-b border-slate-100 py-2 pr-3">
                      <p className="font-medium text-slate-900">{t.pipeline_name}</p>
                      <p className="mono text-xs text-slate-500">{t.trace_id}</p>
                    </td>
                    <td className="border-b border-slate-100 py-2 pr-3">{t.status}</td>
                    <td className="border-b border-slate-100 py-2 pr-3">{(t.duration_ms / 1000).toFixed(1)}s</td>
                    <td className="border-b border-slate-100 py-2">
                      <button type="button" className="text-orange-700 underline" onClick={() => onSelectTrace(t.trace_id)}>
                        View steps
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && !traces.length ? <p className="mt-4 text-sm text-slate-500">No traced runs in this workspace yet.</p> : null}
        </div>
        <div className="rounded border border-slate-200 bg-white p-5 shadow-panel">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-slate-950">Steps for this run</h3>
            {traceFromUrl ? (
              <div className="flex flex-wrap gap-2 text-xs">
                <Link to={`/jobs-monitor?job=${encodeURIComponent(traceFromUrl)}`} className="font-medium text-orange-700 underline">
                  Open in jobs monitor
                </Link>
                <button type="button" className="font-medium text-slate-700 underline" onClick={() => onCorrelate(traceFromUrl)}>
                  Related logs
                </button>
              </div>
            ) : null}
          </div>
          {!traceFromUrl ? <p className="mt-6 text-sm text-slate-500">Choose a run on the left to load its steps.</p> : null}
          {traceDetailLoading ? <p className="mt-6 text-sm text-slate-500">Loading steps…</p> : null}
          {traceFromUrl && traceDetail && !traceDetailLoading ? (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-slate-500">
                {traceDetail.pipeline_name} · {traceDetail.job_status} · {traceDetail.source_platform} → {traceDetail.dest_platform}
              </p>
              <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                {traceDetail.spans.map((s) => (
                  <li key={s.span_id} className="rounded border border-slate-100 bg-slate-50 p-3 text-sm">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-medium text-slate-900">
                        {s.service_name} · {s.operation_name}
                      </span>
                      <span className="text-xs text-slate-500">{s.status}</span>
                    </div>
                    <p className="mono mt-1 text-xs text-slate-600">{s.span_id}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      {(s.duration_ms / 1000).toFixed(2)}s · {s.source ?? "span"}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SLOEnterprisePanel({ items, loading }: { items: ObservabilitySLOItem[]; loading: boolean }) {
  return (
    <div className="space-y-6">
      <section className="rounded border border-slate-200 bg-white p-6 shadow-panel">
        <p className="text-xs uppercase tracking-[0.2em] text-orange-600">Reliability goals</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-950">Targets, headroom, and pace</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Each card is one goal. “Headroom” is how much room you have left before you miss the target. The pace numbers show whether problems are eating that room faster than usual.
        </p>
      </section>
      {loading ? <p className="text-sm text-slate-500">Loading goals…</p> : null}
      <div className="grid gap-5">
        {items.map((s) => (
          <div key={s.id} className="rounded border border-slate-200 bg-white p-6 shadow-panel">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-slate-950">{s.name}</h3>
                <p className="mt-1 text-sm text-slate-600">{s.description}</p>
              </div>
              <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700">{sloStatusLabel(s.slo_status)}</span>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Current measure</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950">
                  {(s.sli_value * (s.sli_kind.includes("ratio") ? 100 : 1)).toFixed(3)}
                  {s.sli_kind.includes("ratio") ? "%" : "s"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  OK events {s.events_good} · problem events {s.events_bad} · total {s.events_total}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Headroom left</p>
                <p className="mt-1 text-2xl font-semibold text-teal-800">{Math.round(s.error_budget_remaining_ratio * 100)}%</p>
                <div className="mt-2 h-2 rounded-full bg-slate-200">
                  <div
                    className="h-2 rounded-full bg-teal-500"
                    style={{ width: `${Math.min(100, Math.max(0, s.error_budget_remaining_ratio * 100))}%` }}
                  />
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Pace (1h / 6h / 24h)</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  <li>Last hour: {s.burn_rate_1h}×</li>
                  <li>Last 6 hours: {s.burn_rate_6h}×</li>
                  <li>Last 24 hours: {s.burn_rate_24h}×</li>
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>
      {!loading && !items.length ? (
        <p className="text-sm text-amber-900">No SLO rows. Apply migration 006 and ensure observability-service can reach Postgres.</p>
      ) : null}
    </div>
  );
}

function SearchableAlertChannelSelect({
  value,
  onChange,
  channels,
  disabled
}: {
  value: string;
  onChange: (channelId: string) => void;
  channels: ObservabilityAlertChannel[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = useMemo(() => channels.find((c) => c.id === value), [channels, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return channels;
    }
    return channels.filter((c) =>
      `${c.name} ${c.id} ${c.channel_kind} ${c.destination_preview}`.toLowerCase().includes(q)
    );
  }, [query, channels]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    function onDocMouseDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  if (channels.length === 0) {
    return (
      <div className="min-w-[200px] flex-1 rounded border border-dashed border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-500">
        Add a notification destination below, then you can send yourself a test.
      </div>
    );
  }

  const primaryLabel = selected?.name ?? (value.trim() ? "This destination is no longer in the list" : "Choose where to send the test");
  const secondaryLine = selected
    ? `${selected.channel_kind} · ${selected.destination_preview}`
    : value.trim()
      ? value
      : "Click to search by name, type, or address";

  return (
    <div className="relative min-w-[200px] flex-1" ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        className="flex w-full min-h-[2.5rem] items-center justify-between gap-2 rounded border border-slate-300 bg-white px-2 py-1.5 text-left text-xs text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 disabled:opacity-50"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1">
          <span className="line-clamp-1 block font-medium text-slate-900">{primaryLabel}</span>
          <span className="line-clamp-1 block text-[10px] text-slate-500">{secondaryLine}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 w-full min-w-[min(100%,320px)] rounded border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-200 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, type, or address…"
                className="w-full rounded border border-slate-300 bg-white py-2 pl-8 pr-2 text-sm text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              />
            </div>
          </div>
          <ul className="max-h-64 overflow-y-auto py-1" role="listbox">
            {filtered.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-orange-50"
                  role="option"
                  aria-selected={value === c.id}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium leading-snug text-slate-900">{c.name}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {c.channel_kind} · {c.destination_preview}
                    </span>
                    <span className="mono mt-0.5 block text-[10px] text-slate-400">{c.id}</span>
                  </span>
                  {value === c.id ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" /> : null}
                </button>
              </li>
            ))}
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-500">Nothing matches that search.</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function AlertRoutingPanel({
  data,
  loading,
  incidentPending,
  dispatchPending,
  onAck,
  onCloseInc,
  onCreateChannel,
  onCreateRule,
  onDispatchTest
}: {
  data?: ObservabilityAlertRoutingState;
  loading: boolean;
  incidentPending: boolean;
  dispatchPending: boolean;
  onAck: (id: string) => void;
  onCloseInc: (id: string) => void;
  onCreateChannel: (b: { name: string; channel_kind: string; destination: string; signing_secret?: string }) => void;
  onCreateRule: (b: {
    name: string;
    description?: string;
    threshold_kind: string;
    threshold_json?: Record<string, unknown>;
    channel_id?: string;
    cooldown_minutes?: number;
  }) => void;
  onDispatchTest: (channelId: string) => void;
}) {
  const [chName, setChName] = useState("");
  const [chKind, setChKind] = useState("webhook");
  const [chDest, setChDest] = useState("");
  const [chSign, setChSign] = useState("");
  const [testChannelId, setTestChannelId] = useState("");
  const [ruleName, setRuleName] = useState("");
  const [ruleKind, setRuleKind] = useState("failed_jobs_24h");
  const [ruleChannel, setRuleChannel] = useState("");
  const testChannelSeeded = useRef(false);

  useEffect(() => {
    const list = data?.channels ?? [];
    if (list.length === 0) {
      testChannelSeeded.current = false;
      setTestChannelId("");
      return;
    }
    if (!testChannelSeeded.current) {
      setTestChannelId(list[0]!.id);
      testChannelSeeded.current = true;
    }
  }, [data?.channels]);

  return (
    <div className="space-y-6">
      <section className="rounded border border-slate-200 bg-white p-6 shadow-panel">
        <p className="text-xs uppercase tracking-[0.2em] text-orange-600">Notifications</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-950">Where we send alerts, what triggers them, and open issues</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Pick email, Slack, a webhook, or PagerDuty. Add rules so we notify you when something looks wrong. Open issues appear here until someone acknowledges or closes them.
        </p>
      </section>

      {loading ? <p className="text-sm text-slate-500">Loading…</p> : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded border border-slate-200 bg-white p-5 shadow-panel">
          <h3 className="text-lg font-semibold text-slate-950">Where notifications go</h3>
          <ul className="mt-4 space-y-3 text-sm">
            {(data?.channels ?? []).map((c) => (
              <li key={c.id} className="rounded border border-slate-100 bg-slate-50 p-3">
                <p className="font-medium text-slate-900">{c.name}</p>
                <p className="text-xs text-slate-600">
                  {c.channel_kind} · {c.destination_preview}
                </p>
                <p className="mono mt-1 text-[10px] text-slate-400">{c.id}</p>
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded border border-dashed border-slate-200 bg-slate-50/80 p-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Send a test</p>
            <p className="mt-1 text-xs text-slate-600">
              Sends one sample notification to the destination you pick. Webhooks include a security signature your receiver can verify.
            </p>
            <div className="mt-2 flex flex-wrap items-stretch gap-2">
              <SearchableAlertChannelSelect
                value={testChannelId}
                onChange={setTestChannelId}
                channels={data?.channels ?? []}
                disabled={dispatchPending}
              />
              <button
                type="button"
                disabled={dispatchPending || !testChannelId.trim()}
                className="rounded bg-slate-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                onClick={() => onDispatchTest(testChannelId.trim())}
              >
                Send test
              </button>
            </div>
          </div>
          <form
            className="mt-5 space-y-3 border-t border-slate-100 pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!chName.trim() || !chDest.trim()) {
                return;
              }
              onCreateChannel({
                name: chName.trim(),
                channel_kind: chKind,
                destination: chDest.trim(),
                signing_secret: chSign.trim() || undefined
              });
              setChName("");
              setChDest("");
              setChSign("");
            }}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Add a destination</p>
            <input
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder='Friendly name (e.g. "Team Slack")'
              value={chName}
              onChange={(e) => setChName(e.target.value)}
            />
            <select className="w-full rounded border border-slate-300 px-3 py-2 text-sm" value={chKind} onChange={(e) => setChKind(e.target.value)}>
              <option value="email">Email</option>
              <option value="webhook">Webhook (custom URL)</option>
              <option value="slack_incoming">Slack (incoming webhook)</option>
              <option value="pagerduty_events">PagerDuty</option>
            </select>
            <input
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder="Email address or webhook URL"
              value={chDest}
              onChange={(e) => setChDest(e.target.value)}
            />
            <input
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder="Webhook signing secret (optional; for verifying requests)"
              value={chSign}
              onChange={(e) => setChSign(e.target.value)}
            />
            <button type="submit" className="rounded bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700">
              Save destination
            </button>
          </form>
        </div>

        <div className="rounded border border-slate-200 bg-white p-5 shadow-panel">
          <h3 className="text-lg font-semibold text-slate-950">Rules and current status</h3>
          <ul className="mt-4 space-y-3 text-sm">
            {(data?.rules ?? []).map((r) => (
              <li key={r.id} className="rounded border border-slate-100 bg-slate-50 p-3">
                <p className="font-medium text-slate-900">{r.name}</p>
                <p className="text-xs text-slate-600">{ruleThresholdSummary(r.threshold_kind)}</p>
              </li>
            ))}
          </ul>
          <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-xs">
            {(data?.evaluations ?? []).map((ev) => (
              <li key={ev.rule_id} className="flex justify-between gap-2 rounded bg-white px-2 py-1">
                <span className="text-slate-700">{ev.rule_name}</span>
                <span className={ev.firing ? "font-semibold text-rose-700" : "text-emerald-700"}>{ev.firing ? "Would notify" : "Quiet"}</span>
              </li>
            ))}
          </ul>
          <form
            className="mt-5 space-y-3 border-t border-slate-100 pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!ruleName.trim()) {
                return;
              }
              onCreateRule({
                name: ruleName.trim(),
                threshold_kind: ruleKind,
                threshold_json: ruleKind === "failed_jobs_24h" ? { min: 1 } : { burn_threshold: 3 },
                channel_id: ruleChannel || undefined,
                cooldown_minutes: 45
              });
              setRuleName("");
            }}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Add a rule</p>
            <input
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder='Rule name (e.g. "Failed jobs")'
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
            />
            <select className="w-full rounded border border-slate-300 px-3 py-2 text-sm" value={ruleKind} onChange={(e) => setRuleKind(e.target.value)}>
              <option value="failed_jobs_24h">Failed jobs in the last 24 hours</option>
              <option value="queue_backlog">Too much work waiting in the queue</option>
              <option value="slo_burn_fast">Reliability goal slipping quickly</option>
            </select>
            <input
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder="Send to this destination ID (optional)"
              value={ruleChannel}
              onChange={(e) => setRuleChannel(e.target.value)}
            />
            <button type="submit" className="rounded border border-orange-300 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-950 hover:bg-orange-100">
              Save rule
            </button>
          </form>
        </div>
      </div>

      <div className="rounded border border-slate-200 bg-white p-5 shadow-panel">
        <h3 className="text-lg font-semibold text-slate-950">Open issues</h3>
        <div className="mt-4 space-y-3">
          {(data?.incidents ?? []).map((inc) => (
            <div key={inc.id} className="rounded border border-slate-100 bg-slate-50 p-4 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <p className="font-semibold text-slate-900">{inc.title}</p>
                <span className="text-xs text-slate-500">{inc.fired_at}</span>
              </div>
              <p className="mt-2 text-slate-600">{inc.detail}</p>
              <p className="mt-2 text-xs text-slate-500">State: {inc.status}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={incidentPending || inc.status !== "open"}
                  className="rounded border border-slate-300 bg-white px-3 py-1 text-xs font-medium disabled:opacity-40"
                  onClick={() => onAck(inc.id)}
                >
                  Acknowledge
                </button>
                <button
                  type="button"
                  disabled={incidentPending || inc.status === "closed"}
                  className="rounded border border-slate-300 bg-white px-3 py-1 text-xs font-medium disabled:opacity-40"
                  onClick={() => onCloseInc(inc.id)}
                >
                  Close
                </button>
              </div>
            </div>
          ))}
        </div>
        {!loading && !(data?.incidents.length ?? 0) ? <p className="mt-4 text-sm text-slate-500">No open issues right now.</p> : null}
      </div>
    </div>
  );
}

function RecentJobRow({ job }: { job: ObservabilityRecentJob }) {
  const st = job.status.toLowerCase();
  const jobsLink =
    st === "failed"
      ? `/jobs-monitor?status=failed&job=${encodeURIComponent(job.id)}`
      : `/jobs-monitor?job=${encodeURIComponent(job.id)}`;
  const lineageLink = `/jobs-monitor?lineage=1&lineageJob=${encodeURIComponent(job.id)}`;
  const pipelineLink = `/pipeline-builder?pipelineId=${encodeURIComponent(job.pipeline_id)}`;
  return (
    <tr className="border-b border-slate-100 align-top">
      <td className="py-3 pr-4">
        <p className="font-medium text-slate-900">{job.pipeline_name}</p>
        <p className="mono mt-0.5 text-xs text-slate-500">{job.id}</p>
      </td>
      <td className="py-3 pr-4">
        <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-800">{job.status}</span>
      </td>
      <td className="py-3 pr-4 text-slate-700">
        {job.completed_chunks} of {job.total_chunks} steps done · {job.failed_chunks} failed
      </td>
      <td className="py-3">
        <div className="flex flex-col gap-1 text-xs">
          <Link to={jobsLink} className="font-medium text-orange-700 underline">
            Job details
          </Link>
          <Link to={lineageLink} className="font-medium text-slate-600 underline">
            Data flow
          </Link>
          <Link to={pipelineLink} className="font-medium text-slate-600 underline">
            Open pipeline
          </Link>
        </div>
      </td>
    </tr>
  );
}

function MetricDrilldownModal({
  metricKey,
  metrics,
  windowHours,
  throughput,
  latency,
  onClose
}: {
  metricKey: string | null;
  metrics: ObservabilitySummary;
  windowHours: number;
  throughput: { label: string; mb: number }[];
  latency: { label: string; sec: number }[];
  onClose: () => void;
}) {
  const title =
    metricKey === "throughput"
      ? "Processing speed"
      : metricKey === "latency"
        ? "Typical run time"
        : metricKey === "failures"
          ? "Failed steps"
          : metricKey === "backlog"
            ? "Work waiting"
            : metricKey === "utilization"
              ? "Worker load"
              : "Metric";

  const mini =
    metricKey === "throughput" ? (
      <SparkLine data={throughput} dataKey="mb" color="#ea580c" />
    ) : metricKey === "latency" ? (
      <SparkLine data={latency} dataKey="sec" color="#0d9488" />
    ) : null;

  return (
    <ObsModal
      title={title}
      description="What this number means, and shortcuts to related pages."
      onClose={onClose}
    >
      <div className="space-y-4 text-sm text-slate-700">
        {metricKey === "throughput" ? (
          <p>
            <strong>{metrics.transfer_speed_mb_s} MB/s</strong> is how fast finished work was processed on average over the last {metrics.throughput_window_hours ?? 24} hours. It reflects completed pipeline steps, not your internet speed.
          </p>
        ) : null}
        {metricKey === "latency" ? (
          <p>
            <strong>{metrics.pipeline_latency_s} seconds</strong> is the average time for jobs that finished successfully over roughly the last {metrics.latency_window_days ?? 7} days.
          </p>
        ) : null}
        {metricKey === "failures" ? (
          <p>
            <strong>{metrics.chunk_failures}</strong> pipeline steps failed in total on current totals. In the last 24 hours, <strong>{metrics.failed_jobs_24h ?? "—"}</strong> whole job(s) ended in failure.
          </p>
        ) : null}
        {metricKey === "backlog" ? (
          <p>
            About <strong>{metrics.queue_backlog}</strong> pipeline steps are still waiting to run across the jobs we are tracking.
          </p>
        ) : null}
        {metricKey === "utilization" ? (
          <p>
            About <strong>{Math.round(metrics.worker_utilization * 100)}%</strong> of worker capacity looks busy based on progress on pipeline steps and jobs currently running (<strong>{metrics.running_jobs ?? "—"}</strong>).
          </p>
        ) : null}
        {mini ? (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Last {windowHours} hours (one point per hour)</p>
            <div className="h-36 w-full">{mini}</div>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-4">
          <Link to="/jobs-monitor" className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-orange-50">
            All jobs
          </Link>
          <Link
            to="/jobs-monitor?status=failed"
            className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-orange-50"
          >
            Failed jobs only
          </Link>
          <Link to="/dataset-explorer" className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-orange-50">
            Datasets
          </Link>
          <Link to="/jobs-monitor?lineage=1" className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-orange-50">
            Data flow map
          </Link>
        </div>
      </div>
    </ObsModal>
  );
}

function SparkLine({ data, dataKey, color }: { data: Record<string, string | number>[]; dataKey: string; color: string }) {
  if (!data.length) {
    return <p className="text-sm text-slate-500">No data points in this time range.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
        <YAxis width={32} tick={{ fontSize: 10 }} />
        <Tooltip />
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function ChartPanel({
  title,
  description,
  loading,
  data,
  dataKey,
  stroke,
  emptyHint
}: {
  title: string;
  description: string;
  loading: boolean;
  data: { label: string; mb?: number; sec?: number }[];
  dataKey: string;
  stroke: string;
  emptyHint: string;
}) {
  return (
    <div className="rounded border border-slate-200 bg-white p-5 shadow-panel">
      <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
      {loading ? <p className="mt-8 text-sm text-slate-500">Loading chart…</p> : null}
      {!loading && !data.length ? <p className="mt-8 text-sm text-slate-500">{emptyHint}</p> : null}
      {!loading && data.length ? (
        <div className="mt-4 h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis width={40} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line type="monotone" dataKey={dataKey} stroke={stroke} strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  );
}

function formatChartTime(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:00`;
  } catch {
    return iso;
  }
}

function MetricCard({
  label,
  value,
  sub,
  onDetails
}: {
  label: string;
  value: string;
  sub?: string;
  onDetails?: () => void;
}) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4 shadow-panel">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
      {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
      {onDetails ? (
        <button type="button" className="mt-3 text-xs font-medium text-orange-700 underline" onClick={onDetails}>
          What this means
        </button>
      ) : null}
    </div>
  );
}

function ObsModal({
  title,
  description,
  onClose,
  children
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="flex max-h-[min(90vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="obs-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.24em] text-orange-600">Monitoring</p>
            <h2 id="obs-modal-title" className="mt-1 text-xl font-semibold text-slate-900">
              {title}
            </h2>
            <p className="mt-1 text-sm text-slate-600">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
