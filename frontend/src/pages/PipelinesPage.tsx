import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  Clock3,
  Search,
  SplitSquareVertical,
  X,
} from "lucide-react";

import type {
  DataSystemItem,
  DatasetItem,
  PipelineItem,
  RunPipelinePayload,
} from "../lib/api";
import { useToast } from "../context/ToastContext";
import { useQueryErrorToast } from "../hooks/useQueryErrorToast";
import { tenantApi } from "../lib/api";
import { useSessionStore } from "../store/session";

const TERMINAL_JOB = new Set(["completed", "failed", "partial"]);

function jobNeedsPoll(status: string | undefined) {
  return Boolean(status && !TERMINAL_JOB.has(status.toLowerCase()));
}

/** Match ?dataset= from explorer (name or external_id; tolerate extra decode). */
function findPreferredDataset(
  datasets: DatasetItem[],
  pref: string | null | undefined,
): DatasetItem | null {
  if (!pref?.trim() || !datasets.length) {
    return null;
  }
  const p = pref.trim();
  let decoded = p;
  try {
    if (/%[0-9A-Fa-f]{2}/.test(p)) {
      decoded = decodeURIComponent(p.replace(/\+/g, " "));
    }
  } catch {
    decoded = p;
  }
  return (
    datasets.find((d) => d.name === p) ??
    datasets.find((d) => d.name === decoded) ??
    datasets.find((d) => d.external_id === p || d.external_id === decoded) ??
    null
  );
}

