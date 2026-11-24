-- Workspace governance: settings, API keys, pipeline templates, audit-friendly log samples.

CREATE TABLE IF NOT EXISTS workspace_settings (
    workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    secret_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_workspace ON api_keys(workspace_id);

CREATE TABLE IF NOT EXISTS pipeline_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    spec_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_templates_workspace ON pipeline_templates(workspace_id);

INSERT INTO workspace_settings (workspace_id, settings_json, updated_at)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    '{"default_region":"us-central1","require_connector_approval":false,"log_retention_days":90}'::jsonb,
    NOW()
)
ON CONFLICT (workspace_id) DO NOTHING;

INSERT INTO pipeline_templates (id, workspace_id, name, description, spec_json, created_by, created_at, updated_at)
VALUES (
    '55555555-5555-5555-5555-555555555501',
    '11111111-1111-1111-1111-111111111111',
    'Warehouse → Lakehouse sync',
    'Chunked replication with staging hop and schema translation.',
    '{"kind":"PipelineTemplate","builder_config":{"goal":"Replicate core facts","mode":"incremental","source_platform":"snowflake","destination_slug":"bigquery"},"nodes":[],"edges":[]}'::jsonb,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '3 days'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO logs (workspace_id, entity_type, entity_id, level, message, context, created_at)
VALUES
  (
    '11111111-1111-1111-1111-111111111111',
    'connection',
    '33333333-3333-3333-3333-333333333331',
    'info',
    'Connection health check succeeded',
    '{"name":"Primary Snowflake Warehouse"}'::jsonb,
    NOW() - INTERVAL '2 hours'
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'pipeline',
    NULL,
    'info',
    'Pipeline definition updated',
    '{"pipeline":"customers_core_to_bq"}'::jsonb,
    NOW() - INTERVAL '5 hours'
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'dataset',
    NULL,
    'info',
    'Discovery run completed',
    '{"datasets_discovered":4}'::jsonb,
    NOW() - INTERVAL '1 day'
  );
