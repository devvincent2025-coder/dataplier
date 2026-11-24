package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	_ "github.com/lib/pq"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/worker"
	"go.temporal.io/sdk/workflow"
)

type pipelineRecord struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Description  string `json:"description"`
	ScheduleCron string `json:"schedule_cron"`
	Status       string `json:"status"`
	CreatedBy    string `json:"created_by"`
	UpdatedAt    string `json:"updated_at"`
	NodeCount    int    `json:"node_count"`
	EdgeCount    int    `json:"edge_count"`
}

type runPipelineRequest struct {
	PipelineID           string `json:"pipeline_id"`
	DatasetName          string `json:"dataset_name"`
	EstimatedBytes       int64  `json:"estimated_bytes"`
	EstimatedRows        int64  `json:"estimated_rows"`
	Partitions           int    `json:"partitions"`
	WorkerCapacity       int    `json:"worker_capacity"`
	NetworkThroughputMBS int    `json:"network_throughput_mb_s"`
	SourcePlatform       string `json:"source_platform"`
	DestinationPlatform  string `json:"destination_platform"`
}

type pipelineRunWorkflowInput struct {
	WorkspaceID string             `json:"workspace_id"`
	JobID       string             `json:"job_id"`
	Run         runPipelineRequest `json:"run"`
}

type pipelineRunWorkflowOutput struct {
	Dispatched  int    `json:"dispatched"`
	FinalStatus string `json:"final_status"`
}

type waitJobCompletionInput struct {
	WorkspaceID string `json:"workspace_id"`
	JobID       string `json:"job_id"`
}

type pipelineActivities struct {
	DB          *sql.DB
	Neo4jDriver neo4j.DriverWithContext
}

func main() {
	db := mustOpenDB()
	defer db.Close()
	neo4jDriver := openNeo4j()
	if neo4jDriver != nil {
		defer neo4jDriver.Close(context.Background())
	}

	temporalAddr := getenv("TEMPORAL_ADDRESS", "temporal:7233")
	var temporalClient client.Client
	for attempt := 1; attempt <= 30; attempt++ {
		var err error
		temporalClient, err = client.Dial(client.Options{HostPort: temporalAddr})
		if err == nil {
			break
		}
		log.Printf("temporal dial attempt %d/30 failed (%s): %v", attempt, temporalAddr, err)
		if attempt == 30 {
			log.Fatalf("failed to connect temporal after 30 attempts: %v", err)
		}
		time.Sleep(2 * time.Second)
	}
	defer temporalClient.Close()

	tw := startTemporalWorker(temporalClient, pipelineActivities{
		DB:          db,
		Neo4jDriver: neo4jDriver,
	})
	defer tw.Stop()

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"service": "pipeline-service", "status": "ok"})
	})
	mux.HandleFunc("GET /pipelines/{id}/builder", handleGetBuilder(db))
	mux.HandleFunc("PUT /pipelines/{id}/builder", handlePutBuilder(db))
	mux.HandleFunc("GET /pipelines/{id}/export", handleExportPipeline(db))
	mux.HandleFunc("/pipelines", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			workspaceID := workspaceIDFromRequest(r)
			if workspaceID == "" {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
				return
			}
			rows, err := db.Query(`
				SELECT p.id, p.name, COALESCE(p.description, ''), COALESCE(p.schedule_cron, ''), p.status,
				       COALESCE(u.full_name, ''), to_char(p.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
				       COALESCE((SELECT COUNT(*) FROM pipeline_nodes pn WHERE pn.pipeline_id = p.id), 0),
				       COALESCE((SELECT COUNT(*) FROM pipeline_edges pe WHERE pe.pipeline_id = p.id), 0)
				FROM pipelines p
				LEFT JOIN users u ON u.id = p.created_by
				WHERE p.workspace_id = $1
				ORDER BY p.updated_at DESC
			`, workspaceID)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			defer rows.Close()
			items := []pipelineRecord{}
			for rows.Next() {
				var item pipelineRecord
				if err := rows.Scan(&item.ID, &item.Name, &item.Description, &item.ScheduleCron, &item.Status, &item.CreatedBy, &item.UpdatedAt, &item.NodeCount, &item.EdgeCount); err != nil {
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
					return
				}
				items = append(items, item)
			}
			writeJSON(w, http.StatusOK, map[string]any{"items": items})
		case http.MethodPost:
			handleCreatePipeline(db)(w, r)
		default:
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		}
	})
	mux.HandleFunc("/pipelines/run", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}
		var req runPipelineRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
			return
		}
		if req.DatasetName == "" || req.EstimatedBytes <= 0 || req.EstimatedRows <= 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "dataset_name, estimated_bytes, estimated_rows are required"})
			return
		}
		if req.Partitions <= 0 {
			req.Partitions = 1
		}
		if req.WorkerCapacity <= 0 {
			req.WorkerCapacity = 8
		}
		if req.NetworkThroughputMBS <= 0 {
			req.NetworkThroughputMBS = 256
		}
		pipelineID, err := resolvePipelineID(db, workspaceID, req.PipelineID)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		req.PipelineID = pipelineID
		jobID, err := createJobRecord(db, req)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}

		workflowOptions := client.StartWorkflowOptions{
			ID:        "pipeline-run-" + jobID,
			TaskQueue: "pipeline-task-queue",
		}
		run, err := temporalClient.ExecuteWorkflow(context.Background(), workflowOptions, PipelineRunWorkflow, pipelineRunWorkflowInput{
			WorkspaceID: workspaceID,
			JobID:       jobID,
			Run:         req,
		})
		if err != nil {
			_, _ = db.Exec(`UPDATE jobs SET status = 'failed', finished_at = NOW() WHERE id = $1`, jobID)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": fmt.Sprintf("failed to start workflow: %v", err)})
			return
		}

		writeJSON(w, http.StatusAccepted, map[string]any{
			"job_id":      jobID,
			"status":      "queued",
			"workflow_id": run.GetID(),
			"run_id":      run.GetRunID(),
		})
	})

	log.Println("pipeline-service listening on :8084")
	_ = http.ListenAndServe(":8084", withCORS(mux))
}

