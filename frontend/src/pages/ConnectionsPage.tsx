import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Cloud,
  Database,
  FolderKanban,
  LoaderCircle,
  PanelRightOpen,
  PlugZap,
  Search,
  SearchCheck,
  Trash2,
  TriangleAlert,
  X
} from "lucide-react";

import { useToast } from "../context/ToastContext";
import { useQueryErrorToast } from "../hooks/useQueryErrorToast";
import { DataSystemLogo } from "../components/data-system-logo";
import { authApi, tenantApi, type ConnectionItem, type DataSystemItem, type DatasetItem, type WorkspaceItem } from "../lib/api";
import { useSessionStore } from "../store/session";

type ConnectorField = {
  key: string;
  label: string;
  type: "text" | "password" | "textarea";
  placeholder: string;
  helper: string;
};

type ConnectorDefinition = {
  id: string;
  name: string;
  category: string;
  tagline: string;
  accent: string;
  fields: ConnectorField[];
  logo: ReactNode;
};

type TestState = "idle" | "testing" | "success" | "error";
type DiscoveryState = "idle" | "discovering" | "success";
type WizardStep = "configure" | "discover" | "success";

/** Credential forms for platforms with live test/discovery adapters; names must match backend normalizePlatform. */
const connectorFieldsBySlug: Record<string, ConnectorField[]> = {
  databricks: [
    { key: "workspaceUrl", label: "Workspace URL", type: "text", placeholder: "https://adb-123456.azuredatabricks.net", helper: "The Databricks workspace hostname." },
    {
      key: "schema",
      label: "Schema",
      type: "text",
      placeholder: "default",
      helper: "Schema to discover tables from. Leave blank to auto-detect."
    },
    { key: "personalAccessToken", label: "Personal Access Token", type: "password", placeholder: "dapi****************", helper: "Token must allow SQL access and catalog discovery." },
    { key: "catalog", label: "Default Catalog", type: "text", placeholder: "main", helper: "Used to scope initial discovery." }
  ],
  snowflake: [
    { key: "account", label: "Account Identifier", type: "text", placeholder: "acme-org.us-east-1", helper: "Snowflake account locator and cloud region." },
    { key: "username", label: "Username", type: "text", placeholder: "dataplier_reader", helper: "User with metadata access to the account." },
    { key: "password", label: "Password", type: "password", placeholder: "••••••••••••", helper: "Password for the Snowflake metadata user." },
    { key: "warehouse", label: "Warehouse", type: "text", placeholder: "COMPUTE_XL", helper: "The compute warehouse for discovery queries." },
    { key: "role", label: "Role", type: "text", placeholder: "DATA_ENGINEER", helper: "Must have metadata access to the target databases." },
    { key: "database", label: "Default Database", type: "text", placeholder: "ANALYTICS", helper: "Optional default database to scope discovery." }
  ],
  bigquery: [
    { key: "projectId", label: "Project ID", type: "text", placeholder: "customer-analytics-prod", helper: "Google Cloud project hosting the datasets." },
    { key: "dataset", label: "Default Dataset", type: "text", placeholder: "fraud_features", helper: "Used as the first discovery scope." },
    { key: "location", label: "Location", type: "text", placeholder: "US", helper: "Dataset processing region." },
    { key: "serviceAccount", label: "Service Account JSON", type: "textarea", placeholder: "{ ... }", helper: "Paste the JSON key with read-only metadata permissions." }
  ],
  "aws-s3": [
    { key: "bucket", label: "Bucket", type: "text", placeholder: "enterprise-raw-zone", helper: "Bucket used for discovery and staging." },
    { key: "region", label: "Region", type: "text", placeholder: "us-east-1", helper: "AWS region where the bucket lives." },
    { key: "accessKey", label: "Access Key", type: "password", placeholder: "AKIA************", helper: "IAM user or role credential with list/get access." },
    { key: "secretKey", label: "Secret Key", type: "password", placeholder: "••••••••••••", helper: "Stored in the encrypted connection vault." }
  ],
  "azure-blob": [
    { key: "storageAccount", label: "Storage Account", type: "text", placeholder: "dataplierlanding", helper: "Azure storage account name." },
    { key: "container", label: "Container", type: "text", placeholder: "raw-zone", helper: "Container to scan for partitioned objects." },
    { key: "accountKey", label: "Account Key", type: "password", placeholder: "••••••••••••", helper: "Shared key used to sign Azure Blob list requests." },
    { key: "prefix", label: "Prefix", type: "text", placeholder: "customers/", helper: "Optional prefix to scope discovery within the container." }
  ],
  postgresql: [
    { key: "host", label: "Host", type: "text", placeholder: "db.internal.company.com", helper: "Primary or read replica hostname." },
    { key: "port", label: "Port", type: "text", placeholder: "5432", helper: "Default PostgreSQL port unless customized." },
    { key: "database", label: "Database", type: "text", placeholder: "customers", helper: "Database to inspect for schemas and tables." },
    { key: "username", label: "Username", type: "text", placeholder: "reader", helper: "Read-only account recommended." },
    { key: "password", label: "Password", type: "password", placeholder: "•••••••••••", helper: "Database password stored in the encrypted connection vault." }
  ],
  mysql: [
    { key: "host", label: "Host", type: "text", placeholder: "mysql.retail.internal", helper: "Primary, replica, or managed MySQL endpoint." },
    { key: "port", label: "Port", type: "text", placeholder: "3306", helper: "Default MySQL port unless customized." },
    { key: "database", label: "Database", type: "text", placeholder: "orders", helper: "Source schema for discovery." },
    { key: "username", label: "Username", type: "text", placeholder: "reader", helper: "Connection user with metadata access." },
    { key: "password", label: "Password", type: "password", placeholder: "•••••••••••", helper: "Database password stored in the encrypted connection vault." }
  ]
};

