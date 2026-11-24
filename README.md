# Data Plier

Data Plier is an enterprise-grade data engineering platform for connecting, chunking, transforming, and transferring large datasets across clouds and data systems. This repository provides a production-oriented monorepo scaffold spanning control plane APIs, workflow execution, chunk planning, worker execution, UI, and infrastructure.

## Repository Layout

- `frontend/`: React + TypeScript + Tailwind + React Flow dashboard.
- `api-gateway/`: Gin-based API gateway with JWT validation hooks, tracing, and Redis-aware middleware seams.
- `services/`: Domain microservices for auth, connections, datasets, pipelines, jobs, metadata, observability, lineage, and transformation.
- `routing-engine/`: Self-driving routing engine for autonomous data-flow strategy generation.
- `chunk-engine/`: FastAPI service that profiles datasets and emits chunk plans.
- `workers/`: Horizontally scalable Go transfer worker.
- `database/`: PostgreSQL schema and seed-friendly DDL.
- `samples/`: Example connection payloads and pipeline definitions.
- `infrastructure/`: Docker Compose, Helm chart, and Terraform scaffolding.
- `docs/`: Architecture, service responsibilities, and platform conventions.

## Platform Planes

1. Experience Plane: Web app, APIs, automation clients.
2. Control Plane: Gateway, auth, metadata, connection, pipeline, job services.
3. Workflow Plane: Temporal-driven orchestration.
4. Data Plane: Chunk engine, transfer workers, transformation execution.
5. Intelligence Plane: Autonomous routing and optimization logic.
6. Governance Plane: Metadata, lineage, audit, RBAC.
7. Operations Plane: Metrics, traces, logs, alerts.

## Getting Started

1. Copy `.env.example` to `.env`.
2. Start local infrastructure with Docker Compose.
3. Launch Go services, the chunk engine, and the frontend.

```bash
docker compose up -d postgres redis kafka zookeeper neo4j temporal grafana prometheus elasticsearch kibana
```

start the app services themselves, because right now only Postgres, Redis, Kafka, Neo4j, Temporal, Prometheus, Grafana, Elasticsearch, Kibana, and Zookeeper

```bash
docker compose up -d --build api-gateway auth-service connection-service dataset-service pipeline-service job-service metadata-service observability-service lineage-service chunk-engine transformation-service routing-engine transfer-worker frontend
```

```bash
docker compose ps
docker compose logs -f api-gateway
```

For the frontend, you have 2 options.
```bash
docker compose up -d --build frontend
```

If you want local dev mode:
```bash
cd frontend
npm install
npm run dev
```
http://localhost:3000

If you want Docker-based hot reload for frontend work:
```bash
docker compose up frontend-dev
docker compose exec -T postgres psql -U dataplier -d dataplier < "database/003-data-systems.sql"

```

Then open:
`http://localhost:3002`

`frontend-dev` runs the Vite dev server with file watching enabled, so UI changes auto-refresh without rebuilding the static Nginx frontend image.

Useful dashboard URLs:

Grafana: http://localhost:3001
Kibana: http://localhost:5601
Neo4j browser: http://localhost:7474
Prometheus: http://localhost:9091

Backend quick tests with curl:

curl http://localhost:8080/healthz

Useful functional tests:
curl -X POST http://localhost:8081/login

curl -X POST http://localhost:8090/chunk-plan \
  -H "Content-Type: application/json" \
  -d '{
    "dataset_name":"sales.orders",
    "estimated_bytes":9876543210,
    "estimated_rows":124500000,
    "partitions":16,
    "worker_capacity":8,
    "network_throughput_mb_s":256
  }'

curl -X POST http://localhost:8091/plan \
  -H "Content-Type: application/json" \
  -d '{
    "dataset_name":"customers.core",
    "operations":["schema_normalization","deduplicate"],
    "target_schema":{"customer_id":"string","email":"string"}
  }'

curl -X POST http://localhost:8092/route \
  -H "Content-Type: application/json" \
  -d '{
    "objective":"Make customer data available to the fraud detection AI system.",
    "source_system":"snowflake",
    "destination_system":"ai-feature-store",
    "dataset_size_gb":1200,
    "network_bandwidth_mbps":1800,
    "worker_capacity":24,
    "cost_preference":"balanced",
    "latency_slo_minutes":45
  }'

## Key Decisions

- Go handles gateway and control plane services for low-latency APIs.
- Python handles chunk planning, transformation-heavy data logic, and autonomous route optimization.
- Kafka transports chunk tasks between orchestrators and workers.
- PostgreSQL stores operational metadata; Neo4j stores lineage graphs.
- Temporal coordinates retries, schedules, and long-running workflows.

## Delivery Notes

This scaffold is intentionally organized for extension. The services include production-minded seams for RBAC, encryption, tracing, rate limiting, and observability, while leaving connector-specific runtime implementations easy to expand by domain teams.

## Self-Driving Data Flow Engine

The autonomous routing engine accepts a business goal plus system constraints, then proposes a transfer strategy by ranking possible source paths, intermediate hops, chunking behavior, and transformation requirements.


For the app flow:

Start auth-service and frontend.
Log in with architect@dataplier.io / password123.

## Discovery Adapters

Connection discovery now uses live adapter hooks across the full connector surface that is exposed in the UI:

- `PostgreSQL`
- `MySQL`
- `Databricks`
- `Snowflake`
- `BigQuery`
- `AWS S3`
- `Azure Blob`

Each adapter attempts real metadata discovery against the external platform, for example:

- `PostgreSQL` and `MySQL` via `information_schema`
- `Databricks` via Unity Catalog table APIs
- `Snowflake` via `information_schema`
- `BigQuery` via the BigQuery tables API and table metadata
- `AWS S3` via object prefix inventory
- `Azure Blob` via blob listing and prefix aggregation

The discovered datasets are persisted into PostgreSQL and become the lifecycle source of truth for:

- `Connections`
- `Dataset Explorer`
- `Pipeline Builder`
- `Jobs`

If a live discovery attempt fails or returns no objects, discovery now returns that failure directly instead of inventing source datasets. Pipeline templates are still supported, but they are created explicitly by users inside the pipeline builder as reusable workflow blueprints rather than being injected by backend discovery.
Open http://localhost:3000.
You should now see company-specific dashboard content tied to the signed-in session.

Start auth-service and frontend.
Log in with architect@dataplier.io / password123.