func startTemporalWorker(c client.Client, activities pipelineActivities) worker.Worker {
	w := worker.New(c, "pipeline-task-queue", worker.Options{})
	w.RegisterWorkflow(PipelineRunWorkflow)
	w.RegisterActivity(activities.DispatchChunksActivity)
	w.RegisterActivity(activities.WaitForJobCompletionActivity)
	if err := w.Start(); err != nil {
		log.Fatalf("failed to start temporal worker: %v", err)
	}
	return w
}

func PipelineRunWorkflow(ctx workflow.Context, input pipelineRunWorkflowInput) (pipelineRunWorkflowOutput, error) {
	dispatchCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 5 * time.Minute,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 3,
		},
	})
	var out pipelineRunWorkflowOutput
	if err := workflow.ExecuteActivity(dispatchCtx, "DispatchChunksActivity", input).Get(dispatchCtx, &out.Dispatched); err != nil {
		return out, err
	}
	if out.Dispatched <= 0 {
		return out, nil
	}
	waitCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 3 * time.Hour,
		HeartbeatTimeout:    90 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 2,
		},
	})
	waitIn := waitJobCompletionInput{WorkspaceID: input.WorkspaceID, JobID: input.JobID}
	if err := workflow.ExecuteActivity(waitCtx, "WaitForJobCompletionActivity", waitIn).Get(waitCtx, &out.FinalStatus); err != nil {
		return out, err
	}
	return out, nil
}