function dataSystemToConnector(system: DataSystemItem): ConnectorDefinition {
  const fields = connectorFieldsBySlug[system.slug] ?? [];
  return {
    id: system.slug,
    name: system.name,
    category: system.category,
    tagline: system.tagline,
    accent: system.accent,
    fields,
    logo: <DataSystemLogo slug={system.slug} />
  };
}

export function ConnectionsPage() {
  const { token, user } = useSessionStore();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [wizardWorkspaceId, setWizardWorkspaceId] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [connectionsModalOpen, setConnectionsModalOpen] = useState(false);
  const [connectionPendingDelete, setConnectionPendingDelete] = useState<ConnectionItem | null>(null);
  const [wizardStep, setWizardStep] = useState<WizardStep>("configure");
  const [connectionName, setConnectionName] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [testState, setTestState] = useState<TestState>("idle");
  const [discoveryState, setDiscoveryState] = useState<DiscoveryState>("idle");
  const [testMessage, setTestMessage] = useState("No validation has run yet.");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [createdConnection, setCreatedConnection] = useState<ConnectionItem | null>(null);
  const [discoveredDatasets, setDiscoveredDatasets] = useState<
    Array<{ name: string; rows: string; size: string; schemaHint: string }>
  >([]);
  const canWriteConnections = user?.permissions?.includes("connections.write") ?? false;

  const workspaceQuery = useQuery({
    queryKey: ["auth-workspaces"],
    queryFn: () => authApi.workspaces(token!),
    enabled: Boolean(token)
  });

  const sessionWorkspaceId = user?.workspace_id ?? "";

  const dataSystemsQuery = useQuery({
    queryKey: ["data-systems", sessionWorkspaceId],
    queryFn: () => tenantApi.dataSystems(token!, sessionWorkspaceId),
    enabled: Boolean(token && sessionWorkspaceId)
  });

  useQueryErrorToast(
    Boolean(dataSystemsQuery.isError),
    dataSystemsQuery.error,
    "Could not load catalog.",
    showToast
  );

  const catalogSystems = dataSystemsQuery.data?.items ?? [];
  const normalizedCatalogSearch = catalogSearch.trim().toLowerCase();
  const filteredCatalogSystems = useMemo(() => {
    if (!normalizedCatalogSearch) {
      return catalogSystems;
    }
    return catalogSystems.filter((system) => {
      const haystack = `${system.name} ${system.slug} ${system.category}`.toLowerCase();
      return haystack.includes(normalizedCatalogSearch);
    });
  }, [catalogSystems, normalizedCatalogSearch]);

  const selectedConnector = useMemo(() => {
    if (!selectedSlug) {
      return null;
    }
    const system = catalogSystems.find((s) => s.slug === selectedSlug);
    if (!system) {
      return null;
    }
    return dataSystemToConnector(system);
  }, [catalogSystems, selectedSlug]);

  useEffect(() => {
    if (selectedSlug !== null || !catalogSystems.length) {
      return;
    }
    setSelectedSlug(catalogSystems[0].slug);
  }, [catalogSystems, selectedSlug]);

  const connectionsQuery = useQuery({
    queryKey: ["connections", sessionWorkspaceId],
    queryFn: () => tenantApi.connections(token!, sessionWorkspaceId),
    enabled: Boolean(token && sessionWorkspaceId)
  });

  const deleteConnectionMutation = useMutation({
    mutationFn: ({ id }: { id: string; name: string }) =>
      tenantApi.deleteConnection(token!, sessionWorkspaceId, id),
    onSuccess: (_, { name }) => {
      showToast(`Connection "${name}" removed.`, { variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["connections", sessionWorkspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["datasets", sessionWorkspaceId] });
    },
    onError: (error) => {
      showToast(error instanceof Error ? error.message : "Could not delete connection.", { variant: "error" });
    }
  });

  useEffect(() => {
    if (!selectedConnector) {
      return;
    }
    const nextValues = selectedConnector.fields.reduce<Record<string, string>>((acc, field) => {
      acc[field.key] = "";
      return acc;
    }, {});

    setConnectionName(`${user?.company || "Workspace"} ${selectedConnector.name}`);
    setFieldValues(nextValues);
    setTestState("idle");
    setDiscoveryState("idle");
    setTestMessage(`Ready to validate ${selectedConnector.name} connectivity.`);
    setWizardStep("configure");
  }, [selectedConnector, user?.company]);

  const canTest = Boolean(
    selectedConnector &&
    selectedConnector.fields
      .filter((field) => field.key !== "schema") // schema is optional
      .every((field) => Boolean(fieldValues[field.key]?.trim()))
  );

  const testConnectionMutation = useMutation({
    mutationFn: () =>
      tenantApi.testConnection(token!, wizardWorkspaceId, {
        name: connectionName,
        platform: selectedConnector!.name,
        credentials: fieldValues,
        config: buildConnectionConfig(selectedConnector!.fields, fieldValues)
      }),
    onMutate: () => {
      setTestState("testing");
      setTestMessage(`Testing ${selectedConnector!.name} credentials, network reachability, and metadata permissions...`);
    },
    onSuccess: (data) => {
      setTestState("success");
      setTestMessage(data.message);
      showToast(data.message, { variant: "success" });
      setWizardStep("discover");
    },
    onError: (error) => {
      setTestState("error");
      setDiscoveryState("idle");
      const msg = error instanceof Error ? error.message : "Connection validation failed.";
      setTestMessage(msg);
      showToast(msg, { variant: "error" });
    }
  });

  const createConnectionMutation = useMutation({
    mutationFn: () =>
      tenantApi.createConnection(token!, wizardWorkspaceId, {
        name: connectionName,
        platform: selectedConnector!.name,
        credentials: fieldValues,
        config: buildConnectionConfig(selectedConnector!.fields, fieldValues)
      }),
    onSuccess: async (data) => {
      setCreatedConnection(data.item);
      await queryClient.invalidateQueries({ queryKey: ["connections", wizardWorkspaceId] });
    }
  });

  const discoverConnectionMutation = useMutation({
    mutationFn: (connectionId: string) => tenantApi.discoverConnection(token!, wizardWorkspaceId, connectionId),
    onMutate: () => {
      setDiscoveryState("discovering");
      setDiscoveredDatasets([]);
    },
    onSuccess: async (data) => {
      setDiscoveredDatasets(
        data.items.map((item) => ({
          name: item.name,
          rows: item.estimated_rows.toLocaleString(),
          size: `${Math.round(item.estimated_bytes / 1024 / 1024)} MB`,
          schemaHint: summarizeSchema(item)
        }))
      );
      setDiscoveryState("success");
      setWizardStep("success");
      showToast("Discovery completed. Results are ready for chunking and routing.", { variant: "success" });
      await queryClient.invalidateQueries({ queryKey: ["datasets", wizardWorkspaceId] });
    },
    onError: (error) => {
      setDiscoveryState("idle");
      setDiscoveredDatasets([]);
      showToast(error instanceof Error ? error.message : "Discovery failed.", { variant: "error" });
    }
  });

  function handleFieldChange(key: string, value: string) {
    setFieldValues((current) => ({ ...current, [key]: value }));
    if (testState !== "idle") {
      setTestState("idle");
      setTestMessage("Configuration changed. Run validation again.");
      setDiscoveryState("idle");
      setWizardStep("configure");
      setCreatedConnection(null);
      setDiscoveredDatasets([]);
    }
  }

  async function handleTestConnection() {
    if (!canTest || !token || !wizardWorkspaceId) {
      setTestState("error");
      setDiscoveryState("idle");
      const msg = "Missing required credentials. Complete all connector fields before testing.";
      setTestMessage(msg);
      showToast(msg, { variant: "error" });
      return;
    }

    await testConnectionMutation.mutateAsync();
  }

  async function handleDiscover() {
    if (testState !== "success") {
      setTestState("error");
      const msg = "Validate the connection successfully before discovering datasets.";
      setTestMessage(msg);
      showToast(msg, { variant: "error" });
      return;
    }
    if (!token || !wizardWorkspaceId) {
      return;
    }

    try {
      const connection = createdConnection ?? (await createConnectionMutation.mutateAsync()).item;
      setCreatedConnection(connection);
      await discoverConnectionMutation.mutateAsync(connection.id);
    } catch (error) {
      setDiscoveryState("idle");
      const msg = error instanceof Error ? error.message : "Discovery failed.";
      setTestMessage(msg);
      showToast(msg, { variant: "error" });
    }
  }

  function openWizard(system: DataSystemItem) {
    if (!canWriteConnections || !token) {
      return;
    }
    const items = workspaceQuery.data?.items ?? [];
    if (items.length === 0) {
      return;
    }
    const fields = connectorFieldsBySlug[system.slug];
    if (!fields?.length) {
      showToast(`Full connection setup for ${system.name} is not available yet.`, { variant: "info" });
      return;
    }
    const preferred =
      user?.workspace_id && items.some((w) => w.id === user.workspace_id) ? user.workspace_id : items[0].id;
    setWizardWorkspaceId(preferred);
    setWizardOpen(true);
  }

  function handleWizardWorkspaceChange(workspaceId: string) {
    setWizardWorkspaceId(workspaceId);
    setTestState("idle");
    setTestMessage("Workspace changed. Run validation again.");
    setDiscoveryState("idle");
    setWizardStep("configure");
    setCreatedConnection(null);
    setDiscoveredDatasets([]);
  }

  const workspaces = workspaceQuery.data?.items ?? [];
  const sessionWorkspace: WorkspaceItem | undefined = workspaces.find((item) => item.id === sessionWorkspaceId);

  function closeWizard() {
    setWizardOpen(false);
    setWizardStep("configure");
    setCreatedConnection(null);
    setDiscoveredDatasets([]);
  }

  function requestDeleteConnection(item: ConnectionItem) {
    if (!canWriteConnections) {
      showToast("You need connections.write permission to remove connections.", { variant: "error" });
      return;
    }
    setConnectionPendingDelete(item);
  }

  function confirmDeleteConnectionRemoval() {
    if (!connectionPendingDelete) {
      return;
    }
    deleteConnectionMutation.mutate(
      { id: connectionPendingDelete.id, name: connectionPendingDelete.name },
      { onSettled: () => setConnectionPendingDelete(null) }
    );
  }

  function closeConnectionsModal() {
    setConnectionPendingDelete(null);
    setConnectionsModalOpen(false);
  }

  useEffect(() => {
    if (!connectionsModalOpen && !connectionPendingDelete) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      if (connectionPendingDelete && !deleteConnectionMutation.isPending) {
        setConnectionPendingDelete(null);
        return;
      }
      if (connectionsModalOpen && !connectionPendingDelete) {
        setConnectionsModalOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [connectionsModalOpen, connectionPendingDelete, deleteConnectionMutation.isPending]);

  return (
    <div className="space-y-8">
      <section className="w-full">
        <div className="rounded border border-slate-200 bg-white p-8 shadow-panel">
          <div className={`grid gap-8 items-start ${!wizardOpen ? "lg:grid-cols-2" : ""}`}>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.24em] text-orange-600">• Connect A Source Or Destination</p>
              <h1 className="mt-3 text-4xl font-semibold text-slate-900">{user?.company} data systems</h1>
              <p className="mt-4 max-w-3xl text-slate-600">
                Add the cloud warehouse, object store, database, or lakehouse your team already uses. Once connected, Data Plier can browse schemas, profile datasets,
                and turn them into chunked autonomous flows. When you create a connection, you choose which workspace it belongs to in the setup wizard.
              </p>
            </div>
            {!wizardOpen ? (
              <div className="min-w-0 lg:pt-1">
                <button
                  type="button"
                  onClick={() => setConnectionsModalOpen(true)}
                  className="flex w-full items-center justify-between gap-4 rounded border border-slate-200 bg-slate-50 px-5 py-4 text-left shadow-sm transition hover:border-slate-300"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <PanelRightOpen className="h-5 w-5 shrink-0 text-orange-600" />
                    <span className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.24em] text-orange-600">Connected Systems</p>
                      <p className="mt-1 text-lg font-semibold text-slate-900">Live workspace connections</p>
                    </span>
                  </span>
                  <span className="shrink-0 rounded border border-slate-200 bg-white px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-600">
                    {connectionsQuery.data?.items.length ?? 0} active
                  </span>
                </button>
              </div>
            ) : null}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <InfoCard icon={<PlugZap className="h-5 w-5 text-orange-600" />} label="Connect" copy="Authorize a platform and validate credentials." />
            <InfoCard icon={<Database className="h-5 w-5 text-orange-600" />} label="Read" copy="Inspect schemas, partitions, and estimated size." />
            <InfoCard icon={<ArrowRight className="h-5 w-5 text-orange-600" />} label="Route" copy="Move it into chunked or autonomous pipelines." />
          </div>
        </div>
      </section>

      <section>
        <div className="mb-5 flex items-end justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-orange-600">Connector Catalog</p>
            <h2 className="mt-2 text-2xl font-semibold">Choose the service your team wants to connect</h2>
          </div>
          <label className="w-full max-w-sm">
            <span className="sr-only">Search services</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={catalogSearch}
                onChange={(event) => setCatalogSearch(event.target.value)}
                placeholder="Search by name, category, or slug"
                className="w-full rounded border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              />
            </span>
          </label>
        </div>

        {dataSystemsQuery.isLoading ? <p className="text-sm text-slate-500">Loading data systems catalog…</p> : null}
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredCatalogSystems.map((system) => {
            const hasWizard = Boolean(connectorFieldsBySlug[system.slug]?.length);
            const isSelected = selectedSlug === system.slug;
            return (
              <button
                key={system.slug}
                type="button"
                onClick={() => {
                  setSelectedSlug(system.slug);
                  openWizard(system);
                }}
                disabled={workspaceQuery.isLoading || workspaceQuery.isError || workspaces.length === 0}
                className={`rounded border p-6 text-left transition ${isSelected ? "border-orange-500 bg-orange-50" : "border-slate-200 bg-white hover:border-orange-300"} ${workspaceQuery.isLoading || workspaceQuery.isError || workspaces.length === 0 ? "cursor-not-allowed opacity-60" : ""} shadow-panel`}
              >
                <div className={`inline-flex h-14 w-14 items-center justify-center rounded bg-gradient-to-br ${system.accent}`}>
                  <DataSystemLogo slug={system.slug} />
                </div>
                <div className="mt-5 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold text-slate-900">{system.name}</h3>
                    <p className="text-sm text-orange-600">{system.category}</p>
                  </div>
                  <Cloud className="h-5 w-5 text-slate-400" />
                </div>
                <p className="mt-4 text-sm text-slate-600">{system.tagline}</p>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-900">
                    {hasWizard ? `Connect ${system.name}` : "Catalog preview"}
                  </span>
                  {!hasWizard ? (
                    <span className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-500">Setup soon</span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
        {!dataSystemsQuery.isLoading && filteredCatalogSystems.length === 0 ? (
          <p className="mt-4 rounded border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            No services match <span className="font-medium text-slate-800">{catalogSearch}</span>.
          </p>
        ) : null}
        {!canWriteConnections ? (
          <p className="mt-4 rounded border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Your current workspace role is read-only for connections. Ask an owner/admin for `connections.write`.
          </p>
        ) : null}
        {canWriteConnections && workspaceQuery.isSuccess && workspaces.length === 0 ? (
          <p className="mt-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            No workspaces are listed for your account. You need access to at least one workspace before you can add connections.
          </p>
        ) : null}
      </section>

      {connectionsModalOpen && !wizardOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !connectionPendingDelete) {
              closeConnectionsModal();
            }
          }}
        >
          <div
            className="flex max-h-[min(85vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="connections-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <PanelRightOpen className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" />
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.24em] text-orange-600">Connected Systems</p>
                  <h2 id="connections-modal-title" className="mt-1 text-xl font-semibold text-slate-900">
                    Live workspace connections
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {sessionWorkspace?.name ?? "Workspace"} · {connectionsQuery.data?.items.length ?? 0} active
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeConnectionsModal}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              {connectionsQuery.isLoading ? <p className="text-sm text-slate-500">Loading connections...</p> : null}
              {!connectionsQuery.isLoading && !connectionsQuery.data?.items.length ? (
                <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
                  No connectors have been activated for this workspace yet. Select a platform to add one.
                </div>
              ) : null}
              {!connectionsQuery.isLoading && (connectionsQuery.data?.items.length ?? 0) > 0 ? (
                <ul className="space-y-4">
                  {(connectionsQuery.data?.items ?? []).map((item) => {
                    const deleting =
                      deleteConnectionMutation.isPending && deleteConnectionMutation.variables?.id === item.id;
                    return (
                      <li key={item.id} className="rounded border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900">{item.name}</p>
                            <p className="text-sm text-slate-600">
                              {item.platform}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              to={`/dataset-explorer?source=${encodeURIComponent(item.platform)}&connectionName=${encodeURIComponent(item.name)}`}
                              className="rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                              onClick={closeConnectionsModal}
                            >
                              Browse Data
                            </Link>
                            <button
                              type="button"
                              disabled={!canWriteConnections || deleting}
                              onClick={() => requestDeleteConnection(item)}
                              className="inline-flex items-center gap-1.5 rounded border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {deleting ? (
                                <LoaderCircle className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                              Delete
                            </button>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {Object.entries(item.config)
                            .slice(0, 4)
                            .map(([key, value]) => (
                              <div key={key} className="rounded border border-slate-200 bg-white p-2 text-xs text-slate-700">
                                <p className="uppercase tracking-wider text-slate-500">{key}</p>
                                <p className="mt-0.5 truncate" title={String(value)}>
                                  {String(value)}
                                </p>
                              </div>
                            ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {!canWriteConnections ? (
                <p className="mt-4 text-sm text-slate-600">Your role is read-only; delete is disabled.</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {connectionPendingDelete && connectionsModalOpen && !wizardOpen ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-connection-title"
          aria-describedby="delete-connection-desc"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deleteConnectionMutation.isPending) {
              setConnectionPendingDelete(null);
            }
          }}
        >
          <div
            className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100">
                <Trash2 className="h-5 w-5 text-rose-700" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <h3 id="delete-connection-title" className="text-lg font-semibold text-slate-900">
                  Delete connection?
                </h3>
                <p className="mt-1 text-sm font-medium text-slate-800">{connectionPendingDelete.name}</p>
                <p id="delete-connection-desc" className="mt-4 text-sm leading-relaxed text-slate-600">
                  This removes the connection for everyone in this workspace. Datasets discovered from this connection will be removed from the catalog. This cannot be
                  undone.
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                disabled={deleteConnectionMutation.isPending}
                onClick={() => setConnectionPendingDelete(null)}
                className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteConnectionMutation.isPending}
                onClick={confirmDeleteConnectionRemoval}
                className="rounded bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {deleteConnectionMutation.isPending &&
                deleteConnectionMutation.variables?.id === connectionPendingDelete.id
                  ? "Deleting…"
                  : "Delete connection"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {wizardOpen && selectedConnector ? (
        <ConnectionWizardModal
          selectedConnector={selectedConnector}
          connectionName={connectionName}
          fieldValues={fieldValues}
          wizardStep={wizardStep}
          testState={testState}
          discoveryState={discoveryState}
          testMessage={testMessage}
          createdConnection={createdConnection}
          discoveredDatasets={discoveredDatasets}
          workspaces={workspaces}
          workspacesLoading={workspaceQuery.isLoading}
          wizardWorkspaceId={wizardWorkspaceId}
          onWizardWorkspaceChange={handleWizardWorkspaceChange}
          onClose={closeWizard}
          onStepChange={setWizardStep}
          onPrevious={() => {
            if (wizardStep === "success") {
              setWizardStep("discover");
              return;
            }
            if (wizardStep === "discover") {
              setWizardStep("configure");
              return;
            }
            closeWizard();
          }}
          onConnectionNameChange={setConnectionName}
          onFieldChange={handleFieldChange}
          onTestConnection={handleTestConnection}
          onDiscover={handleDiscover}
        />
      ) : null}
    </div>
  );
}

function ConnectionWizardModal({
  selectedConnector,
  connectionName,
  fieldValues,
  wizardStep,
  testState,
  discoveryState,
  testMessage,
  createdConnection,
  discoveredDatasets,
  workspaces,
  workspacesLoading,
  wizardWorkspaceId,
  onWizardWorkspaceChange,
  onClose,
  onStepChange,
  onPrevious,
  onConnectionNameChange,
  onFieldChange,
  onTestConnection,
  onDiscover
}: {
  selectedConnector: ConnectorDefinition;
  connectionName: string;
  fieldValues: Record<string, string>;
  wizardStep: WizardStep;
  testState: TestState;
  discoveryState: DiscoveryState;
  testMessage: string;
  createdConnection: ConnectionItem | null;
  discoveredDatasets: Array<{ name: string; rows: string; size: string; schemaHint: string }>;
  workspaces: WorkspaceItem[];
  workspacesLoading: boolean;
  wizardWorkspaceId: string;
  onWizardWorkspaceChange: (workspaceId: string) => void;
  onClose: () => void;
  onStepChange: (step: WizardStep) => void;
  onPrevious: () => void;
  onConnectionNameChange: (value: string) => void;
  onFieldChange: (key: string, value: string) => void;
  onTestConnection: () => void;
  onDiscover: () => void;
}) {
  const canOpenDiscover = testState === "success" || wizardStep === "discover" || wizardStep === "success";
  const canOpenSuccess = discoveryState === "success" || wizardStep === "success";
  const wizardTargetWorkspace = workspaces.find((w) => w.id === wizardWorkspaceId);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-white/95 p-4 transition-opacity duration-300"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded border border-slate-200 bg-white shadow-2xl shadow-slate-200 transition-all duration-300 ease-out">
        <div className="flex items-start justify-between gap-6 border-b border-slate-200 p-8">
          <div className="flex items-center gap-4">
            <div className={`inline-flex h-16 w-16 items-center justify-center rounded bg-gradient-to-br ${selectedConnector.accent}`}>
              {selectedConnector.logo}
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-orange-600">New Connection Wizard</p>
              <h2 className="mt-2 text-3xl font-semibold text-slate-900">{selectedConnector.name}</h2>
              <p className="mt-2 text-sm text-slate-600">{selectedConnector.tagline}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700">
            Close
          </button>
        </div>

        <div className="border-b border-slate-200 bg-slate-50/90 px-8 py-5">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Attach new connections to workspace</span>
            <p className="mt-1 text-xs text-slate-500">Only workspaces you have access to are listed.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end lg:max-w-3xl">
              <select
                className="w-full rounded border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                value={wizardWorkspaceId}
                onChange={(event) => onWizardWorkspaceChange(event.target.value)}
                disabled={workspacesLoading || workspaces.length === 0}
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name} ({workspace.environment})
                  </option>
                ))}
              </select>
              <span className="rounded border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-600 sm:whitespace-nowrap">
                {wizardTargetWorkspace ? `${wizardTargetWorkspace.slug} • ${wizardTargetWorkspace.region}` : "—"}
              </span>
            </div>
          </label>
        </div>

        <div className="border-b border-slate-200 px-8 py-5">
          <div className="grid gap-3 md:grid-cols-3">
            <WizardTab
              title="Step 2"
              label="Configure"
              active={wizardStep === "configure"}
              complete={testState === "success" || wizardStep === "discover" || wizardStep === "success"}
              onClick={() => onStepChange("configure")}
            />
            <WizardTab
              title="Step 3"
              label="Discover"
              active={wizardStep === "discover"}
              complete={wizardStep === "success"}
              locked={!canOpenDiscover}
              onClick={() => {
                if (canOpenDiscover) {
                  onStepChange("discover");
                }
              }}
            />
            <WizardTab
              title="Finish"
              label="Success"
              active={wizardStep === "success"}
              complete={wizardStep === "success"}
              locked={!canOpenSuccess}
              onClick={() => {
                if (canOpenSuccess) {
                  onStepChange("success");
                }
              }}
            />
          </div>
        </div>

        <div className="grid gap-6 p-8 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-6">
            <div className={`rounded border p-6 transition-all duration-300 ease-out ${wizardStep === "configure" ? "border-orange-500 bg-orange-50 opacity-100" : "border-slate-200 bg-slate-50 opacity-90"}`}>
              <p className="text-xs uppercase tracking-[0.24em] text-orange-600">Step 2 • Configure Connector</p>
              <div className="mt-6 space-y-4">
                <FieldShell label="Connection Display Name" helper="Friendly name shown across discovery, pipelines, and jobs.">
                  <input
                    className="w-full rounded border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none"
                    value={connectionName}
                    onChange={(event) => onConnectionNameChange(event.target.value)}
                    placeholder="Connection display name"
                  />
                </FieldShell>

                {selectedConnector.fields.map((field) => (
                  <FieldShell key={field.key} label={field.label} helper={field.helper}>
                    {field.type === "textarea" ? (
                      <textarea
                        className="min-h-28 w-full rounded border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none"
                        value={fieldValues[field.key] ?? ""}
                        onChange={(event) => onFieldChange(field.key, event.target.value)}
                        placeholder={field.placeholder}
                      />
                    ) : (
                      <input
                        type={field.type}
                        className="w-full rounded border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none"
                        value={fieldValues[field.key] ?? ""}
                        onChange={(event) => onFieldChange(field.key, event.target.value)}
                        placeholder={field.placeholder}
                      />
                    )}
                  </FieldShell>
                ))}
              </div>

              <div className="mt-6 rounded border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-3">
                  {testState === "testing" ? <LoaderCircle className="h-5 w-5 animate-spin text-orange-600" /> : null}
                  {testState === "success" ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : null}
                  {testState === "error" ? <TriangleAlert className="h-5 w-5 text-rose-400" /> : null}
                  {testState === "idle" ? <SearchCheck className="h-5 w-5 text-slate-500" /> : null}
                  <p className="font-medium text-slate-900">Connection test state</p>
                </div>
                <p className="mono mt-3 text-sm text-slate-600">{testMessage}</p>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={onTestConnection}
                  disabled={testState === "testing"}
                  className="rounded bg-ember px-5 py-3 font-medium text-white disabled:opacity-60"
                >
                  {testState === "testing" ? "Testing..." : "Test Connection"}
                </button>
                <button
                  type="button"
                  onClick={onDiscover}
                  disabled={discoveryState === "discovering"}
                  className="rounded border border-slate-300 bg-white px-5 py-3 text-slate-700 disabled:opacity-60"
                >
                  {discoveryState === "discovering" ? "Discovering..." : "Save And Discover Data"}
                </button>
              </div>
            </div>
          </div>

          {wizardStep === "success" ? (
            <div className="rounded border border-emerald-200 bg-emerald-50 p-6 transition-all duration-300 ease-out">
              <div className="flex items-start gap-4">
                <div className="rounded bg-emerald-100 p-3">
                  <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-emerald-600">Connection Saved</p>
                  <h2 className="mt-2 text-3xl font-semibold text-slate-900">{connectionName} is ready</h2>
                  <p className="mt-3 max-w-2xl text-sm text-slate-600">
                    Data Plier validated the connector, discovered datasets, and prepared this source for chunking, transformation, and autonomous pipeline design.
                  </p>
                  {createdConnection ? <p className="mono mt-3 text-xs uppercase tracking-[0.2em] text-orange-600">Connection ID {createdConnection.id}</p> : null}
                </div>
              </div>

              <div className="mt-6 grid gap-4">
                {discoveredDatasets.slice(0, 3).map((dataset) => {
                  const builderHref = buildPipelineHref({
                    source: selectedConnector.name,
                    connectionName,
                    datasetName: dataset.name,
                    mode: "manual"
                  });

                  return (
                    <div key={dataset.name} className="rounded border border-slate-200 bg-white p-5">
                      <p className="text-lg font-semibold text-slate-900">{dataset.name}</p>
                      <p className="mt-2 text-sm text-slate-600">{dataset.rows} • {dataset.size}</p>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <Link
                          to={`/dataset-explorer?source=${encodeURIComponent(selectedConnector.name)}&connectionName=${encodeURIComponent(connectionName)}&dataset=${encodeURIComponent(dataset.name)}`}
                          className="rounded border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700"
                        >
                          Open In Dataset Explorer
                        </Link>
                        <Link to={builderHref} className="rounded bg-ember px-4 py-2 text-sm font-medium text-white">
                          Create Pipeline From This Source
                        </Link>
                      </div>
                    </div>
                  );
                })}
                {discoveredDatasets.length === 0 ? (
                  <div className="rounded border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
                    No live datasets are available yet for this connector. Discovery results only appear from connected sources returned by the platform APIs.
                  </div>
                ) : null}
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button type="button" onClick={onClose} className="rounded bg-ember px-5 py-3 font-medium text-white">
                  Done
                </button>
                <button
                  type="button"
                  onClick={() => onStepChange("discover")}
                  className="rounded border border-slate-300 bg-white px-5 py-3 text-slate-700"
                >
                  Review Discovery
                </button>
              </div>
            </div>
          ) : (
            <div className={`rounded border p-6 transition-all duration-300 ease-out ${wizardStep === "discover" ? "border-orange-500 bg-orange-50 opacity-100" : "border-slate-200 bg-slate-50 opacity-90"}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-orange-600">Step 3 • Discover Datasets</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-900">Discovery results</h2>
                </div>
                <span className="rounded border border-slate-300 bg-white px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-600">
                  {discoveredDatasets.length} results
                </span>
              </div>

              <div className="mt-6 grid gap-4">
                {discoveredDatasets.map((dataset) => {
                  const builderHref = buildPipelineHref({
                    source: selectedConnector.name,
                    connectionName,
                    datasetName: dataset.name,
                    mode: "manual"
                  });

                  return (
                    <div key={dataset.name} className="rounded border border-slate-200 bg-white p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-semibold text-slate-900">{dataset.name}</p>
                          <p className="mt-1 text-sm text-slate-600">{dataset.rows} • {dataset.size}</p>
                        </div>
                        <Database className="h-5 w-5 text-orange-600" />
                      </div>
                      <p className="mono mt-4 text-sm text-slate-600">{dataset.schemaHint}</p>
                      <div className="mt-5 flex flex-wrap gap-3">
                        <Link
                          to={`/dataset-explorer?source=${encodeURIComponent(selectedConnector.name)}&connectionName=${encodeURIComponent(connectionName)}&dataset=${encodeURIComponent(dataset.name)}`}
                          className="rounded border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700"
                        >
                          Open In Dataset Explorer
                        </Link>
                        <Link to={builderHref} className="rounded bg-ember px-4 py-2 text-sm font-medium text-white">
                          Create Pipeline From This Source
                        </Link>
                      </div>
                    </div>
                  );
                })}
                {discoveredDatasets.length === 0 ? (
                  <div className="rounded border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
                    No live datasets found for this source. Connect and persist the source through the backend before discovery results can appear here.
                  </div>
                ) : null}
              </div>

              {discoveryState === "success" ? null : (
                <p className="mt-5 text-sm text-slate-600">Run connection validation and discovery to confirm live inventory from this service.</p>
              )}
              {wizardStep === "discover" ? (
                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={onPrevious}
                    className="rounded border border-slate-300 bg-white px-5 py-3 text-slate-700"
                  >
                    Previous
                  </button>
                  {discoveryState === "success" ? (
                    <button
                      type="button"
                      onClick={() => onStepChange("success")}
                      className="rounded bg-ember px-5 py-3 font-medium text-white"
                    >
                      Continue
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function WizardTab({
  title,
  label,
  active,
  complete,
  locked,
  onClick
}: {
  title: string;
  label: string;
  active: boolean;
  complete: boolean;
  locked?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locked}
      className={`rounded border px-4 py-4 text-left transition-all duration-300 ${active ? "border-orange-500 bg-orange-50" : "border-slate-200 bg-white"} ${locked ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{title}</p>
          <p className="mt-2 font-medium text-slate-900">{label}</p>
        </div>
        {complete ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <FolderKanban className="h-5 w-5 text-slate-400" />}
      </div>
    </button>
  );
}


function FieldShell({ label, helper, children }: { label: string; helper: string; children: ReactNode }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <p className="text-sm font-medium text-slate-900">{label}</p>
      <p className="mt-1 text-xs text-slate-500">{helper}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function InfoCard({ icon, label, copy }: { icon: ReactNode; label: string; copy: string }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-3">
        {icon}
        <p className="font-medium text-slate-900">{label}</p>
      </div>
      <p className="mt-3 text-sm text-slate-600">{copy}</p>
    </div>
  );
}

function summarizeSchema(item: DatasetItem) {
  const entries = Object.entries(item.schema_json ?? {});
  if (entries.length === 0) {
    return "Schema preview available after profiling.";
  }
  return entries
    .slice(0, 3)
    .map(([field, type]) => `${field}: ${type}`)
    .join(" • ");
}

function buildConnectionConfig(fields: ConnectorField[], values: Record<string, string>) {
  return fields.reduce<Record<string, unknown>>((acc, field) => {
    acc[field.key] = values[field.key] ?? "";
    return acc;
  }, {});
}

function buildPipelineHref({
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

