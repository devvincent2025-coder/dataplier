package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	_ "github.com/lib/pq"
)

type jobRecord struct {
	ID                  string `json:"id"`
	PipelineID          string `json:"pipeline_id"`
	PipelineName        string `json:"pipeline_name"`
	Status              string `json:"status"`
	SourcePlatform      string `json:"source_platform"`
	DestinationPlatform string `json:"destination_platform"`
	StartedAt           string `json:"started_at"`
	FinishedAt          string `json:"finished_at,omitempty"`
	TotalChunks         int    `json:"total_chunks"`
	CompletedChunks     int    `json:"completed_chunks"`
	FailedChunks        int    `json:"failed_chunks"`
}

type chunkEventRequest struct {
	JobID           string `json:"job_id"`
	ChunkIndex      int    `json:"chunk_index"`
	State           string `json:"state"`
	Bytes           int64  `json:"bytes"`
	SourcePartition string `json:"source_partition,omitempty"`
	WorkspaceID     string `json:"workspace_id,omitempty"`
	PipelineID      string `json:"pipeline_id,omitempty"`
	DatasetName     string `json:"dataset_name,omitempty"`
}

type jobChunkRecord struct {
	ChunkIndex      int    `json:"chunk_index"`
	State           string `json:"state"`
	SourcePartition string `json:"source_partition,omitempty"`
	Attempts        int    `json:"attempts"`
	BytesProcessed  int64  `json:"bytes_processed"`
	StartedAt       string `json:"started_at,omitempty"`
	FinishedAt      string `json:"finished_at,omitempty"`
}

func main() {
	db := mustOpenDB()
	defer db.Close()

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"service": "job-service", "status": "ok"})
	})
	mux.HandleFunc("GET /jobs", func(w http.ResponseWriter, r *http.Request) {
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}

		rows, err := db.Query(`
			SELECT j.id, j.pipeline_id, p.name, j.status, COALESCE(j.source_platform, ''), COALESCE(j.destination_platform, ''),
			       to_char(j.started_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
			       COALESCE(to_char(j.finished_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), ''),
			       j.total_chunks, j.completed_chunks, j.failed_chunks
			FROM jobs j
			JOIN pipelines p ON p.id = j.pipeline_id
			WHERE p.workspace_id = $1
			ORDER BY j.started_at DESC
		`, workspaceID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		defer rows.Close()

		items := []jobRecord{}
		for rows.Next() {
			var item jobRecord
			if err := rows.Scan(&item.ID, &item.PipelineID, &item.PipelineName, &item.Status, &item.SourcePlatform, &item.DestinationPlatform, &item.StartedAt, &item.FinishedAt, &item.TotalChunks, &item.CompletedChunks, &item.FailedChunks); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			items = append(items, item)
		}

		writeJSON(w, http.StatusOK, map[string]any{"items": items})
	})
	mux.HandleFunc("GET /jobs/{id}/chunks", func(w http.ResponseWriter, r *http.Request) {
		jobID := strings.TrimSpace(r.PathValue("id"))
		if jobID == "" || jobID == "events" {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "job not found"})
			return
		}
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}
		rows, err := db.Query(`
			SELECT jc.chunk_index, jc.state, COALESCE(jc.source_partition, ''), jc.attempts, jc.bytes_processed,
			       COALESCE(to_char(jc.started_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), ''),
			       COALESCE(to_char(jc.finished_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), '')
			FROM job_chunks jc
			INNER JOIN jobs j ON j.id = jc.job_id
			INNER JOIN pipelines p ON p.id = j.pipeline_id
			WHERE jc.job_id = $1 AND p.workspace_id = $2
			ORDER BY jc.chunk_index
		`, jobID, workspaceID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		defer rows.Close()
		items := []jobChunkRecord{}
		for rows.Next() {
			var row jobChunkRecord
			if err := rows.Scan(&row.ChunkIndex, &row.State, &row.SourcePartition, &row.Attempts, &row.BytesProcessed, &row.StartedAt, &row.FinishedAt); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			items = append(items, row)
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": items})
	})
	mux.HandleFunc("GET /jobs/{id}", func(w http.ResponseWriter, r *http.Request) {
		jobID := strings.TrimSpace(r.PathValue("id"))
		if jobID == "" || jobID == "events" {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "job not found"})
			return
		}
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}
		var item jobRecord
		err := db.QueryRow(`
			SELECT j.id, j.pipeline_id, p.name, j.status, COALESCE(j.source_platform, ''), COALESCE(j.destination_platform, ''),
			       to_char(j.started_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
			       COALESCE(to_char(j.finished_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), ''),
			       j.total_chunks, j.completed_chunks, j.failed_chunks
			FROM jobs j
			JOIN pipelines p ON p.id = j.pipeline_id
			WHERE j.id = $1 AND p.workspace_id = $2
		`, jobID, workspaceID).Scan(&item.ID, &item.PipelineID, &item.PipelineName, &item.Status, &item.SourcePlatform, &item.DestinationPlatform, &item.StartedAt, &item.FinishedAt, &item.TotalChunks, &item.CompletedChunks, &item.FailedChunks)
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "job not found"})
			return
		}
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, item)
	})
	mux.HandleFunc("POST /jobs/events", func(w http.ResponseWriter, r *http.Request) {
		var req chunkEventRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
			return
		}
		if req.JobID == "" || req.State == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "job_id and state are required"})
			return
		}
		ws := strings.TrimSpace(req.WorkspaceID)
		if ws != "" && strings.EqualFold(strings.TrimSpace(req.State), "started") {
			st, err := loadWorkspaceSettingsJSON(db, ws)
			if err == nil && inMaintenanceWindowUTC(time.Now(), st) {
				writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "workspace maintenance window active; defer chunk starts until after the window"})
				return
			}
		}
		state := strings.ToLower(strings.TrimSpace(req.State))
		if err := handleChunkEvent(db, req, state); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		go forwardObsIngest(req, state)
		if state == "completed" || state == "failed" {
			go forwardChunkLineage(req, state)
		}
		writeJSON(w, http.StatusAccepted, map[string]any{"status": "recorded"})
	})

	log.Println("job-service listening on :8085")
	_ = http.ListenAndServe(":8085", withCORS(mux))
}

