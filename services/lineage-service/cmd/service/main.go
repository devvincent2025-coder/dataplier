package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	_ "github.com/lib/pq"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

type lineageChunkEventRequest struct {
	WorkspaceID string `json:"workspace_id"`
	PipelineID  string `json:"pipeline_id"`
	JobID       string `json:"job_id"`
	ChunkIndex  int    `json:"chunk_index"`
	State       string `json:"state"`
	DatasetName string `json:"dataset_name"`
}

func main() {
	db := mustOpenDB()
	defer db.Close()
	neo4jDriver := openNeo4j()
	if neo4jDriver != nil {
		defer neo4jDriver.Close(context.Background())
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"service": "lineage-service", "status": "ok"})
	})
	mux.HandleFunc("GET /graph/job/{jobId}", func(w http.ResponseWriter, r *http.Request) {
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}
		jobID := strings.TrimSpace(r.PathValue("jobId"))
		if jobID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "job_id required"})
			return
		}
		if neo4jDriver == nil {
			writeJSON(w, http.StatusOK, map[string]any{
				"nodes": []any{},
				"links": []any{},
				"note":  "neo4j_unavailable",
			})
			return
		}
		graph, err := buildJobGraphFromNeo4j(r.Context(), neo4jDriver, workspaceID, jobID)
		if err != nil {
			log.Printf("job lineage graph: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, graph)
	})
	mux.HandleFunc("/graph", func(w http.ResponseWriter, r *http.Request) {
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}

		if neo4jDriver != nil {
			graph, err := buildGraphFromNeo4j(neo4jDriver, workspaceID)
			if err == nil {
				writeJSON(w, http.StatusOK, graph)
				return
			}
			log.Printf("neo4j graph fallback to postgres: %v", err)
		}

		rows, err := db.Query(`
			SELECT d.name, c.platform
			FROM datasets d
			JOIN connections c ON c.id = d.connection_id
			WHERE d.workspace_id = $1
			ORDER BY d.discovered_at DESC
		`, workspaceID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		defer rows.Close()

		datasets := []map[string]string{}
		for rows.Next() {
			var name, system string
			if err := rows.Scan(&name, &system); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			datasets = append(datasets, map[string]string{"id": name, "system": system})
		}

		edgeRows, err := db.Query(`
			SELECT p.name, COALESCE(j.source_platform, ''), COALESCE(j.destination_platform, '')
			FROM pipelines p
			LEFT JOIN jobs j ON j.pipeline_id = p.id
			WHERE p.workspace_id = $1
			ORDER BY p.updated_at DESC
		`, workspaceID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		defer edgeRows.Close()

		edges := []map[string]string{}
		events := []map[string]string{}
		for edgeRows.Next() {
			var pipelineName, sourcePlatform, destinationPlatform string
			if err := edgeRows.Scan(&pipelineName, &sourcePlatform, &destinationPlatform); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			edges = append(edges, map[string]string{
				"source":    sourcePlatform,
				"target":    destinationPlatform,
				"operation": pipelineName,
			})
			events = append(events, map[string]string{
				"user":     "workspace-user",
				"action":   "pipeline_run",
				"pipeline": pipelineName,
			})
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"datasets": datasets,
			"edges":    edges,
			"events":   events,
		})
	})
	mux.HandleFunc("/chunk-lineage", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		if neo4jDriver == nil {
			writeJSON(w, http.StatusAccepted, map[string]any{"status": "noop", "reason": "neo4j_unavailable"})
			return
		}
		var req lineageChunkEventRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
			return
		}
		if req.WorkspaceID == "" || req.JobID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "workspace_id and job_id are required"})
			return
		}
		if err := writeChunkLineage(r.Context(), neo4jDriver, req); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusAccepted, map[string]any{"status": "recorded"})
	})
	// Column-level lineage scaffold (Postgres-backed; OpenLineage-compatible shape).
	mux.HandleFunc("GET /columns/dataset/{datasetId}", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}
		datasetID := strings.TrimSpace(r.PathValue("datasetId"))
		if datasetID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "dataset id required"})
			return
		}
		var name, externalID, platform, schemaText string
		err := db.QueryRow(`
			SELECT d.name, d.external_id, c.platform, d.schema_json::text
			FROM datasets d
			JOIN connections c ON c.id = d.connection_id
			WHERE d.workspace_id = $1 AND d.id = $2::uuid
		`, workspaceID, datasetID).Scan(&name, &externalID, &platform, &schemaText)
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "dataset not found"})
			return
		}
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		var schema map[string]any
		_ = json.Unmarshal([]byte(schemaText), &schema)
		if schema == nil {
			schema = map[string]any{}
		}
		pipelineRefs := []map[string]any{}
		pRows, qerr := db.Query(`
			SELECT p.id::text, p.name, p.status, max(p.updated_at) AS mu
			FROM pipelines p
			WHERE p.workspace_id = $1
			  AND (
				lower(trim(COALESCE(p.builder_config->>'dataset_name',''))) IN (lower(trim($2)), lower(trim($3)))
				OR position(lower($2) in lower(p.builder_config::text)) > 0
				OR position(lower($3) in lower(p.builder_config::text)) > 0
			  )
			GROUP BY 1, 2, 3
			ORDER BY mu DESC
			LIMIT 25
		`, workspaceID, name, externalID)
		if qerr == nil {
			defer pRows.Close()
			for pRows.Next() {
				var pid, pname, pstatus string
				var mu time.Time
				if err := pRows.Scan(&pid, &pname, &pstatus, &mu); err != nil {
					break
				}
				pipelineRefs = append(pipelineRefs, map[string]any{
					"id": pid, "name": pname, "status": pstatus,
				})
			}
		}

		jobRefs := []map[string]any{}
		if len(pipelineRefs) > 0 {
			ids := make([]string, 0, len(pipelineRefs))
			for _, pr := range pipelineRefs {
				if s, ok := pr["id"].(string); ok && s != "" {
					ids = append(ids, s)
				}
			}
			if len(ids) > 0 {
				ph := make([]string, len(ids))
				args := []any{workspaceID}
				for i, id := range ids {
					ph[i] = fmt.Sprintf("$%d", i+2)
					args = append(args, id)
				}
				jq := fmt.Sprintf(`
					SELECT j.id::text, j.status, p.id::text, p.name
					FROM jobs j
					JOIN pipelines p ON p.id = j.pipeline_id
					WHERE p.workspace_id = $1 AND j.pipeline_id IN (%s)
					ORDER BY j.started_at DESC
					LIMIT 20
				`, strings.Join(ph, ","))
				jRows, jerr := db.Query(jq, args...)
				if jerr == nil {
					defer jRows.Close()
					for jRows.Next() {
						var jid, jstat, ppid, ppname string
						if err := jRows.Scan(&jid, &jstat, &ppid, &ppname); err != nil {
							break
						}
						jobRefs = append(jobRefs, map[string]any{
							"id": jid, "status": jstat, "pipeline_id": ppid, "pipeline_name": ppname,
						})
					}
				}
			}
		}

		olNamespace := fmt.Sprintf("dataplier:%s:%s", workspaceID, platform)
		olDatasetName := name
		openlineageFields := map[string]any{}
		olSchemaFields := []map[string]any{}
		columns := []map[string]any{}
		edges := []map[string]any{}
		n := 0
		maxPlEdges := 5
		if len(pipelineRefs) < maxPlEdges {
			maxPlEdges = len(pipelineRefs)
		}
		for colName, typ := range schema {
			if n >= 200 {
				break
			}
			srcID := "src:" + datasetID + ":" + colName
			tgtID := "dst:published:" + colName
			openlineageFields[colName] = map[string]any{
				"inputFields": []map[string]string{{
					"namespace": olNamespace,
					"name":      olDatasetName,
					"field":     colName,
				}},
				"transformationDescription": "Dataplier schema plane (physical → published facet scaffold).",
				"transformationType":        "INDIRECT",
			}
			olSchemaFields = append(olSchemaFields, map[string]any{
				"name": colName, "type": fmt.Sprint(typ),
			})
			columns = append(columns, map[string]any{
				"name":           colName,
				"source_type":    fmt.Sprint(typ),
				"facet":          "physical",
				"dataset_name":   name,
				"platform":       platform,
				"upstream_id":    srcID,
				"published_id":   tgtID,
			})
			edges = append(edges, map[string]any{
				"source": srcID, "target": "xf:dataplier-schema", "rel": "extract", "column": colName,
			})
			edges = append(edges, map[string]any{
				"source": "xf:dataplier-schema", "target": tgtID, "rel": "publish", "column": colName,
			})
			for pi := 0; pi < maxPlEdges; pi++ {
				pr := pipelineRefs[pi]
				if pid, ok := pr["id"].(string); ok {
					edges = append(edges, map[string]any{
						"source": srcID, "target": "pl:" + pid, "rel": "referenced_by_pipeline", "column": colName,
					})
				}
			}
			n++
		}

		openlineage := map[string]any{
			"producer":     "https://dataplier.dev/lineage-service",
			"spec_version": "1-0-0",
			"dataset": map[string]any{
				"namespace": olNamespace,
				"name":      olDatasetName,
				"facets": map[string]any{
					"schema": map[string]any{
						"_producer":  "https://dataplier.dev/lineage-service",
						"_schemaURL": "https://openlineage.io/spec/facets/1-0-0/SchemaDatasetFacet.json",
						"fields":     olSchemaFields,
					},
					"columnLineage": map[string]any{
						"_producer":  "https://dataplier.dev/lineage-service",
						"_schemaURL": "https://openlineage.io/spec/facets/1-0-0/ColumnLineageDatasetFacet.json",
						"fields":     openlineageFields,
					},
				},
			},
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"dataset_id":     datasetID,
			"dataset_name":   name,
			"external_id":    externalID,
			"platform":       platform,
			"schema_facets":  []string{"physical", "published"},
			"columns":        columns,
			"edges":          edges,
			"pipeline_refs":  pipelineRefs,
			"job_refs":       jobRefs,
			"openlineage":    openlineage,
			"parity_basis":   "postgres_schema_json_plus_pipeline_builder_config",
			"note":           "Synthetic column hops + workspace pipeline references; swap in OpenLineage events for production graphs.",
		})
	})

	log.Println("lineage-service listening on :8088")
	_ = http.ListenAndServe(":8088", withCORS(mux))
}

