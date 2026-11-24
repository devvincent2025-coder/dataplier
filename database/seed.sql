INSERT INTO workspaces (id, name, slug, tier, created_at)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Enterprise Control', 'enterprise-control', 'enterprise', NOW()),
  ('22222222-2222-2222-2222-222222222222', 'Coca-Cola Analytics', 'coca-cola-analytics', 'enterprise', NOW())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO users (id, workspace_id, email, password_hash, full_name, role, oauth_provider, created_at, last_login_at)
VALUES
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '11111111-1111-1111-1111-111111111111',
    'architect@dataplier.io',
    'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
    'Data Plier Architect',
    'admin',
    NULL,
    NOW() - INTERVAL '14 days',
    NOW() - INTERVAL '10 minutes'
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '22222222-2222-2222-2222-222222222222',
    'ops@cocacola.example',
    'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
    'Adaeze Okafor',
    'engineer',
    'google',
    NOW() - INTERVAL '7 days',
    NOW() - INTERVAL '45 minutes'
  )
ON CONFLICT (email) DO NOTHING;

INSERT INTO connections (id, workspace_id, name, platform, encrypted_credentials, config, status, last_tested_at, created_by, created_at)
VALUES
  (
    '33333333-3333-3333-3333-333333333331',
    '11111111-1111-1111-1111-111111111111',
    'Primary Snowflake Warehouse',
    'snowflake',
    decode('746573742d6372656473', 'hex'),
    '{"account":"enterprise_main","warehouse":"compute_wh","database":"analytics"}'::jsonb,
    'healthy',
    NOW() - INTERVAL '20 minutes',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    NOW() - INTERVAL '10 days'
  ),
  (
    '33333333-3333-3333-3333-333333333332',
    '11111111-1111-1111-1111-111111111111',
    'Fraud Feature Store',
    'bigquery',
    decode('746573742d63726564732d32', 'hex'),
    '{"project_id":"fraud-lab","dataset":"features","location":"US"}'::jsonb,
    'healthy',
    NOW() - INTERVAL '35 minutes',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    NOW() - INTERVAL '9 days'
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    '22222222-2222-2222-2222-222222222222',
    'Retail Databricks Lakehouse',
    'databricks',
    decode('746573742d63726564732d33', 'hex'),
    '{"host":"https://adb-retail.databricks.com","catalog":"main","warehouse":"retail_wh"}'::jsonb,
    'healthy',
    NOW() - INTERVAL '50 minutes',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    NOW() - INTERVAL '6 days'
  )
ON CONFLICT DO NOTHING;

INSERT INTO datasets (id, workspace_id, connection_id, external_id, name, schema_json, estimated_rows, estimated_bytes, discovered_at)
VALUES
  (
    '44444444-4444-4444-4444-444444444441',
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333331',
    'snowflake://analytics/customers_core',
    'customers.core',
    '{"customer_id":"string","region":"string","risk_band":"string","updated_at":"timestamp"}'::jsonb,
    185000000,
    12670153523,
    NOW() - INTERVAL '2 hours'
  ),
  (
    '44444444-4444-4444-4444-444444444442',
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333332',
    'bigquery://features/fraud_features',
    'fraud.features',
    '{"customer_id":"string","feature_vector":"record","scored_at":"timestamp"}'::jsonb,
    91000000,
    7147483648,
    NOW() - INTERVAL '90 minutes'
  ),
  (
    '44444444-4444-4444-4444-444444444443',
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333',
    'databricks://main/clickstream_events',
    'retail.clickstream_events',
    '{"session_id":"string","store_id":"string","event_name":"string","event_time":"timestamp"}'::jsonb,
    420000000,
    24870000000,
    NOW() - INTERVAL '75 minutes'
  )
ON CONFLICT DO NOTHING;

INSERT INTO pipelines (id, workspace_id, name, description, schedule_cron, status, created_by, created_at, updated_at)
VALUES
  (
    '55555555-5555-5555-5555-555555555551',
    '11111111-1111-1111-1111-111111111111',
    'Customer Data For Fraud AI',
    'Publishes governed customer data into the fraud detection feature pipeline.',
    '0 */4 * * *',
    'scheduled',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '20 minutes'
  ),
  (
    '55555555-5555-5555-5555-555555555552',
    '22222222-2222-2222-2222-222222222222',
    'Retail Clickstream Feature Sync',
    'Moves clickstream events into a feature-ready analytics destination.',
    '*/30 * * * *',
    'running',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '5 minutes'
  )
ON CONFLICT DO NOTHING;