export function PipelinesPage() {
  const { token, user } = useSessionStore();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [runTarget, setRunTarget] = useState<PipelineItem | null>(null);
  const workspaceEnabled = Boolean(token && user?.workspace_id);
  const datasetFromUrl = useMemo(
    () => searchParams.get("dataset")?.trim() || null,
    [searchParams],
  );

  const jobsQuery = useQuery({
    queryKey: ["jobs", user?.workspace_id],
    queryFn: () => tenantApi.jobs(token!, user!.workspace_id),
    enabled: workspaceEnabled,
    refetchInterval: (q) => {
      const items = q.state.data?.items ?? [];
      return items.some((i) => jobNeedsPoll(i.status)) ? 5000 : false;
    },
  });

  const hasActiveJobs = useMemo(
    () => (jobsQuery.data?.items ?? []).some((i) => jobNeedsPoll(i.status)),
    [jobsQuery.data?.items],
  );

  const query = useQuery({
    queryKey: ["pipelines", user?.workspace_id],
    queryFn: () => tenantApi.pipelines(token!, user!.workspace_id),
    enabled: workspaceEnabled,
    refetchInterval: hasActiveJobs ? 10_000 : 25_000,
  });

  useQueryErrorToast(
    Boolean(query.isError),
    query.error,
    "Could not load pipelines.",
    showToast,
  );

  const datasetsQuery = useQuery({
    queryKey: ["datasets", user?.workspace_id],
    queryFn: () => tenantApi.datasets(token!, user!.workspace_id),
    enabled: Boolean(
      token && user?.workspace_id && (runTarget || datasetFromUrl),
    ),
  });

  const urlDataset = useMemo(
    () => findPreferredDataset(datasetsQuery.data?.items ?? [], datasetFromUrl),
    [datasetsQuery.data?.items, datasetFromUrl],
  );

  const dataSystemsQuery = useQuery({
    queryKey: ["data-systems", user?.workspace_id],
    queryFn: () => tenantApi.dataSystems(token!, user!.workspace_id),
    enabled: workspaceEnabled,
  });

  useEffect(() => {
    const pid = searchParams.get("run");
    if (!pid || !query.data?.items.length) {
      return;
    }
    const pipe = query.data.items.find((p) => p.id === pid);
    if (pipe) {
      setRunTarget(pipe);
    }
  }, [searchParams, query.data?.items]);

  const runMutation = useMutation({
    mutationFn: (payload: RunPipelinePayload) =>
      tenantApi.runPipeline(token!, user!.workspace_id, payload),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({
        queryKey: ["jobs", user?.workspace_id],
      });
      setRunTarget(null);
      navigate(`/jobs-monitor?job=${encodeURIComponent(data.job_id)}`);
    },
    onError: (error) => {
      showToast(error instanceof Error ? error.message : "Run failed", {
        variant: "error",
      });
    },
  });

  return (
    <div className="space-y-8">
      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded border border-slate-200 bg-white shadow-panel p-8">
          <p className="text-sm uppercase tracking-[0.25em] text-orange-600">
            Workflow Plane
          </p>
          <h1 className="mt-2 text-4xl font-semibold text-slate-900">
            {user?.workspace_name} pipelines
          </h1>
          <p className="mt-4 text-slate-600">
            Pipelines turn connected systems and discovered datasets into
            movement plans you can run, monitor, and tune.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/pipeline-builder"
              className="rounded bg-ember px-5 py-3 font-medium text-white shadow-sm hover:opacity-95"
            >
              Create Pipeline
            </Link>
            <Link
              to="/jobs-monitor"
              className="rounded border border-slate-200 bg-white px-5 py-3 font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Monitor Active Jobs
            </Link>
          </div>
          {query.isFetching && !query.isLoading ? (
            <p className="mt-3 text-xs text-slate-500">
              Refreshing pipeline list…
            </p>
          ) : null}
        </div>

        <div className="rounded border border-slate-200 bg-white shadow-panel p-8">
          <p className="text-sm uppercase tracking-[0.25em] text-orange-600">
            Pipeline Modes
          </p>
          <div className="mt-5 grid gap-3">
            <ModeCard
              icon={<SplitSquareVertical className="h-5 w-5 text-orange-600" />}
              title="Manual flow"
              text="Operators connect sources, chunking steps, transforms, and destinations."
            />
            <ModeCard
              icon={<Bot className="h-5 w-5 text-orange-600" />}
              title="Autonomous flow"
              text="Describe the outcome; the routing engine proposes an execution plan."
            />
            <ModeCard
              icon={<Clock3 className="h-5 w-5 text-orange-600" />}
              title="Scheduled flow"
              text="Recurring syncs on governed schedules."
            />
          </div>
        </div>
      </section>

      {!datasetFromUrl ? (
        <section className="grid gap-4 md:grid-cols-3">
          <FlowSummaryCard
            title="Connect"
            text="Authorize the platform and discover source datasets."
            href="/connections"
            cta="Manage Connections"
          />
          <FlowSummaryCard
            title="Read"
            text="Inspect schema, size, and select what should move."
            href="/dataset-explorer"
            cta="Browse Datasets"
          />
          <FlowSummaryCard
            title="Run"
            text="Launch a run and track chunk progress in Jobs."
            href="/jobs-monitor"
            cta="Open Jobs Monitor"
          />
        </section>
      ) : null}

      {datasetFromUrl ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <p className="min-w-0">
            <span className="font-medium text-slate-900">Selected Dataset</span>
            <span className="mx-1.5 text-slate-400">·</span>
            <span
              className="mono break-all text-xs text-slate-800"
              title={datasetFromUrl}
            >
              {datasetFromUrl}
            </span>
            {datasetsQuery.isLoading ? (
              <span className="ml-2 text-xs text-slate-500">(checking…)</span>
            ) : urlDataset ? null : datasetsQuery.isSuccess ? (
              <span className="ml-2 text-xs text-amber-800">
                (not found in workspace)
              </span>
            ) : null}
          </p>
          <Link
            to="/pipelines"
            className="shrink-0 text-xs font-medium text-orange-700 underline decoration-orange-300 underline-offset-2 hover:text-orange-900"
          >
            Clear
          </Link>
        </div>
      ) : null}

      <section className="grid gap-4">
        {query.data?.items.map((item) => (
          <article
            key={item.id}
            className="rounded border border-slate-200 bg-white shadow-panel p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <span className="font-medium text-slate-900">
                Active Pipeline · {item.name}
              </span>

              <div className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-600">
                {item.status}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                to={`/pipeline-builder?pipelineId=${encodeURIComponent(item.id)}`}
                className="rounded border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Open In Builder
              </Link>

              <button
                type="button"
                onClick={() => setRunTarget(item)}
                className="rounded bg-ember px-4 py-3 text-sm font-medium text-white"
              >
                Run Now
              </button>
            </div>
          </article>
        ))}

        {query.isLoading ? (
          <p className="text-sm text-slate-500">Loading pipelines...</p>
        ) : null}
        {!query.isLoading && !query.data?.items.length ? (
          <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
            No pipelines have been created yet. Start by connecting a source
            system, reading a dataset, then generate a manual or autonomous
            pipeline.
          </div>
        ) : null}
      </section>

      {runTarget && token && user?.workspace_id ? (
        <RunPipelineModal
          key={`${runTarget.id}-${datasetFromUrl ?? ""}`}
          pipeline={runTarget}
          preferredDatasetName={datasetFromUrl}
          datasets={datasetsQuery.data?.items ?? []}
          datasetsLoading={datasetsQuery.isLoading}
          dataSystems={dataSystemsQuery.data?.items ?? []}
          dataSystemsLoading={dataSystemsQuery.isLoading}
          submitting={runMutation.isPending}
          onClose={() => setRunTarget(null)}
          onSubmit={(payload) => runMutation.mutate(payload)}
        />
      ) : null}
    </div>
  );
}