func openNeo4j() neo4j.DriverWithContext {
	uri := getenv("NEO4J_URI", "")
	if uri == "" {
		return nil
	}
	username := getenv("NEO4J_USER", "neo4j")
	password := getenv("NEO4J_PASSWORD", "dataplier")
	driver, err := neo4j.NewDriverWithContext(uri, neo4j.BasicAuth(username, password, ""))
	if err != nil {
		log.Printf("neo4j disabled: %v", err)
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := driver.VerifyConnectivity(ctx); err != nil {
		log.Printf("neo4j connectivity failed: %v", err)
		_ = driver.Close(ctx)
		return nil
	}
	return driver
}

func buildGraphFromNeo4j(driver neo4j.DriverWithContext, workspaceID string) (map[string]any, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	session := driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(ctx)

	datasets := []map[string]string{}
	edges := []map[string]string{}
	events := []map[string]string{}

	_, err := session.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		dsRes, err := tx.Run(ctx, `
			MATCH (d:Dataset {workspace_id: $workspace_id})
			RETURN d.name AS name, d.system AS system
			LIMIT 200
		`, map[string]any{"workspace_id": workspaceID})
		if err != nil {
			return nil, err
		}
		for dsRes.Next(ctx) {
			name, _ := dsRes.Record().Get("name")
			system, _ := dsRes.Record().Get("system")
			datasets = append(datasets, map[string]string{
				"id":     asString(name),
				"system": asString(system),
			})
		}

		edgeRes, err := tx.Run(ctx, `
			MATCH (s:Dataset {workspace_id: $workspace_id})-[r:FLOWS_TO]->(t:Dataset {workspace_id: $workspace_id})
			RETURN s.name AS source, t.name AS target, COALESCE(r.operation, 'transform') AS operation
			LIMIT 400
		`, map[string]any{"workspace_id": workspaceID})
		if err != nil {
			return nil, err
		}
		for edgeRes.Next(ctx) {
			source, _ := edgeRes.Record().Get("source")
			target, _ := edgeRes.Record().Get("target")
			operation, _ := edgeRes.Record().Get("operation")
			edges = append(edges, map[string]string{
				"source": asString(source), "target": asString(target), "operation": asString(operation),
			})
		}
		return nil, nil
	})
	if err != nil {
		return nil, err
	}

	if len(events) == 0 {
		events = append(events, map[string]string{
			"user": "system", "action": "lineage_graph_query", "pipeline": "neo4j",
		})
	}
	return map[string]any{"datasets": datasets, "edges": edges, "events": events}, nil
}

