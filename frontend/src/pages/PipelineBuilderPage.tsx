import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactFlow, {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  MiniMap,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node as FlowNode,
  type NodeChange
} from "reactflow";
import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  Download,
  Search,
  Settings2,
  SplitSquareVertical,
  WandSparkles,
  X
} from "lucide-react";
import { stringify } from "yaml";

import type { DataSystemItem, PipelineBuilderEdgeDTO, PipelineBuilderNodeDTO, RoutingStrategy } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { useQueryErrorToast } from "../hooks/useQueryErrorToast";
import { intelligenceApi, tenantApi } from "../lib/api";
import { useSessionStore } from "../store/session";

type FlowMode = "manual" | "autonomous";

type NodeData = { label: string; node_type: string };

const inputClass =
  "mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100";

function resolveSourceSlug(sourceDisplay: string, catalog: DataSystemItem[]): string {
  const t = sourceDisplay.trim().toLowerCase();
  if (!t) {
    return catalog[0]?.slug ?? "databricks";
  }
  const byName = catalog.find((s) => s.name.toLowerCase() === t);
  if (byName) {
    return byName.slug;
  }
  const bySlug = catalog.find((s) => s.slug === t);
  if (bySlug) {
    return bySlug.slug;
  }
  const legacy: Record<string, string> = {
    databricks: "databricks",
    snowflake: "snowflake",
    bigquery: "bigquery",
    s3: "aws-s3",
    "aws-s3": "aws-s3"
  };
  return legacy[t] ?? catalog[0]?.slug ?? "databricks";
}

function rfTypeForNodeType(nodeType: string): FlowNode["type"] {
  if (nodeType === "source") {
    return "input";
  }
  if (nodeType === "destination") {
    return "output";
  }
  return "default";
}

function dbNodesToRf(nodes: PipelineBuilderNodeDTO[]): FlowNode<NodeData>[] {
  return nodes.map((n) => ({
    id: n.id,
    type: rfTypeForNodeType(n.node_type),
    position: { x: n.position_x, y: n.position_y },
    data: { label: n.label, node_type: n.node_type }
  }));
}

function dbEdgesToRf(edges: PipelineBuilderEdgeDTO[]): Edge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source_node_id,
    target: e.target_node_id,
    animated: true
  }));
}

function rfToNodeDTOs(nodes: FlowNode<NodeData>[]): PipelineBuilderNodeDTO[] {
  return nodes.map((n) => ({
    id: n.id,
    node_type: n.data?.node_type ?? "default",
    label: n.data?.label ?? "",
    position_x: n.position.x,
    position_y: n.position.y,
    config: {}
  }));
}

function rfToEdgeDTOs(edges: Edge[]): PipelineBuilderEdgeDTO[] {
  return edges.map((e) => ({
    id: e.id,
    source_node_id: e.source,
    target_node_id: e.target,
    edge_type: "default",
    config: {}
  }));
}

function defaultGraph(sourceLabel: string, dataset: string, destLabel: string): { nodes: FlowNode<NodeData>[]; edges: Edge[] } {
  const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  const nodes: FlowNode<NodeData>[] = [
    { id: ids[0], type: "input", position: { x: 0, y: 80 }, data: { label: `${sourceLabel} source`, node_type: "source" } },
    { id: ids[1], type: "default", position: { x: 250, y: 80 }, data: { label: dataset, node_type: "default" } },
    { id: ids[2], type: "default", position: { x: 500, y: 80 }, data: { label: "Smart chunk engine", node_type: "chunk" } },
    { id: ids[3], type: "default", position: { x: 750, y: 80 }, data: { label: "Schema translator", node_type: "transform" } },
    { id: ids[4], type: "output", position: { x: 1000, y: 80 }, data: { label: `${destLabel} destination`, node_type: "destination" } }
  ];
  const edges: Edge[] = [
    { id: crypto.randomUUID(), source: ids[0], target: ids[1], animated: true },
    { id: crypto.randomUUID(), source: ids[1], target: ids[2], animated: true },
    { id: crypto.randomUUID(), source: ids[2], target: ids[3], animated: true },
    { id: crypto.randomUUID(), source: ids[3], target: ids[4], animated: true }
  ];
  return { nodes, edges };
}

