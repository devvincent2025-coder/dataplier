# Data Plier Architecture

## Product Posture

Data Plier is modeled as a universal data manipulation plane for enterprises that need secure, observable, chunk-aware data mobility across cloud warehouses, lakes, and operational databases.

## Core Service Topology

- `api-gateway`: ingress, JWT enforcement, request tracing, rate limiting.
- `auth-service`: identity, OAuth, RBAC, token minting, audit hooks.
- `connection-service`: external system connection definitions, health checks, metadata discovery.
- `dataset-service`: dataset browsing, schema preview, size estimation.
- `pipeline-service`: DAG persistence, Temporal scheduling, manual runs.
- `job-service`: job lifecycle, retries, chunk progress, execution visibility.
- `metadata-service`: operational metadata storage and lineage write APIs.
- `lineage-service`: graph-oriented lineage APIs backed by Neo4j semantics.
- `observability-service`: metrics fan-in and dashboard-friendly summaries.
- `transformation-service`: Arrow-first transformation planning and execution seams.
- `routing-engine`: autonomous route planner that optimizes cost, latency, and reliability.
- `schema-translator`: universal schema mapper and compatibility evaluator across warehouse and AI feature-store schemas.
- `time-machine`: snapshot catalog and replay/rollback planner for auditable dataset history.
- `ai-controller`: pipeline traffic controller that predicts congestion and recommends dynamic route/chunk adjustments.
- `chunk-engine`: source profiling and chunk-plan generation using capacity-aware heuristics.
- `transfer-worker`: Kafka consumer that moves chunk units through connectors and transformation seams.

## Security Model

- TLS 1.3 expected at ingress and service mesh boundaries.
- Secrets encrypted with AES-256 before database persistence.
- RBAC roles: `admin`, `engineer`, `viewer`.
- Audit logs emitted for auth, connection, and execution events.

## Data Lifecycle

1. User creates or schedules a pipeline.
2. Pipeline service starts a Temporal workflow.
3. Routing engine selects the best route and staging strategy.
4. Metadata service records the job and lineage anchors.
5. Chunk engine profiles the source dataset and emits chunk tasks.
6. Transfer workers consume chunk tasks from Kafka.
7. Transformation service applies schema, filter, join, or dedupe logic when required.
8. Schema translator reconciles destination contracts and nested type differences.
9. AI controller monitors queue and throughput signals for adaptive tuning.
10. Job service updates progress and retries failures.
11. Destination writes complete and lineage edges are persisted to Neo4j.

## Intelligence Plane

The autonomous router evaluates source freshness, dataset size, partitionability, worker capacity, network bandwidth, queue backlog, egress cost, and destination requirements to produce a recommended route and execution policy.

### Competitive feature slices (API)

- **Dataset list enrichment** (`dataset-service` `GET /datasets`): heuristics for `table_format` (native / delta / iceberg / object layouts), `cdc_eligible`, `data_contract` tier metadata, `transfer_cost_hint` (illustrative egress bands), and `multi_vendor_profile` for UI transparency vs warehouse-native tools.
- **DAG-as-code** (`pipeline-service` `GET /pipelines/{id}/export?format=yaml|json`): portable pipeline document for GitOps and orchestrator handoff (Temporal / Airflow-class workflows).
- **Policy snapshot** (`metadata-service` `GET /policy/summary`): RBAC, masking recommendations, egress policy, and integration hooks (workspace-scoped; extend with a real policy engine).
- **Column lineage scaffold** (`lineage-service` `GET /columns/dataset/{datasetId}`): column-level hop list derived from stored `schema_json` (OpenLineage-shaped evolution path).
- **Routing SLA + cost fields** (`routing-engine` `POST /route`): `sla_summary` and `cost_transparency` alongside chunk/compression decisions for explainable planning.

## Advanced Enterprise Differentiators

- Data Time Machine: snapshot, replay, and rollback capabilities for compliance and reproducibility.
- Universal Schema Translator: cross-system type mapping and structural reconciliation.
- AI Data Traffic Controller: congestion prediction, transfer tuning, and route adaptation.