func buildJobGraphFromNeo4j(ctx context.Context, driver neo4j.DriverWithContext, workspaceID, jobID string) (map[string]any, error) {
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	session := driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(ctx)

	type node struct {
		ID    string         `json:"id"`
		Kind  string         `json:"kind"`
		Label string         `json:"label"`
		Meta  map[string]any `json:"meta,omitempty"`
	}
	type link struct {
		Source string `json:"source"`
		Target string `json:"target"`
		Rel    string `json:"rel"`
	}
	nodes := []node{}
	links := []link{}
	seen := map[string]bool{}
	jobAbsent := false

	addNode := func(id, kind, label string, meta map[string]any) {
		if id == "" || seen[id] {
			return
		}
		seen[id] = true
		nodes = append(nodes, node{ID: id, Kind: kind, Label: label, Meta: meta})
	}

	_, err := session.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		res, err := tx.Run(ctx, `
			MATCH (j:Job {workspace_id: $workspace_id, id: $job_id})
			OPTIONAL MATCH (p:Pipeline)-[:TRIGGERED]->(j)
			OPTIONAL MATCH (j)-[:HAS_CHUNK]->(c:Chunk)
			OPTIONAL MATCH (j)-[:READS]->(dr:Dataset)
			OPTIONAL MATCH (j)-[:WRITES]->(dw:Dataset)
			RETURN p.id AS pipeline_id,
			       j.id AS job_id,
			       collect(DISTINCT c) AS chunks,
			       collect(DISTINCT dr) AS reads,
			       collect(DISTINCT dw) AS writes
		`, map[string]any{"workspace_id": workspaceID, "job_id": jobID})
		if err != nil {
			return nil, err
		}
		if !res.Next(ctx) {
			jobAbsent = true
			return nil, nil
		}
		rec := res.Record()
		pipeVal, _ := rec.Get("pipeline_id")
		jobVal, _ := rec.Get("job_id")
		chunksVal, _ := rec.Get("chunks")
		readsVal, _ := rec.Get("reads")
		writesVal, _ := rec.Get("writes")

		jid := asString(jobVal)
		if jid == "" {
			jobAbsent = true
			return nil, nil
		}
		jobNode := "job:" + jid
		addNode(jobNode, "job", "Job "+jid[:min(8, len(jid))], map[string]any{"job_id": jid})

		pid := asString(pipeVal)
		if pid != "" {
			pnode := "pipeline:" + pid
			addNode(pnode, "pipeline", "Pipeline", map[string]any{"pipeline_id": pid})
			links = append(links, link{Source: pnode, Target: jobNode, Rel: "TRIGGERED"})
		}

		if chunkList, ok := chunksVal.([]any); ok {
			for _, raw := range chunkList {
				if raw == nil {
					continue
				}
				node, ok := raw.(neo4j.Node)
				if !ok {
					continue
				}
				props := node.Props
				idx, _ := props["chunk_index"].(int64)
				if intVal, ok := props["chunk_index"].(int); ok {
					idx = int64(intVal)
				}
				st, _ := props["state"].(string)
				cid := fmt.Sprintf("chunk:%s:%d", jid, idx)
				addNode(cid, "chunk", fmt.Sprintf("Chunk %d", idx), map[string]any{"chunk_index": idx, "state": st})
				links = append(links, link{Source: jobNode, Target: cid, Rel: "HAS_CHUNK"})
			}
		}

		addDatasets := func(rawList any, rel string) {
			list, ok := rawList.([]any)
			if !ok {
				return
			}
			for _, raw := range list {
				if raw == nil {
					continue
				}
				dn, ok := raw.(neo4j.Node)
				if !ok {
					continue
				}
				name := asString(dn.Props["name"])
				sys := asString(dn.Props["system"])
				did := "dataset:" + name + ":" + sys
				addNode(did, "dataset", name, map[string]any{"name": name, "system": sys})
				links = append(links, link{Source: jobNode, Target: did, Rel: rel})
			}
		}
		addDatasets(readsVal, "READS")
		addDatasets(writesVal, "WRITES")

		return nil, nil
	})
	if err != nil {
		return nil, err
	}
	out := map[string]any{
		"nodes": nodes,
		"links": links,
	}
	if jobAbsent {
		out["note"] = "job_not_in_graph"
	}
	return out, nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func asString(value any) string {
	if value == nil {
		return ""
	}
	if parsed, ok := value.(string); ok {
		return parsed
	}
	return ""
}

