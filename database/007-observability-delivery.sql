-- Webhook signing secret per channel (optional; falls back to env on delivery worker).
ALTER TABLE obs_alert_channels ADD COLUMN IF NOT EXISTS signing_secret TEXT;

-- Outbound alert deliveries with retry scheduling.
CREATE TABLE IF NOT EXISTS obs_alert_delivery_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    channel_id UUID REFERENCES obs_alert_channels(id) ON DELETE SET NULL,
    payload_json JSONB NOT NULL,
    idempotency_key TEXT NOT NULL,
    attempt_count INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 8,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'dead')),
    signature_hex TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_obs_delivery_idem ON obs_alert_delivery_queue(workspace_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_obs_delivery_due ON obs_alert_delivery_queue(status, next_attempt_at);