INSERT INTO pipeline_nodes (id, pipeline_id, node_type, label, position_x, position_y, config)
VALUES
  ('66666666-6666-6666-6666-666666666661', '55555555-5555-5555-5555-555555555551', 'source', 'Snowflake Source', 0, 120, '{"dataset":"customers.core"}'::jsonb),
  ('66666666-6666-6666-6666-666666666662', '55555555-5555-5555-5555-555555555551', 'chunk', 'Adaptive Chunk Engine', 240, 120, '{"target_chunk_mb":512}'::jsonb),
  ('66666666-6666-6666-6666-666666666663', '55555555-5555-5555-5555-555555555551', 'transform', 'Schema Normalize', 480, 120, '{"mode":"schema_normalization"}'::jsonb),
  ('66666666-6666-6666-6666-666666666664', '55555555-5555-5555-5555-555555555551', 'destination', 'BigQuery Feature Store', 720, 120, '{"dataset":"fraud.features"}'::jsonb),
  ('66666666-6666-6666-6666-666666666665', '55555555-5555-5555-5555-555555555552', 'source', 'Databricks Clickstream', 0, 220, '{"dataset":"retail.clickstream_events"}'::jsonb),
  ('66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555552', 'filter', 'Session Clean', 240, 220, '{"rule":"drop_null_session_id"}'::jsonb),
  ('66666666-6666-6666-6666-666666666667', '55555555-5555-5555-5555-555555555552', 'destination', 'Analytics Sink', 480, 220, '{"dataset":"retail.analytics_clickstream"}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO pipeline_edges (id, pipeline_id, source_node_id, target_node_id, edge_type, config)
VALUES
  ('77777777-7777-7777-7777-777777777771', '55555555-5555-5555-5555-555555555551', '66666666-6666-6666-6666-666666666661', '66666666-6666-6666-6666-666666666662', 'default', '{}'::jsonb),
  ('77777777-7777-7777-7777-777777777772', '55555555-5555-5555-5555-555555555551', '66666666-6666-6666-6666-666666666662', '66666666-6666-6666-6666-666666666663', 'default', '{}'::jsonb),
  ('77777777-7777-7777-7777-777777777773', '55555555-5555-5555-5555-555555555551', '66666666-6666-6666-6666-666666666663', '66666666-6666-6666-6666-666666666664', 'default', '{}'::jsonb),
  ('77777777-7777-7777-7777-777777777774', '55555555-5555-5555-5555-555555555552', '66666666-6666-6666-6666-666666666665', '66666666-6666-6666-6666-666666666666', 'default', '{}'::jsonb),
  ('77777777-7777-7777-7777-777777777775', '55555555-5555-5555-5555-555555555552', '66666666-6666-6666-6666-666666666666', '66666666-6666-6666-6666-666666666667', 'default', '{}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO jobs (id, pipeline_id, triggered_by, status, source_platform, destination_platform, started_at, finished_at, total_chunks, completed_chunks, failed_chunks)
VALUES
  (
    '88888888-8888-8888-8888-888888888881',
    '55555555-5555-5555-5555-555555555551',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'running',
    'snowflake',
    'bigquery',
    NOW() - INTERVAL '15 minutes',
    NULL,
    64,
    47,
    1
  ),
  (
    '88888888-8888-8888-8888-888888888882',
    '55555555-5555-5555-5555-555555555552',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'completed',
    'databricks',
    'bigquery',
    NOW() - INTERVAL '2 hours',
    NOW() - INTERVAL '75 minutes',
    80,
    80,
    0
  )
ON CONFLICT DO NOTHING;

INSERT INTO job_chunks (id, job_id, chunk_index, state, source_partition, destination_partition, attempts, bytes_processed, started_at, finished_at)
VALUES
  ('99999999-9999-9999-9999-999999999991', '88888888-8888-8888-8888-888888888881', 0, 'completed', 'p0', 'fraud.features.p0', 1, 268435456, NOW() - INTERVAL '15 minutes', NOW() - INTERVAL '14 minutes'),
  ('99999999-9999-9999-9999-999999999992', '88888888-8888-8888-8888-888888888881', 1, 'running', 'p1', 'fraud.features.p1', 1, 201326592, NOW() - INTERVAL '13 minutes', NULL),
  ('99999999-9999-9999-9999-999999999993', '88888888-8888-8888-8888-888888888882', 0, 'completed', 'retail_0', 'analytics_0', 1, 536870912, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '118 minutes')
ON CONFLICT DO NOTHING;

INSERT INTO logs (id, workspace_id, entity_type, entity_id, level, message, context, created_at)
VALUES
  (
    '10101010-1010-1010-1010-101010101010',
    '11111111-1111-1111-1111-111111111111',
    'job',
    '88888888-8888-8888-8888-888888888881',
    'info',
    'Adaptive route selected with Snowflake source and BigQuery feature sink.',
    '{"route":["snowflake","chunk-engine","transform","bigquery"],"workspace":"Enterprise Control"}'::jsonb,
    NOW() - INTERVAL '14 minutes'
  ),
  (
    '20202020-2020-2020-2020-202020202020',
    '22222222-2222-2222-2222-222222222222',
    'pipeline',
    '55555555-5555-5555-5555-555555555552',
    'warn',
    'Clickstream sync experienced elevated queue backlog and auto-scaled workers.',
    '{"backlog":142,"autoscaled_workers":12}'::jsonb,
    NOW() - INTERVAL '65 minutes'
  )
ON CONFLICT DO NOTHING;
