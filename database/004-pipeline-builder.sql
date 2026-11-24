-- Builder metadata and graph persistence (Pipeline Builder UI)
ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS builder_config JSONB NOT NULL DEFAULT '{}'::jsonb;
