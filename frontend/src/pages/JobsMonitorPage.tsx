import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";

import { useToast } from "../context/ToastContext";
import { useQueryErrorToast } from "../hooks/useQueryErrorToast";
import type { LineageJobGraph } from "../lib/api";
import { governanceApi, tenantApi } from "../lib/api";
import { useSessionStore } from "../store/session";

const TERMINAL = new Set(["completed", "failed", "partial"]);

/** Older lineage-service returned 500 with this body when the job had no Neo4j node yet. */
function isLegacyJobMissingLineageError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /job not found in lineage graph/i.test(msg);
}

function jobNeedsPoll(status: string | undefined) {
  return Boolean(status && !TERMINAL.has(status.toLowerCase()));
}

function jobStatusPillClass(status: string) {
  const s = status.toLowerCase();
  if (s === "completed") {
    return "border border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (s === "failed") {
    return "border border-rose-200 bg-rose-50 text-rose-800";
  }
  if (s === "partial") {
    return "border border-amber-200 bg-amber-50 text-amber-900";
  }
  if (s === "running" || s === "queued") {
    return "border border-orange-200 bg-orange-50 text-orange-800";
  }
  return "border border-slate-200 bg-slate-100 text-slate-800";
}

function formatBytes(n: number) {
  if (!n) {
    return "0 B";
  }
  if (n < 1024) {
    return `${n} B`;
  }
  if (n < 1024 * 1024) {
    return `${(n / 1024).toFixed(1)} KB`;
  }
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function lineageNodeKindClass(kind: string) {
  switch (kind) {
    case "pipeline":
      return "text-sky-600";
    case "job":
      return "text-orange-600";
    case "chunk":
      return "text-emerald-600";
    case "dataset":
      return "text-violet-600";
    default:
      return "text-slate-500";
  }
}

export function JobsMonitorPage() {
  const { token, user } = useSessionStore();
  const { showToast } = useToast();
  const workspaceId = user?.workspace_id ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedJobId = searchParams.get("job") ?? "";
  const statusFilter = (searchParams.get("status") ?? "").trim().toLowerCase();
  const pipelineFilter = (searchParams.get("pipeline") ?? "").trim();

  const [lineageModalOpen, setLineageModalOpen] = useState(false);
  const [lineageFocusJobId, setLineageFocusJobId] = useState("");

  const listQuery = useQuery({
    queryKey: ["jobs", workspaceId],
    queryFn: () => tenantApi.jobs(token!, workspaceId),
    enabled: Boolean(token && workspaceId),
    refetchInterval: (q) => {
      const items = q.state.data?.items;
      if (!items?.length) {
        return false;
      }
      return items.some((i) => jobNeedsPoll(i.status)) ? 5000 : false;
    }
  });

  const jobQuery = useQuery({
    queryKey: ["job", workspaceId, selectedJobId],
    queryFn: () => tenantApi.job(token!, workspaceId, selectedJobId),
    enabled: Boolean(token && workspaceId && selectedJobId),
    refetchInterval: (q) => (jobNeedsPoll(q.state.data?.status) ? 4000 : false)
  });

  const chunksQuery = useQuery({
    queryKey: ["job-chunks", workspaceId, selectedJobId],
    queryFn: () => tenantApi.jobChunks(token!, workspaceId, selectedJobId),
    enabled: Boolean(token && workspaceId && selectedJobId),
    refetchInterval: () => (selectedJobId && jobNeedsPoll(jobQuery.data?.status) ? 3500 : false)
  });

  const allJobs = listQuery.data?.items ?? [];
  const listItems = useMemo(() => {
    let rows = allJobs;
    if (statusFilter) {
      rows = rows.filter((j) => j.status.toLowerCase() === statusFilter);
    }
    if (pipelineFilter) {
      rows = rows.filter((j) => j.pipeline_id === pipelineFilter || j.pipeline_name === pipelineFilter);
    }
    return rows;
  }, [allJobs, statusFilter, pipelineFilter]);

  const statusForLineageJob = useMemo(
    () => allJobs.find((j) => j.id === lineageFocusJobId)?.status,
    [allJobs, lineageFocusJobId]
  );

  const jobLineageQuery = useQuery({
    queryKey: ["lineage-job-graph", workspaceId, lineageFocusJobId],
    queryFn: async (): Promise<LineageJobGraph> => {
      try {
        return await governanceApi.jobLineageGraph(token!, workspaceId, lineageFocusJobId);
      } catch (e) {
        if (isLegacyJobMissingLineageError(e)) {
          return { nodes: [], links: [], note: "job_not_in_graph" };
        }
        throw e;
      }
    },
    enabled: Boolean(token && workspaceId && lineageFocusJobId && lineageModalOpen),
    refetchInterval: () =>
      lineageModalOpen && lineageFocusJobId && jobNeedsPoll(statusForLineageJob) ? 6000 : false
  });

  useQueryErrorToast(
    Boolean(lineageModalOpen && lineageFocusJobId && jobLineageQuery.isError),
    jobLineageQuery.error,
    "Could not load lineage for this job.",
    showToast
  );

  useEffect(() => {
    const open = searchParams.get("lineage") === "1";
    const fromUrl = searchParams.get("lineageJob") ?? "";
    if (!open && !fromUrl) {
      return;
    }
    setLineageModalOpen(true);
    if (fromUrl) {
      setLineageFocusJobId(fromUrl);
    } else if (open) {
      const j = searchParams.get("job") ?? "";
      setLineageFocusJobId(j);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("lineage");
    next.delete("lineageJob");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const selectJob = (id: string) => {
    const next = new URLSearchParams(searchParams);
    if (id) {
      next.set("job", id);
    } else {
      next.delete("job");
    }
    setSearchParams(next);
  };

  const openLineageModal = useCallback(
    (jobId?: string) => {
      const pick = jobId ?? selectedJobId ?? allJobs[0]?.id ?? "";
      setLineageFocusJobId(pick);
      setLineageModalOpen(true);
    },
    [selectedJobId, allJobs]
  );

  const closeLineageModal = useCallback(() => setLineageModalOpen(false), []);

  const detailJob = jobQuery.data;

  const progress = useMemo(() => {
    if (!detailJob?.total_chunks) {
      return 0;
    }
    return Math.round((detailJob.completed_chunks / detailJob.total_chunks) * 100);
  }, [detailJob]);

  useEffect(() => {
    if (!lineageModalOpen) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeLineageModal();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [lineageModalOpen, closeLineageModal]);

  return (
    <div className="space-y-6">
      <section className="rounded border border-slate-200 bg-white p-6 shadow-panel sm:p-8">
        <p className="text-xs uppercase tracking-[0.24em] text-orange-600">Execution plane</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{user?.company} jobs monitor</h1>
        <p className="mt-2 text-sm text-slate-600">
          Workspace job runs, live status, and per-chunk progress. Open <span className="font-medium text-slate-800">Job lineage</span> for the Neo4j pipeline → job →
          chunk graph.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <button
            type="button"
            onClick={() => openLineageModal()}
            className="rounded border border-orange-200 bg-orange-50 px-3 py-2 font-medium text-orange-900 hover:bg-orange-100"
          >
            Job lineage
          </button>
        </div>
        {statusFilter || pipelineFilter ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <span>
              Filtered list
              {statusFilter ? (
                <>
                  {" "}
                  · status <span className="mono font-medium">{statusFilter}</span>
                </>
              ) : null}
              {pipelineFilter ? (
                <>
                  {" "}
                  · pipeline <span className="mono font-medium">{pipelineFilter}</span>
                </>
              ) : null}
            </span>
            <button
              type="button"
              className="font-medium text-orange-800 underline"
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.delete("status");
                next.delete("pipeline");
                setSearchParams(next);
              }}
            >
              Clear filters
            </button>
          </div>
        ) : null}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded border border-slate-200 bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-slate-950">Workspace jobs</h2>
            {listQuery.isFetching ? <span className="text-xs text-slate-400">Refreshing…</span> : null}
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                  <th className="border-b border-slate-200 px-4 py-3">Pipeline</th>
                  <th className="border-b border-slate-200 px-4 py-3">Status</th>
                  <th className="border-b border-slate-200 px-4 py-3">Chunks</th>
                  <th className="border-b border-slate-200 px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {listItems.map((item) => {
                  const active = item.id === selectedJobId;
                  const pct = item.total_chunks ? Math.round((item.completed_chunks / item.total_chunks) * 100) : 0;
                  return (
                    <tr key={item.id} className={`align-top ${active ? "bg-orange-50/80" : ""}`}>
                      <td className="border-b border-slate-200 px-4 py-4">
                        <p className="font-medium text-slate-950">{item.pipeline_name}</p>
                        <p className="mono mt-1 text-xs text-slate-500">{item.id}</p>
                        <p className="mt-1 text-xs text-slate-600">
                          {item.source_platform} → {item.destination_platform}
                        </p>
                      </td>
                      <td className="border-b border-slate-200 px-4 py-4">
                        <div className={`rounded px-3 py-2 text-sm ${jobStatusPillClass(item.status)}`}>{item.status}</div>
                        <div className="mt-2 h-2 overflow-hidden rounded bg-slate-100">
                          <div className="h-2 rounded bg-orange-500" style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                      <td className="border-b border-slate-200 px-4 py-4 text-sm text-slate-700">
                        {item.completed_chunks}/{item.total_chunks} ok · {item.failed_chunks} failed
                      </td>
                      <td className="border-b border-slate-200 px-4 py-4">
                        <div className="flex flex-col items-start gap-1">
                          <button
                            type="button"
                            onClick={() => selectJob(item.id)}
                            className="text-sm font-medium text-orange-700 underline"
                          >
                            {active ? "Selected" : "Details"}
                          </button>
                          <button
                            type="button"
                            onClick={() => openLineageModal(item.id)}
                            className="text-xs font-medium text-slate-600 underline hover:text-slate-900"
                          >
                            Lineage
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {listQuery.isLoading ? <p className="mt-4 text-sm text-slate-500">Loading jobs…</p> : null}
          {!listQuery.isLoading && !listItems.length ? (
            <div className="mt-4 rounded border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
              {allJobs.length && (statusFilter || pipelineFilter) ? (
                <>
                  <p>No jobs match the current URL filters.</p>
                  <button
                    type="button"
                    className="mt-2 font-medium text-orange-700 underline"
                    onClick={() => {
                      const next = new URLSearchParams(searchParams);
                      next.delete("status");
                      next.delete("pipeline");
                      setSearchParams(next);
                    }}
                  >
                    Clear filters
                  </button>
                </>
              ) : (
                <>
                  <p>No job executions in this workspace yet.</p>
                  <Link to="/pipelines" className="mt-2 inline-block font-medium text-orange-700 underline">
                    Run a pipeline
                  </Link>
                </>
              )}
            </div>
          ) : null}
        </div>

        <div className="rounded border border-slate-200 bg-white p-6 shadow-panel">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-950">Job detail</h2>
            {selectedJobId ? (
              <button
                type="button"
                onClick={() => selectJob("")}
                className="text-sm font-medium text-slate-600 underline hover:text-slate-900"
              >
                Clear selection
              </button>
            ) : null}
          </div>
          {!selectedJobId ? <p className="mt-4 text-sm text-slate-500">Select a job from the list for status and chunks.</p> : null}
          {selectedJobId && jobQuery.isLoading ? <p className="mt-4 text-sm text-slate-500">Loading job…</p> : null}
          {selectedJobId && jobQuery.isError ? (
            <p className="mt-4 text-sm text-red-600">Could not load this job. It may belong to another workspace or was removed.</p>
          ) : null}
          {detailJob ? (
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500">Status</p>
                <div className={`mt-1 inline-block rounded px-3 py-1.5 text-lg font-medium ${jobStatusPillClass(detailJob.status)}`}>{detailJob.status}</div>
                <p className="mt-2 text-sm text-slate-600">
                  {detailJob.pipeline_name} · {detailJob.completed_chunks}/{detailJob.total_chunks} complete
                </p>
                <p className="mono mt-1 text-xs text-slate-500">{detailJob.id}</p>
                <div className="mt-2 h-2 overflow-hidden rounded bg-slate-100">
                  <div className="h-2 rounded bg-orange-500" style={{ width: `${progress}%` }} />
                </div>
              </div>
              <div className="grid gap-2 text-sm text-slate-600">
                <p>
                  <span className="font-medium text-slate-800">Started:</span> {detailJob.started_at}
                </p>
                {detailJob.finished_at ? (
                  <p>
                    <span className="font-medium text-slate-800">Finished:</span> {detailJob.finished_at}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => openLineageModal(detailJob.id)}
                  className="w-fit text-left text-sm font-medium text-orange-700 underline hover:text-orange-800"
                >
                  View job lineage
                </button>
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-900">Chunks</p>
                {chunksQuery.isLoading ? <p className="mt-2 text-sm text-slate-500">Loading chunks…</p> : null}
                {!chunksQuery.isLoading && !(chunksQuery.data?.items.length ?? 0) ? (
                  <p className="mt-2 text-sm text-slate-500">No chunk rows yet.</p>
                ) : null}
                {chunksQuery.data?.items.length ? (
                  <div className="mt-3 max-h-72 overflow-auto rounded border border-slate-200">
                    <table className="min-w-full text-left text-sm">
                      <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="border-b border-slate-200 px-3 py-2">#</th>
                          <th className="border-b border-slate-200 px-3 py-2">State</th>
                          <th className="border-b border-slate-200 px-3 py-2">Attempts</th>
                          <th className="border-b border-slate-200 px-3 py-2">Bytes</th>
                          <th className="border-b border-slate-200 px-3 py-2">Partition</th>
                        </tr>
                      </thead>
                      <tbody>
                        {chunksQuery.data.items.map((c) => (
                          <tr key={c.chunk_index} className="border-b border-slate-100 last:border-0">
                            <td className="mono px-3 py-2 text-slate-800">{c.chunk_index}</td>
                            <td className="px-3 py-2 text-slate-700">{c.state}</td>
                            <td className="px-3 py-2 text-slate-600">{c.attempts}</td>
                            <td className="px-3 py-2 text-slate-600">{formatBytes(c.bytes_processed)}</td>
                            <td className="max-w-[140px] truncate px-3 py-2 text-xs text-slate-500">{c.source_partition ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {lineageModalOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeLineageModal();
            }
          }}
        >
          <div
            className="flex max-h-[min(90vh,720px)] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="job-lineage-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.24em] text-orange-600">Governance</p>
                <h2 id="job-lineage-modal-title" className="mt-1 text-xl font-semibold text-slate-900">
                  Job lineage
                </h2>
                <p className="mt-1 text-sm text-slate-600">Pipeline → job → chunk graph.</p>
              </div>
              <button
                type="button"
                onClick={closeLineageModal}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <label className="block text-sm font-medium text-slate-700">
                Job
                <select
                  value={lineageFocusJobId}
                  onChange={(e) => setLineageFocusJobId(e.target.value)}
                  className="mt-1 w-full max-w-xl rounded border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                >
                  <option value="">— Select a job —</option>
                  {allJobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.pipeline_name} · {j.id.slice(0, 8)}… ({j.status})
                    </option>
                  ))}
                </select>
              </label>

              {!lineageFocusJobId ? (
                <p className="mt-4 text-sm text-slate-500">Choose a job to load its lineage subgraph.</p>
              ) : null}

              {lineageFocusJobId && jobLineageQuery.isLoading ? <p className="mt-4 text-sm text-slate-500">Loading graph…</p> : null}
              {jobLineageQuery.data?.note === "neo4j_unavailable" ? (
                <p className="mt-4 text-sm text-amber-800">Neo4j is not configured; subgraph is empty.</p>
              ) : null}
              {jobLineageQuery.data?.note === "job_not_in_graph" ? (
                <div className="mt-4 rounded border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <p className="font-medium text-slate-900">No lineage vertex for this job yet</p>
                  <p className="mt-2 leading-relaxed text-slate-600">
                    The job exists in the jobs API, but nothing has been written for it in the lineage graph (Neo4j). That usually means chunk events from job-service are
                    not being forwarded to lineage yet, or this run has not produced any recorded chunks.
                  </p>
                </div>
              ) : null}

              {lineageFocusJobId && jobLineageQuery.data?.nodes.length ? (
                <div className="mt-6 grid gap-6 md:grid-cols-2">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Nodes</h3>
                    <ul className="mt-3 space-y-2 text-sm">
                      {jobLineageQuery.data.nodes.map((n) => (
                        <li key={n.id} className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                          <span className="font-medium text-slate-900">{n.label}</span>
                          <span className={`ml-2 text-xs ${lineageNodeKindClass(n.kind)}`}>{n.kind}</span>
                          {n.meta && Object.keys(n.meta).length ? (
                            <pre className="mono mt-1 max-h-24 overflow-auto text-xs text-slate-500">{JSON.stringify(n.meta)}</pre>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Links</h3>
                    <ul className="mt-3 space-y-2 text-sm">
                      {jobLineageQuery.data.links.map((l, i) => (
                        <li key={`${l.source}-${l.target}-${i}`} className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                          <span className="text-slate-500">{l.rel}</span>
                          <p className="mono mt-1 text-xs text-slate-800">
                            {l.source} → {l.target}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}

              {lineageFocusJobId &&
              !jobLineageQuery.isLoading &&
              !jobLineageQuery.isError &&
              jobLineageQuery.data &&
              !jobLineageQuery.data.nodes.length &&
              jobLineageQuery.data.note !== "neo4j_unavailable" &&
              jobLineageQuery.data.note !== "job_not_in_graph" ? (
                <p className="mt-4 text-sm text-slate-600">
                  No nodes in this subgraph yet (job is in the graph but has no linked chunks or datasets).
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
