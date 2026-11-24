import { USE_DEMO_DATA, isDemoBearerToken } from "../config/demoMode";
import * as demo from "./demoBackend";

const API_GATEWAY_BASE_URL = import.meta.env.VITE_API_GATEWAY_URL || "https://dataplier.com/api";

function tenantUsesDemoBackend(token: string) {
  return USE_DEMO_DATA && isDemoBearerToken(token);
}

export type UserSession = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  company: string;
  workspace_id: string;
  workspace_slug: string;
  workspace_name: string;
  plan: string;
  trial_status: string;
  trial_ends_at?: string | null;
  subscription_state: string;
  workspace_role?: "owner" | "admin" | "engineer" | "viewer";
  permissions?: string[];
};

export type SessionEnvelope = {
  token: string;
  session: {
    token: string;
    user_id: string;
    created_at: string;
    expires_at: string;
  };
  user: UserSession;
};

export type PricingPlan = {
  id: string;
  name: string;
  price_monthly: number;
  price_yearly: number;
  trial_days: number;
  description: string;
  features: string[];
  recommended: boolean;
  max_pipelines: string;
  max_connectors: string;
  support_tier: string;
  includes_lineage: boolean;
  includes_autoflow: boolean;
};

export type WorkspaceItem = {
  id: string;
  name: string;
  slug: string;
  region: string;
  environment: "Production" | "Staging" | "Development";
  description: string;
  created_at: string;
  role?: "owner" | "admin" | "engineer" | "viewer";
};

export type WorkspaceAccessItem = {
  user_id: string;
  email: string;
  full_name: string;
  role: "owner" | "admin" | "engineer" | "viewer";
  /** Effective permissions for this member (includes custom subset when set). */
  permissions?: string[];
};

export type WorkspaceInviteItem = {
  id: string;
  email: string;
  role: "owner" | "admin" | "engineer" | "viewer";
  permissions: string[];
  created_at: string;
};

export type WorkspaceAccessResponse = {
  items: WorkspaceAccessItem[];
  invites: WorkspaceInviteItem[];
};

export type InvitePreview = {
  email: string;
  workspace_id: string;
  workspace_name: string;
  role: WorkspaceAccessItem["role"];
  permissions: string[];
};

export type RoleDefinition = {
  id: string;
  label: string;
  description: string;
  permissions: string[];
};

export type RoleCatalogResponse = {
  roles: string[];
  definitions: RoleDefinition[];
};

export type AuditEventItem = {
  id: string;
  entity_type: string;
  entity_id: string;
  level: string;
  message: string;
  context: Record<string, unknown>;
  created_at: string;
};

export type ApiKeyItem = {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at?: string;
};

export type PipelineTemplateItem = {
  id: string;
  name: string;
  description: string;
  spec_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

async function request<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  return requestWithBase<T>(API_GATEWAY_BASE_URL, path, init, token);
}

async function requestWithBase<T>(baseUrl: string, path: string, init?: RequestInit, token?: string, workspaceId?: string): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (workspaceId) {
    headers.set("X-Workspace-Id", workspaceId);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const maybeError = (data as { error?: string }).error;
    throw new Error(maybeError ?? `Request failed (${response.status})`);
  }

  return data as T;
}

/** Plain-text or binary export (e.g. pipeline DAG YAML). */
async function requestWithBaseText(baseUrl: string, path: string, token?: string, workspaceId?: string): Promise<string> {
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (workspaceId) {
    headers.set("X-Workspace-Id", workspaceId);
  }
  const response = await fetch(`${baseUrl}${path}`, { headers });
  const ct = response.headers.get("Content-Type") ?? "";
  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const maybeError = (errBody as { error?: string }).error;
    throw new Error(maybeError ?? `Request failed (${response.status})`);
  }
  if (ct.includes("application/json")) {
    return JSON.stringify(await response.json(), null, 2);
  }
  return response.text();
}

