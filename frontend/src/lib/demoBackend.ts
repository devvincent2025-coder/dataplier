/**
 * In-memory fixtures for local E2E UI testing when `VITE_USE_DEMO_DATA` is enabled.
 * See `src/config/demoMode.ts` for env and demo credentials.
 */
import { stringify } from "yaml";

import {
  DEMO_AUTH_EMAIL,
  DEMO_AUTH_PASSWORD,
  DEMO_BEARER_TOKEN,
  USE_DEMO_DATA,
  isDemoBearerToken
} from "../config/demoMode";
import { digitsOnly, guessBrandFromPan, parseExpiry, validateCardForm } from "./billingCardValidation";

const nowIso = () => new Date().toISOString();
const delay = (ms = 45) => new Promise((r) => setTimeout(r, ms));

const DEMO_WORKSPACE_ID = "ws-demo-main";
const DEMO_USER_ID = "user-demo-1";

function newId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}`;
}

type UserSession = {
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

type SessionInner = {
  token: string;
  user_id: string;
  created_at: string;
  expires_at: string;
};

type SessionEnvelope = {
  token: string;
  session: SessionInner;
  user: UserSession;
};

let demoUser: UserSession = {
  id: DEMO_USER_ID,
  email: DEMO_AUTH_EMAIL,
  full_name: "Demo Engineer",
  role: "engineer",
  company: "Demo Corp",
  workspace_id: DEMO_WORKSPACE_ID,
  workspace_slug: "demo-workspace",
  workspace_name: "Demo Workspace",
  plan: "growth",
  trial_status: "active",
  trial_ends_at: new Date(Date.now() + 14 * 864e5).toISOString(),
  subscription_state: "trialing",
  workspace_role: "owner",
  permissions: ["*"]
};

let demoSessionInner: SessionInner = {
  token: DEMO_BEARER_TOKEN,
  user_id: DEMO_USER_ID,
  created_at: nowIso(),
  expires_at: new Date(Date.now() + 864e5 * 7).toISOString()
};

type WorkspaceItem = {
  id: string;
  name: string;
  slug: string;
  region: string;
  environment: "Production" | "Staging" | "Development";
  description: string;
  created_at: string;
  role?: "owner" | "admin" | "engineer" | "viewer";
};

let demoWorkspaces: WorkspaceItem[] = [
  {
    id: DEMO_WORKSPACE_ID,
    name: "Demo Workspace",
    slug: "demo-workspace",
    region: "us-east-1",
    environment: "Staging",
    description: "Synthetic workspace for UI walkthroughs.",
    created_at: nowIso(),
    role: "owner"
  }
];

type ConnectionItem = {
  id: string;
  name: string;
  platform: string;
  status: string;
  config: Record<string, unknown>;
  last_tested_at?: string;
  created_at: string;
};

type DatasetItem = {
  id: string;
  name: string;
  external_id: string;
  schema_json: Record<string, string>;
  estimated_rows: number;
  estimated_bytes: number;
  connection_name: string;
  platform: string;
  discovered_at: string;
  table_format?: string;
  cdc_eligible?: boolean;
  multi_vendor_profile?: string;
  data_contract?: Record<string, unknown>;
  transfer_cost_hint?: Record<string, unknown>;
};

function demoConnectionConfigForDataset(d: DatasetItem): Record<string, unknown> {
  const c = demoConnections.find((x) => x.name === d.connection_name);
  const raw = c?.config;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function enrichDemoDataset(d: DatasetItem): DatasetItem {
  const connCfg = demoConnectionConfigForDataset(d);
  const lower = `${d.name} ${d.external_id}`.toLowerCase();
  let table_format = "native";
  const fmtCfg = String(connCfg.table_format ?? connCfg.file_format ?? connCfg.format ?? "").toLowerCase();
  if (fmtCfg === "iceberg") table_format = "iceberg";
  else if (fmtCfg === "delta" || fmtCfg === "deltalake") table_format = "delta";
  else if (lower.includes("iceberg")) table_format = "iceberg";
  else if (lower.includes("delta") || lower.includes("/delta/")) table_format = "delta";
  else if (d.platform === "aws-s3" || d.platform === "azure-blob") {
    table_format = lower.includes("parquet") ? "parquet_objects" : "object_prefix";
  }
  const cdc_eligible =
    Boolean(connCfg.cdc || connCfg.enable_cdc || connCfg.debezium || connCfg.changefeed) ||
    /cdc|changefeed|debezium/i.test(`${d.name} ${d.external_id}`) ||
    ["postgresql", "mysql", "snowflake", "bigquery", "databricks"].includes(d.platform);
  let multi_vendor_profile = "control_plane";
  if (["snowflake", "bigquery", "databricks"].includes(d.platform)) multi_vendor_profile = "warehouse_native";
  if (d.platform === "aws-s3" || d.platform === "azure-blob") multi_vendor_profile = "object_store";
  if (connCfg.external_stage || connCfg.gcs_bucket || connCfg.s3_stage) {
    multi_vendor_profile = "warehouse_with_object_staging";
  }
  const gb = d.estimated_bytes / (1024 * 1024 * 1024);
  const tier = /gold|mart|curated/i.test(d.name) ? "gold" : /silver|enriched|staging/i.test(d.name) ? "silver" : "bronze";
  const fresh = tier === "gold" ? 4 : 24;
  const anchor =
    d.platform === "snowflake"
      ? 0.11
      : d.platform === "bigquery"
        ? 0.09
        : d.platform === "databricks"
          ? 0.1
          : d.platform === "aws-s3" || d.platform === "azure-blob"
            ? 0.035
            : 0.09;
  const scopes: Record<string, string> = {};
  for (const k of [
    "database",
    "catalog",
    "warehouse",
    "schema",
    "default_schema",
    "project_id",
    "dataset",
    "location",
    "region",
    "bucket",
    "container",
    "storageAccount",
    "account_name"
  ] as const) {
    const v = connCfg[k];
    if (typeof v === "string" && v.trim()) scopes[k] = v.trim();
  }
  const methodology =
    Object.keys(connCfg).length > 0
      ? "Demo uses saved connector config + platform anchoring (mirrors dataset-service parity_basis)."
      : "Heuristic from dataset size (demo mirrors dataset-service enrichment).";
  return {
    ...d,
    table_format,
    cdc_eligible,
    multi_vendor_profile,
    data_contract: {
      tier,
      owner_team: "data-engineering",
      freshness_slo_hours: fresh,
      deprecation_policy: "none",
      schema_evolution: "additive_only",
      table_format_detected: table_format,
      source_platform_profile: d.platform,
      parity_basis: "connector_config_and_name_heuristics",
      ...(Object.keys(scopes).length ? { connection_scopes: scopes } : {})
    },
    transfer_cost_hint: {
      estimated_egress_usd_monthly_low: Math.round(Math.max(0, gb * anchor * 0.35) * 100) / 100,
      estimated_egress_usd_monthly_high: Math.round(gb * anchor * 1.4 * 100) / 100,
      confidence: Object.keys(connCfg).length > 0 ? "medium-low" : "low",
      methodology,
      object_store_ingress_discount: d.platform === "aws-s3" || d.platform === "azure-blob",
      parity_basis: "workspace_connection_config",
      source_platform: d.platform
    }
  };
}

type PipelineItem = {
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

type PipelineBuilderConfig = {
  goal?: string;
  mode?: string;
  source_platform?: string;
  connection_name?: string;
  dataset_name?: string;
  destination_slug?: string;
};

type PipelineBuilderNodeDTO = {
  id: string;
  node_type: string;
  label: string;
  position_x: number;
  position_y: number;
  config?: Record<string, unknown>;
};

type PipelineBuilderEdgeDTO = {
  id: string;
  source_node_id: string;
  target_node_id: string;
  edge_type?: string;
  config?: Record<string, unknown>;
};

type PipelineBuilderSnapshot = {
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

type PipelineSavePayload = {
  name: string;
  description?: string;
  builder_config: PipelineBuilderConfig;
  nodes: PipelineBuilderNodeDTO[];
  edges: PipelineBuilderEdgeDTO[];
};

type JobItem = {
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

type JobChunkRow = {
  chunk_index: number;
  state: string;
  source_partition?: string;
  attempts: number;
  bytes_processed: number;
  started_at?: string;
  finished_at?: string;
};

const CONN_SF = "conn-demo-snowflake";
const CONN_DB = "conn-demo-databricks";
const CONN_BLOB = "conn-demo-azure-blob";
const PIPE_DEMO = "pipe-demo-orders";

let demoConnections: ConnectionItem[] = [
  {
    id: CONN_SF,
    name: "Snowflake — QA",
    platform: "snowflake",
    status: "connected",
    config: { database: "ANALYTICS" },
    last_tested_at: nowIso(),
    created_at: nowIso()
  },
  {
    id: CONN_DB,
    name: "Databricks — ML workspace",
    platform: "databricks",
    status: "connected",
    config: { catalog: "main", default_schema: "ml_features" },
    last_tested_at: nowIso(),
    created_at: nowIso()
  },
  {
    id: CONN_BLOB,
    name: "Azure Blob — landing zone",
    platform: "azure-blob",
    status: "connected",
    config: { container: "raw-zone", storageAccount: "demolandingsa" },
    last_tested_at: nowIso(),
    created_at: nowIso()
  }
];

let demoDatasets: DatasetItem[] = [
  {
    id: "ds-demo-orders",
    name: "PUBLIC.ORDERS_FACT",
    external_id: "ANALYTICS.PUBLIC.ORDERS_FACT",
    schema_json: {
      order_id: "VARCHAR",
      customer_id: "VARCHAR",
      amount_usd: "NUMBER",
      created_at: "TIMESTAMP_NTZ"
    },
    estimated_rows: 1_250_000,
    estimated_bytes: 420_000_000,
    connection_name: "Snowflake — QA",
    platform: "snowflake",
    discovered_at: nowIso()
  },
  {
    id: "ds-demo-events",
    name: "PUBLIC.APP_EVENTS",
    external_id: "ANALYTICS.PUBLIC.APP_EVENTS",
    schema_json: {
      event_id: "VARCHAR",
      session_id: "VARCHAR",
      event_type: "VARCHAR",
      payload: "VARIANT",
      ts: "TIMESTAMP_NTZ"
    },
    estimated_rows: 8_400_000,
    estimated_bytes: 2_100_000_000,
    connection_name: "Snowflake — QA",
    platform: "snowflake",
    discovered_at: nowIso()
  },
  {
    id: "ds-demo-db-churn",
    name: "ml_features.gold_customer_churn",
    external_id: "main.ml_features.gold_customer_churn",
    schema_json: {
      account_id: "STRING",
      churn_score: "DOUBLE",
      model_version: "STRING",
      scored_at: "TIMESTAMP"
    },
    estimated_rows: 890_000,
    estimated_bytes: 195_000_000,
    connection_name: "Databricks — ML workspace",
    platform: "databricks",
    discovered_at: nowIso()
  },
  {
    id: "ds-demo-db-streams",
    name: "sensor_bronze.iot_device_streams",
    external_id: "main.sensor_bronze.iot_device_streams",
    schema_json: {
      device_id: "STRING",
      metric: "STRING",
      value: "DOUBLE",
      event_time: "TIMESTAMP"
    },
    estimated_rows: 42_000_000,
    estimated_bytes: 5_800_000_000,
    connection_name: "Databricks — ML workspace",
    platform: "databricks",
    discovered_at: nowIso()
  },
  {
    id: "ds-demo-blob-partner-feed",
    name: "partner-feed/year=2026/month=04/*.parquet",
    external_id: "raw-zone/partner-feed/year=2026/month=04/",
    schema_json: {
      partner_id: "STRING",
      record_type: "STRING",
      payload_json: "STRING",
      ingested_at: "TIMESTAMP"
    },
    estimated_rows: 3_200_000,
    estimated_bytes: 980_000_000,
    connection_name: "Azure Blob — landing zone",
    platform: "azure-blob",
    discovered_at: nowIso()
  },
  {
    id: "ds-demo-blob-cdc",
    name: "cdc/sales_db/public.orders/*.jsonl",
    external_id: "raw-zone/cdc/sales_db/public.orders/",
    schema_json: {
      lsn: "STRING",
      op: "STRING",
      before: "STRING",
      after: "STRING",
      ts_ms: "BIGINT"
    },
    estimated_rows: 12_500_000,
    estimated_bytes: 4_400_000_000,
    connection_name: "Azure Blob — landing zone",
    platform: "azure-blob",
    discovered_at: nowIso()
  }
];

let demoPipelines: PipelineItem[] = [
  {
    id: PIPE_DEMO,
    name: "Orders → BigQuery warehouse",
    description: "Chunked replication with schema translation.",
    schedule_cron: "0 */6 * * *",
    status: "active",
    created_by: demoUser.email,
    updated_at: nowIso(),
    node_count: 5,
    edge_count: 4
  }
];

const pipelineSnapshots = new Map<string, PipelineBuilderSnapshot>();

function defaultBuilderSnapshot(pipelineId: string, name: string, description: string): PipelineBuilderSnapshot {
  const nodes: PipelineBuilderNodeDTO[] = [
    { id: "n1", node_type: "source", label: "Snowflake source", position_x: 0, position_y: 80 },
    { id: "n2", node_type: "default", label: "ORDERS_FACT", position_x: 250, position_y: 80 },
    { id: "n3", node_type: "chunk", label: "Smart chunk engine", position_x: 500, position_y: 80 },
    { id: "n4", node_type: "transform", label: "Schema translator", position_x: 750, position_y: 80 },
    { id: "n5", node_type: "destination", label: "BigQuery destination", position_x: 1000, position_y: 80 }
  ];
  const edges: PipelineBuilderEdgeDTO[] = [
    { id: "e1", source_node_id: "n1", target_node_id: "n2" },
    { id: "e2", source_node_id: "n2", target_node_id: "n3" },
    { id: "e3", source_node_id: "n3", target_node_id: "n4" },
    { id: "e4", source_node_id: "n4", target_node_id: "n5" }
  ];
  return {
    pipeline: {
      id: pipelineId,
      name,
      description,
      status: "draft",
      builder_config: {
        goal: "Replicate ORDERS_FACT to analytics warehouse",
        mode: "incremental",
        source_platform: "snowflake",
        connection_name: "Snowflake — QA",
        dataset_name: "PUBLIC.ORDERS_FACT",
        destination_slug: "bigquery"
      }
    },
    nodes,
    edges
  };
}

pipelineSnapshots.set(PIPE_DEMO, defaultBuilderSnapshot(PIPE_DEMO, "Orders → BigQuery warehouse", "Chunked replication with schema translation."));

let demoJobs: JobItem[] = [
  {
    id: "job-demo-1",
    pipeline_id: PIPE_DEMO,
    pipeline_name: "Orders → BigQuery warehouse",
    status: "succeeded",
    source_platform: "snowflake",
    destination_platform: "bigquery",
    started_at: new Date(Date.now() - 3600e3).toISOString(),
    finished_at: new Date(Date.now() - 3500e3).toISOString(),
    total_chunks: 12,
    completed_chunks: 12,
    failed_chunks: 0
  }
];

type DemoAccessRow = {
  user_id: string;
  email: string;
  full_name: string;
  role: "owner" | "admin" | "engineer" | "viewer";
  permissions?: string[];
};

let demoWorkspaceMembers: DemoAccessRow[] = [
  { user_id: DEMO_USER_ID, email: DEMO_AUTH_EMAIL, full_name: "Demo Engineer", role: "owner" },
  { user_id: "user-demo-2", email: "viewer@example.com", full_name: "Jamie Viewer", role: "viewer" }
];

type DemoPendingInvite = {
  token: string;
  public_id: string;
  workspace_id: string;
  email: string;
  role: Exclude<DemoAccessRow["role"], "owner">;
  permissions: string[];
  created_at: string;
};

let demoPendingInvites: DemoPendingInvite[] = [];

const demoInviteUserByToken = new Map<
  string,
  { user: UserSession; session: SessionInner }
>();

function demoDefaultPermissionsForRole(role: DemoAccessRow["role"]): string[] {
  const defs: Record<DemoAccessRow["role"], string[]> = {
    owner: ["workspace.read", "workspace.write", "workspace.access.manage", "governance.write"],
    admin: ["workspace.read", "workspace.write", "workspace.access.manage", "governance.write"],
    engineer: ["workspace.read", "connections.write", "pipelines.write", "governance.read"],
    viewer: ["workspace.read", "governance.read"]
  };
  return [...(defs[role] ?? defs.viewer)];
}

function demoEffectiveMemberPermissions(row: DemoAccessRow): string[] {
  if (row.permissions && row.permissions.length > 0) {
    return [...row.permissions].sort();
  }
  return demoDefaultPermissionsForRole(row.role);
}

type DemoApiKey = { id: string; name: string; key_prefix: string; created_at: string; last_used_at?: string };
let demoApiKeys: DemoApiKey[] = [];

type DemoTemplate = {
  id: string;
  name: string;
  description: string;
  spec_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
let demoTemplates: DemoTemplate[] = [
  {
    id: "tmpl-demo-1",
    name: "Sample lakehouse sync",
    description: "Demo pipeline skeleton for incremental warehouse replication.",
    spec_json: { kind: "PipelineTemplate", builder_config: { mode: "incremental" }, nodes: [], edges: [] },
    created_at: nowIso(),
    updated_at: nowIso()
  }
];

let demoWorkspaceSettings: Record<string, unknown> = {
  default_region: "eastus",
  default_timezone: "America/New_York",
  primary_contact_email: "",
  default_environment: "production",
  require_connector_approval: false,
  log_retention_days: 90,
  api_ip_allowlist: "",
  ui_ip_allowlist: "",
  session_max_age_minutes: 480,
  session_idle_timeout_minutes: 60,
  sql_preview_default_catalog: "demo_analytics",
  sql_preview_default_warehouse: "DEMO_WH",
  encryption_mode: "platform",
  customer_managed_key_vault_uri: "",
  customer_managed_key_name: "",
  export_max_rows_per_run: 1_000_000,
  export_approved_destination_prefixes: ["s3://demo-approved-exports/", "https://datalake.example.com/demo/"],
  maintenance_weekday: "sunday",
  maintenance_start_time_utc: "06:00",
  maintenance_duration_minutes: 120,
  governance_slack_webhook_url: "",
  governance_teams_webhook_url: ""
};

function assertDemoToken(token: string) {
  if (!isDemoBearerToken(token)) {
    throw new Error("Demo mode requires a demo session token.");
  }
}

export function demoCredentialsMatch(email: string, password: string): boolean {
  return email.trim().toLowerCase() === DEMO_AUTH_EMAIL && password === DEMO_AUTH_PASSWORD;
}

export async function demoAuthLogin(payload: { email: string; password: string }): Promise<SessionEnvelope | null> {
  if (!USE_DEMO_DATA) return null;
  await delay();
  if (!demoCredentialsMatch(payload.email, payload.password)) {
    return null;
  }
  demoSessionInner = { ...demoSessionInner, created_at: nowIso() };
  return { token: DEMO_BEARER_TOKEN, session: demoSessionInner, user: { ...demoUser } };
}

export async function demoAuthSignup(payload: {
  full_name: string;
  email: string;
  password: string;
  company: string;
  plan_id: string;
  start_trial: boolean;
}): Promise<SessionEnvelope> {
  if (!USE_DEMO_DATA) throw new Error("Demo mode is not enabled.");
  await delay();
  demoUser = {
    ...demoUser,
    email: payload.email,
    full_name: payload.full_name,
    company: payload.company,
    plan: payload.plan_id,
    trial_status: payload.start_trial ? "active" : "none",
    subscription_state: payload.start_trial ? "trialing" : "inactive"
  };
  demoSessionInner = { ...demoSessionInner, user_id: newId("user"), created_at: nowIso() };
  return { token: DEMO_BEARER_TOKEN, session: demoSessionInner, user: { ...demoUser } };
}

export async function demoAuthForgotPassword(payload: { email: string }) {
  await delay();
  return {
    status: "ok",
    message: "If that email exists, a reset link was sent (demo: no email is sent).",
    email: payload.email
  };
}

export async function demoAuthSession(token: string): Promise<{ user: UserSession; session: SessionInner }> {
  await delay();
  const alt = demoInviteUserByToken.get(token);
  if (alt) {
    return { user: { ...alt.user }, session: { ...alt.session } };
  }
  assertDemoToken(token);
  return { user: { ...demoUser }, session: { ...demoSessionInner, token } };
}

export async function demoAuthLogout(_token: string) {
  await delay();
  return { status: "ok" };
}

export async function demoAuthPricingPlans() {
  await delay();
  return {
    plans: [
      {
        id: "starter",
        name: "Starter",
        price_monthly: 0,
        price_yearly: 0,
        trial_days: 14,
        description: "Up to 5 connectors",
        features: ["5 connectors", "Community support"],
        recommended: false,
        max_pipelines: "10",
        max_connectors: "5",
        support_tier: "community",
        includes_lineage: false,
        includes_autoflow: false
      },
      {
        id: "growth",
        name: "Growth",
        price_monthly: 499,
        price_yearly: 4990,
        trial_days: 14,
        description: "Unlimited pipelines",
        features: ["Unlimited pipelines", "Routing center", "Email support"],
        recommended: true,
        max_pipelines: "unlimited",
        max_connectors: "unlimited",
        support_tier: "standard",
        includes_lineage: true,
        includes_autoflow: true
      },
      {
        id: "enterprise",
        name: "Enterprise",
        price_monthly: 0,
        price_yearly: 0,
        trial_days: 30,
        description: "SLA + dedicated support",
        features: ["Dedicated CSM", "VPC", "Custom contracts"],
        recommended: false,
        max_pipelines: "unlimited",
        max_connectors: "unlimited",
        support_tier: "premium",
        includes_lineage: true,
        includes_autoflow: true
      }
    ]
  };
}

export async function demoAuthStartTrial(token: string, payload: { plan_id: string }) {
  assertDemoToken(token);
  await delay();
  demoUser = {
    ...demoUser,
    plan: payload.plan_id,
    trial_status: "active",
    subscription_state: "trialing",
    trial_ends_at: new Date(Date.now() + (payload.plan_id === "enterprise" ? 30 : 14) * 864e5).toISOString()
  };
  return { user: { ...demoUser }, session: { ...demoSessionInner } };
}

export async function demoAuthOAuthProviders() {
  await delay();
  return {
    providers: [
      { id: "google", label: "Google", status: "demo" },
      { id: "microsoft", label: "Microsoft", status: "demo" }
    ]
  };
}

export async function demoAuthWorkspaces(token: string) {
  assertDemoToken(token);
  await delay();
  return { items: demoWorkspaces.map((w) => ({ ...w })) };
}

export async function demoAuthCreateWorkspace(
  token: string,
  payload: { name: string; region: string; environment: WorkspaceItem["environment"]; description: string }
) {
  assertDemoToken(token);
  await delay();
  const item: WorkspaceItem = {
    id: newId("ws"),
    name: payload.name,
    slug: payload.name.toLowerCase().replace(/\s+/g, "-").slice(0, 48),
    region: payload.region,
    environment: payload.environment,
    description: payload.description,
    created_at: nowIso(),
    role: "owner"
  };
  demoWorkspaces = [...demoWorkspaces, item];
  return { item };
}

export async function demoAuthDeleteWorkspace(token: string, workspaceId: string) {
  assertDemoToken(token);
  await delay();
  demoWorkspaces = demoWorkspaces.filter((w) => w.id !== workspaceId);
  if (demoUser.workspace_id === workspaceId && demoWorkspaces[0]) {
    demoUser = { ...demoUser, workspace_id: demoWorkspaces[0].id, workspace_name: demoWorkspaces[0].name, workspace_slug: demoWorkspaces[0].slug };
  }
  return { status: "deleted", id: workspaceId };
}

export async function demoAuthUpdateWorkspace(
  token: string,
  workspaceId: string,
  payload: { name: string; region: string; environment: WorkspaceItem["environment"]; description: string }
) {
  assertDemoToken(token);
  await delay();
  const idx = demoWorkspaces.findIndex((w) => w.id === workspaceId);
  if (idx < 0) throw new Error("Workspace not found");
  const prev = demoWorkspaces[idx]!;
  const item: WorkspaceItem = {
    ...prev,
    name: payload.name,
    region: payload.region,
    environment: payload.environment,
    description: payload.description,
    slug: payload.name.toLowerCase().replace(/\s+/g, "-").slice(0, 48)
  };
  demoWorkspaces = [...demoWorkspaces.slice(0, idx), item, ...demoWorkspaces.slice(idx + 1)];
  if (demoUser.workspace_id === workspaceId) {
    demoUser = { ...demoUser, workspace_name: item.name, workspace_slug: item.slug };
  }
  return { item };
}

function demoUserRoleInWorkspace(workspaceId: string): DemoAccessRow["role"] | undefined {
  const ws = demoWorkspaces.find((w) => w.id === workspaceId);
  if (!ws) return undefined;
  if (workspaceId === DEMO_WORKSPACE_ID) {
    const row = demoWorkspaceMembers.find((m) => m.user_id === demoUser.id);
    return row?.role ?? ws.role;
  }
  return ws.role;
}

export async function demoAuthSelectWorkspace(token: string, workspaceId: string) {
  assertDemoToken(token);
  await delay();
  const ws = demoWorkspaces.find((w) => w.id === workspaceId);
  if (!ws) throw new Error("Workspace not found");
  if (workspaceId === demoUser.workspace_id) {
    return { user: { ...demoUser }, session: { ...demoSessionInner } };
  }
  const sourceRole = demoUserRoleInWorkspace(demoUser.workspace_id);
  if (sourceRole !== "owner" && sourceRole !== "admin") {
    throw new Error(
      "Only workspace owners and admins in your current workspace may change the active workspace. Ask an owner or admin if you need access elsewhere."
    );
  }
  const targetRole = demoUserRoleInWorkspace(workspaceId);
  const newRole = targetRole ?? ws.role ?? "owner";
  const nextPerms: string[] =
    newRole === "owner" || newRole === "admin" ? ["*"] : demoDefaultPermissionsForRole(newRole);
  demoUser = {
    ...demoUser,
    workspace_id: ws.id,
    workspace_name: ws.name,
    workspace_slug: ws.slug,
    workspace_role: newRole,
    permissions: nextPerms
  };
  return { user: { ...demoUser }, session: { ...demoSessionInner } };
}

export async function demoAuthWorkspaceAccess(token: string, workspaceId: string) {
  assertDemoToken(token);
  await delay();
  if (!demoWorkspaces.some((w) => w.id === workspaceId)) throw new Error("Workspace not found");
  const items = demoWorkspaceMembers.map((m) => ({
    ...m,
    permissions: demoEffectiveMemberPermissions(m)
  }));
  const invites = demoPendingInvites
    .filter((i) => i.workspace_id === workspaceId)
    .map((i) => ({
      id: i.public_id,
      email: i.email,
      role: i.role,
      permissions: i.permissions,
      created_at: i.created_at
    }));
  return { items, invites };
}

export async function demoAuthAssignWorkspaceAccess(
  token: string,
  payload: {
    workspace_id: string;
    email: string;
    role: "owner" | "admin" | "engineer" | "viewer";
    permissions?: string[] | null;
  }
) {
  assertDemoToken(token);
  await delay();
  if (!demoWorkspaces.some((w) => w.id === payload.workspace_id)) throw new Error("Workspace not found");
  const em = payload.email.trim().toLowerCase();
  const idx = demoWorkspaceMembers.findIndex((m) => m.email.toLowerCase() === em);
  const nextPerms =
    payload.permissions === undefined
      ? undefined
      : payload.permissions === null || payload.permissions.length === 0
        ? undefined
        : [...payload.permissions];
  if (idx >= 0) {
    const prev = demoWorkspaceMembers[idx]!;
    demoWorkspaceMembers[idx] = {
      ...prev,
      role: payload.role,
      ...(nextPerms !== undefined ? { permissions: nextPerms } : {})
    };
  } else {
    demoWorkspaceMembers.push({
      user_id: newId("u"),
      email: payload.email.trim(),
      full_name: payload.email.trim().split("@")[0] ?? "Invited user",
      role: payload.role,
      ...(nextPerms !== undefined ? { permissions: nextPerms } : {})
    });
  }
  return { status: "granted" };
}

export async function demoAuthSendWorkspaceInvite(
  token: string,
  payload: {
    workspace_id: string;
    email: string;
    role: Exclude<DemoAccessRow["role"], "owner">;
    permissions: string[];
  }
) {
  assertDemoToken(token);
  await delay();
  if (!demoWorkspaces.some((w) => w.id === payload.workspace_id)) throw new Error("Workspace not found");
  const email = payload.email.trim().toLowerCase();
  if (demoWorkspaceMembers.some((m) => m.email.toLowerCase() === email)) {
    throw new Error("that email is already a member of this workspace");
  }
  demoPendingInvites = demoPendingInvites.filter((i) => !(i.workspace_id === payload.workspace_id && i.email === email));
  const tok = `demo_inv_${newId("t").replace(/[^a-z0-9]/gi, "").slice(0, 20)}`;
  const publicId = `inv_${newId("").slice(4, 12)}`;
  demoPendingInvites.push({
    token: tok,
    public_id: publicId,
    workspace_id: payload.workspace_id,
    email,
    role: payload.role,
    permissions: payload.permissions.length ? [...payload.permissions] : demoDefaultPermissionsForRole(payload.role),
    created_at: nowIso()
  });
  return { status: "invited", id: publicId, email, role: payload.role, sent_email: false };
}

export async function demoAuthCancelWorkspaceInvite(token: string, workspaceId: string, inviteId: string) {
  assertDemoToken(token);
  await delay();
  if (!demoWorkspaces.some((w) => w.id === workspaceId)) throw new Error("Workspace not found");
  const before = demoPendingInvites.length;
  demoPendingInvites = demoPendingInvites.filter((i) => !(i.public_id === inviteId && i.workspace_id === workspaceId));
  if (demoPendingInvites.length === before) throw new Error("invite not found");
  return { status: "cancelled" };
}

export async function demoAuthInvitePreview(inviteToken: string) {
  if (!USE_DEMO_DATA) throw new Error("Demo mode is not enabled.");
  await delay();
  const inv = demoPendingInvites.find((i) => i.token === inviteToken);
  if (!inv) throw new Error("invite not found or expired");
  const ws = demoWorkspaces.find((w) => w.id === inv.workspace_id) ?? demoWorkspaces[0]!;
  return {
    email: inv.email,
    workspace_id: ws.id,
    workspace_name: ws.name,
    role: inv.role,
    permissions: inv.permissions
  };
}

export async function demoAuthInviteAccept(
  payload: {
    token: string;
    full_name?: string;
    password?: string;
    company?: string;
    plan_id?: string;
    start_trial?: boolean;
  },
  existingSessionToken: string | null
) {
  if (!USE_DEMO_DATA) throw new Error("Demo mode is not enabled.");
  await delay();
  const inv = demoPendingInvites.find((i) => i.token === payload.token);
  if (!inv) throw new Error("invite not found or expired");

  if (existingSessionToken) {
    assertDemoToken(existingSessionToken);
    const u = demoUser.email.trim().toLowerCase() === inv.email.trim().toLowerCase() ? demoUser : null;
    if (!u) throw new Error("signed-in user does not match invite email");
    demoPendingInvites = demoPendingInvites.filter((i) => i.token !== payload.token);
    return { token: DEMO_BEARER_TOKEN, session: demoSessionInner, user: { ...demoUser } };
  }

  const existingMember = demoWorkspaceMembers.some((m) => m.email.toLowerCase() === inv.email);
  if (existingMember) {
    const err = new Error("account_exists");
    throw err;
  }
  if (!payload.full_name?.trim() || !payload.password?.trim()) {
    throw new Error("full_name and password are required");
  }
  if (payload.password.trim().length < 8) {
    throw new Error("password must be at least 8 characters");
  }

  const uid = newId("u");
  const itoken = `dp_demo_i_${newId("").slice(4, 16)}`;
  const ws = demoWorkspaces[0]!;
  const fullName = payload.full_name.trim();
  const permRow: DemoAccessRow = {
    user_id: uid,
    email: inv.email,
    full_name: fullName,
    role: inv.role,
    permissions: inv.permissions.length ? [...inv.permissions] : undefined
  };
  const invitedUser: UserSession = {
    id: uid,
    email: inv.email,
    full_name: fullName,
    role: "member",
    company: payload.company?.trim() ?? "",
    workspace_id: ws.id,
    workspace_slug: ws.slug,
    workspace_name: ws.name,
    plan: payload.plan_id ?? "growth",
    trial_status: payload.start_trial ? "active" : "inactive",
    trial_ends_at: payload.start_trial ? new Date(Date.now() + 14 * 864e5).toISOString() : null,
    subscription_state: payload.start_trial ? "trialing" : "inactive",
    workspace_role: inv.role,
    permissions: demoEffectiveMemberPermissions(permRow)
  };
  const sess: SessionInner = {
    token: itoken,
    user_id: uid,
    created_at: nowIso(),
    expires_at: new Date(Date.now() + 864e5 * 7).toISOString()
  };
  demoInviteUserByToken.set(itoken, { user: invitedUser, session: sess });
  demoWorkspaceMembers.push(permRow);
  demoPendingInvites = demoPendingInvites.filter((i) => i.token !== payload.token);
  return { token: itoken, session: sess, user: invitedUser };
}

export async function demoAuthRevokeWorkspaceAccess(token: string, workspaceId: string, userId: string) {
  assertDemoToken(token);
  await delay();
  if (!demoWorkspaces.some((w) => w.id === workspaceId)) throw new Error("Workspace not found");
  const row = demoWorkspaceMembers.find((m) => m.user_id === userId);
  if (!row) throw new Error("Member not found");
  if (row.role === "owner") throw new Error("Cannot revoke an owner in demo");
  demoWorkspaceMembers = demoWorkspaceMembers.filter((m) => m.user_id !== userId);
  return { status: "revoked", user_id: userId };
}

export async function demoAuthRoleCatalog(token: string) {
  assertDemoToken(token);
  await delay();
  return {
    roles: ["owner", "admin", "engineer", "viewer"],
    definitions: [
      {
        id: "owner",
        label: "Owner",
        description: "Full workspace control including roles and destructive actions.",
        permissions: ["workspace.read", "workspace.write", "workspace.access.manage", "governance.write"]
      },
      {
        id: "admin",
        label: "Admin",
        description: "Operational control without ownership transfer.",
        permissions: ["workspace.read", "workspace.write", "workspace.access.manage", "governance.write"]
      },
      {
        id: "engineer",
        label: "Engineer",
        description: "Build and run data pipelines and connectors.",
        permissions: ["workspace.read", "connections.write", "pipelines.write", "governance.read"]
      },
      {
        id: "viewer",
        label: "Viewer",
        description: "Read-only monitoring and audits.",
        permissions: ["workspace.read", "governance.read"]
      }
    ]
  };
}

const DATA_SYSTEMS = [
  { slug: "snowflake", name: "Snowflake", category: "Warehouse", tagline: "Elastic analytics", accent: "#29B5E8" },
  { slug: "bigquery", name: "BigQuery", category: "Warehouse", tagline: "Serverless SQL", accent: "#4285F4" },
  { slug: "databricks", name: "Databricks", category: "Lakehouse", tagline: "Unified analytics", accent: "#FF3621" },
  { slug: "postgresql", name: "PostgreSQL", category: "Database", tagline: "Relational core", accent: "#336791" },
  { slug: "mysql", name: "MySQL", category: "Database", tagline: "Operational store", accent: "#4479A1" },
  { slug: "aws-s3", name: "Amazon S3", category: "Object", tagline: "Durable lake", accent: "#E25444" },
  { slug: "azure-blob", name: "Azure Blob", category: "Object", tagline: "Cloud files", accent: "#0078D4" }
];

export async function demoDataSystems(token: string) {
  assertDemoToken(token);
  await delay();
  return { items: DATA_SYSTEMS.map((s) => ({ ...s })) };
}

type CreateConnectionPayload = {
  name: string;
  platform: string;
  credentials: Record<string, string>;
  config: Record<string, unknown>;
};

export async function demoConnectionsList(token: string) {
  assertDemoToken(token);
  await delay();
  return { items: demoConnections.map((c) => ({ ...c })) };
}

export async function demoTestConnection(token: string, _workspaceId: string, _payload: CreateConnectionPayload) {
  assertDemoToken(token);
  await delay(80);
  return {
    status: "ok",
    latency_ms: 38,
    workspace_id: DEMO_WORKSPACE_ID,
    message: "Demo mode: connection test always succeeds."
  };
}

export async function demoCreateConnection(token: string, _workspaceId: string, payload: CreateConnectionPayload) {
  assertDemoToken(token);
  await delay();
  const item: ConnectionItem = {
    id: newId("conn"),
    name: payload.name,
    platform: payload.platform,
    status: "connected",
    config: payload.config,
    last_tested_at: nowIso(),
    created_at: nowIso()
  };
  demoConnections = [...demoConnections, item];
  return { item, message: "Connection saved (demo)." };
}

export async function demoDiscoverConnection(token: string, _workspaceId: string, connectionId: string) {
  assertDemoToken(token);
  await delay(120);
  const conn = demoConnections.find((c) => c.id === connectionId);
  if (!conn) throw new Error("Connection not found");
  const discovered: DatasetItem[] = [
    {
      id: newId("ds"),
      name: `${conn.name} — DISCOVERED_SAMPLE`,
      external_id: `${conn.platform.toUpperCase()}.DISCOVERED_SAMPLE`,
      schema_json: { id: "VARCHAR", value: "NUMBER", ingested_at: "TIMESTAMP" },
      estimated_rows: 50_000,
      estimated_bytes: 12_000_000,
      connection_name: conn.name,
      platform: conn.platform,
      discovered_at: nowIso()
    }
  ];
  const sample = discovered[0]!;
  if (!demoDatasets.some((d) => d.id === sample.id)) {
    demoDatasets = [...demoDatasets, sample];
  }
  return {
    items: discovered.map((x) => enrichDemoDataset({ ...x })),
    message: "Discovery complete (demo): one synthetic dataset added."
  };
}

export async function demoDeleteConnection(token: string, _workspaceId: string, connectionId: string) {
  assertDemoToken(token);
  await delay();
  const removed = demoConnections.find((c) => c.id === connectionId);
  demoConnections = demoConnections.filter((c) => c.id !== connectionId);
  if (removed) {
    demoDatasets = demoDatasets.filter((d) => d.connection_name !== removed.name);
  }
  return { status: "deleted", id: connectionId };
}

export async function demoDatasetsList(token: string) {
  assertDemoToken(token);
  await delay();
  return {
    items: demoDatasets.map((d) => enrichDemoDataset({ ...d, schema_json: { ...d.schema_json } }))
  };
}

export async function demoDatasetSchema(token: string, datasetId: string) {
  assertDemoToken(token);
  await delay();
  const ds = demoDatasets.find((d) => d.id === datasetId);
  if (!ds) throw new Error("Dataset not found");
  return { schema_json: { ...ds.schema_json } };
}

export async function demoUpdateDatasetSchema(token: string, datasetId: string, schema_json: Record<string, string>) {
  assertDemoToken(token);
  await delay();
  const idx = demoDatasets.findIndex((d) => d.id === datasetId);
  if (idx < 0) throw new Error("Dataset not found");
  const prev = demoDatasets[idx]!;
  const next = { ...prev, schema_json: { ...schema_json } };
  demoDatasets = [...demoDatasets.slice(0, idx), next, ...demoDatasets.slice(idx + 1)];
  return { status: "ok", dataset_id: datasetId, schema_json: { ...next.schema_json } };
}

export async function demoPipelinesList(token: string) {
  assertDemoToken(token);
  await delay();
  return { items: demoPipelines.map((p) => ({ ...p })) };
}

export async function demoCreatePipeline(
  token: string,
  _workspaceId: string,
  payload: { name: string; description?: string; builder_config?: PipelineBuilderConfig }
) {
  assertDemoToken(token);
  await delay();
  const id = newId("pipe");
  const description = payload.description ?? "";
  demoPipelines = [
    ...demoPipelines,
    {
      id,
      name: payload.name,
      description,
      schedule_cron: "",
      status: "draft",
      created_by: demoUser.email,
      updated_at: nowIso(),
      node_count: 0,
      edge_count: 0
    }
  ];
  const snap = defaultBuilderSnapshot(id, payload.name, description);
  if (payload.builder_config) {
    snap.pipeline.builder_config = { ...snap.pipeline.builder_config, ...payload.builder_config };
  }
  pipelineSnapshots.set(id, snap);
  return { id, name: payload.name };
}

export async function demoPipelineBuilder(token: string, _workspaceId: string, pipelineId: string) {
  assertDemoToken(token);
  await delay();
  const meta = demoPipelines.find((p) => p.id === pipelineId);
  if (!meta) throw new Error("Pipeline not found");
  if (!pipelineSnapshots.has(pipelineId)) {
    pipelineSnapshots.set(pipelineId, defaultBuilderSnapshot(pipelineId, meta.name, meta.description));
  }
  const snap = pipelineSnapshots.get(pipelineId)!;
  return JSON.parse(JSON.stringify(snap)) as PipelineBuilderSnapshot;
}

export async function demoSavePipelineBuilder(
  token: string,
  _workspaceId: string,
  pipelineId: string,
  payload: PipelineSavePayload
) {
  assertDemoToken(token);
  await delay();
  const idx = demoPipelines.findIndex((p) => p.id === pipelineId);
  if (idx < 0) throw new Error("Pipeline not found");
  const prev = demoPipelines[idx]!;
  const updated: PipelineItem = {
    ...prev,
    name: payload.name,
    description: payload.description ?? prev.description,
    updated_at: nowIso(),
    node_count: payload.nodes.length,
    edge_count: payload.edges.length
  };
  demoPipelines = [...demoPipelines.slice(0, idx), updated, ...demoPipelines.slice(idx + 1)];
  pipelineSnapshots.set(pipelineId, {
    pipeline: {
      id: pipelineId,
      name: payload.name,
      description: payload.description ?? prev.description,
      status: prev.status,
      builder_config: { ...payload.builder_config }
    },
    nodes: payload.nodes.map((n) => ({ ...n })),
    edges: payload.edges.map((e) => ({ ...e }))
  });
  return { status: "ok", id: pipelineId };
}

export async function demoRunPipeline(
  token: string,
  _workspaceId: string,
  payload: {
    pipeline_id?: string;
    dataset_name: string;
    estimated_bytes: number;
    estimated_rows: number;
    partitions?: number;
    worker_capacity?: number;
    network_throughput_mb_s?: number;
    source_platform?: string;
    destination_platform?: string;
  }
) {
  assertDemoToken(token);
  await delay(100);
  const pipelineId = payload.pipeline_id ?? PIPE_DEMO;
  const meta = demoPipelines.find((p) => p.id === pipelineId) ?? demoPipelines[0]!;
  const job: JobItem = {
    id: newId("job"),
    pipeline_id: meta.id,
    pipeline_name: meta.name,
    status: "running",
    source_platform: payload.source_platform ?? "snowflake",
    destination_platform: payload.destination_platform ?? "bigquery",
    started_at: nowIso(),
    total_chunks: Math.max(4, Math.min(32, Math.ceil(payload.estimated_bytes / (64 * 1024 * 1024)))),
    completed_chunks: 0,
    failed_chunks: 0
  };
  demoJobs = [job, ...demoJobs];
  return {
    job_id: job.id,
    status: "queued",
    workflow_id: `wf-${job.id}`,
    run_id: `run-${job.id}`
  };
}

export async function demoJobsList(token: string) {
  assertDemoToken(token);
  await delay();
  return { items: demoJobs.map((j) => ({ ...j })) };
}

export async function demoJob(token: string, jobId: string) {
  assertDemoToken(token);
  await delay();
  const j = demoJobs.find((x) => x.id === jobId);
  if (!j) throw new Error("Job not found");
  return { ...j };
}

export async function demoJobChunks(token: string, jobId: string) {
  assertDemoToken(token);
  await delay();
  const j = demoJobs.find((x) => x.id === jobId);
  if (!j) throw new Error("Job not found");
  const n = Math.min(j.total_chunks, 8);
  const bytesPerChunk = 8 * 1024 * 1024;
  const items: JobChunkRow[] = Array.from({ length: n }, (_, i) => ({
    chunk_index: i,
    state: i < j.completed_chunks ? "done" : i === j.completed_chunks && j.status === "running" ? "running" : "pending",
    source_partition: `p${i.toString().padStart(4, "0")}`,
    attempts: 1,
    bytes_processed: i < j.completed_chunks ? bytesPerChunk : 0,
    started_at: i < j.completed_chunks ? nowIso() : undefined,
    finished_at: i < j.completed_chunks ? nowIso() : undefined
  }));
  return { items };
}

export async function demoCreateRoute(
  token: string,
  workspaceId: string,
  payload: {
    objective: string;
    source_system: string;
    destination_system: string;
    dataset_size_gb: number;
    network_bandwidth_mbps: number;
    worker_capacity: number;
    cost_preference?: string;
    latency_slo_minutes?: number;
    workspace_id?: string;
  }
) {
  assertDemoToken(token);
  await delay();
  return {
    objective: payload.objective,
    route: [
      { system: payload.source_system, action: "partition_read" },
      { system: "dataplier-control-plane", action: "route_optimize" },
      { system: payload.destination_system, action: "bulk_load" }
    ],
    chunk_target_mb: Math.min(512, Math.max(64, payload.dataset_size_gb * 8)),
    compression: "zstd",
    rationale: [
      `Demo routing for ${payload.dataset_size_gb} GB (${payload.cost_preference ?? "balanced"} preference).`,
      `Assumed ${payload.network_bandwidth_mbps} Mbps link and ${payload.worker_capacity} workers.`,
      `Workspace: ${workspaceId}`
    ],
    strategy_id: "demo-strategy-1",
    schema_version: "1.0",
    confidence: 0.86,
    decision_path: "demo/heuristic",
    signals_used: { demo: true, cost_preference: payload.cost_preference ?? "balanced" },
    warnings: ["Demo mode: optimizer not connected; response is static."],
    model_version: "demo-0.1",
    sla_summary: {
      latency_slo_minutes: payload.latency_slo_minutes ?? 60,
      estimated_wall_clock_minutes: Math.min(
        payload.latency_slo_minutes ?? 60,
        12 + payload.dataset_size_gb / Math.max(1, payload.network_bandwidth_mbps / 512)
      ),
      within_slo: true,
      staging_included: payload.dataset_size_gb > 200,
      notes: "Demo SLA summary; production uses routing-engine simulation + job history."
    },
    cost_transparency: {
      egress_usd_monthly_band_low: Math.round(payload.dataset_size_gb * 0.04 * 100) / 100,
      egress_usd_monthly_band_high: Math.round(payload.dataset_size_gb * 0.18 * 100) / 100,
      currency: "USD",
      cost_preference: payload.cost_preference ?? "balanced",
      methodology: "Illustrative egress band for multi-vendor comparisons."
    }
  };
}

export async function demoMetadataSummary(token: string, workspaceId: string) {
  assertDemoToken(token);
  await delay();
  return {
    workspace_name: demoWorkspaces.find((w) => w.id === workspaceId)?.name ?? demoUser.workspace_name,
    counts: {
      connections: demoConnections.length,
      datasets: demoDatasets.length,
      pipelines: demoPipelines.length,
      jobs: demoJobs.length,
      logs: 24
    },
    recent_logs: [
      {
        entity_type: "pipeline",
        level: "info",
        message: "Demo: last builder save acknowledged.",
        created_at: nowIso()
      },
      {
        entity_type: "connection",
        level: "info",
        message: "Demo: synthetic discovery completed.",
        created_at: nowIso()
      }
    ]
  };
}

export async function demoObservabilitySummary(token: string) {
  assertDemoToken(token);
  await delay();
  return {
    worker_utilization: 0.62,
    transfer_speed_mb_s: 420,
    queue_backlog: 3,
    chunk_failures: 0,
    pipeline_latency_s: 118,
    throughput_window_hours: 24,
    latency_window_days: 7,
    failed_jobs_24h: 0,
    running_jobs: 1,
    throughput_source: "demo",
    latency_source: "demo"
  };
}

function demoHourBuckets(hours: number) {
  const out: string[] = [];
  const now = Date.now();
  for (let i = hours - 1; i >= 0; i--) {
    out.push(new Date(now - i * 3600_000).toISOString());
  }
  return out;
}

export async function demoObservabilityTimeseries(token: string, hours: number) {
  assertDemoToken(token);
  await delay();
  const h = Math.min(168, Math.max(1, hours));
  const buckets = demoHourBuckets(Math.min(h, 96));
  const throughput = buckets.map((t, idx) => ({
    t,
    mb_per_s: Math.round((180 + Math.sin(idx / 3) * 40 + idx * 2) * 100) / 100
  }));
  const latency = buckets.map((t, idx) => ({
    t,
    latency_s: Math.round((90 + Math.cos(idx / 4) * 25 + idx) * 10) / 10
  }));
  return { window_hours: h, throughput, latency };
}

export async function demoObservabilityRecentJobs(token: string, opts?: { limit?: number; status?: string }) {
  assertDemoToken(token);
  await delay();
  const limit = Math.min(100, Math.max(1, opts?.limit ?? 8));
  let rows = demoJobs.map((j) => ({
    id: j.id,
    status: j.status,
    started_at: j.started_at,
    finished_at: j.finished_at,
    total_chunks: j.total_chunks,
    completed_chunks: j.completed_chunks,
    failed_chunks: j.failed_chunks,
    pipeline_id: j.pipeline_id,
    pipeline_name: j.pipeline_name
  }));
  if (opts?.status) {
    const s = opts.status.toLowerCase();
    rows = rows.filter((r) => r.status.toLowerCase() === s);
  }
  return { items: rows.slice(0, limit) };
}

export async function demoObservabilityAlerts(token: string) {
  assertDemoToken(token);
  await delay();
  const failed = demoJobs.filter((j) => j.status.toLowerCase() === "failed").length;
  if (failed > 0) {
    return {
      items: [
        {
          id: "demo_failed",
          severity: "warning" as const,
          title: "Some jobs failed",
          detail: "At least one job in this workspace ended with errors. Open the jobs list to inspect them.",
          href: "/jobs-monitor?status=failed",
          since: new Date().toISOString()
        }
      ]
    };
  }
  return {
    items: [
      {
        id: "all_clear",
        severity: "success" as const,
        title: "Everything looks routine",
        detail: "No failed jobs in the last day and the work queue looks normal.",
        href: "/observability?tab=alerting",
        since: new Date().toISOString()
      }
    ]
  };
}

type DemoAlertCh = {
  id: string;
  name: string;
  channel_kind: string;
  destination_preview: string;
  enabled: boolean;
  created_at: string;
};
type DemoAlertRule = {
  id: string;
  name: string;
  description: string;
  threshold_kind: string;
  threshold_json: Record<string, unknown>;
  channel_id?: string;
  enabled: boolean;
  cooldown_minutes: number;
};
let demoAlertExtraChannels: DemoAlertCh[] = [];
let demoAlertExtraRules: DemoAlertRule[] = [];

export async function demoObservabilityTraces(token: string, limit?: number) {
  assertDemoToken(token);
  await delay();
  const n = Math.min(50, Math.max(1, limit ?? 20));
  const items = demoJobs.slice(0, n).map((j) => ({
    trace_id: j.id,
    kind: "pipeline_execution",
    pipeline_name: j.pipeline_name,
    status: j.status,
    started_at: j.started_at,
    duration_ms: j.finished_at ? Math.max(1, new Date(j.finished_at).getTime() - new Date(j.started_at).getTime()) : 120_000,
    span_count_hint: 6 + j.total_chunks,
    href_jobs: `/jobs-monitor?job=${encodeURIComponent(j.id)}`
  }));
  return { items };
}

export async function demoObservabilityTraceDetail(token: string, traceId: string) {
  assertDemoToken(token);
  await delay();
  const j = demoJobs.find((x) => x.id === traceId);
  const spans = [
    {
      span_id: "demo-root",
      parent_span_id: null as string | null,
      service_name: "dataplier.control-plane",
      operation_name: "POST /pipelines/run",
      start_at: new Date(Date.now() - 3_600_000).toISOString(),
      end_at: new Date(Date.now() - 3_590_000).toISOString(),
      duration_ms: 10_000,
      status: "ok",
      attributes: { "http.route": "/pipelines/run" },
      source: "native"
    },
    {
      span_id: "demo-job",
      parent_span_id: "demo-root",
      service_name: "dataplier.job-runner",
      operation_name: "job.orchestrate",
      start_at: j?.started_at ?? new Date().toISOString(),
      end_at: j?.finished_at ?? null,
      duration_ms: j?.finished_at ? 900_000 : 400_000,
      status: j?.status?.toLowerCase() === "failed" ? "error" : "unset",
      attributes: { job_id: traceId },
      source: "native"
    },
    {
      span_id: "demo-chunk-0",
      parent_span_id: "demo-job",
      service_name: "dataplier.transfer-worker",
      operation_name: "chunk.execute",
      start_at: j?.started_at ?? new Date().toISOString(),
      end_at: j?.finished_at ?? null,
      duration_ms: 120_000,
      status: "ok",
      attributes: { chunk_index: 0 },
      source: "derived"
    }
  ];
  return {
    trace_id: traceId,
    pipeline_name: j?.pipeline_name ?? "Demo pipeline",
    job_status: j?.status ?? "unknown",
    source_platform: j?.source_platform ?? "snowflake",
    dest_platform: j?.destination_platform ?? "bigquery",
    spans
  };
}

export async function demoObservabilitySLOs(token: string) {
  assertDemoToken(token);
  await delay();
  return {
    items: [
      {
        id: "demo-slo-1",
        name: "Pipeline job success",
        description: "Demo SLO: completed / terminal jobs in rolling window.",
        sli_kind: "job_success_ratio",
        target_numeric: 0.999,
        comparison: "gte",
        window_hours: 720,
        enabled: true,
        sli_value: 0.9994,
        error_budget_remaining_ratio: 0.4,
        burn_rate_1h: 0.8,
        burn_rate_6h: 1.1,
        burn_rate_24h: 1.4,
        slo_status: "healthy",
        events_good: 998,
        events_bad: 2,
        events_total: 1000
      },
      {
        id: "demo-slo-2",
        name: "Chunk transfer reliability",
        description: "Demo SLO on chunk completion ratio.",
        sli_kind: "chunk_success_ratio",
        target_numeric: 0.995,
        comparison: "gte",
        window_hours: 168,
        enabled: true,
        sli_value: 0.997,
        error_budget_remaining_ratio: 0.55,
        burn_rate_1h: 0.2,
        burn_rate_6h: 0.4,
        burn_rate_24h: 0.6,
        slo_status: "healthy",
        events_good: 12_400,
        events_bad: 38,
        events_total: 12_438
      }
    ]
  };
}

export async function demoObservabilityCorrelation(token: string, jobId: string) {
  assertDemoToken(token);
  await delay();
  return {
    job_id: jobId,
    logs: [
      {
        entity_type: "job",
        level: "info",
        message: `Demo correlation bundle for job ${jobId.slice(0, 8)}…`,
        created_at: new Date().toISOString()
      }
    ],
    links: {
      jobs: `/jobs-monitor?job=${encodeURIComponent(jobId)}`,
      lineage: `/jobs-monitor?lineage=1&lineageJob=${encodeURIComponent(jobId)}`,
      trace: `/observability?tab=traces&trace=${encodeURIComponent(jobId)}`,
      explorer: "/dataset-explorer"
    }
  };
}

export async function demoObservabilityAlertRouting(token: string) {
  assertDemoToken(token);
  await delay();
  const baseChannels: DemoAlertCh[] = [
    {
      id: "demo-ch-1",
      name: "Demo on-call email",
      channel_kind: "email",
      destination_preview: "oncall@demo.dataplier",
      enabled: true,
      created_at: new Date().toISOString()
    },
    {
      id: "demo-ch-2",
      name: "Demo webhook bus",
      channel_kind: "webhook",
      destination_preview: "https://ho…/bus",
      enabled: true,
      created_at: new Date().toISOString()
    }
  ];
  const baseRules: DemoAlertRule[] = [
    {
      id: "demo-rule-1",
      name: "Failed jobs (24h)",
      description: "Route when failed terminal jobs appear.",
      threshold_kind: "failed_jobs_24h",
      threshold_json: { min: 1 },
      channel_id: "demo-ch-1",
      enabled: true,
      cooldown_minutes: 30
    },
    {
      id: "demo-rule-2",
      name: "SLO fast burn",
      description: "Multi-window burn heuristic.",
      threshold_kind: "slo_burn_fast",
      threshold_json: { burn_threshold: 3 },
      channel_id: "demo-ch-2",
      enabled: true,
      cooldown_minutes: 15
    }
  ];
  const channels = [...baseChannels, ...demoAlertExtraChannels];
  const rules = [...baseRules, ...demoAlertExtraRules];
  return {
    channels,
    rules,
    incidents: [
      {
        id: "demo-inc-1",
        rule_id: "demo-rule-1",
        severity: "warning",
        title: "Demo incident",
        detail: "Simulated delivery queued to email channel.",
        status: "open",
        fingerprint: "demo:failed_jobs",
        fired_at: new Date(Date.now() - 20 * 60_000).toISOString(),
        deliveries: [{ channel_id: "demo-ch-1", channel_kind: "email", status: "queued" }]
      }
    ],
    evaluations: rules.map((r) => ({
      rule_id: r.id,
      rule_name: r.name,
      firing: false,
      reason: "below threshold (demo)",
      routed_channel_id: r.channel_id
    }))
  };
}

export async function demoObservabilityWebhookDispatchTest(token: string, channelId: string) {
  assertDemoToken(token);
  await delay();
  return { status: "queued", idempotency_key: `demo-test:${channelId}:${Date.now()}` };
}

export async function demoObservabilityAlertChannelCreate(
  token: string,
  body: { name: string; channel_kind: string; destination: string; headers_json?: unknown; enabled?: boolean; signing_secret?: string }
) {
  assertDemoToken(token);
  await delay();
  const id = `demo-ch-x-${demoAlertExtraChannels.length + 1}`;
  demoAlertExtraChannels.push({
    id,
    name: body.name,
    channel_kind: body.channel_kind,
    destination_preview: body.destination.length > 24 ? `${body.destination.slice(0, 12)}…` : body.destination,
    enabled: body.enabled !== false,
    created_at: new Date().toISOString()
  });
  return { id, status: "created" };
}

export async function demoObservabilityAlertRuleCreate(
  token: string,
  body: {
    name: string;
    description?: string;
    threshold_kind: string;
    threshold_json?: Record<string, unknown>;
    channel_id?: string;
    enabled?: boolean;
    cooldown_minutes?: number;
  }
) {
  assertDemoToken(token);
  await delay();
  const id = `demo-rule-x-${demoAlertExtraRules.length + 1}`;
  demoAlertExtraRules.push({
    id,
    name: body.name,
    description: body.description ?? "",
    threshold_kind: body.threshold_kind,
    threshold_json: body.threshold_json ?? {},
    channel_id: body.channel_id,
    enabled: body.enabled !== false,
    cooldown_minutes: body.cooldown_minutes ?? 60
  });
  return { id, status: "created" };
}

export async function demoObservabilityIncidentUpdate(token: string, incidentId: string, status: "acknowledged" | "closed") {
  assertDemoToken(token);
  await delay();
  return { id: incidentId, status };
}

export async function demoLineageGraph(token: string) {
  assertDemoToken(token);
  await delay();
  return {
    datasets: demoDatasets.slice(0, 6).map((d) => ({ id: d.id, system: d.platform })),
    edges: [
      { source: "snowflake", target: "dataplier", operation: "extract" },
      { source: "dataplier", target: "bigquery", operation: "load" }
    ],
    events: [{ user: demoUser.email, action: "save_builder", pipeline: demoPipelines[0]?.name ?? "demo" }]
  };
}

export async function demoJobLineageGraph(token: string, jobId: string) {
  assertDemoToken(token);
  await delay();
  const j = demoJobs.find((x) => x.id === jobId);
  return {
    nodes: [
      { id: "src", kind: "system", label: j?.source_platform ?? "snowflake", meta: {} },
      { id: "job", kind: "job", label: `job ${jobId}`, meta: { status: j?.status } },
      { id: "dst", kind: "system", label: j?.destination_platform ?? "bigquery", meta: {} }
    ],
    links: [
      { source: "src", target: "job", rel: "read" },
      { source: "job", target: "dst", rel: "write" }
    ],
    note: "Demo lineage graph."
  };
}

function demoPolicyMaskingHits(): { scope: string; rule: string; status: string; column_hits: number }[] {
  type Hit = { scope: string; rule: string; status: string; column_hits: number };
  const agg = new Map<string, Hit>();
  const bump = (scope: string, rule: string, status: string) => {
    const k = `${scope}|${rule}`;
    const cur = agg.get(k);
    agg.set(k, { scope, rule, status, column_hits: (cur?.column_hits ?? 0) + 1 });
  };
  for (const d of demoDatasets) {
    for (const col of Object.keys(d.schema_json)) {
      const key = col.toLowerCase();
      if (key.includes("email") || key.endsWith("_email") || key === "mail") bump("pii.email", "hash_tokenize", "recommended");
      else if (key.includes("phone") || key.includes("mobile") || key.includes("msisdn") || key === "tel")
        bump("pii.phone", "last_four", "optional");
      else if (key.includes("ssn") || key.includes("social_security") || key.includes("national_id"))
        bump("pii.government_id", "tokenize", "recommended");
      else if (key.includes("credit_card") || key.includes("card_number") || key === "pan")
        bump("pii.payment_card", "vault_token", "recommended");
      else if (key.includes("password") || key.includes("passwd") || key.includes("secret_key"))
        bump("pii.credential", "never_log_clear_text", "required");
      else if (key.includes("latitude") || key.includes("longitude")) bump("pii.location", "bucket_geohash", "optional");
    }
  }
  const out = [...agg.values()];
  return out.length ? out : [{ scope: "pii.none_detected", rule: "n/a", status: "informational", column_hits: 0 }];
}

export async function demoPolicySummary(token: string, workspaceId: string) {
  assertDemoToken(token);
  await delay();
  const maxBytes = Math.max(0, ...demoDatasets.map((d) => d.estimated_bytes));
  const maxGb = maxBytes / (1024 * 1024 * 1024);
  let approvalGb = Math.round(maxGb * 2 + 120);
  approvalGb = Math.min(5000, Math.max(100, approvalGb));
  const platforms = [...new Set(demoConnections.map((c) => c.platform))].sort();
  return {
    workspace_id: workspaceId,
    workspace_name: demoWorkspaces.find((w) => w.id === workspaceId)?.name ?? demoUser.workspace_name,
    rbac: {
      roles_defined: ["owner", "admin", "engineer", "viewer"],
      default_deny_writes: false,
      break_glass_enabled: false,
      members_by_role: {
        [demoUser.role]: 1,
        ...(demoUser.workspace_role && demoUser.workspace_role !== demoUser.role
          ? { [demoUser.workspace_role]: 1 as number }
          : {})
      },
      parity_basis: "demo_session_user_roles"
    },
    masking: demoPolicyMaskingHits(),
    data_contracts: {
      enforced_tiers: ["bronze", "silver", "gold"],
      sla_attestation: "freshness SLOs attach to datasets at publish time",
      column_lineage_depth: "table + selected columns (see lineage service)",
      dataset_count: demoDatasets.length,
      connection_platforms: platforms,
      parity_basis: "demo_schema_json_column_scan"
    },
    egress_policy: {
      require_approval_above_gb_per_day: approvalGb,
      blocked_destination_classes: [] as string[],
      max_dataset_bytes_observed: maxBytes,
      parity_basis: "max_dataset_size_in_demo_workspace"
    },
    integrations: {
      webhooks: ["POST /hooks/pipeline-status (planned)"],
      export_dags: "GET /pipelines/{id}/export?format=yaml",
      pipeline_count: demoPipelines.length,
      workspace_connections: platforms
    }
  };
}

function demoPipelineRefsForDataset(name: string, externalId: string): { id: string; name: string; status: string }[] {
  const refs: { id: string; name: string; status: string }[] = [];
  const n = name.trim().toLowerCase();
  const e = externalId.trim().toLowerCase();
  for (const p of demoPipelines) {
    const snap = pipelineSnapshots.get(p.id);
    const dn = snap?.pipeline.builder_config?.dataset_name?.trim().toLowerCase() ?? "";
    const blob = JSON.stringify(snap?.pipeline.builder_config ?? {}).toLowerCase();
    if ((dn && (dn === n || dn === e)) || (n.length > 4 && blob.includes(n)) || (e.length > 4 && blob.includes(e))) {
      refs.push({ id: p.id, name: p.name, status: p.status });
    }
  }
  return refs;
}

export async function demoDatasetColumnLineage(token: string, datasetId: string) {
  assertDemoToken(token);
  await delay();
  const raw = demoDatasets.find((d) => d.id === datasetId);
  if (!raw) throw new Error("Dataset not found");
  const d = enrichDemoDataset({ ...raw });
  const pipelineRefs = demoPipelineRefsForDataset(d.name, d.external_id);
  const plIds = new Set(pipelineRefs.map((x) => x.id));
  const jobRefs = demoJobs
    .filter((j) => plIds.has(j.pipeline_id))
    .slice(0, 20)
    .map((j) => ({
      id: j.id,
      status: j.status,
      pipeline_id: j.pipeline_id,
      pipeline_name: j.pipeline_name
    }));
  const olNamespace = `dataplier:${DEMO_WORKSPACE_ID}:${d.platform}`;
  const columns: Record<string, unknown>[] = [];
  const edges: Record<string, unknown>[] = [];
  const olFields: Record<string, unknown> = {};
  const olSchemaFields: { name: string; type: string }[] = [];
  const maxPl = Math.min(5, pipelineRefs.length);
  for (const [colName, typ] of Object.entries(d.schema_json)) {
    const srcID = `src:${datasetId}:${colName}`;
    const tgtID = `dst:published:${colName}`;
    olFields[colName] = {
      inputFields: [{ namespace: olNamespace, name: d.name, field: colName }],
      transformationDescription: "Dataplier schema plane (physical → published facet scaffold).",
      transformationType: "INDIRECT"
    };
    olSchemaFields.push({ name: colName, type: typ });
    columns.push({
      name: colName,
      source_type: typ,
      facet: "physical",
      dataset_name: d.name,
      platform: d.platform,
      upstream_id: srcID,
      published_id: tgtID
    });
    edges.push({ source: srcID, target: "xf:dataplier-schema", rel: "extract", column: colName });
    edges.push({ source: "xf:dataplier-schema", target: tgtID, rel: "publish", column: colName });
    for (let i = 0; i < maxPl; i++) {
      edges.push({ source: srcID, target: `pl:${pipelineRefs[i]!.id}`, rel: "referenced_by_pipeline", column: colName });
    }
  }
  return {
    dataset_id: datasetId,
    dataset_name: d.name,
    external_id: d.external_id,
    platform: d.platform,
    schema_facets: ["physical", "published"],
    columns,
    edges,
    pipeline_refs: pipelineRefs,
    job_refs: jobRefs,
    openlineage: {
      producer: "https://dataplier.dev/lineage-service",
      spec_version: "1-0-0",
      dataset: {
        namespace: olNamespace,
        name: d.name,
        facets: {
          schema: {
            _producer: "https://dataplier.dev/lineage-service",
            _schemaURL: "https://openlineage.io/spec/facets/1-0-0/SchemaDatasetFacet.json",
            fields: olSchemaFields
          },
          columnLineage: {
            _producer: "https://dataplier.dev/lineage-service",
            _schemaURL: "https://openlineage.io/spec/facets/1-0-0/ColumnLineageDatasetFacet.json",
            fields: olFields
          }
        }
      }
    },
    parity_basis: "demo_schema_json_plus_pipeline_builder_config",
    note: "Demo column lineage + OpenLineage-shaped facets (matches lineage-service response shape)."
  };
}

export async function demoGovernanceAuditEvents(token: string, workspaceId: string) {
  assertDemoToken(token);
  await delay();
  if (!demoWorkspaces.some((w) => w.id === workspaceId)) throw new Error("Workspace not found");
  return {
    items: [
      {
        id: "log-demo-1",
        entity_type: "connection",
        entity_id: "",
        level: "info",
        message: "Connection health check succeeded (demo)",
        context: { connection: "Snowflake — QA" },
        created_at: new Date(Date.now() - 3600e3).toISOString()
      },
      {
        id: "log-demo-2",
        entity_type: "pipeline",
        entity_id: "",
        level: "info",
        message: "Pipeline definition saved",
        context: { pipeline: demoPipelines[0]?.name ?? "demo" },
        created_at: new Date(Date.now() - 7200e3).toISOString()
      }
    ]
  };
}

export async function demoGovernanceApiKeysList(token: string, workspaceId: string) {
  assertDemoToken(token);
  await delay();
  if (!demoWorkspaces.some((w) => w.id === workspaceId)) throw new Error("Workspace not found");
  return { items: demoApiKeys.map((k) => ({ ...k })) };
}

export async function demoGovernanceApiKeyCreate(token: string, workspaceId: string, name: string) {
  assertDemoToken(token);
  await delay();
  if (!demoWorkspaces.some((w) => w.id === workspaceId)) throw new Error("Workspace not found");
  const raw = `dpl_demo_${newId("rnd").replace(/-/g, "")}`;
  const prefix = raw.slice(0, 14);
  const row: DemoApiKey = { id: newId("key"), name: name.trim(), key_prefix: prefix, created_at: nowIso() };
  demoApiKeys = [row, ...demoApiKeys];
  return { item: { id: row.id, name: row.name, key_prefix: row.key_prefix, created_at: row.created_at }, token: raw, note: "Demo token shown once." };
}

export async function demoGovernanceApiKeyDelete(token: string, workspaceId: string, id: string) {
  assertDemoToken(token);
  await delay();
  if (!demoWorkspaces.some((w) => w.id === workspaceId)) throw new Error("Workspace not found");
  demoApiKeys = demoApiKeys.filter((k) => k.id !== id);
  return { status: "deleted", id };
}

export async function demoGovernanceTemplatesList(token: string, workspaceId: string) {
  assertDemoToken(token);
  await delay();
  if (!demoWorkspaces.some((w) => w.id === workspaceId)) throw new Error("Workspace not found");
  return { items: demoTemplates.map((t) => ({ ...t })) };
}

export async function demoGovernanceTemplateCreate(
  token: string,
  workspaceId: string,
  payload: { name: string; description: string; spec_json: Record<string, unknown> }
) {
  assertDemoToken(token);
  await delay();
  if (!demoWorkspaces.some((w) => w.id === workspaceId)) throw new Error("Workspace not found");
  const row: DemoTemplate = {
    id: newId("tmpl"),
    name: payload.name.trim(),
    description: payload.description.trim(),
    spec_json: payload.spec_json && typeof payload.spec_json === "object" ? payload.spec_json : {},
    created_at: nowIso(),
    updated_at: nowIso()
  };
  demoTemplates = [row, ...demoTemplates];
  return { item: { id: row.id, name: row.name } };
}

export async function demoGovernanceTemplateUpdate(
  token: string,
  workspaceId: string,
  id: string,
  payload: { name?: string; description?: string; spec_json?: Record<string, unknown> }
) {
  assertDemoToken(token);
  await delay();
  if (!demoWorkspaces.some((w) => w.id === workspaceId)) throw new Error("Workspace not found");
  const idx = demoTemplates.findIndex((t) => t.id === id);
  if (idx < 0) throw new Error("Template not found");
  const cur = demoTemplates[idx]!;
  demoTemplates[idx] = {
    ...cur,
    name: payload.name?.trim() ?? cur.name,
    description: payload.description?.trim() ?? cur.description,
    spec_json: payload.spec_json ?? cur.spec_json,
    updated_at: nowIso()
  };
  return { status: "updated", id };
}

export async function demoGovernanceTemplateDelete(token: string, workspaceId: string, id: string) {
  assertDemoToken(token);
  await delay();
  if (!demoWorkspaces.some((w) => w.id === workspaceId)) throw new Error("Workspace not found");
  demoTemplates = demoTemplates.filter((t) => t.id !== id);
  return { status: "deleted", id };
}

export async function demoGovernanceWorkspaceSettingsGet(token: string, workspaceId: string) {
  assertDemoToken(token);
  await delay();
  if (!demoWorkspaces.some((w) => w.id === workspaceId)) throw new Error("Workspace not found");
  return { settings: { ...demoWorkspaceSettings } };
}

export async function demoGovernanceWorkspaceSettingsPatch(token: string, workspaceId: string, patch: Record<string, unknown>) {
  assertDemoToken(token);
  await delay();
  if (!demoWorkspaces.some((w) => w.id === workspaceId)) throw new Error("Workspace not found");
  demoWorkspaceSettings = { ...demoWorkspaceSettings, ...patch };
  return { settings: { ...demoWorkspaceSettings } };
}

/** In-memory billing fixtures for VITE_USE_DEMO_DATA (simulated Stripe). */
let demoBillingAddress = {
  line1: "400 Market Street",
  line2: "Suite 1200",
  city: "San Francisco",
  region: "CA",
  postal: "94111",
  country: "US"
};

type DemoPm = {
  id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  is_default: boolean;
};

let demoBillingPaymentMethods: DemoPm[] = [
  { id: "pm_demo_visa", brand: "Visa", last4: "4242", exp_month: 8, exp_year: 2027, is_default: true },
  { id: "pm_demo_mc", brand: "Mastercard", last4: "9921", exp_month: 11, exp_year: 2026, is_default: false }
];

let demoBillingPlanKey = "professional";
let demoBillingCadence: "monthly" | "annual" = "monthly";
let demoBillingPeriodEndMs = Date.now() + 30 * 86400000;

const DEMO_INVOICES: {
  id: string;
  number: string;
  status: string;
  currency: string;
  amount: string;
  issued_at: string;
  hosted_invoice_url?: string;
  invoice_pdf?: string;
}[] = [
  {
    id: "in_demo_1",
    number: "DP-DEMO-0003",
    status: "paid",
    currency: "USD",
    amount: "249.00",
    issued_at: new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10),
    hosted_invoice_url: "https://stripe.com/docs",
    invoice_pdf: "https://stripe.com/docs"
  },
  {
    id: "in_demo_2",
    number: "DP-DEMO-0002",
    status: "paid",
    currency: "USD",
    amount: "249.00",
    issued_at: new Date(Date.now() - 58 * 86400000).toISOString().slice(0, 10),
    hosted_invoice_url: "https://stripe.com/docs",
    invoice_pdf: "https://stripe.com/docs"
  },
  {
    id: "in_demo_3",
    number: "DP-DEMO-0001",
    status: "paid",
    currency: "USD",
    amount: "249.00",
    issued_at: new Date(Date.now() - 88 * 86400000).toISOString().slice(0, 10),
    hosted_invoice_url: "https://stripe.com/docs",
    invoice_pdf: "https://stripe.com/docs"
  }
];

function demoPriceIdForPlan(): string {
  const suf = demoBillingCadence === "annual" ? "y" : "m";
  const slug = demoBillingPlanKey === "starter" ? "starter" : demoBillingPlanKey === "enterprise" ? "ent" : "pro";
  return `price_demo_${slug}_${suf}`;
}

export async function demoBillingConfig(token: string) {
  assertDemoToken(token);
  await delay();
  return {
    stripe_configured: true,
    publishable_key: "pk_test_demo_simulated",
    price_map: {
      starter: { monthly: "price_demo_starter_m", annual: "price_demo_starter_y" },
      professional: { monthly: "price_demo_pro_m", annual: "price_demo_pro_y" },
      enterprise: { monthly: "price_demo_ent_m", annual: "price_demo_ent_y" }
    } as Record<string, { monthly?: string; annual?: string }>
  };
}

export async function demoBillingStatus(token: string, _workspaceId: string) {
  assertDemoToken(token);
  await delay();
  return {
    stripe_configured: true,
    has_customer: true,
    customer_id: "cus_demo_simulated",
    subscription_id: "sub_demo_simulated",
    subscription_status: "active",
    price_id: demoPriceIdForPlan(),
    current_period_end: new Date(demoBillingPeriodEndMs).toISOString(),
    cancel_at_period_end: false,
    address: {
      line1: demoBillingAddress.line1,
      line2: demoBillingAddress.line2,
      city: demoBillingAddress.city,
      region: demoBillingAddress.region,
      postal: demoBillingAddress.postal,
      country: demoBillingAddress.country
    },
    payment_methods: demoBillingPaymentMethods.map((p) => ({ ...p }))
  };
}

export async function demoBillingInvoices(token: string, _workspaceId: string) {
  assertDemoToken(token);
  await delay();
  return { items: DEMO_INVOICES.map((i) => ({ ...i })) };
}

export async function demoBillingInvoice(token: string, _workspaceId: string, id: string) {
  assertDemoToken(token);
  await delay();
  const row = DEMO_INVOICES.find((i) => i.id === id);
  const amt = row?.amount ?? "249.00";
  const cur = row?.currency ?? "USD";
  const num = row?.number ?? id;
  const issued = row?.issued_at ?? new Date().toISOString().slice(0, 10);
  return {
    id,
    number: num,
    status: row?.status ?? "paid",
    currency: cur,
    amount_due: "0.00",
    subtotal: amt,
    total: amt,
    issued_at: issued,
    lines: [
      { description: "Dataplier platform (simulated)", amount: amt, currency: cur },
      { description: "Usage — jobs (simulated)", amount: "0.00", currency: cur }
    ],
    hosted_invoice_url: row?.hosted_invoice_url,
    invoice_pdf: row?.invoice_pdf
  };
}

export async function demoBillingCheckout(
  token: string,
  _workspaceId: string,
  body: { plan: string; billing_period: string; success_url: string; cancel_url: string; email: string }
) {
  assertDemoToken(token);
  await delay();
  const p = String(body.plan || "professional").toLowerCase();
  if (p === "starter" || p === "professional" || p === "enterprise") {
    demoBillingPlanKey = p;
  }
  const bp = String(body.billing_period || "monthly").toLowerCase();
  demoBillingCadence = bp === "annual" || bp === "yearly" ? "annual" : "monthly";
  demoBillingPeriodEndMs = Date.now() + (demoBillingCadence === "annual" ? 365 : 30) * 86400000;
  return { url: "" };
}

export async function demoBillingPortal(token: string, _workspaceId: string, _returnUrl: string) {
  assertDemoToken(token);
  await delay();
  return { url: "" };
}

export async function demoBillingCustomerPatch(
  token: string,
  _workspaceId: string,
  body: { line1: string; line2?: string; city: string; region: string; postal: string; country: string }
) {
  assertDemoToken(token);
  await delay();
  demoBillingAddress = {
    line1: body.line1,
    line2: body.line2 ?? "",
    city: body.city,
    region: body.region,
    postal: body.postal,
    country: body.country
  };
  return { status: "ok" };
}

export async function demoBillingPaymentMethodDefault(token: string, _workspaceId: string, paymentMethodId: string) {
  assertDemoToken(token);
  await delay();
  demoBillingPaymentMethods = demoBillingPaymentMethods.map((p) => ({
    ...p,
    is_default: p.id === paymentMethodId
  }));
  return { status: "ok" };
}

export async function demoBillingPaymentMethodDetach(token: string, _workspaceId: string, paymentMethodId: string) {
  assertDemoToken(token);
  await delay();
  if (demoBillingPaymentMethods.length <= 1) {
    throw new Error("Demo: keep at least one card on file.");
  }
  const removed = demoBillingPaymentMethods.find((p) => p.id === paymentMethodId);
  demoBillingPaymentMethods = demoBillingPaymentMethods.filter((p) => p.id !== paymentMethodId);
  if (removed?.is_default && demoBillingPaymentMethods.length) {
    demoBillingPaymentMethods[0] = { ...demoBillingPaymentMethods[0], is_default: true };
  }
  return { status: "ok" };
}

export async function demoBillingAddCard(
  token: string,
  _workspaceId: string,
  body: { name: string; number: string; expiry: string; cvc: string }
) {
  assertDemoToken(token);
  await delay();
  const v = validateCardForm({
    name: body.name,
    number: body.number,
    expiry: body.expiry,
    cvc: body.cvc
  });
  if (!v.ok) {
    throw new Error(v.message);
  }
  const pan = digitsOnly(body.number);
  const last4 = pan.slice(-4);
  const brand = guessBrandFromPan(pan);
  const exp = parseExpiry(body.expiry)!;
  demoBillingPaymentMethods.push({
    id: `pm_demo_${Date.now().toString(36)}`,
    brand,
    last4,
    exp_month: exp.month,
    exp_year: exp.year,
    is_default: false
  });
  return { status: "ok" };
}

export async function demoPipelineExportYaml(token: string, _workspaceId: string, pipelineId: string) {
  assertDemoToken(token);
  await delay();
  const meta = demoPipelines.find((p) => p.id === pipelineId);
  if (!meta) throw new Error("Pipeline not found");
  if (!pipelineSnapshots.has(pipelineId)) {
    pipelineSnapshots.set(pipelineId, defaultBuilderSnapshot(pipelineId, meta.name, meta.description));
  }
  const snap = pipelineSnapshots.get(pipelineId)!;
  const doc = {
    apiVersion: "dataplier.dev/v1",
    kind: "Pipeline",
    metadata: {
      id: pipelineId,
      name: snap.pipeline.name,
      workspaceId: DEMO_WORKSPACE_ID,
      status: snap.pipeline.status
    },
    spec: {
      description: snap.pipeline.description,
      builder_config: snap.pipeline.builder_config,
      nodes: snap.nodes,
      edges: snap.edges,
      orchestration: {
        export_engine: "dataplier-demo",
        compatible_with: ["temporal", "airflow-dagbag", "argo-workflows"],
        notes: "Demo export mirrors pipeline-service YAML."
      }
    }
  };
  return stringify(doc);
}