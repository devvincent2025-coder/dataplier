import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Braces, Database, Eye, PlayCircle, ScanSearch, SplitSquareVertical } from "lucide-react";

import { DatasetIntelChips } from "../components/DatasetIntelChips";
import { useToast } from "../context/ToastContext";
import { useQueryErrorToast } from "../hooks/useQueryErrorToast";
import { tenantApi } from "../lib/api";
import { useSessionStore } from "../store/session";

/** Show datasets from every connection (URL / legacy filters still apply). */
const ALL_CONNECTIONS_VALUE = "__all__";

export function DatasetExplorerPage() {
  const { token, user } = useSessionStore();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const sourceFilter = searchParams.get("source");
  const connectionNameFilter = searchParams.get("connectionName");
  const datasetFilter = searchParams.get("dataset");
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>("");
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const connectionsQuery = useQuery({
    queryKey: ["connections", user?.workspace_id],
    queryFn: () => tenantApi.connections(token!, user!.workspace_id),
    enabled: Boolean(token && user?.workspace_id)
  });

  const connections = useMemo(
    () => [...(connectionsQuery.data?.items ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [connectionsQuery.data?.items]
  );

  const query = useQuery({
    queryKey: ["datasets", user?.workspace_id],
    queryFn: () => tenantApi.datasets(token!, user!.workspace_id),
    enabled: Boolean(token && user?.workspace_id)
  });

  /** Pick connection from URL, or auto-pick when there is only one connector. */
  useEffect(() => {
    if (!connections.length) return;
    if (connectionNameFilter) {
      const match = connections.find((c) => c.name === connectionNameFilter);
      if (match) {
        setSelectedConnectionId(match.id);
        return;
      }
    }
    if (connections.length === 1) {
      setSelectedConnectionId((prev) => prev || connections[0]!.id);
    }
  }, [connections, connectionNameFilter]);

  const filteredItems = useMemo(() => {
    let items = query.data?.items ?? [];
    items = items.filter((item) => {
      if (sourceFilter && item.platform.toLowerCase() !== sourceFilter.toLowerCase()) {
        return false;
      }
      if (connectionNameFilter && item.connection_name !== connectionNameFilter) {
        return false;
      }
      return true;
    });

    if (connectionsQuery.isPending) {
      return [];
    }

    const mustPickConnection =
      connections.length > 1 &&
      !connectionNameFilter &&
      selectedConnectionId !== ALL_CONNECTIONS_VALUE &&
      selectedConnectionId === "";

    if (mustPickConnection) {
      return [];
    }

    if (selectedConnectionId === ALL_CONNECTIONS_VALUE) {
      return items;
    }

    if (selectedConnectionId) {
      const conn = connections.find((c) => c.id === selectedConnectionId);
      if (!conn) return items;
      return items.filter((item) => item.connection_name === conn.name);
    }

    if (connections.length === 1) {
      const only = connections[0]!;
      return items.filter((item) => item.connection_name === only.name);
    }

    return items;
  }, [query.data?.items, sourceFilter, connectionNameFilter, selectedConnectionId, connections, connectionsQuery.isPending]);

  useEffect(() => {
    if (!selectedDatasetId) return;
    if (!filteredItems.some((d) => d.id === selectedDatasetId)) {
      setSelectedDatasetId(null);
    }
  }, [filteredItems, selectedDatasetId]);

  function onConnectionScopeChange(nextId: string) {
    setSelectedConnectionId(nextId);
    setSelectedDatasetId(null);
    const next = new URLSearchParams(searchParams);
    if (!nextId || nextId === ALL_CONNECTIONS_VALUE) {
      next.delete("connectionName");
    } else {
      const conn = connections.find((c) => c.id === nextId);
      if (conn) next.set("connectionName", conn.name);
    }
    setSearchParams(next, { replace: true });
  }

  const selectedDataset = useMemo(
    () =>
      filteredItems.find((item) => item.id === selectedDatasetId) ??
      filteredItems.find((item) => item.name === datasetFilter) ??
      filteredItems[0],
    [filteredItems, selectedDatasetId, datasetFilter]
  );

  const schemaQuery = useQuery({
    queryKey: ["dataset-schema", user?.workspace_id, selectedDataset?.id],
    queryFn: () => tenantApi.datasetSchema(token!, user!.workspace_id, selectedDataset!.id),
    enabled: Boolean(token && user?.workspace_id && selectedDataset?.id)
  });

  useQueryErrorToast(
    Boolean(connectionsQuery.isError),
    connectionsQuery.error,
    "Could not load connections. Refresh or check the gateway.",
    showToast
  );
  useQueryErrorToast(
    Boolean(schemaQuery.isError),
    schemaQuery.error,
    "Could not refetch schema; showing cached list fields.",
    showToast
  );

  const schemaFields = useMemo(() => {
    const raw = schemaQuery.data?.schema_json ?? selectedDataset?.schema_json ?? {};
    return Object.entries(raw);
  }, [schemaQuery.data?.schema_json, selectedDataset?.schema_json]);

  const pipelineBuilderManual = selectedDataset
    ? buildPipelineBuilderHref({
        source: selectedDataset.platform,
        connectionName: selectedDataset.connection_name,
        datasetName: selectedDataset.name,
        mode: "manual"
      })
    : "/pipeline-builder";

  const pipelineBuilderAuto = selectedDataset
    ? buildPipelineBuilderHref({
        source: selectedDataset.platform,
        connectionName: selectedDataset.connection_name,
        datasetName: selectedDataset.name,
        mode: "autonomous"
      })
    : "/pipeline-builder";

  const pipelinesRunHref = selectedDataset ? `/pipelines?dataset=${encodeURIComponent(selectedDataset.name)}` : "/pipelines";

  return (
    <div className="space-y-8">
      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm uppercase tracking-[0.3em] text-teal">• Read And Profile Data</p>
          <h1 className="mt-3 text-4xl font-semibold text-slate-950">{user?.company} dataset explorer</h1>
          <p className="mt-4 max-w-3xl text-slate-600">
            Open the pipeline builder with this context or start a run from the Pipelines page.
          </p>
          {sourceFilter || connectionNameFilter ? (
            <div className="mt-5 rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Focused on {sourceFilter || "selected source"} {connectionNameFilter ? `via ${connectionNameFilter}` : ""}.
            </div>
          ) : null}
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <FlowCard icon={<Database className="h-5 w-5 text-teal" />} title="Select Source" text="Pick the connected warehouse or store." />
            <FlowCard icon={<ScanSearch className="h-5 w-5 text-teal" />} title="Profile" text="Read rows, bytes, and freshness." />
            <FlowCard icon={<Braces className="h-5 w-5 text-teal" />} title="Inspect Schema" text="Understand field contracts before moving data." />
            <FlowCard icon={<ArrowRight className="h-5 w-5 text-teal" />} title="Forward" text="Create a pipeline or autonomous routing objective." />
          </div>
        </div>
        <div className="rounded border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm uppercase tracking-[0.25em] text-teal">Action Panel</p>
          <div className="mt-5 space-y-4">
            <Link
              to={pipelineBuilderManual}
              aria-disabled={!selectedDataset}
              className={`flex w-full items-center justify-between rounded border border-slate-200 bg-slate-50 px-5 py-4 text-left transition hover:bg-orange-50 ${!selectedDataset ? "pointer-events-none opacity-50" : ""}`}
            >
              <span>
                <p className="font-medium text-slate-900">Build manual pipeline</p>
                <p className="mt-1 text-sm text-slate-600">Opens pipeline builder with this dataset and connection in the query string.</p>
              </span>
              <SplitSquareVertical className="h-5 w-5 text-teal" />
            </Link>
            <Link
              to={pipelineBuilderAuto}
              aria-disabled={!selectedDataset}
              className={`flex w-full items-center justify-between rounded border border-slate-200 bg-slate-50 px-5 py-4 text-left transition hover:bg-orange-50 ${!selectedDataset ? "pointer-events-none opacity-50" : ""}`}
            >
              <span>
                <p className="font-medium text-slate-900">Launch autonomous pipeline</p>
                <p className="mt-1 text-sm text-slate-600">Same context with autonomous mode flag for the builder.</p>
              </span>
              <PlayCircle className="h-5 w-5 text-teal" />
            </Link>
            <Link
              to={pipelinesRunHref}
              aria-disabled={!selectedDataset}
              className={`flex w-full items-center justify-between rounded border border-ember/30 bg-orange-50 px-5 py-4 text-left transition hover:bg-orange-100 ${!selectedDataset ? "pointer-events-none opacity-50" : ""}`}
            >
              <span>
                <p className="font-medium text-slate-900">Run on Pipelines page</p>
                <p className="mt-1 text-sm text-slate-600">Opens Pipelines with ?dataset=… so “Run” pre-selects this dataset.</p>
              </span>
              <ArrowRight className="h-5 w-5 text-ember" />
            </Link>
            <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4 text-sm">
              <Link to="/connections" className="text-teal underline">
                Connections
              </Link>
              <span className="text-slate-300">·</span>
              <Link to="/jobs-monitor" className="text-teal underline">
                Jobs monitor
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-teal">Available Datasets</p>
              <h2 className="mt-2 text-2xl font-semibold">Choose what to move</h2>
            </div>
            <span className="text-sm text-slate-500">
              {connectionsQuery.isPending ? "…" : `${filteredItems.length} discovered`}
            </span>
          </div>

          <div className="mt-6 rounded border border-slate-200 bg-slate-50 p-4">
            <label htmlFor="dataset-explorer-connection" className="text-sm font-medium text-slate-800">
              Connection
            </label>
            <p className="mt-1 text-xs text-slate-600">
              Pick a connected source to list only its discovered tables. Use “All connections” when you need the full catalog across every connector.
            </p>
            <select
              id="dataset-explorer-connection"
              className="mt-3 w-full rounded border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal disabled:cursor-not-allowed disabled:opacity-60"
              value={selectedConnectionId}
              onChange={(e) => onConnectionScopeChange(e.target.value)}
              disabled={connectionsQuery.isPending || connections.length === 0}
            >
              {connections.length > 1 ? (
                <option value="">Select a connection…</option>
              ) : null}
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.platform})
                  {c.status ? ` — ${c.status}` : ""}
                </option>
              ))}
              {connections.length > 1 ? (
                <option value={ALL_CONNECTIONS_VALUE}>All connections (full list)</option>
              ) : null}
            </select>
            {!connectionsQuery.isPending && connections.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">
                No connections in this workspace yet.{" "}
                <Link to="/connections" className="font-medium text-teal underline">
                  Add a connection
                </Link>{" "}
                and run discovery before datasets appear here.
              </p>
            ) : null}
          </div>

          <div className="mt-6 space-y-4">
            {filteredItems.map((item) => {
              const selected = selectedDataset?.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedDatasetId(item.id)}
                  className={`w-full rounded border p-5 text-left transition ${selected ? "border-teal bg-orange-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-slate-900">{item.name}</p>
                      <p className="text-sm text-slate-600">
                        {item.platform} via {item.connection_name}
                      </p>
                    </div>
                    <ArrowRight className="h-5 w-5 text-slate-400" />
                  </div>
                  <p className="mt-3 text-sm text-slate-600">
                    {item.estimated_rows.toLocaleString()} rows • {Math.round(item.estimated_bytes / 1024 / 1024)} MB • discovered {item.discovered_at}
                  </p>
                  <DatasetIntelChips item={item} />
                </button>
              );
            })}
            {query.isLoading || connectionsQuery.isPending ? (
              <p className="text-sm text-slate-600">Loading connections and datasets…</p>
            ) : null}
            {!query.isLoading &&
            !connectionsQuery.isPending &&
            connections.length > 1 &&
            selectedConnectionId === "" &&
            !connectionNameFilter ? (
              <div className="rounded border border-dashed border-amber-200 bg-amber-50/80 p-5 text-sm text-amber-950">
                Select a <strong>connection</strong> above to see its datasets. With many connectors, the explorer stays scoped to one source at a time so the list stays manageable.
              </div>
            ) : null}
            {!query.isLoading &&
            !connectionsQuery.isPending &&
            !(connections.length > 1 && selectedConnectionId === "" && !connectionNameFilter) &&
            filteredItems.length === 0 ? (
              <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                {connections.length === 0 ? (
                  <>
                    Add at least one connection, then run discovery from the connections flow. Datasets will appear here once metadata is synced.
                  </>
                ) : (
                  <>
                    No datasets have been discovered yet for this connection. Complete source discovery from the{" "}
                    <Link to="/connections" className="font-medium text-teal underline">
                      connections
                    </Link>{" "}
                    flow first.
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm uppercase tracking-[0.25em] text-teal">Selected Dataset</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">{selectedDataset?.name || "Choose a dataset"}</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <Metric title="Rows" value={selectedDataset ? selectedDataset.estimated_rows.toLocaleString() : "--"} />
            <Metric title="Estimated Size" value={selectedDataset ? `${Math.round(selectedDataset.estimated_bytes / 1024 / 1024)} MB` : "--"} />
            <Metric title="Source" value={selectedDataset ? selectedDataset.platform : "--"} />
          </div>
          {selectedDataset ? (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Warehouse &amp; contract signals</p>
              <DatasetIntelChips item={selectedDataset} />
            </div>
          ) : null}
          <div className="mt-6 rounded border border-slate-200 bg-slate-50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-medium text-slate-900">Schema (API + JSON)</p>
              {schemaQuery.isFetching ? <span className="text-xs text-slate-500">Refreshing schema…</span> : null}
            </div>
            <pre className="mt-4 max-h-48 overflow-auto text-xs text-slate-700">{JSON.stringify(Object.fromEntries(schemaFields), null, 2)}</pre>
          </div>

          {previewOpen && selectedDataset ? (
            <div className="mt-4 rounded border border-dashed border-slate-300 bg-white p-4">
              <p className="text-sm font-medium text-slate-900">Logical preview</p>
              <p className="mt-1 text-xs text-slate-600">
                There is no row-sampling API in this stack yet. This table lists columns from the stored schema only (same shape as production metadata).
              </p>
              {schemaFields.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No schema fields recorded. Profile or edit schema after discovery.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        {schemaFields.map(([name]) => (
                          <th key={name} className="px-2 py-2 font-medium text-slate-800">
                            {name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="text-slate-500">
                        {schemaFields.map(([name, typ]) => (
                          <td key={name} className="mono px-2 py-2 text-xs">
                            ({String(typ)})
                          </td>
                        ))}
                      </tr>
                      <tr className="text-slate-400">
                        {schemaFields.map(([name]) => (
                          <td key={name} className="px-2 py-2 text-xs italic">
                            —
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <button
              type="button"
              disabled={!selectedDataset}
              onClick={() => setPreviewOpen((v) => !v)}
              className="inline-flex items-center justify-center gap-2 rounded border border-slate-300 bg-white px-4 py-3 text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Eye className="h-4 w-4" />
              {previewOpen ? "Hide preview" : "Logical preview"}
            </button>
            <Link
              to={selectedDataset ? `/schema-editor?datasetId=${encodeURIComponent(selectedDataset.id)}` : "#"}
              className={`rounded border border-slate-300 bg-white px-4 py-3 text-center text-slate-700 transition hover:bg-slate-50 ${!selectedDataset ? "pointer-events-none opacity-50" : ""}`}
            >
              Open Schema Editor
            </Link>
            <Link
              to={pipelineBuilderManual}
              className={`rounded border border-slate-300 bg-white px-4 py-3 text-center text-slate-700 transition hover:bg-slate-50 ${!selectedDataset ? "pointer-events-none opacity-50" : ""}`}
            >
              Configure chunking
            </Link>
            <Link
              to={pipelinesRunHref}
              className={`rounded bg-ember px-4 py-3 text-center font-medium text-white ${!selectedDataset ? "pointer-events-none opacity-50" : ""}`}
            >
              Send to pipeline run
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function FlowCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
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

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function buildPipelineBuilderHref({
  source,
  connectionName,
  datasetName,
  mode
}: {
  source: string;
  connectionName: string;
  datasetName: string;
  mode: "manual" | "autonomous";
}) {
  const params = new URLSearchParams({
    source,
    connectionName,
    dataset: datasetName,
    mode
  });
  return `/pipeline-builder?${params.toString()}`;
}