export const authApi = {
  login: async (payload: { email: string; password: string }) => {
    const demoSession = await demo.demoAuthLogin(payload);
    if (demoSession) return demoSession;
    /* Live gateway (used when demo credentials do not match or demo flag is off): */
    return request<SessionEnvelope>("/auth/login", { method: "POST", body: JSON.stringify(payload) });
  },
  signup: async (payload: {
    full_name: string;
    email: string;
    password: string;
    company: string;
    plan_id: string;
    start_trial: boolean;
  }) => {
    if (USE_DEMO_DATA) return demo.demoAuthSignup(payload);
    return request<SessionEnvelope>("/auth/signup", { method: "POST", body: JSON.stringify(payload) });
  },
  forgotPassword: async (payload: { email: string }) => {
    if (USE_DEMO_DATA) return demo.demoAuthForgotPassword(payload);
    return request<{ status: string; message: string; email: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  session: async (token: string) => {
    if (isDemoBearerToken(token)) return demo.demoAuthSession(token);
    return request<{ user: UserSession; session: SessionEnvelope["session"] }>("/auth/session", { method: "GET" }, token);
  },
  logout: async (token: string) => {
    if (isDemoBearerToken(token)) return demo.demoAuthLogout(token);
    return request<{ status: string }>("/auth/logout", { method: "POST" }, token);
  },
  pricingPlans: async () => {
    if (USE_DEMO_DATA) return demo.demoAuthPricingPlans();
    return request<{ plans: PricingPlan[] }>("/auth/pricing/plans", { method: "GET" });
  },
  startTrial: async (token: string, payload: { plan_id: string }) => {
    if (isDemoBearerToken(token)) return demo.demoAuthStartTrial(token, payload);
    return request<{ user: UserSession; session: SessionEnvelope["session"] }>(
      "/auth/trial/start",
      { method: "POST", body: JSON.stringify(payload) },
      token
    );
  },
  oauthProviders: async () => {
    if (USE_DEMO_DATA) return demo.demoAuthOAuthProviders();
    return request<{ providers: { id: string; label: string; status: string }[] }>("/auth/oauth/providers", { method: "GET" });
  },
  workspaces: async (token: string) => {
    if (isDemoBearerToken(token)) return demo.demoAuthWorkspaces(token);
    return request<{ items: WorkspaceItem[] }>("/auth/workspaces", { method: "GET" }, token);
  },
  createWorkspace: async (
    token: string,
    payload: { name: string; region: string; environment: WorkspaceItem["environment"]; description: string }
  ) => {
    if (isDemoBearerToken(token)) return demo.demoAuthCreateWorkspace(token, payload);
    return request<{ item: WorkspaceItem }>("/auth/workspaces", { method: "POST", body: JSON.stringify(payload) }, token);
  },
  deleteWorkspace: async (token: string, workspaceId: string) => {
    if (isDemoBearerToken(token)) return demo.demoAuthDeleteWorkspace(token, workspaceId);
    return request<{ status: string }>(`/auth/workspaces/${encodeURIComponent(workspaceId)}`, { method: "DELETE" }, token);
  },
  updateWorkspace: async (
    token: string,
    workspaceId: string,
    payload: { name: string; region: string; environment: WorkspaceItem["environment"]; description: string }
  ) => {
    if (isDemoBearerToken(token)) return demo.demoAuthUpdateWorkspace(token, workspaceId, payload);
    return request<{ item: WorkspaceItem }>(
      `/auth/workspaces/${encodeURIComponent(workspaceId)}`,
      { method: "PATCH", body: JSON.stringify(payload) },
      token
    );
  },
  selectWorkspace: async (token: string, workspaceId: string) => {
    if (isDemoBearerToken(token)) return demo.demoAuthSelectWorkspace(token, workspaceId);
    return request<{ user: UserSession; session: SessionEnvelope["session"] }>(
      "/auth/workspaces/select",
      { method: "POST", body: JSON.stringify({ workspace_id: workspaceId }) },
      token
    );
  },
  workspaceAccess: async (token: string, workspaceId: string) => {
    if (isDemoBearerToken(token)) return demo.demoAuthWorkspaceAccess(token, workspaceId);
    return request<WorkspaceAccessResponse>(
      `/auth/workspaces/access?workspace_id=${encodeURIComponent(workspaceId)}`,
      { method: "GET" },
      token
    );
  },
  assignWorkspaceAccess: async (
    token: string,
    payload: {
      workspace_id: string;
      email: string;
      role: WorkspaceAccessItem["role"];
      /** When set, replaces custom permission override for this member. */
      permissions?: string[] | null;
    }
  ) => {
    if (isDemoBearerToken(token)) return demo.demoAuthAssignWorkspaceAccess(token, payload);
    return request<{ status: string }>("/auth/workspaces/access", { method: "POST", body: JSON.stringify(payload) }, token);
  },
  sendWorkspaceInvite: async (
    token: string,
    payload: {
      workspace_id: string;
      email: string;
      role: Exclude<WorkspaceAccessItem["role"], "owner">;
      permissions: string[];
    }
  ) => {
    if (isDemoBearerToken(token)) return demo.demoAuthSendWorkspaceInvite(token, payload);
    return request<{ status: string; id: string; email: string; role: string; sent_email: boolean }>(
      "/auth/workspaces/invite",
      { method: "POST", body: JSON.stringify(payload) },
      token
    );
  },
  cancelWorkspaceInvite: async (token: string, workspaceId: string, inviteId: string) => {
    if (isDemoBearerToken(token)) return demo.demoAuthCancelWorkspaceInvite(token, workspaceId, inviteId);
    const q = new URLSearchParams({ workspace_id: workspaceId, invite_id: inviteId });
    return request<{ status: string }>(`/auth/workspaces/invites?${q.toString()}`, { method: "DELETE" }, token);
  },
  invitePreview: async (inviteToken: string) => {
    if (USE_DEMO_DATA) return demo.demoAuthInvitePreview(inviteToken);
    return request<InvitePreview>(
      `/auth/invite/preview?token=${encodeURIComponent(inviteToken)}`,
      { method: "GET" }
    );
  },
  inviteAccept: async (
    payload: {
      token: string;
      full_name?: string;
      password?: string;
      company?: string;
      plan_id?: string;
      start_trial?: boolean;
    },
    existingSessionToken?: string | null
  ) => {
    if (USE_DEMO_DATA) return demo.demoAuthInviteAccept(payload, existingSessionToken ?? null);
    return request<SessionEnvelope>("/auth/invite/accept", {
      method: "POST",
      body: JSON.stringify(payload)
    }, existingSessionToken ?? undefined);
  },
  revokeWorkspaceAccess: async (token: string, workspaceId: string, userId: string) => {
    if (isDemoBearerToken(token)) return demo.demoAuthRevokeWorkspaceAccess(token, workspaceId, userId);
    const q = new URLSearchParams({ workspace_id: workspaceId, user_id: userId });
    return request<{ status: string; user_id: string }>(`/auth/workspaces/access?${q.toString()}`, { method: "DELETE" }, token);
  },
  roleCatalog: async (token: string) => {
    if (isDemoBearerToken(token)) return demo.demoAuthRoleCatalog(token);
    return request<RoleCatalogResponse>("/auth/roles", { method: "GET" }, token);
  }
};

export type ConnectionItem = {
  id: string;
  name: string;
  platform: string;
  status: string;
  config: Record<string, unknown>;
  last_tested_at?: string;
  created_at: string;
};

export type DataSystemItem = {
  slug: string;
  name: string;
  category: string;
  tagline: string;
  accent: string;
};

export type ConnectionTestResponse = {
  status: string;
  latency_ms: number;
  workspace_id: string;
  message: string;
};

export type CreateConnectionPayload = {
  name: string;
  platform: string;
  credentials: Record<string, string>;
  config: Record<string, unknown>;
};

export type CreateConnectionResponse = {
  item: ConnectionItem;
  message: string;
};

export type DatasetItem = {
  id: string;
  name: string;
  external_id: string;
  schema_json: Record<string, string>;
  estimated_rows: number;
  estimated_bytes: number;
  connection_name: string;
  platform: string;
  discovered_at: string;
  /** Heuristic: native | delta | iceberg | parquet_objects | object_prefix */
  table_format?: string;
  cdc_eligible?: boolean;
  multi_vendor_profile?: string;
  data_contract?: Record<string, unknown>;
  transfer_cost_hint?: Record<string, unknown>;
};

export type PipelineItem = {
  id: string;
  name: string;
  description: string;
  schedule_cron: string;
  status: string;
  created_by: string;
  updated_at: string;
  node_count: number;
  edge_count: number;
};

export type PipelineBuilderConfig = {
  goal?: string;
  mode?: string;
  source_platform?: string;
  connection_name?: string;
  dataset_name?: string;
  destination_slug?: string;
};

export type PipelineBuilderNodeDTO = {
  id: string;
  node_type: string;
  label: string;
  position_x: number;
  position_y: number;
  config?: Record<string, unknown>;
};

export type PipelineBuilderEdgeDTO = {
  id: string;
  source_node_id: string;
  target_node_id: string;
  edge_type?: string;
  config?: Record<string, unknown>;
};

export type PipelineBuilderSnapshot = {
  pipeline: {
    id: string;
    name: string;
    description: string;
    status: string;
    builder_config: PipelineBuilderConfig;
  };
  nodes: PipelineBuilderNodeDTO[];
  edges: PipelineBuilderEdgeDTO[];
};

export type PipelineSavePayload = {
  name: string;
  description?: string;
  builder_config: PipelineBuilderConfig;
  nodes: PipelineBuilderNodeDTO[];
  edges: PipelineBuilderEdgeDTO[];
};

export type JobItem = {
  id: string;
  pipeline_id: string;
  pipeline_name: string;
  status: string;
  source_platform: string;
  destination_platform: string;
  started_at: string;
  finished_at?: string;
  total_chunks: number;
  completed_chunks: number;
  failed_chunks: number;
};

export type JobChunkRow = {
  chunk_index: number;
  state: string;
  source_partition?: string;
  attempts: number;
  bytes_processed: number;
  started_at?: string;
  finished_at?: string;
};

export type RunPipelinePayload = {
  pipeline_id?: string;
  dataset_name: string;
  estimated_bytes: number;
  estimated_rows: number;
  partitions?: number;
  worker_capacity?: number;
  network_throughput_mb_s?: number;
  source_platform?: string;
  destination_platform?: string;
};

export type RunPipelineResponse = {
  job_id: string;
  status: string;
  workflow_id: string;
  run_id: string;
};

export type RoutingCostPreference = "balanced" | "min_cost" | "min_latency";

export type RoutingRequestPayload = {
  objective: string;
  source_system: string;
  destination_system: string;
  dataset_size_gb: number;
  network_bandwidth_mbps: number;
  worker_capacity: number;
  cost_preference?: RoutingCostPreference;
  latency_slo_minutes?: number;
  workspace_id?: string;
};

export type RouteHop = {
  system: string;
  action: string;
};

export type RoutingStrategy = {
  objective: string;
  route: RouteHop[];
  chunk_target_mb: number;
  compression: string;
  rationale: string[];
  strategy_id?: string;
  schema_version?: string;
  confidence?: number;
  decision_path?: string;
  signals_used?: Record<string, unknown>;
  warnings?: string[];
  model_version?: string | null;
  sla_summary?: Record<string, unknown>;
  cost_transparency?: Record<string, unknown>;
};

export type LineageJobNode = {
  id: string;
  kind: string;
  label: string;
  meta?: Record<string, unknown>;
};

export type LineageJobLink = {
  source: string;
  target: string;
  rel: string;
};

export type LineageJobGraph = {
  nodes: LineageJobNode[];
  links: LineageJobLink[];
  note?: string;
};

export const tenantApi = {
  dataSystems: async (token: string, workspaceId: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoDataSystems(token);
    /* Live: */
    return requestWithBase<{ items: DataSystemItem[] }>(
      API_GATEWAY_BASE_URL,
      "/connections/catalog/data-systems",
      { method: "GET" },
      token,
      workspaceId
    );
  },
  connections: async (token: string, workspaceId: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoConnectionsList(token);
    return requestWithBase<{ items: ConnectionItem[] }>(API_GATEWAY_BASE_URL, "/connections", { method: "GET" }, token, workspaceId);
  },
  testConnection: async (token: string, workspaceId: string, payload: CreateConnectionPayload) => {
    if (tenantUsesDemoBackend(token)) return demo.demoTestConnection(token, workspaceId, payload);
    /* Live gateway connection test: */
    return requestWithBase<ConnectionTestResponse>(
      API_GATEWAY_BASE_URL,
      "/connections/test",
      { method: "POST", body: JSON.stringify(payload) },
      token,
      workspaceId
    );
  },
  createConnection: async (token: string, workspaceId: string, payload: CreateConnectionPayload) => {
    if (tenantUsesDemoBackend(token)) return demo.demoCreateConnection(token, workspaceId, payload);
    /* Live gateway create connection: */
    return requestWithBase<CreateConnectionResponse>(
      API_GATEWAY_BASE_URL,
      "/connections",
      { method: "POST", body: JSON.stringify(payload) },
      token,
      workspaceId
    );
  },
  discoverConnection: async (token: string, workspaceId: string, connectionId: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoDiscoverConnection(token, workspaceId, connectionId);
    return requestWithBase<{ items: DatasetItem[]; message: string }>(
      API_GATEWAY_BASE_URL,
      `/connections/${encodeURIComponent(connectionId)}/discover`,
      { method: "POST" },
      token,
      workspaceId
    );
  },
  deleteConnection: async (token: string, workspaceId: string, connectionId: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoDeleteConnection(token, workspaceId, connectionId);
    return requestWithBase<{ status: string; id: string }>(
      API_GATEWAY_BASE_URL,
      `/connections/${encodeURIComponent(connectionId)}`,
      { method: "DELETE" },
      token,
      workspaceId
    );
  },
  datasets: async (token: string, workspaceId: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoDatasetsList(token);
    return requestWithBase<{ items: DatasetItem[] }>(API_GATEWAY_BASE_URL, "/datasets", { method: "GET" }, token, workspaceId);
  },
  datasetSchema: async (token: string, workspaceId: string, datasetId: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoDatasetSchema(token, datasetId);
    return requestWithBase<{ schema_json: Record<string, string> }>(
      API_GATEWAY_BASE_URL,
      `/datasets/${datasetId}/schema`,
      { method: "GET" },
      token,
      workspaceId
    );
  },
  updateDatasetSchema: async (token: string, workspaceId: string, datasetId: string, schema_json: Record<string, string>) => {
    if (tenantUsesDemoBackend(token)) return demo.demoUpdateDatasetSchema(token, datasetId, schema_json);
    return requestWithBase<{ status: string; dataset_id: string; schema_json: Record<string, string> }>(
      API_GATEWAY_BASE_URL,
      `/datasets/${datasetId}/schema`,
      { method: "PUT", body: JSON.stringify({ schema_json }) },
      token,
      workspaceId
    );
  },
  pipelines: async (token: string, workspaceId: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoPipelinesList(token);
    return requestWithBase<{ items: PipelineItem[] }>(API_GATEWAY_BASE_URL, "/pipelines", { method: "GET" }, token, workspaceId);
  },
  createPipeline: async (
    token: string,
    workspaceId: string,
    payload: { name: string; description?: string; builder_config?: PipelineBuilderConfig }
  ) => {
    if (tenantUsesDemoBackend(token)) return demo.demoCreatePipeline(token, workspaceId, payload);
    return requestWithBase<{ id: string; name: string }>(API_GATEWAY_BASE_URL, "/pipelines", { method: "POST", body: JSON.stringify(payload) }, token, workspaceId);
  },
  pipelineBuilder: async (token: string, workspaceId: string, pipelineId: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoPipelineBuilder(token, workspaceId, pipelineId);
    return requestWithBase<PipelineBuilderSnapshot>(
      API_GATEWAY_BASE_URL,
      `/pipelines/${encodeURIComponent(pipelineId)}/builder`,
      { method: "GET" },
      token,
      workspaceId
    );
  },
  savePipelineBuilder: async (token: string, workspaceId: string, pipelineId: string, payload: PipelineSavePayload) => {
    if (tenantUsesDemoBackend(token)) return demo.demoSavePipelineBuilder(token, workspaceId, pipelineId, payload);
    return requestWithBase<{ status: string; id: string }>(
      API_GATEWAY_BASE_URL,
      `/pipelines/${encodeURIComponent(pipelineId)}/builder`,
      { method: "PUT", body: JSON.stringify(payload) },
      token,
      workspaceId
    );
  },
  runPipeline: async (token: string, workspaceId: string, payload: RunPipelinePayload) => {
    if (tenantUsesDemoBackend(token)) return demo.demoRunPipeline(token, workspaceId, payload);
    return requestWithBase<RunPipelineResponse>(API_GATEWAY_BASE_URL, "/pipelines/run", { method: "POST", body: JSON.stringify(payload) }, token, workspaceId);
  },
  jobs: async (token: string, workspaceId: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoJobsList(token);
    return requestWithBase<{ items: JobItem[] }>(API_GATEWAY_BASE_URL, "/jobs", { method: "GET" }, token, workspaceId);
  },
  job: async (token: string, workspaceId: string, jobId: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoJob(token, jobId);
    return requestWithBase<JobItem>(API_GATEWAY_BASE_URL, `/jobs/${encodeURIComponent(jobId)}`, { method: "GET" }, token, workspaceId);
  },
  jobChunks: async (token: string, workspaceId: string, jobId: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoJobChunks(token, jobId);
    return requestWithBase<{ items: JobChunkRow[] }>(
      API_GATEWAY_BASE_URL,
      `/jobs/${encodeURIComponent(jobId)}/chunks`,
      { method: "GET" },
      token,
      workspaceId
    );
  },
  pipelineExportYaml: async (token: string, workspaceId: string, pipelineId: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoPipelineExportYaml(token, workspaceId, pipelineId);
    return requestWithBaseText(
      API_GATEWAY_BASE_URL,
      `/pipelines/${encodeURIComponent(pipelineId)}/export?format=yaml`,
      token,
      workspaceId
    );
  }
};

export const intelligenceApi = {
  createRoute: async (token: string, workspaceId: string, payload: RoutingRequestPayload) => {
    if (tenantUsesDemoBackend(token)) return demo.demoCreateRoute(token, workspaceId, { ...payload, workspace_id: workspaceId });
    return requestWithBase<RoutingStrategy>(
      API_GATEWAY_BASE_URL,
      "/routing/route",
      { method: "POST", body: JSON.stringify({ ...payload, workspace_id: workspaceId }) },
      token,
      workspaceId
    );
  }
};

export type MetadataSummary = {
  workspace_name: string;
  counts: {
    connections: number;
    datasets: number;
    pipelines: number;
    jobs: number;
    logs: number;
  };
  recent_logs: {
    entity_type: string;
    level: string;
    message: string;
    created_at: string;
  }[];
};

export type ObservabilitySummary = {
  worker_utilization: number;
  transfer_speed_mb_s: number;
  queue_backlog: number;
  chunk_failures: number;
  pipeline_latency_s: number;
  throughput_window_hours?: number;
  latency_window_days?: number;
  failed_jobs_24h?: number;
  running_jobs?: number;
  throughput_source?: string;
  latency_source?: string;
};

export type ObservabilityTimeseries = {
  window_hours: number;
  throughput: { t: string; mb_per_s: number }[];
  latency: { t: string; latency_s: number }[];
};

export type ObservabilityRecentJob = {
  id: string;
  status: string;
  started_at: string;
  finished_at?: string;
  total_chunks: number;
  completed_chunks: number;
  failed_chunks: number;
  pipeline_id: string;
  pipeline_name: string;
};

export type ObservabilityAlert = {
  id: string;
  severity: "warning" | "info" | "success";
  title: string;
  detail: string;
  href: string;
  since: string;
};

export type ObservabilityTraceListItem = {
  trace_id: string;
  kind: string;
  pipeline_name: string;
  status: string;
  started_at: string;
  duration_ms: number;
  span_count_hint: number;
  href_jobs: string;
};

export type ObservabilityTraceSpan = {
  span_id: string;
  parent_span_id?: string | null;
  service_name: string;
  operation_name: string;
  start_at: string;
  end_at?: string | null;
  duration_ms: number;
  status: string;
  attributes?: Record<string, unknown>;
  source?: string;
};

export type ObservabilityTraceDetail = {
  trace_id: string;
  pipeline_name: string;
  job_status: string;
  source_platform: string;
  dest_platform: string;
  spans: ObservabilityTraceSpan[];
};

export type ObservabilitySLOItem = {
  id: string;
  name: string;
  description: string;
  sli_kind: string;
  target_numeric: number;
  comparison: string;
  window_hours: number;
  enabled: boolean;
  sli_value: number;
  error_budget_remaining_ratio: number;
  burn_rate_1h: number;
  burn_rate_6h: number;
  burn_rate_24h: number;
  slo_status: string;
  events_good: number;
  events_bad: number;
  events_total: number;
};

export type ObservabilityAlertChannel = {
  id: string;
  name: string;
  channel_kind: string;
  destination_preview: string;
  enabled: boolean;
  created_at: string;
};

export type ObservabilityAlertRule = {
  id: string;
  name: string;
  description: string;
  threshold_kind: string;
  threshold_json: Record<string, unknown>;
  channel_id?: string;
  enabled: boolean;
  cooldown_minutes: number;
};

export type ObservabilityAlertIncident = {
  id: string;
  rule_id?: string;
  severity: string;
  title: string;
  detail: string;
  status: string;
  fingerprint: string;
  fired_at: string;
  acknowledged_at?: string;
  closed_at?: string;
  deliveries: unknown;
};

export type ObservabilityRuleEvaluation = {
  rule_id: string;
  rule_name: string;
  firing: boolean;
  reason: string;
  routed_channel_id?: string;
};

export type ObservabilityAlertRoutingState = {
  channels: ObservabilityAlertChannel[];
  rules: ObservabilityAlertRule[];
  incidents: ObservabilityAlertIncident[];
  evaluations: ObservabilityRuleEvaluation[];
};

export type ObservabilityCorrelationResponse = {
  job_id: string;
  logs: { entity_type: string; level: string; message: string; created_at: string }[];
  links: Record<string, string>;
};

export type LineageGraph = {
  datasets: { id: string; system: string }[];
  edges: { source: string; target: string; operation: string }[];
  events: { user: string; action: string; pipeline: string }[];
};

export type PolicySummary = {
  workspace_id: string;
  workspace_name: string;
  rbac: Record<string, unknown>;
  masking: { scope: string; rule: string; status: string; column_hits?: number }[];
  data_contracts: Record<string, unknown>;
  egress_policy: Record<string, unknown>;
  integrations: Record<string, unknown>;
};

export type BillingPriceMap = Record<string, { monthly?: string; annual?: string }>;

export type BillingConfigResponse = {
  stripe_configured: boolean;
  publishable_key: string;
  price_map: BillingPriceMap;
};

export type BillingPaymentMethod = {
  id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  is_default: boolean;
};

export type BillingStatusResponse = {
  stripe_configured: boolean;
  has_customer?: boolean;
  customer_id?: string;
  subscription_id?: string;
  subscription_status?: string;
  price_id?: string;
  current_period_end?: string;
  cancel_at_period_end?: boolean;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    region?: string;
    postal?: string;
    country?: string;
  };
  payment_methods?: BillingPaymentMethod[];
};

export type BillingInvoiceListItem = {
  id: string;
  number: string;
  status: string;
  currency: string;
  amount: string;
  issued_at: string;
  hosted_invoice_url?: string;
  invoice_pdf?: string;
};

export type BillingInvoiceDetail = {
  id: string;
  number: string;
  status: string;
  currency: string;
  amount_due: string;
  subtotal: string;
  total: string;
  issued_at: string;
  lines: { description: string; amount: string; currency: string }[];
  hosted_invoice_url?: string;
  invoice_pdf?: string;
};

export type ColumnLineageResponse = {
  dataset_id: string;
  dataset_name: string;
  external_id?: string;
  platform: string;
  schema_facets: string[];
  columns: Record<string, unknown>[];
  edges: Record<string, unknown>[];
  pipeline_refs?: Record<string, unknown>[];
  job_refs?: Record<string, unknown>[];
  openlineage?: Record<string, unknown>;
  parity_basis?: string;
  note?: string;
};

export const governanceApi = {
  metadataSummary: async (token: string, workspaceId: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoMetadataSummary(token, workspaceId);
    return requestWithBase<MetadataSummary>(API_GATEWAY_BASE_URL, "/metadata/summary", { method: "GET" }, token, workspaceId);
  },
  observabilitySummary: async (token: string, workspaceId: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoObservabilitySummary(token);
    return requestWithBase<ObservabilitySummary>(API_GATEWAY_BASE_URL, "/metrics/summary", { method: "GET" }, token, workspaceId);
  },
  observabilityTimeseries: async (token: string, workspaceId: string, hours: number) => {
    if (tenantUsesDemoBackend(token)) return demo.demoObservabilityTimeseries(token, hours);
    const q = `?hours=${encodeURIComponent(String(hours))}`;
    return requestWithBase<ObservabilityTimeseries>(
      API_GATEWAY_BASE_URL,
      `/metrics/timeseries${q}`,
      { method: "GET" },
      token,
      workspaceId
    );
  },
  observabilityRecentJobs: async (token: string, workspaceId: string, opts?: { limit?: number; status?: string }) => {
    if (tenantUsesDemoBackend(token)) return demo.demoObservabilityRecentJobs(token, opts);
    const params = new URLSearchParams();
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    if (opts?.status) params.set("status", opts.status);
    const q = params.toString() ? `?${params.toString()}` : "";
    return requestWithBase<{ items: ObservabilityRecentJob[] }>(
      API_GATEWAY_BASE_URL,
      `/metrics/jobs/recent${q}`,
      { method: "GET" },
      token,
      workspaceId
    );
  },
  observabilityAlerts: async (token: string, workspaceId: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoObservabilityAlerts(token);
    return requestWithBase<{ items: ObservabilityAlert[] }>(
      API_GATEWAY_BASE_URL,
      "/metrics/alerts",
      { method: "GET" },
      token,
      workspaceId
    );
  },
  observabilityTraces: async (token: string, workspaceId: string, limit?: number) => {
    if (tenantUsesDemoBackend(token)) return demo.demoObservabilityTraces(token, limit);
    const q = limit != null ? `?limit=${encodeURIComponent(String(limit))}` : "";
    return requestWithBase<{ items: ObservabilityTraceListItem[] }>(
      API_GATEWAY_BASE_URL,
      `/metrics/traces${q}`,
      { method: "GET" },
      token,
      workspaceId
    );
  },
  observabilityTraceDetail: async (token: string, workspaceId: string, traceId: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoObservabilityTraceDetail(token, traceId);
    return requestWithBase<ObservabilityTraceDetail>(
      API_GATEWAY_BASE_URL,
      `/metrics/traces/${encodeURIComponent(traceId)}`,
      { method: "GET" },
      token,
      workspaceId
    );
  },
  observabilitySLOs: async (token: string, workspaceId: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoObservabilitySLOs(token);
    return requestWithBase<{ items: ObservabilitySLOItem[] }>(
      API_GATEWAY_BASE_URL,
      "/metrics/slos",
      { method: "GET" },
      token,
      workspaceId
    );
  },
  observabilityCorrelation: async (token: string, workspaceId: string, jobId: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoObservabilityCorrelation(token, jobId);
    const q = `?job_id=${encodeURIComponent(jobId)}`;
    return requestWithBase<ObservabilityCorrelationResponse>(
      API_GATEWAY_BASE_URL,
      `/metrics/correlation${q}`,
      { method: "GET" },
      token,
      workspaceId
    );
  },
  observabilityAlertRouting: async (token: string, workspaceId: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoObservabilityAlertRouting(token);
    return requestWithBase<ObservabilityAlertRoutingState>(
      API_GATEWAY_BASE_URL,
      "/metrics/alert-routing",
      { method: "GET" },
      token,
      workspaceId
    );
  },
  observabilityWebhookDispatchTest: async (token: string, workspaceId: string, channelId: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoObservabilityWebhookDispatchTest(token, channelId);
    return requestWithBase<{ status: string; idempotency_key: string }>(
      API_GATEWAY_BASE_URL,
      "/metrics/alert-routing/dispatch-test",
      { method: "POST", body: JSON.stringify({ channel_id: channelId }) },
      token,
      workspaceId
    );
  },
  observabilityAlertChannelCreate: async (
    token: string,
    workspaceId: string,
    body: { name: string; channel_kind: string; destination: string; headers_json?: unknown; enabled?: boolean; signing_secret?: string }
  ) => {
    if (tenantUsesDemoBackend(token)) return demo.demoObservabilityAlertChannelCreate(token, body);
    return requestWithBase<{ id: string; status: string }>(
      API_GATEWAY_BASE_URL,
      "/metrics/alert-routing/channels",
      { method: "POST", body: JSON.stringify(body) },
      token,
      workspaceId
    );
  },
  observabilityAlertRuleCreate: async (
    token: string,
    workspaceId: string,
    body: {
      name: string;
      description?: string;
      threshold_kind: string;
      threshold_json?: Record<string, unknown>;
      channel_id?: string;
      enabled?: boolean;
      cooldown_minutes?: number;
    }
  ) => {
    if (tenantUsesDemoBackend(token)) return demo.demoObservabilityAlertRuleCreate(token, body);
    return requestWithBase<{ id: string; status: string }>(
      API_GATEWAY_BASE_URL,
      "/metrics/alert-routing/rules",
      { method: "POST", body: JSON.stringify(body) },
      token,
      workspaceId
    );
  },
  observabilityIncidentUpdate: async (token: string, workspaceId: string, incidentId: string, status: "acknowledged" | "closed") => {
    if (tenantUsesDemoBackend(token)) return demo.demoObservabilityIncidentUpdate(token, incidentId, status);
    return requestWithBase<{ id: string; status: string }>(
      API_GATEWAY_BASE_URL,
      `/metrics/alert-routing/incidents/${encodeURIComponent(incidentId)}`,
      { method: "PATCH", body: JSON.stringify({ status }) },
      token,
      workspaceId
    );
  },
  lineageGraph: async (token: string, workspaceId: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoLineageGraph(token);
    return requestWithBase<LineageGraph>(API_GATEWAY_BASE_URL, "/lineage/graph", { method: "GET" }, token, workspaceId);
  },
  jobLineageGraph: async (token: string, workspaceId: string, jobId: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoJobLineageGraph(token, jobId);
    return requestWithBase<LineageJobGraph>(
      API_GATEWAY_BASE_URL,
      `/lineage/graph/job/${encodeURIComponent(jobId)}`,
      { method: "GET" },
      token,
      workspaceId
    );
  },
  policySummary: async (token: string, workspaceId: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoPolicySummary(token, workspaceId);
    return requestWithBase<PolicySummary>(API_GATEWAY_BASE_URL, "/metadata/policy/summary", { method: "GET" }, token, workspaceId);
  },
  datasetColumnLineage: async (token: string, workspaceId: string, datasetId: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoDatasetColumnLineage(token, datasetId);
    return requestWithBase<ColumnLineageResponse>(
      API_GATEWAY_BASE_URL,
      `/lineage/columns/dataset/${encodeURIComponent(datasetId)}`,
      { method: "GET" },
      token,
      workspaceId
    );
  },
  auditEvents: async (token: string, workspaceId: string, limit?: number) => {
    if (tenantUsesDemoBackend(token)) return demo.demoGovernanceAuditEvents(token, workspaceId);
    const q = limit ? `?limit=${encodeURIComponent(String(limit))}` : "";
    return requestWithBase<{ items: AuditEventItem[] }>(
      API_GATEWAY_BASE_URL,
      `/metadata/audit/events${q}`,
      { method: "GET" },
      token,
      workspaceId
    );
  },
  apiKeysList: async (token: string, workspaceId: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoGovernanceApiKeysList(token, workspaceId);
    return requestWithBase<{ items: ApiKeyItem[] }>(API_GATEWAY_BASE_URL, "/metadata/api-keys", { method: "GET" }, token, workspaceId);
  },
  apiKeyCreate: async (token: string, workspaceId: string, name: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoGovernanceApiKeyCreate(token, workspaceId, name);
    return requestWithBase<{ item: ApiKeyItem; token: string; note: string }>(
      API_GATEWAY_BASE_URL,
      "/metadata/api-keys",
      { method: "POST", body: JSON.stringify({ name }) },
      token,
      workspaceId
    );
  },
  apiKeyDelete: async (token: string, workspaceId: string, id: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoGovernanceApiKeyDelete(token, workspaceId, id);
    return requestWithBase<{ status: string; id: string }>(
      API_GATEWAY_BASE_URL,
      `/metadata/api-keys/${encodeURIComponent(id)}`,
      { method: "DELETE" },
      token,
      workspaceId
    );
  },
  templatesList: async (token: string, workspaceId: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoGovernanceTemplatesList(token, workspaceId);
    return requestWithBase<{ items: PipelineTemplateItem[] }>(
      API_GATEWAY_BASE_URL,
      "/metadata/templates",
      { method: "GET" },
      token,
      workspaceId
    );
  },
  templateCreate: async (token: string, workspaceId: string, payload: { name: string; description: string; spec_json: Record<string, unknown> }) => {
    if (tenantUsesDemoBackend(token)) return demo.demoGovernanceTemplateCreate(token, workspaceId, payload);
    return requestWithBase<{ item: { id: string; name: string } }>(
      API_GATEWAY_BASE_URL,
      "/metadata/templates",
      { method: "POST", body: JSON.stringify(payload) },
      token,
      workspaceId
    );
  },
  templateUpdate: async (token: string, workspaceId: string, id: string, payload: { name?: string; description?: string; spec_json?: Record<string, unknown> }) => {
    if (tenantUsesDemoBackend(token)) return demo.demoGovernanceTemplateUpdate(token, workspaceId, id, payload);
    return requestWithBase<{ status: string; id: string }>(
      API_GATEWAY_BASE_URL,
      `/metadata/templates/${encodeURIComponent(id)}`,
      { method: "PATCH", body: JSON.stringify(payload) },
      token,
      workspaceId
    );
  },
  templateDelete: async (token: string, workspaceId: string, id: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoGovernanceTemplateDelete(token, workspaceId, id);
    return requestWithBase<{ status: string; id: string }>(
      API_GATEWAY_BASE_URL,
      `/metadata/templates/${encodeURIComponent(id)}`,
      { method: "DELETE" },
      token,
      workspaceId
    );
  },
  workspaceSettingsGet: async (token: string, workspaceId: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoGovernanceWorkspaceSettingsGet(token, workspaceId);
    return requestWithBase<{ settings: Record<string, unknown> }>(
      API_GATEWAY_BASE_URL,
      "/metadata/workspace/settings",
      { method: "GET" },
      token,
      workspaceId
    );
  },
  workspaceSettingsPatch: async (token: string, workspaceId: string, patch: Record<string, unknown>) => {
    if (tenantUsesDemoBackend(token)) return demo.demoGovernanceWorkspaceSettingsPatch(token, workspaceId, patch);
    return requestWithBase<{ settings: Record<string, unknown> }>(
      API_GATEWAY_BASE_URL,
      "/metadata/workspace/settings",
      { method: "PATCH", body: JSON.stringify(patch) },
      token,
      workspaceId
    );
  },
  billingConfig: async (token: string, workspaceId: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoBillingConfig(token);
    return requestWithBase<BillingConfigResponse>(API_GATEWAY_BASE_URL, "/metadata/billing/config", { method: "GET" }, token, workspaceId);
  },
  billingStatus: async (token: string, workspaceId: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoBillingStatus(token, workspaceId);
    return requestWithBase<BillingStatusResponse>(API_GATEWAY_BASE_URL, "/metadata/billing/status", { method: "GET" }, token, workspaceId);
  },
  billingCheckout: async (
    token: string,
    workspaceId: string,
    body: { plan: string; billing_period: string; success_url: string; cancel_url: string; email: string }
  ) => {
    if (tenantUsesDemoBackend(token)) return demo.demoBillingCheckout(token, workspaceId, body);
    return requestWithBase<{ url: string }>(
      API_GATEWAY_BASE_URL,
      "/metadata/billing/checkout",
      { method: "POST", body: JSON.stringify(body) },
      token,
      workspaceId
    );
  },
  billingPortal: async (token: string, workspaceId: string, returnUrl: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoBillingPortal(token, workspaceId, returnUrl);
    return requestWithBase<{ url: string }>(
      API_GATEWAY_BASE_URL,
      "/metadata/billing/portal",
      { method: "POST", body: JSON.stringify({ return_url: returnUrl }) },
      token,
      workspaceId
    );
  },
  billingInvoices: async (token: string, workspaceId: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoBillingInvoices(token, workspaceId);
    return requestWithBase<{ items: BillingInvoiceListItem[] }>(
      API_GATEWAY_BASE_URL,
      "/metadata/billing/invoices",
      { method: "GET" },
      token,
      workspaceId
    );
  },
  billingInvoice: async (token: string, workspaceId: string, id: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoBillingInvoice(token, workspaceId, id);
    const q = `?id=${encodeURIComponent(id)}`;
    return requestWithBase<BillingInvoiceDetail>(
      API_GATEWAY_BASE_URL,
      `/metadata/billing/invoice${q}`,
      { method: "GET" },
      token,
      workspaceId
    );
  },
  billingCustomerPatch: async (
    token: string,
    workspaceId: string,
    body: { line1: string; line2?: string; city: string; region: string; postal: string; country: string }
  ) => {
    if (tenantUsesDemoBackend(token)) return demo.demoBillingCustomerPatch(token, workspaceId, body);
    return requestWithBase<{ status: string }>(
      API_GATEWAY_BASE_URL,
      "/metadata/billing/customer",
      { method: "PATCH", body: JSON.stringify(body) },
      token,
      workspaceId
    );
  },
  billingPaymentMethodDefault: async (token: string, workspaceId: string, paymentMethodId: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoBillingPaymentMethodDefault(token, workspaceId, paymentMethodId);
    return requestWithBase<{ status: string }>(
      API_GATEWAY_BASE_URL,
      "/metadata/billing/payment-method/default",
      { method: "POST", body: JSON.stringify({ payment_method_id: paymentMethodId }) },
      token,
      workspaceId
    );
  },
  billingPaymentMethodDetach: async (token: string, workspaceId: string, paymentMethodId: string) => {
    if (tenantUsesDemoBackend(token)) return demo.demoBillingPaymentMethodDetach(token, workspaceId, paymentMethodId);
    return requestWithBase<{ status: string }>(
      API_GATEWAY_BASE_URL,
      "/metadata/billing/payment-method/detach",
      { method: "POST", body: JSON.stringify({ payment_method_id: paymentMethodId }) },
      token,
      workspaceId
    );
  },
  billingSetupIntent: async (token: string, workspaceId: string) => {
    return requestWithBase<{ client_secret: string; publishable_key: string }>(
      API_GATEWAY_BASE_URL,
      "/metadata/billing/setup-intent",
      { method: "POST" },
      token,
      workspaceId
    );
  },
  billingDemoAddCard: async (
    token: string,
    workspaceId: string,
    body: { name: string; number: string; expiry: string; cvc: string }
  ) => {
    if (tenantUsesDemoBackend(token)) return demo.demoBillingAddCard(token, workspaceId, body);
    throw new Error("Demo add card is only available in demo mode");
  }
};