func handleChunkEvent(db *sql.DB, req chunkEventRequest, state string) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	partition := req.SourcePartition
	switch state {
	case "started":
		_, err = tx.Exec(`
			INSERT INTO job_chunks (job_id, chunk_index, state, source_partition, bytes_processed, attempts, started_at)
			VALUES ($1, $2, 'running', NULLIF($3, ''), 0, 1, NOW())
			ON CONFLICT (job_id, chunk_index) DO UPDATE SET
				attempts = job_chunks.attempts + 1,
				state = 'running',
				started_at = COALESCE(job_chunks.started_at, NOW())
		`, req.JobID, req.ChunkIndex, partition)
	case "retrying":
		_, err = tx.Exec(`
			UPDATE job_chunks
			SET state = 'retrying', attempts = attempts + 1
			WHERE job_id = $1 AND chunk_index = $2
		`, req.JobID, req.ChunkIndex)
	case "completed":
		res, e2 := tx.Exec(`
			UPDATE job_chunks
			SET state = 'completed', bytes_processed = $3, finished_at = NOW()
			WHERE job_id = $1 AND chunk_index = $2 AND state != 'completed'
		`, req.JobID, req.ChunkIndex, req.Bytes)
		if e2 != nil {
			return e2
		}
		n, _ := res.RowsAffected()
		if n > 0 {
			_, err = tx.Exec(`UPDATE jobs SET completed_chunks = completed_chunks + 1 WHERE id = $1`, req.JobID)
		}
	case "failed":
		var prev sql.NullString
		e2 := tx.QueryRow(`
			SELECT state FROM job_chunks WHERE job_id = $1 AND chunk_index = $2 FOR UPDATE
		`, req.JobID, req.ChunkIndex).Scan(&prev)
		if e2 == sql.ErrNoRows {
			_, err = tx.Exec(`
				INSERT INTO job_chunks (job_id, chunk_index, state, attempts, finished_at)
				VALUES ($1, $2, 'failed', 1, NOW())
			`, req.JobID, req.ChunkIndex)
			if err != nil {
				return err
			}
			_, err = tx.Exec(`UPDATE jobs SET failed_chunks = failed_chunks + 1 WHERE id = $1`, req.JobID)
		} else if e2 != nil {
			return e2
		} else if prev.String != "completed" && prev.String != "failed" {
			_, err = tx.Exec(`
				UPDATE job_chunks SET state = 'failed', finished_at = NOW()
				WHERE job_id = $1 AND chunk_index = $2
			`, req.JobID, req.ChunkIndex)
			if err != nil {
				return err
			}
			_, err = tx.Exec(`UPDATE jobs SET failed_chunks = failed_chunks + 1 WHERE id = $1`, req.JobID)
		}
	default:
		return fmt.Errorf("unsupported state: %s", state)
	}
	if err != nil {
		return err
	}
	if err := finalizeJobIfDone(tx, req.JobID); err != nil {
		return err
	}
	return tx.Commit()
}

