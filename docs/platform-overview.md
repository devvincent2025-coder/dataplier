# Data Plier — Platform Overview

This document summarizes what the software is, how the repository is organized, whether it is ready to run end-to-end, and product directions that would strengthen competitiveness versus platforms such as **Databricks**, **Snowflake**, and **Apache Airflow**.

---

## What Data Plier Is

**Data Plier** is an enterprise-oriented **data movement and orchestration platform**. It is positioned as a *control plane* plus *data plane* for connecting heterogeneous sources (warehouses, lakes, databases, object stores), **discovering** datasets, **editing schemas**, **building pipelines** (manual or “autonomous” modes), **planning chunks** for large transfers, **running jobs** with visibility into chunk progress, and applying **intelligent routing** (cost, latency, capacity) across systems.

The product narrative (marketing + in-app copy) emphasizes:

- **Chunk-aware** replication at scale  
- **Cross-cloud / cross-system** connectivity  
- **Autonomous routing** (objectives, constraints, suggested routes)  
- **Governance**: metadata summaries, lineage graphs, observability-style metrics  
- **Security posture**: RBAC, encrypted secrets, audit seams (described in architecture; depth varies by service)

Architecturally, the platform is split into **planes** (experience, control, workflow, data, intelligence, governance, operations) as described in the root `README.md` and `docs/architecture.md`.

---

## Repository Layout and Roles

High-level map of top-level folders (excluding dependencies such as `node_modules` or local virtualenvs):

| Path | Purpose |
|------|---------|
| **`frontend/`** | React + TypeScript + Vite + Tailwind + React Flow. Main product UI: auth, workspaces, connections wizard, dataset explorer, schema editor, pipeline builder, pipelines run UI, jobs monitor, observability, routing center, and public marketing pages (landing, overview, pricing). Talks to the API gateway via `src/lib/api.ts`. Supports **demo mode** (`VITE_USE_DEMO_DATA`) with in-memory fixtures in `src/lib/demoBackend.ts` for UI/E2E without a live backend. |
| **`api-gateway/`** | Go HTTP **ingress**: routing to downstream services, JWT validation hooks, tracing/rate-limit seams per README. |
| **`services/`** | Go **microservices** (each with `cmd/service/main.go` where applicable): **auth**, **connection** (real discovery adapters for Postgres, MySQL, Databricks, Snowflake, BigQuery, S3, Azure Blob), **dataset**, **pipeline** (Temporal + Neo4j + chunk engine integration per compose), **job**, **metadata**, **observability**, **lineage** (Neo4j-oriented). |
| **`routing-engine/`** | Python/FastAPI **autonomous routing** API (strategy, hops, chunk hints, confidence, warnings). Can call observability and connection services for richer decisions. |
| **`chunk-engine/`** | Python/FastAPI **chunk planning** (dataset profiling heuristics, Kafka task emission seams). |
| **`workers/transfer-worker/`** | Go **Kafka consumer** that executes chunk transfer work and reports back to job-service. |
| **`schema-translator/`**, **`time-machine/`**, **`ai-controller/`** | Python services referenced in architecture docs and `docker-compose.yml` for cross-schema mapping, snapshot/replay concepts, and adaptive traffic control. |
| **`services/transformation-service/`** | Transformation planning/execution seam (per compose and architecture). |
| **`database/`** | PostgreSQL **DDL**, seeds, data-system catalog SQL, pipeline-builder migrations. |
| **`infrastructure/`** | **Docker Compose** fragments (e.g. Prometheus), **Helm** chart templates, **Terraform** scaffolding for Kubernetes-style deployment. |
| **`docs/`** | `architecture.md` (service topology, lifecycle, security model) and this overview. |
| **`samples/`** | Example payloads / pipeline snippets (per README). |
| **`scripts/`** | Operational helpers (e.g. SQL seeds for external systems). |
| **`docker-compose.yml`** | Orchestrates Postgres, Redis, Kafka, Zookeeper, Neo4j, Elasticsearch, Kibana, Prometheus, Grafana, Temporal, API gateway, core services, chunk engine, routing engine, workers, and frontend. |

### Frontend routes (behavioral snapshot)

- **Implemented product flows**: `/dashboard`, `/workspaces`, `/connections`, `/dataset-explorer`, `/schema-editor`, `/pipelines`, `/pipeline-builder`, `/jobs-monitor`, `/observability`, `/routing-center`, auth (`/login`, `/signup`, `/forgot-password`), marketing (`/`, `/overview`, `/product`, `/philosophy`, `/pricing`).  
- **Placeholder / stub pages** (generic template lists): `/template-library`, `/roles`, `/api-keys`, `/audit-trail`, `/settings`. These are not full product modules yet.

---

## Is the System “Ready” and Will It Work as Required?

**Short answer:** The repo is a **serious, multi-service scaffold** with **real connector logic** in the connection service and a **fully wired SPA** against a documented API contract. It can run as a **local platform** when infrastructure and services are brought up with Docker Compose and a correct `.env`. Whether it meets *your* production requirements depends on non-code factors: SLAs, compliance, connector coverage, operational maturity, and hardening.