func (a pipelineActivities) DispatchChunksActivity(ctx context.Context, input pipelineRunWorkflowInput) (int, error) {
	dispatched, err := dispatchChunkPlan(input.WorkspaceID, input.JobID, input.Run)
	if err != nil {
		_, _ = a.DB.Exec(`UPDATE jobs SET status = 'failed', finished_at = NOW() WHERE id = $1`, input.JobID)
		return 0, err
	}
	_, _ = a.DB.Exec(`UPDATE jobs SET status = 'running', total_chunks = $2 WHERE id = $1`, input.JobID, dispatched)
	if err := writeLineageGraph(ctx, a.Neo4jDriver, input.WorkspaceID, input.JobID, input.Run); err != nil {
		log.Printf("lineage write failed for job=%s: %v", input.JobID, err)
	}
	activity.GetLogger(ctx).Info("chunks dispatched", "job_id", input.JobID, "count", dispatched)
	return dispatched, nil
}

func (a pipelineActivities) WaitForJobCompletionActivity(ctx context.Context, in waitJobCompletionInput) (string, error) {
	base := strings.TrimRight(getenv("JOB_SERVICE_URL", "http://job-service:8085"), "/")
	url := base + "/jobs/" + strings.TrimSpace(in.JobID)
	interval := jobPollInterval()
	maxWait := jobPollMaxWait()
	deadline := time.Now().Add(maxWait)
	client := &http.Client{Timeout: 12 * time.Second}
	logger := activity.GetLogger(ctx)
	for {
		if time.Now().After(deadline) {
			return "", fmt.Errorf("job %s not terminal after %v", in.JobID, maxWait)
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return "", err
		}
		req.Header.Set("X-Workspace-Id", in.WorkspaceID)
		resp, err := client.Do(req)
		if err != nil {
			logger.Warn("job poll request failed", "error", err)
			activity.RecordHeartbeat(ctx, "poll_error")
			select {
			case <-ctx.Done():
				return "", ctx.Err()
			case <-time.After(interval):
			}
			continue
		}
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		_ = resp.Body.Close()
		if resp.StatusCode == http.StatusNotFound {
			return "", fmt.Errorf("job %s not found", in.JobID)
		}
		if resp.StatusCode >= 300 {
			logger.Warn("job poll unexpected status", "status", resp.StatusCode, "body", string(body))
			activity.RecordHeartbeat(ctx, "poll_http_error")
			select {
			case <-ctx.Done():
				return "", ctx.Err()
			case <-time.After(interval):
			}
			continue
		}
		var jr struct {
			Status string `json:"status"`
		}
		if err := json.Unmarshal(body, &jr); err != nil {
			return "", fmt.Errorf("decode job status: %w", err)
		}
		st := strings.ToLower(strings.TrimSpace(jr.Status))
		switch st {
		case "completed", "failed", "partial":
			logger.Info("job reached terminal status", "job_id", in.JobID, "status", st)
			return st, nil
		}
		activity.RecordHeartbeat(ctx, st)
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-time.After(interval):
		}
	}
}

func jobPollInterval() time.Duration {
	s := strings.TrimSpace(os.Getenv("JOB_POLL_INTERVAL_SEC"))
	if s == "" {
		return 5 * time.Second
	}
	n, err := strconv.Atoi(s)
	if err != nil || n < 1 {
		return 5 * time.Second
	}
	return time.Duration(n) * time.Second
}

func jobPollMaxWait() time.Duration {
	s := strings.TrimSpace(os.Getenv("JOB_COMPLETION_POLL_MAX_MINUTES"))
	if s == "" {
		return 120 * time.Minute
	}
	n, err := strconv.Atoi(s)
	if err != nil || n < 1 {
		return 120 * time.Minute
	}
	return time.Duration(n) * time.Minute
}

