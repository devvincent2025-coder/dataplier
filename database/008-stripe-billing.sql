-- Stripe billing linkage per workspace (customer + subscription mirror).

CREATE TABLE IF NOT EXISTS workspace_stripe (
    workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    subscription_status TEXT,
    price_id TEXT,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_stripe_customer
    ON workspace_stripe (stripe_customer_id)
    WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_stripe_subscription
    ON workspace_stripe (stripe_subscription_id)
    WHERE stripe_subscription_id IS NOT NULL;
