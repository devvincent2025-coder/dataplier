-- Enterprise observability: SLO definitions, alert channels/rules, incidents, optional distributed trace spans.

CREATE TABLE IF NOT EXISTS obs_slo_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    sli_kind TEXT NOT NULL CHECK (sli_kind IN ('job_success_ratio', 'chunk_success_ratio', 'p95_job_duration_sec')),
    target_numeric DOUBLE PRECISION NOT NULL,
    comparison TEXT NOT NULL DEFAULT 'gte' CHECK (comparison IN ('gte', 'lte')),
    window_hours INT NOT NULL DEFAULT 720,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obs_slo_workspace ON obs_slo_definitions(workspace_id);

CREATE TABLE IF NOT EXISTS obs_alert_channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    channel_kind TEXT NOT NULL CHECK (channel_kind IN ('email', 'webhook', 'slack_incoming', 'pagerduty_events')),
    destination TEXT NOT NULL,
    headers_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obs_alert_ch_workspace ON obs_alert_channels(workspace_id);

CREATE TABLE IF NOT EXISTS obs_alert_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    threshold_kind TEXT NOT NULL CHECK (threshold_kind IN ('failed_jobs_24h', 'chunk_failure_rate', 'queue_backlog', 'slo_burn_fast')),
    threshold_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    channel_id UUID REFERENCES obs_alert_channels(id) ON DELETE SET NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    cooldown_minutes INT NOT NULL DEFAULT 60,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obs_alert_rules_workspace ON obs_alert_rules(workspace_id);

CREATE TABLE IF NOT EXISTS obs_alert_incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    rule_id UUID REFERENCES obs_alert_rules(id) ON DELETE SET NULL,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'closed')),
    fingerprint TEXT NOT NULL,
    fired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    deliveries_json JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_obs_incidents_workspace_fired ON obs_alert_incidents(workspace_id, fired_at DESC);

-- Optional native spans (OTel-compatible IDs); execution API also derives traces from jobs/chunks.
CREATE TABLE IF NOT EXISTS obs_trace_spans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    trace_id TEXT NOT NULL,
    span_id TEXT NOT NULL,
    parent_span_id TEXT,
    service_name TEXT NOT NULL,
    operation_name TEXT NOT NULL,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'error', 'unset')),
    attrs_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obs_spans_trace ON obs_trace_spans(workspace_id, trace_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_obs_spans_unique ON obs_trace_spans(trace_id, span_id);

-- Seed defaults for primary demo workspace (idempotent inserts).
INSERT INTO obs_slo_definitions (id, workspace_id, name, description, sli_kind, target_numeric, comparison, window_hours, enabled)
VALUES
  (
    'a1000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'Pipeline job success',
    'Rolling ratio of completed jobs vs terminal jobs (completed + failed + partial).',
    'job_success_ratio',
    0.999,
    'gte',
    720,
    true
  ),
  (
    'a1000000-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'Chunk transfer reliability',
    'Completed chunks vs chunks that reached a terminal outcome in the window.',
    'chunk_success_ratio',
    0.995,
    'gte',
    168,
    true
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO obs_alert_channels (id, workspace_id, name, channel_kind, destination, headers_json, enabled)
VALUES
  (
    'b2000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'Platform on-call email',
    'email',
    'oncall@dataplier.local',
    '{}'::jsonb,
    true
  ),
  (
    'b2000000-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'Webhook — incident bus',
    'webhook',
    'https://hooks.dataplier.local/routing/v1/incidents',
    '{"X-Dataplier-Plane":"governance"}'::jsonb,
    true
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO obs_alert_rules (id, workspace_id, name, description, threshold_kind, threshold_json, channel_id, enabled, cooldown_minutes)
VALUES
  (
    'c3000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'Failed jobs burst',
    'Pages on-call when any job fails in a rolling 24h window.',
    'failed_jobs_24h',
    '{"min":1}'::jsonb,
    'b2000000-0000-0000-0000-000000000001',
    true,
    30
  ),
  (
    'c3000000-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'SLO fast burn',
    'Routes to webhook when multi-window burn indicates risk.',
    'slo_burn_fast',
    '{"burn_threshold":3}'::jsonb,
    'b2000000-0000-0000-0000-000000000002',
    true,
    15
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO obs_alert_incidents (id, workspace_id, rule_id, severity, title, detail, status, fingerprint, fired_at, deliveries_json)
VALUES
  (
    'd4000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'c3000000-0000-0000-0000-000000000001',
    'warning',
    'Job failure detected',
    'One or more jobs finished with status failed in the last 24 hours.',
    'open',
    'failed_jobs_24h:v1',
    NOW() - INTERVAL '20 minutes',
    '[{"channel_id":"b2000000-0000-0000-0000-000000000001","channel_kind":"email","status":"queued"}]'::jsonb
  )
ON CONFLICT (id) DO NOTHING;

-- Sample distributed spans (control plane + worker) correlated to a seeded job trace.
INSERT INTO obs_trace_spans (id, workspace_id, trace_id, span_id, parent_span_id, service_name, operation_name, start_at, end_at, status, attrs_json)
VALUES
  (
    'e5000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    '88888888-8888-8888-8888-888888888881',
    '00root0000000000',
    NULL,
    'dataplier.control-plane',
    'POST /pipelines/run',
    NOW() - INTERVAL '16 minutes',
    NOW() - INTERVAL '15 minutes',
    'ok',
    '{"http.route":"/pipelines/run","http.status":202}'::jsonb
  ),
  (
    'e5000000-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    '88888888-8888-8888-8888-888888888881',
    '00job00000000000',
    '00root0000000000',
    'dataplier.job-runner',
    'job.orchestrate',
    NOW() - INTERVAL '15 minutes',
    NULL,
    'unset',
    '{"job.id":"88888888-8888-8888-8888-888888888881"}'::jsonb
  ),
  (
    'e5000000-0000-0000-0000-000000000003',
    '11111111-1111-1111-1111-111111111111',
    '88888888-8888-8888-8888-888888888881',
    '00chunk000000000',
    '00job00000000000',
    'dataplier.transfer-worker',
    'chunk.teleport',
    NOW() - INTERVAL '14 minutes',
    NOW() - INTERVAL '13 minutes',
    'ok',
    '{"chunk_index":0,"bytes":268435456}'::jsonb
  )
ON CONFLICT (trace_id, span_id) DO NOTHING;