### What works well today

- **Architecture and boundaries** are clear: gateway → domain services → Temporal/Kafka/Neo4j/Postgres.  
- **Connection discovery** is explicitly implemented for multiple vendors (see root `README.md` “Discovery Adapters”).  
- **Frontend** covers the main engineer journey: connect → discover → explore datasets → edit schema → build pipeline → run/monitor → routing and governance summaries.  
- **Demo mode** lets you validate UX and flows **without** standing up the full stack (`frontend` + `VITE_USE_DEMO_DATA` + demo credentials in `src/config/demoMode.ts`).  
- **Docker Compose** provides a credible path to run gateway, services, chunk engine, routing engine, worker, and databases together.

### Gaps and risks (be explicit)

1. **Placeholder app areas**: Template library, fine-grained RBAC UI, API keys, audit trail, and settings are **not** full implementations; they are route stubs.  
2. **“Required” vs aspirational**: `docs/architecture.md` describes **time-machine**, **AI controller**, **schema translator**, and rich governance flows as part of the *vision*; implementation depth across those services may lag the narrative—treat them as **incremental** unless you have verified them in your environment.  
3. **Operational readiness**: Production needs key management, backups, upgrades, SLOs, penetration testing, and connector-specific quotas—this repository gives **seams** (README mentions RBAC, encryption, tracing) but enterprise readiness is **more than the code**.  
4. **Single-environment truth**: The UI assumes a working gateway at `localhost:8080` (see `frontend/src/lib/api.ts`). Any drift between OpenAPI/contracts and the UI must be tested after service changes.  
5. **Testing in CI**: Full-stack automated tests are not guaranteed from this overview alone; validate `go test`, service integration tests, and frontend tests in your pipeline.

**Verdict:** Suitable for **development, demos, and incremental hardening** toward production. Not automatically “complete” versus hyperscale SaaS without your own QA, security review, and roadmap for the stubbed areas.

---

## Recommendations to Compete with Databricks, Snowflake, and Airflow

These incumbents win on **depth**: notebooks + jobs + SQL + governance (Databricks), **warehouse-native** SQL, sharing, and replication (Snowflake), and **DAG authoring + scheduling + ecosystem** (Airflow). Data Plier’s wedge is **portable, chunk-smart movement and routing across systems**. To compete credibly, prioritize differentiators *and* close table-stakes gaps.

### 1. Orchestration and developer experience (vs Airflow)

- **First-class DAG as code**: Export/import pipelines as YAML or Python SDK (versioned, reviewed in Git).  
- **Scheduling SLAs**: Deadlines, SLA alerts, backfill semantics, and clear retry policies per task/chunk.  
- **Observability parity**: Structured run history, task duration percentiles, dependency graph view, and integration with OpenTelemetry everywhere.  
- **Ecosystem**: Webhooks, REST/CLI for CI, and a plugin model for operators (similar spirit to Airflow providers).

### 2. Warehouse and lakehouse depth (vs Snowflake / Databricks)

- **Incremental sync**: CDC-native connectors, merge keys, dedupe strategies, and watermark management surfaced in the UI.  
- **Cost transparency**: Estimated egress/ingress, warehouse credit hints, and routing choices that explain **money vs latency** tradeoffs.  
- **Unity Catalog / Iceberg / Delta**: First-class table formats, partition evolution, and schema evolution policies in the schema editor.  
- **Cross-region and residency**: Data sovereignty routing rules (EU-only paths, etc.).

### 3. Collaboration, governance, and security (all three)

- **Data products**: Published datasets with contracts (SLA, owner, schema version, deprecation).  
- **Lineage depth**: Column-level lineage, transformation logic fingerprints, and integration with external catalogs (OpenLineage, DataHub).  
- **Policy engine**: Row/column masking rules tied to RBAC and workspace boundaries.  
- **Enterprise SSO / SCIM**: Full lifecycle for users and groups (stubs exist conceptually; product needs end-to-end stories).

### 4. Differentiators Data Plier can own

- **Autonomous routing + explainability**: Make the routing center the “copilot” for *where* and *how* data should flow, with auditable rationale (you already surface confidence, warnings, and signals in the UI contract).  
- **Chunk intelligence**: Adaptive chunk sizes based on live throughput and failure rates (tight loop with workers and observability).  
- **Universal movement**: Position as the neutral layer when customers refuse single-vendor lock-in—strong multi-vendor connectors and schema translation.  
- **Time-travel and replay** (if built out): Auditable re-run of pipelines for compliance—rarely done well as a unified product.

### 5. Go-to-market clarity

- **One killer vertical**: e.g. “Snowflake → BigQuery with governed chunk replication” documented with benchmarks.  
- **Security narrative**: Completed pen-test summaries, SOC2 roadmap, and customer-facing architecture diagrams.

---

## Related Documents

- Root **`README.md`**: quick start, curl examples, discovery adapter list.  
- **`docs/architecture.md`**: service topology, data lifecycle, security model, intelligence plane.

---

*This file is descriptive and based on repository layout and documentation as of the last update. For deployment specifics, follow `README.md` and your own operational runbooks.*