function resolveDataSystemSlug(
  platform: string,
  systems: DataSystemItem[],
): string {
  if (!systems.length) {
    return "";
  }
  const p = platform.trim().toLowerCase();
  if (!p) {
    return systems[0].slug;
  }
  const byName = systems.find((s) => s.name.toLowerCase() === p);
  if (byName) {
    return byName.slug;
  }
  const bySlug = systems.find((s) => s.slug === p);
  if (bySlug) {
    return bySlug.slug;
  }
  return systems[0].slug;
}

function RunPipelineModal({
  pipeline,
  preferredDatasetName,
  datasets,
  datasetsLoading,
  dataSystems,
  dataSystemsLoading,
  submitting,
  onClose,
  onSubmit,
}: {
  pipeline: PipelineItem;
  preferredDatasetName: string | null;
  datasets: DatasetItem[];
  datasetsLoading: boolean;
  dataSystems: DataSystemItem[];
  dataSystemsLoading: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (p: RunPipelinePayload) => void;
}) {
  const { showToast } = useToast();
  const emptyCatalogNotified = useRef(false);
  useEffect(() => {
    if (dataSystemsLoading || dataSystems.length) {
      emptyCatalogNotified.current = false;
      return;
    }
    if (emptyCatalogNotified.current) {
      return;
    }
    emptyCatalogNotified.current = true;
    showToast("No systems catalog.", { variant: "error" });
  }, [dataSystemsLoading, dataSystems.length, showToast]);

  const byName = useMemo(() => {
    const m = new Map<string, DatasetItem>();
    for (const d of datasets) {
      m.set(d.name, d);
    }
    return m;
  }, [datasets]);

  const [datasetName, setDatasetName] = useState("");
  const [estimatedRows, setEstimatedRows] = useState(1_000_000);
  const [estimatedBytes, setEstimatedBytes] = useState(1_000_000_000);
  const [partitions, setPartitions] = useState(4);
  const [workerCapacity, setWorkerCapacity] = useState(8);
  const [networkMbps, setNetworkMbps] = useState(256);
  const [sourcePlatform, setSourcePlatform] = useState("");
  const [destinationPlatform, setDestinationPlatform] = useState("");

  useEffect(() => {
    if (!dataSystems.length) {
      return;
    }
    setDestinationPlatform((cur) => {
      if (cur && dataSystems.some((s) => s.slug === cur)) {
        return cur;
      }
      return (
        dataSystems.find((s) => s.slug === "aws-s3")?.slug ??
        dataSystems[0].slug
      );
    });
  }, [dataSystems]);

  useEffect(() => {
    if (!datasets.length) {
      return;
    }
    const pick =
      findPreferredDataset(datasets, preferredDatasetName) ?? datasets[0];
    setDatasetName(pick.name);
    setEstimatedRows(Math.max(1, pick.estimated_rows || 1));
    setEstimatedBytes(Math.max(1, pick.estimated_bytes || 1));
    setSourcePlatform(
      dataSystems.length
        ? resolveDataSystemSlug(pick.platform || "", dataSystems)
        : pick.platform || "",
    );
  }, [datasets, preferredDatasetName, dataSystems]);

  useEffect(() => {
    const ds = byName.get(datasetName);
    if (ds) {
      setEstimatedRows(Math.max(1, ds.estimated_rows || 1));
      setEstimatedBytes(Math.max(1, ds.estimated_bytes || 1));
      setSourcePlatform(
        dataSystems.length
          ? resolveDataSystemSlug(ds.platform || "", dataSystems)
          : ds.platform || "",
      );
    }
  }, [datasetName, byName, dataSystems]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!datasetName.trim()) {
      return;
    }
    onSubmit({
      pipeline_id: pipeline.id,
      dataset_name: datasetName.trim(),
      estimated_rows: estimatedRows,
      estimated_bytes: estimatedBytes,
      partitions,
      worker_capacity: workerCapacity,
      network_throughput_mb_s: networkMbps,
      source_platform: sourcePlatform || undefined,
      destination_platform: destinationPlatform || undefined,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="run-pipeline-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="run-pipeline-title"
              className="text-xl font-semibold text-slate-900"
            >
              Run pipeline
            </h2>
            <p className="mt-1 text-sm text-slate-500">{pipeline.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {datasetsLoading ? (
          <p className="mt-4 text-sm text-slate-500">Loading datasets...</p>
        ) : null}
        {!datasetsLoading && !datasets.length ? (
          <p className="mt-4 text-sm text-amber-800">
            No datasets discovered in this workspace.{" "}
            <Link to="/connections" className="underline">
              Connect a source
            </Link>{" "}
            and run discovery first.
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Dataset
            <select
              value={datasetName}
              onChange={(ev) => setDatasetName(ev.target.value)}
              className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              required
            >
              {datasets.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name} ({d.platform})
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Estimated rows
              <input
                type="number"
                min={1}
                value={estimatedRows}
                onChange={(ev) => setEstimatedRows(Number(ev.target.value))}
                className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Estimated bytes
              <input
                type="number"
                min={1}
                value={estimatedBytes}
                onChange={(ev) => setEstimatedBytes(Number(ev.target.value))}
                className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm font-medium text-slate-700">
              Partitions
              <input
                type="number"
                min={1}
                value={partitions}
                onChange={(ev) => setPartitions(Number(ev.target.value))}
                className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Worker capacity
              <input
                type="number"
                min={1}
                value={workerCapacity}
                onChange={(ev) => setWorkerCapacity(Number(ev.target.value))}
                className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Network MB/s
              <input
                type="number"
                min={1}
                value={networkMbps}
                onChange={(ev) => setNetworkMbps(Number(ev.target.value))}
                className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Source platform
              {dataSystemsLoading ? (
                <p className="mt-1 text-sm text-slate-500">Loading systems…</p>
              ) : !dataSystems.length ? null : (
                <SearchableSystemSelect
                  value={sourcePlatform}
                  onChange={setSourcePlatform}
                  systems={dataSystems}
                  placeholder="Select source platform"
                />
              )}
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Destination platform
              {dataSystemsLoading ? (
                <p className="mt-1 text-sm text-slate-500">Loading systems…</p>
              ) : !dataSystems.length ? null : (
                <SearchableSystemSelect
                  value={destinationPlatform}
                  onChange={setDestinationPlatform}
                  systems={dataSystems}
                  placeholder="Select destination platform"
                />
              )}
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                submitting ||
                !datasets.length ||
                !dataSystems.length ||
                dataSystemsLoading
              }
              className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {submitting ? "Starting…" : "Start run"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SearchableSystemSelect({
  value,
  onChange,
  systems,
  placeholder,
}: {
  value: string;
  onChange: (slug: string) => void;
  systems: DataSystemItem[];
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
    return systems.filter((s) =>
      `${s.name} ${s.slug} ${s.category}`.toLowerCase().includes(q),
    );
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
        className="flex w-full items-center justify-between rounded border border-slate-300 bg-white px-3 py-2 text-left text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
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
                  {value === system.slug ? (
                    <Check className="h-4 w-4 text-orange-600" />
                  ) : null}
                </button>
              </li>
            ))}
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-500">
                No matching systems.
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ModeCard({
  icon,
  title,
  text,
}: {
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-3">
        {icon}
        <p className="font-medium text-slate-900">{title}</p>
      </div>
      <p className="mt-3 text-sm text-slate-600">{text}</p>
    </div>
  );
}

function FlowSummaryCard({
  title,
  text,
  href,
  cta,
}: {
  title: string;
  text: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="rounded border border-slate-200 bg-white p-5 shadow-panel">
      <p className="text-sm uppercase tracking-[0.2em] text-orange-600">
        {title}
      </p>
      <p className="mt-3 text-sm text-slate-600">{text}</p>
      <Link
        to={href}
        className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-orange-600 hover:text-orange-700"
      >
        {cta}
        <ArrowRight className="h-4 w-4 text-orange-600" />
      </Link>
    </div>
  );
}