function graphFromRouting(strategy: RoutingStrategy): { nodes: FlowNode<NodeData>[]; edges: Edge[] } {
  const hops = strategy.route;
  if (!hops.length) {
    return { nodes: [], edges: [] };
  }
  const spacing = 260;
  const ids = hops.map(() => crypto.randomUUID());
  const nodes: FlowNode<NodeData>[] = hops.map((hop, i) => {
    const nt = i === 0 ? "source" : i === hops.length - 1 ? "destination" : "transform";
    return {
      id: ids[i],
      type: rfTypeForNodeType(nt),
      position: { x: i * spacing, y: 80 },
      data: { label: `${hop.system} — ${hop.action}`, node_type: nt }
    };
  });
  const edges: Edge[] = [];
  for (let i = 0; i < ids.length - 1; i++) {
    edges.push({ id: crypto.randomUUID(), source: ids[i], target: ids[i + 1], animated: true });
  }
  return { nodes, edges };
}

export function PipelineBuilderPage() {
  const { token, user } = useSessionStore();
  const { showToast } = useToast();
  const workspaceId = user?.workspace_id ?? "";
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const pipelineId = searchParams.get("pipelineId") ?? "";

  const source = searchParams.get("source") ?? "Databricks";
  const connectionName = searchParams.get("connectionName") ?? "Primary Lakehouse Connection";
  /** Explicit `?dataset=` (e.g. schema editor) vs default demo dataset when param omitted */
  const datasetFromQuery = searchParams.get("dataset");
  const hasDatasetInUrl = Boolean(datasetFromQuery?.trim());
  const dataset = hasDatasetInUrl ? datasetFromQuery!.trim() : "customer_360";
  const initialMode = (searchParams.get("mode") as FlowMode | null) ?? "autonomous";
  const isDraftFromUrl = !pipelineId && hasDatasetInUrl;

  const [mode, setMode] = useState<FlowMode>(initialMode);
  const [goal, setGoal] = useState(`Make ${dataset} from ${source} available to downstream analytics.`);
  const [destinationSlug, setDestinationSlug] = useState("bigquery");
  const [pipelineName, setPipelineName] = useState("");
  const [nodes, setNodes] = useState<FlowNode<NodeData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [routingStrategy, setRoutingStrategy] = useState<RoutingStrategy | null>(null);
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [executionModalOpen, setExecutionModalOpen] = useState(false);
  const [yamlCopied, setYamlCopied] = useState(false);
  const [serverExportBusy, setServerExportBusy] = useState(false);

  const hydratedKey = useRef<string>("");

  const dataSystemsQuery = useQuery({
    queryKey: ["data-systems", workspaceId],
    queryFn: () => tenantApi.dataSystems(token!, workspaceId),
    enabled: Boolean(token && workspaceId)
  });
  const catalogSystems = dataSystemsQuery.data?.items ?? [];

  const datasetsQuery = useQuery({
    queryKey: ["datasets", workspaceId],
    queryFn: () => tenantApi.datasets(token!, workspaceId),
    enabled: Boolean(token && workspaceId)
  });
  const workspaceDatasetCount = datasetsQuery.data?.items?.length ?? 0;
  const workspaceInputContextLoading = Boolean(token && workspaceId) && datasetsQuery.isLoading;
  const hasWorkspaceDatasets = Boolean(token && workspaceId) && datasetsQuery.isSuccess && workspaceDatasetCount > 0;

  const pipelinesListQuery = useQuery({
    queryKey: ["pipelines", workspaceId],
    queryFn: () => tenantApi.pipelines(token!, workspaceId),
    enabled: Boolean(token && workspaceId)
  });

  const builderQuery = useQuery({
    queryKey: ["pipeline-builder", workspaceId, pipelineId],
    queryFn: () => tenantApi.pipelineBuilder(token!, workspaceId, pipelineId),
    enabled: Boolean(token && workspaceId && pipelineId),
    refetchOnWindowFocus: false
  });

  useQueryErrorToast(
    Boolean(builderQuery.isError),
    builderQuery.error,
    "Load failed",
    showToast
  );

  const setupCatalogWarned = useRef(false);
  useEffect(() => {
    if (!setupModalOpen) {
      setupCatalogWarned.current = false;
      return;
    }
    if (dataSystemsQuery.isLoading || catalogSystems.length) {
      return;
    }
    if (setupCatalogWarned.current) {
      return;
    }
    setupCatalogWarned.current = true;
    showToast("No destination catalog available.", { variant: "error" });
  }, [setupModalOpen, dataSystemsQuery.isLoading, catalogSystems.length, showToast]);

  const sourceSlug = useMemo(() => resolveSourceSlug(source, catalogSystems), [source, catalogSystems]);

  const destinationLabel = useMemo(
    () => catalogSystems.find((s) => s.slug === destinationSlug)?.name ?? destinationSlug,
    [catalogSystems, destinationSlug]
  );

  const canGenerateRoutingGraph = useMemo(() => {
    if (mode !== "autonomous") {
      return false;
    }
    if (!token || !workspaceId) {
      return false;
    }
    if (!goal.trim()) {
      return false;
    }
    if (!hasWorkspaceDatasets) {
      return false;
    }
    if (dataSystemsQuery.isLoading) {
      return false;
    }
    if (!catalogSystems.length) {
      return false;
    }
    if (!catalogSystems.some((s) => s.slug === destinationSlug)) {
      return false;
    }
    return true;
  }, [
    mode,
    token,
    workspaceId,
    goal,
    hasWorkspaceDatasets,
    dataSystemsQuery.isLoading,
    catalogSystems,
    destinationSlug
  ]);

  const routingEngineDisabledReason = useMemo(() => {
    if (mode !== "autonomous") {
      return "Switch to Autonomous mode to generate a graph from the routing engine.";
    }
    if (!token || !workspaceId) {
      return "Sign in with a workspace to use the routing engine.";
    }
    if (!goal.trim()) {
      return "Enter an objective describing what you want the pipeline to achieve.";
    }
    if (!hasWorkspaceDatasets) {
      return "Discover at least one dataset in your workspace (via Connections) before generating a routed graph.";
    }
    if (dataSystemsQuery.isLoading) {
      return "Loading destination catalog…";
    }
    if (!catalogSystems.length) {
      return "No destinations available in the catalog.";
    }
    if (!catalogSystems.some((s) => s.slug === destinationSlug)) {
      return "Select a valid destination.";
    }
    return "";
  }, [
    mode,
    token,
    workspaceId,
    goal,
    hasWorkspaceDatasets,
    dataSystemsQuery.isLoading,
    catalogSystems,
    destinationSlug
  ]);

  useEffect(() => {
    if (!setupModalOpen && !executionModalOpen) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSetupModalOpen(false);
        setExecutionModalOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setupModalOpen, executionModalOpen]);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    setGoal(`Make ${dataset} from ${source} available to downstream analytics.`);
  }, [dataset, source]);

  useEffect(() => {
    if (!catalogSystems.length) {
      return;
    }
    if (catalogSystems.some((s) => s.slug === destinationSlug)) {
      return;
    }
    setDestinationSlug(catalogSystems[0].slug);
  }, [catalogSystems, destinationSlug]);

  /** URL-only visit from schema editor (or similar): show default graph without waiting for pipelineId */
  const draftBootstrapKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (pipelineId) {
      draftBootstrapKeyRef.current = null;
      return;
    }
    if (!hasDatasetInUrl) {
      draftBootstrapKeyRef.current = null;
      return;
    }
    const key = `${source}|${connectionName}|${dataset}|${destinationSlug}|${mode}`;
    if (draftBootstrapKeyRef.current === key) {
      return;
    }
    draftBootstrapKeyRef.current = key;
    const { nodes: n, edges: e } = defaultGraph(source, dataset, destinationLabel);
    setNodes(n);
    setEdges(e);
    setPipelineName(dataset.length > 56 ? `${dataset.slice(0, 53)}…` : dataset);
  }, [
    pipelineId,
    hasDatasetInUrl,
    source,
    connectionName,
    dataset,
    destinationSlug,
    mode,
    destinationLabel
  ]);

  useEffect(() => {
    if (!builderQuery.isSuccess || !builderQuery.data || builderQuery.data.pipeline.id !== pipelineId) {
      return;
    }
    const key = `${pipelineId}:${builderQuery.dataUpdatedAt}`;
    if (hydratedKey.current === key) {
      return;
    }
    hydratedKey.current = key;

    const { pipeline, nodes: dn, edges: de } = builderQuery.data;
    setPipelineName(pipeline.name);
    const bc = pipeline.builder_config ?? {};
    if (typeof bc.goal === "string") {
      setGoal(bc.goal);
    }
    if (bc.mode === "manual" || bc.mode === "autonomous") {
      setMode(bc.mode);
    }
    if (typeof bc.destination_slug === "string" && catalogSystems.some((s) => s.slug === bc.destination_slug)) {
      setDestinationSlug(bc.destination_slug);
    }

    if (dn.length === 0) {
      const { nodes: n, edges: e } = defaultGraph(source, dataset, destinationLabel);
      setNodes(n);
      setEdges(e);
    } else {
      setNodes(dbNodesToRf(dn));
      setEdges(dbEdgesToRf(de));
    }
  }, [builderQuery.isSuccess, builderQuery.data, builderQuery.dataUpdatedAt, pipelineId, source, dataset, destinationLabel, catalogSystems]);

  const createMutation = useMutation({
    mutationFn: () =>
      tenantApi.createPipeline(token!, workspaceId, {
        name: pipelineName.trim() || `Pipeline · ${dataset.length > 42 ? `${dataset.slice(0, 39)}…` : dataset}`,
        builder_config: {
          goal,
          mode,
          source_platform: source,
          connection_name: connectionName,
          dataset_name: dataset,
          destination_slug: destinationSlug
        }
      }),
    onSuccess: (data) => {
      hydratedKey.current = "";
      setPipelineName(data.name);
      setSearchParams((prev) => {
        const n = new URLSearchParams(prev);
        n.set("pipelineId", data.id);
        return n;
      });
      showToast("Created pipeline — adjust the graph and click Save.", { variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["pipelines", workspaceId] });
    },
    onError: (error) => {
      showToast(error instanceof Error ? error.message : "Could not create pipeline.", { variant: "error" });
    }
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      tenantApi.savePipelineBuilder(token!, workspaceId, pipelineId, {
        name: pipelineName.trim() || "Untitled pipeline",
        description: "",
        builder_config: {
          goal,
          mode,
          source_platform: source,
          connection_name: connectionName,
          dataset_name: dataset,
          destination_slug: destinationSlug
        },
        nodes: rfToNodeDTOs(nodes),
        edges: rfToEdgeDTOs(edges)
      }),
    onSuccess: () => {
      showToast("Saved.", { variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["pipeline-builder", workspaceId, pipelineId] });
      void queryClient.invalidateQueries({ queryKey: ["pipelines", workspaceId] });
    },
    onError: (e: Error) => showToast(e.message, { variant: "error" })
  });

  const routeMutation = useMutation({
    mutationFn: () =>
      intelligenceApi.createRoute(token!, workspaceId, {
        objective: goal,
        source_system: sourceSlug,
        destination_system: destinationSlug,
        dataset_size_gb: 120,
        network_bandwidth_mbps: 512,
        worker_capacity: 12,
        cost_preference: "balanced",
        latency_slo_minutes: 90
      }),
    onSuccess: (strategy) => {
      setRoutingStrategy(strategy);
      const { nodes: n, edges: e } = graphFromRouting(strategy);
      if (n.length) {
        setNodes(n);
        setEdges(e);
      }
      showToast("Routing engine updated the graph from your objective.", { variant: "success" });
      setSetupModalOpen(false);
    },
    onError: (e: Error) => showToast(e.message, { variant: "error" })
  });

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({ ...params, id: crypto.randomUUID(), animated: true }, eds));
  }, []);

  const setPipelineIdParam = (id: string) => {
    hydratedKey.current = "";
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      if (id) {
        n.set("pipelineId", id);
      } else {
        n.delete("pipelineId");
      }
      return n;
    });
  };

  const pipelinesRunHref = `/pipelines?run=${encodeURIComponent(pipelineId)}&dataset=${encodeURIComponent(dataset)}`;

  const openSetupModal = () => {
    setExecutionModalOpen(false);
    setSetupModalOpen(true);
  };

  const openExecutionModal = () => {
    setSetupModalOpen(false);
    setExecutionModalOpen(true);
  };

  const pipelineYamlDocument = useMemo(
    () => ({
      pipeline: {
        name: pipelineName.trim() || "Untitled pipeline",
        ...(pipelineId ? { id: pipelineId } : { status: "no_pipeline_selected" }),
        ...(workspaceId ? { workspace_id: workspaceId } : {})
      },
      spec: {
        goal,
        mode,
        source_platform: source,
        connection_name: connectionName,
        dataset_name: dataset,
        destination_slug: destinationSlug
      },
      graph: {
        nodes: nodes.map((n) => ({
          id: n.id,
          node_type: n.data?.node_type ?? "default",
          label: n.data?.label ?? "",
          position: { x: Math.round(n.position.x * 100) / 100, y: Math.round(n.position.y * 100) / 100 }
        })),
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target
        }))
      },
      ...(routingStrategy
        ? {
            routing: {
              chunk_target_mb: routingStrategy.chunk_target_mb,
              compression: routingStrategy.compression,
              route: routingStrategy.route.map((h) => ({ system: h.system, action: h.action }))
            }
          }
        : {})
    }),
    [
      pipelineId,
      pipelineName,
      workspaceId,
      goal,
      mode,
      source,
      connectionName,
      dataset,
      destinationSlug,
      nodes,
      edges,
      routingStrategy
    ]
  );

  const pipelineYamlText = useMemo(() => stringify(pipelineYamlDocument), [pipelineYamlDocument]);

  const copyPipelineYaml = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(pipelineYamlText);
      setYamlCopied(true);
      window.setTimeout(() => setYamlCopied(false), 2000);
    } catch {
      showToast("Could not copy YAML to clipboard.", { variant: "error" });
    }
  }, [pipelineYamlText, showToast]);

  const downloadServerPipelineYaml = useCallback(async () => {
    if (!pipelineId || !token || !workspaceId) {
      return;
    }
    setServerExportBusy(true);
    try {
      const text = await tenantApi.pipelineExportYaml(token, workspaceId, pipelineId);
      const blob = new Blob([text], { type: "application/yaml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pipeline-${pipelineId.slice(0, 8)}.yaml`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("Downloaded server DAG export (YAML).", { variant: "success" });
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Server export failed.", { variant: "error" });
    } finally {
      setServerExportBusy(false);
    }
  }, [pipelineId, token, workspaceId, showToast]);

  return (
    <div className="space-y-6">
      <header className="rounded border border-slate-200 bg-white p-5 shadow-panel sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.28em] text-orange-600">Pipeline builder</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900 sm:text-3xl">Design and save pipeline graphs</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Edit the canvas below, save to your workspace, and run jobs from Pipelines. Open <span className="font-medium text-slate-800">Pipeline setup</span> for
              objective, routing, and source context.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!token || !workspaceId || createMutation.isPending}
              onClick={() => createMutation.mutate()}
              className="rounded bg-ember px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              New pipeline
            </button>
            <Link
              to="/pipelines"
              className="rounded border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              All pipelines
            </Link>
            <button
              type="button"
              onClick={openSetupModal}
              className="inline-flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Settings2 className="h-4 w-4 text-orange-600" />
              Pipeline setup
            </button>
            <button
              type="button"
              onClick={openExecutionModal}
              className="rounded border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Run &amp; routing
            </button>
          </div>
        </div>
        {pipelinesListQuery.data?.items.length ? (
          <label className="mt-4 block max-w-md text-sm font-medium text-slate-700">
            Open existing
            <select className={inputClass} value={pipelineId} onChange={(ev) => setPipelineIdParam(ev.target.value)}>
              <option value="">— Select —</option>
              {pipelinesListQuery.data.items.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {isDraftFromUrl ? (
          <p className="mt-4 rounded border border-orange-200 bg-orange-50/90 px-3 py-2 text-sm text-slate-800">
            <span className="font-medium text-slate-900">Draft from dataset link</span> — graph below matches{" "}
            <span className="mono text-xs">{dataset}</span> on <span className="font-medium">{source}</span> ({connectionName}). Click{" "}
            <strong>New pipeline</strong> to persist, then <strong>Save graph</strong>.
          </p>
        ) : null}
      </header>

      <section className="rounded border border-slate-200 bg-white p-4 shadow-panel sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <label className="min-w-[min(100%,16rem)] flex-1 text-sm font-medium text-slate-700">
            Pipeline name
            <input
              value={pipelineName}
              onChange={(e) => setPipelineName(e.target.value)}
              disabled={!pipelineId && !hasDatasetInUrl}
              className={inputClass}
              placeholder="Shown in Pipelines list"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-slate-500">
              <span className="font-medium text-slate-700">{mode}</span>
              <span className="mx-1.5 text-slate-300">·</span>
              <span title="Destination">{destinationLabel}</span>
            </p>
            <button type="button" onClick={openSetupModal} className="text-xs font-medium text-orange-600 hover:text-orange-700">
              Edit in setup
            </button>
            <button
              type="button"
              disabled={!pipelineId || saveMutation.isPending || !token || !workspaceId}
              onClick={() => saveMutation.mutate()}
              className="rounded bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {saveMutation.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        <div className="mt-4 grid min-h-[420px] grid-cols-1 gap-4 lg:h-[min(70vh,680px)] lg:grid-cols-[1fr_minmax(260px,380px)]">
          <div className="relative h-[min(52vh,520px)] min-h-[320px] overflow-hidden rounded border border-slate-200 bg-slate-50 lg:h-full lg:min-h-0">
            {!pipelineId && !hasDatasetInUrl ? (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-500">
                Create or open a pipeline to edit the graph.
              </div>
            ) : !pipelineId && hasDatasetInUrl && nodes.length === 0 ? (
              <div className="flex h-full items-center justify-center text-slate-500">Preparing graph…</div>
            ) : pipelineId && builderQuery.isLoading ? (
              <div className="flex h-full items-center justify-center text-slate-500">Loading graph…</div>
            ) : (
              <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} fitView>
                <MiniMap />
                <Controls />
                <Background color="#cbd5e1" gap={16} />
              </ReactFlow>
            )}
          </div>

          <aside className="flex min-h-0 max-h-[min(42vh,400px)] flex-col rounded border border-slate-200 bg-slate-50 lg:h-full lg:max-h-none lg:min-h-0">
            <div className="shrink-0 border-b border-slate-200 px-3 py-3 sm:px-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">Pipeline as YAML</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Live spec and graph.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void copyPipelineYaml()}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  {yamlCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {yamlCopied ? "Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  disabled={!pipelineId || serverExportBusy || !token || !workspaceId}
                  onClick={() => void downloadServerPipelineYaml()}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-900 shadow-sm hover:bg-orange-100 disabled:opacity-50"
                  title="DAG-as-code from pipeline-service (GitOps / Airflow-compatible envelope)"
                >
                  <Download className="h-3.5 w-3.5" />
                  {serverExportBusy ? "…" : "Server YAML"}
                </button>
              </div>
            </div>
            <pre className="min-h-0 flex-1 overflow-auto p-3 text-left text-[11px] leading-relaxed text-slate-100 sm:p-4 sm:text-xs bg-slate-900/95">
              {pipelineYamlText}
            </pre>
          </aside>
        </div>
      </section>

      {setupModalOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSetupModalOpen(false);
            }
          }}
        >
          <div
            className="flex max-h-[min(90vh,800px)] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pipeline-setup-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
              <div className="flex min-w-0 items-start gap-3">
                <Bot className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" />
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.24em] text-orange-600">Configuration</p>
                  <h2 id="pipeline-setup-modal-title" className="mt-1 text-xl font-semibold text-slate-900">
                    Pipeline setup
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">Objective, mode, destination, and source binding. Saved when you click Save graph on the main view.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSetupModalOpen(false)}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-medium text-slate-700">Mode</p>
                <div className="inline-flex rounded-full border border-slate-200 bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setMode("manual")}
                    className={`rounded-full px-4 py-2 text-sm font-medium ${mode === "manual" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
                  >
                    Manual
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("autonomous")}
                    className={`rounded-full px-4 py-2 text-sm font-medium ${mode === "autonomous" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
                  >
                    Autonomous
                  </button>
                </div>
              </div>
              <h3 className="mt-6 text-sm font-semibold text-slate-900">Objective</h3>
              <textarea
                className="mt-2 min-h-28 w-full rounded border border-slate-300 bg-white p-4 text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
              />
              <div className={`mt-4 grid gap-3 ${hasWorkspaceDatasets ? "md:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]" : ""}`}>
                <label className="min-w-0 rounded border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-700">
                  Destination
                  {dataSystemsQuery.isLoading ? (
                    <p className="mt-2 text-sm text-slate-500">Loading…</p>
                  ) : !catalogSystems.length ? null : (
                    <SearchableSystemSelect value={destinationSlug} onChange={setDestinationSlug} systems={catalogSystems} />
                  )}
                </label>
                {hasWorkspaceDatasets ? (
                  <div className="min-w-0 rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    <p className="font-medium text-slate-800">Source &amp; dataset</p>
                    <p className="mt-2 text-xs leading-relaxed text-slate-500">
                      Input data for this pipeline. Destination is where processed data lands.
                    </p>
                    <div className="mt-3 space-y-2 border-t border-slate-200/80 pt-3">
                      <ContextRow label="Platform" value={source} />
                      <ContextRow label="Dataset" value={dataset} />
                      <ContextRow label="Connection" value={connectionName} />
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-slate-500">
                      To change these, open the builder from another dataset in your workspace.
                    </p>
                  </div>
                ) : workspaceInputContextLoading ? (
                  <div className="rounded border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-500 md:col-span-2">
                    Checking workspace for discovered datasets…
                  </div>
                ) : token && workspaceId ? (
                  <div className="rounded border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600 md:col-span-2">
                    <p className="font-medium text-slate-800">No source data yet</p>
                    <Link
                      to="/connections"
                      className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-orange-600 hover:text-orange-700"
                    >
                      Go to Connections
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                ) : null}
              </div>
              <div className="mt-6 border-t border-slate-100 pt-4">
                <h3 className="text-sm font-semibold text-slate-900">Context summary</h3>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  {workspaceInputContextLoading ? (
                    <p className="text-slate-500">Loading workspace datasets…</p>
                  ) : hasWorkspaceDatasets ? (
                    <div className="space-y-2">
                      <ContextRow label="Source" value={source} />
                      <ContextRow label="Connection" value={connectionName} />
                      <ContextRow label="Dataset" value={dataset} />
                    </div>
                  ) : token && workspaceId ? (
                    <p className="leading-relaxed text-slate-600">
                      No discovered datasets yet — connect a platform and run discovery to bind source data.
                    </p>
                  ) : (
                    <p className="text-slate-500">Sign in with a workspace to load context.</p>
                  )}
                  <div className="space-y-2 border-t border-slate-100 pt-3">
                    <ContextRow label="Mode" value={mode} />
                    <ContextRow label="Destination" value={destinationLabel} />
                  </div>
                </div>
              </div>
              <div className="mt-6">
                <button
                  type="button"
                  disabled={routeMutation.isPending || !canGenerateRoutingGraph}
                  title={routeMutation.isPending || canGenerateRoutingGraph ? undefined : routingEngineDisabledReason}
                  onClick={() => routeMutation.mutate()}
                  className="rounded px-4 py-3 font-medium disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:hover:bg-slate-300 enabled:bg-orange-500 enabled:text-white enabled:hover:bg-orange-600"
                >
                  {routeMutation.isPending ? "Generating…" : "Generate graph from routing engine"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {executionModalOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setExecutionModalOpen(false);
            }
          }}
        >
          <div
            className="flex max-h-[min(90vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pipeline-exec-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.24em] text-orange-600">Execution</p>
                <h2 id="pipeline-exec-modal-title" className="mt-1 text-xl font-semibold text-slate-900">
                  Run &amp; routing
                </h2>
                <p className="mt-1 text-sm text-slate-600">Routing output and how to start a job in Pipelines.</p>
              </div>
              <button
                type="button"
                onClick={() => setExecutionModalOpen(false)}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
              <div className="space-y-3">
                {routingStrategy ? (
                  <>
                    <PlanRow
                      icon={<WandSparkles className="h-4 w-4 text-orange-600" />}
                      title="Last routing result"
                      text={`Chunk ${routingStrategy.chunk_target_mb} MB · ${routingStrategy.compression}`}
                    />
                    <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">
                      {routingStrategy.route.map((h, i) => (
                        <li key={`${h.system}-${i}`}>
                          {h.system} — {h.action}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <PlanRow
                    icon={<SplitSquareVertical className="h-4 w-4 text-orange-600" />}
                    title="Routing"
                    text='Use "Generate graph from routing engine" in Pipeline setup (autonomous mode) to align the canvas with routing output.'
                  />
                )}
                <PlanRow
                  icon={<Clock3 className="h-4 w-4 text-orange-600" />}
                  title="Run"
                  text="Start a job from Pipelines with this pipeline id and dataset."
                />
              </div>
              <Link
                to={pipelineId ? pipelinesRunHref : "/pipelines"}
                className={`mt-5 block rounded px-4 py-3 text-center text-sm font-medium text-white ${pipelineId ? "bg-ember" : "cursor-not-allowed bg-slate-300"}`}
                aria-disabled={!pipelineId}
                onClick={(e) => {
                  if (!pipelineId) {
                    e.preventDefault();
                  }
                }}
              >
                Open run dialog (Pipelines)
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SearchableSystemSelect({
  value,
  onChange,
  systems,
}: {
  value: string;
  onChange: (slug: string) => void;
  systems: DataSystemItem[];
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
      if (!rootRef.current?.contains(event.target as globalThis.Node)) {
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
        <span className="truncate">{selected?.name ?? "Select"}</span>
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
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="w-full rounded border border-slate-300 py-2 pl-8 pr-2 text-sm outline-none focus:border-orange-400"
              />
            </div>
          </div>
          <ul className="max-h-56 overflow-y-auto py-1" role="listbox">
            {filtered.map((s) => (
              <li key={s.slug}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(s.slug);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-orange-50"
                  role="option"
                >
                  <span className="truncate">{s.name}</span>
                  {value === s.slug ? <Check className="h-4 w-4 text-orange-600" /> : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function PlanRow({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-sm font-medium text-slate-900">{title}</p>
      </div>
      <p className="mt-2 text-xs text-slate-600">{text}</p>
    </div>
  );
}

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs uppercase tracking-wider text-slate-500">{label}</span>
      <p className="font-medium text-slate-900">{value}</p>
    </div>
  );
}