func writeChunkLineage(ctx context.Context, driver neo4j.DriverWithContext, req lineageChunkEventRequest) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	pipelineID := req.PipelineID
	if pipelineID == "" {
		pipelineID = "__unknown_pipeline__"
	}
	session := driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeWrite})
	defer session.Close(ctx)
	_, err := session.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		_, err := tx.Run(ctx, `
			MERGE (p:Pipeline {workspace_id: $workspace_id, id: $pipeline_id})
			MERGE (j:Job {workspace_id: $workspace_id, id: $job_id})
			MERGE (p)-[:TRIGGERED {at: datetime()}]->(j)
			MERGE (c:Chunk {workspace_id: $workspace_id, job_id: $job_id, chunk_index: $chunk_index})
			SET c.state = $state, c.updated_at = datetime()
			MERGE (j)-[:HAS_CHUNK]->(c)
		`, map[string]any{
			"workspace_id": req.WorkspaceID,
			"pipeline_id":  pipelineID,
			"job_id":       req.JobID,
			"chunk_index":  req.ChunkIndex,
			"state":        req.State,
		})
		if err != nil {
			return nil, err
		}
		if strings.TrimSpace(req.DatasetName) == "" {
			return nil, nil
		}
		_, err = tx.Run(ctx, `
			MATCH (j:Job {workspace_id: $workspace_id, id: $job_id})
			MATCH (c:Chunk {workspace_id: $workspace_id, job_id: $job_id, chunk_index: $chunk_index})
			MERGE (d:Dataset {workspace_id: $workspace_id, name: $dataset_name})
			MERGE (j)-[:READS]->(d)
			MERGE (c)-[:PART_OF]->(d)
		`, map[string]any{
			"workspace_id": req.WorkspaceID,
			"job_id":       req.JobID,
			"chunk_index":  req.ChunkIndex,
			"dataset_name": req.DatasetName,
		})
		return nil, err
	})
	return err
}

func mustOpenDB() *sql.DB {
	dsn := getenv("POSTGRES_DSN", "postgres://dataplier:dataplier@postgres:5432/dataplier?sslmode=disable")
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		panic(err)
	}
	return db
}

func workspaceIDFromRequest(r *http.Request) string { return r.Header.Get("X-Workspace-Id") }

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Workspace-Id")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