func dispatchChunkPlan(workspaceID string, jobID string, req runPipelineRequest) (int, error) {
	chunkEngineURL := getenv("CHUNK_ENGINE_URL", "http://chunk-engine:8090")
	payload := map[string]any{
		"job_id":                  jobID,
		"workspace_id":            workspaceID,
		"pipeline_id":             req.PipelineID,
		"dataset_name":            req.DatasetName,
		"estimated_bytes":         req.EstimatedBytes,
		"estimated_rows":          req.EstimatedRows,
		"partitions":              req.Partitions,
		"worker_capacity":         req.WorkerCapacity,
		"network_throughput_mb_s": req.NetworkThroughputMBS,
	}
	body, _ := json.Marshal(payload)
	resp, err := http.Post(chunkEngineURL+"/chunk-plan/dispatch", "application/json", bytes.NewReader(body))
	if err != nil {
		return 0, fmt.Errorf("chunk-engine unavailable: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1024*1024))
	if resp.StatusCode >= 300 {
		return 0, fmt.Errorf("chunk-engine dispatch failed: %s", string(respBody))
	}
	var parsed struct {
		DispatchedCount int `json:"dispatched_count"`
	}
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return 0, fmt.Errorf("invalid chunk-engine response: %w", err)
	}
	return parsed.DispatchedCount, nil
}

func createJobRecord(db *sql.DB, req runPipelineRequest) (string, error) {
	var jobID string
	err := db.QueryRow(`
		INSERT INTO jobs (pipeline_id, status, source_platform, destination_platform, total_chunks, completed_chunks, failed_chunks)
		VALUES ($1, 'queued', $2, $3, 0, 0, 0)
		RETURNING id
	`, req.PipelineID, req.SourcePlatform, req.DestinationPlatform).Scan(&jobID)
	return jobID, err
}

func resolvePipelineID(db *sql.DB, workspaceID string, requestedID string) (string, error) {
	if requestedID != "" {
		var exists bool
		if err := db.QueryRow(`SELECT EXISTS (SELECT 1 FROM pipelines WHERE id = $1 AND workspace_id = $2)`, requestedID, workspaceID).Scan(&exists); err != nil {
			return "", err
		}
		if !exists {
			return "", fmt.Errorf("pipeline not found in workspace")
		}
		return requestedID, nil
	}
	var fallbackID string
	if err := db.QueryRow(`SELECT id FROM pipelines WHERE workspace_id = $1 ORDER BY updated_at DESC LIMIT 1`, workspaceID).Scan(&fallbackID); err != nil {
		if err == sql.ErrNoRows {
			return "", fmt.Errorf("no pipeline found in workspace")
		}
		return "", err
	}
	return fallbackID, nil
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

func writeLineageGraph(ctx context.Context, driver neo4j.DriverWithContext, workspaceID string, jobID string, req runPipelineRequest) error {
	if driver == nil {
		return nil
	}
	destName := req.DatasetName + "::destination"
	if req.DestinationPlatform != "" {
		destName = req.DatasetName + "::" + req.DestinationPlatform
	}
	session := driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeWrite})
	defer session.Close(ctx)
	_, err := session.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		_, err := tx.Run(ctx, `
			MERGE (p:Pipeline {workspace_id: $workspace_id, id: $pipeline_id})
			ON CREATE SET p.name = $pipeline_id
			MERGE (j:Job {workspace_id: $workspace_id, id: $job_id})
			ON CREATE SET j.status = 'running'
			MERGE (ds:Dataset {workspace_id: $workspace_id, name: $dataset_name, system: coalesce($source_platform, 'unknown')})
			MERGE (dd:Dataset {workspace_id: $workspace_id, name: $dest_dataset_name, system: coalesce($destination_platform, 'unknown')})
			MERGE (p)-[:TRIGGERED {at: datetime()}]->(j)
			MERGE (j)-[:READS]->(ds)
			MERGE (j)-[:WRITES]->(dd)
			MERGE (ds)-[r:FLOWS_TO {operation: 'pipeline_dispatch', job_id: $job_id}]->(dd)
			RETURN p, j, r
		`, map[string]any{
			"workspace_id":         workspaceID,
			"pipeline_id":          req.PipelineID,
			"job_id":               jobID,
			"dataset_name":         req.DatasetName,
			"dest_dataset_name":    destName,
			"source_platform":      req.SourcePlatform,
			"destination_platform": req.DestinationPlatform,
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

func workspaceIDFromRequest(r *http.Request) string {
	return r.Header.Get("X-Workspace-Id")
}

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
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
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