func finalizeJobIfDone(tx *sql.Tx, jobID string) error {
	var total, completed, failed int
	if err := tx.QueryRow(`
		SELECT total_chunks, completed_chunks, failed_chunks FROM jobs WHERE id = $1 FOR UPDATE
	`, jobID).Scan(&total, &completed, &failed); err != nil {
		return err
	}
	if total <= 0 {
		return nil
	}
	if completed+failed < total {
		_, err := tx.Exec(`UPDATE jobs SET status = 'running' WHERE id = $1 AND status IN ('queued')`, jobID)
		return err
	}
	status := "partial"
	if failed == 0 {
		status = "completed"
	} else if completed == 0 {
		status = "failed"
	}
	_, err := tx.Exec(`
		UPDATE jobs SET status = $2, finished_at = COALESCE(finished_at, NOW())
		WHERE id = $1
	`, jobID, status)
	return err
}

func forwardObsIngest(req chunkEventRequest, state string) {
	base := strings.TrimSpace(getenv("OBSERVABILITY_SERVICE_URL", ""))
	key := strings.TrimSpace(getenv("OBS_INGEST_SECRET", ""))
	if base == "" || key == "" || strings.TrimSpace(req.WorkspaceID) == "" {
		return
	}
	now := time.Now().UTC()
	traceID := req.JobID
	jid := traceID
	if len(jid) > 8 {
		jid = jid[:8]
	}
	spanID := fmt.Sprintf("jobsvc-%s-%d-%s-%d", jid, req.ChunkIndex, state, now.UnixNano())
	st := "unset"
	if state == "failed" {
		st = "error"
	} else if state == "completed" {
		st = "ok"
	}
	payload := map[string]any{
		"spans": []map[string]any{
			{
				"trace_id":        traceID,
				"span_id":         spanID,
				"parent_span_id":  nil,
				"service_name":    "dataplier.job-service",
				"operation_name":  "chunk." + state,
				"start_at":        now.Format(time.RFC3339Nano),
				"end_at":          now.Format(time.RFC3339Nano),
				"status":          st,
				"attrs": map[string]any{
					"job_id": req.JobID, "chunk_index": req.ChunkIndex, "bytes": req.Bytes, "state": state,
				},
			},
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return
	}
	url := strings.TrimSuffix(base, "/") + "/metrics/ingest/spans"
	httpReq, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-Workspace-Id", req.WorkspaceID)
	httpReq.Header.Set("X-Obs-Ingest-Key", key)
	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		log.Printf("obs ingest forward failed: %v", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		log.Printf("obs ingest forward status=%d body=%s", resp.StatusCode, string(b))
	}
}

func forwardChunkLineage(req chunkEventRequest, state string) {
	base := strings.TrimSpace(getenv("LINEAGE_SERVICE_URL", ""))
	if base == "" || req.WorkspaceID == "" {
		return
	}
	payload := map[string]any{
		"workspace_id": req.WorkspaceID,
		"job_id":       req.JobID,
		"pipeline_id":  req.PipelineID,
		"chunk_index":  req.ChunkIndex,
		"state":        state,
		"dataset_name": req.DatasetName,
	}
	body, _ := json.Marshal(payload)
	url := strings.TrimSuffix(base, "/") + "/chunk-lineage"
	httpReq, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-Workspace-Id", req.WorkspaceID)
	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		log.Printf("chunk lineage forward failed: %v", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		log.Printf("chunk lineage forward status=%d body=%s", resp.StatusCode, string(b))
	}
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
