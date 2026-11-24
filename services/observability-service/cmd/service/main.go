package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	_ "github.com/lib/pq"
)

func main() {
	db := mustOpenDB()
	defer db.Close()

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"service": "observability-service", "status": "ok"})
	})
	mux.HandleFunc("/metrics/summary", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}
		handleSummary(db, w, workspaceID)
	})
	mux.HandleFunc("/metrics/timeseries", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}
		handleTimeseries(db, w, r, workspaceID)
	})
	mux.HandleFunc("/metrics/jobs/recent", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}
		handleRecentJobs(db, w, r, workspaceID)
	})
	mux.HandleFunc("/metrics/alerts", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}
		handleAlerts(db, w, workspaceID)
	})
	mux.HandleFunc("/metrics/traces", func(w http.ResponseWriter, r *http.Request) {
		routeTraces(db, w, r)
	})
	mux.HandleFunc("/metrics/traces/", func(w http.ResponseWriter, r *http.Request) {
		routeTraces(db, w, r)
	})
	mux.HandleFunc("/metrics/slos", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}
		handleSLOs(db, w, workspaceID)
	})
	mux.HandleFunc("/metrics/correlation", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}
		handleCorrelation(db, w, r, workspaceID)
	})
	mux.HandleFunc("/metrics/ingest/spans", func(w http.ResponseWriter, r *http.Request) {
		handleIngestSpans(db, w, r)
	})
	mux.HandleFunc("/metrics/alert-routing/dispatch-test", func(w http.ResponseWriter, r *http.Request) {
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}
		handleDispatchTest(db, w, r, workspaceID)
	})
	mux.HandleFunc("/metrics/alert-routing/channels", func(w http.ResponseWriter, r *http.Request) {
		routeAlertChannels(db, w, r)
	})
	mux.HandleFunc("/metrics/alert-routing/rules", func(w http.ResponseWriter, r *http.Request) {
		routeAlertRules(db, w, r)
	})
	mux.HandleFunc("/metrics/alert-routing/incidents/", func(w http.ResponseWriter, r *http.Request) {
		routeAlertIncidents(db, w, r)
	})
	mux.HandleFunc("/metrics/alert-routing", func(w http.ResponseWriter, r *http.Request) {
		routeAlertRouting(db, w, r)
	})

	startDeliveryWorker(db)

	log.Println("observability-service listening on :8087")
	_ = http.ListenAndServe(":8087", withCORS(mux))
}

func handleSummary(db *sql.DB, w http.ResponseWriter, workspaceID string) {
	var totalChunks, completedChunks, failedChunks, runningJobs int
	err := db.QueryRow(`
		SELECT
		  COALESCE(SUM(j.total_chunks), 0),
		  COALESCE(SUM(j.completed_chunks), 0),
		  COALESCE(SUM(j.failed_chunks), 0),
		  COALESCE(SUM(CASE WHEN j.status = 'running' THEN 1 ELSE 0 END), 0)
		FROM jobs j
		JOIN pipelines p ON p.id = j.pipeline_id
		WHERE p.workspace_id = $1
	`, workspaceID).Scan(&totalChunks, &completedChunks, &failedChunks, &runningJobs)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	workerUtilization := 0.0
	if totalChunks > 0 {
		workerUtilization = float64(completedChunks+runningJobs) / float64(totalChunks)
		if workerUtilization > 1 {
			workerUtilization = 1
		}
	}
	queueBacklog := totalChunks - completedChunks - failedChunks
	if queueBacklog < 0 {
		queueBacklog = 0
	}

	var transferBytes sql.NullInt64
	var transferSeconds sql.NullFloat64
	err = db.QueryRow(`
		SELECT
		  COALESCE(SUM(jc.bytes_processed), 0),
		  COALESCE(SUM(GREATEST(EXTRACT(EPOCH FROM (jc.finished_at - jc.started_at)), 0.001)), 0)
		FROM job_chunks jc
		JOIN jobs j ON j.id = jc.job_id
		JOIN pipelines p ON p.id = j.pipeline_id
		WHERE p.workspace_id = $1
		  AND jc.state = 'completed'
		  AND jc.finished_at IS NOT NULL
		  AND jc.started_at IS NOT NULL
		  AND jc.finished_at >= NOW() - INTERVAL '24 hours'
	`, workspaceID).Scan(&transferBytes, &transferSeconds)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	transferMBps := 0.0
	if transferBytes.Valid && transferBytes.Int64 > 0 && transferSeconds.Valid && transferSeconds.Float64 > 0 {
		transferMBps = (float64(transferBytes.Int64) / transferSeconds.Float64) / (1024 * 1024)
	}

	var latencyAvg sql.NullFloat64
	err = db.QueryRow(`
		SELECT AVG(EXTRACT(EPOCH FROM (j.finished_at - j.started_at)))
		FROM jobs j
		JOIN pipelines p ON p.id = j.pipeline_id
		WHERE p.workspace_id = $1
		  AND j.finished_at IS NOT NULL
		  AND j.started_at IS NOT NULL
		  AND j.finished_at >= NOW() - INTERVAL '7 days'
		  AND j.status IN ('completed', 'partial', 'failed')
	`, workspaceID).Scan(&latencyAvg)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	pipelineLatency := 0.0
	if latencyAvg.Valid {
		pipelineLatency = latencyAvg.Float64
	}

	var failedJobs24h int
	_ = db.QueryRow(`
		SELECT COUNT(*)
		FROM jobs j
		JOIN pipelines p ON p.id = j.pipeline_id
		WHERE p.workspace_id = $1
		  AND j.status = 'failed'
		  AND j.finished_at >= NOW() - INTERVAL '24 hours'
	`, workspaceID).Scan(&failedJobs24h)

	writeJSON(w, http.StatusOK, map[string]any{
		"worker_utilization":        workerUtilization,
		"transfer_speed_mb_s":       math.Round(transferMBps*100) / 100,
		"queue_backlog":             queueBacklog,
		"chunk_failures":            failedChunks,
		"pipeline_latency_s":        math.Round(pipelineLatency*10) / 10,
		"throughput_window_hours":   24,
		"latency_window_days":       7,
		"failed_jobs_24h":           failedJobs24h,
		"running_jobs":              runningJobs,
		"throughput_source":         "job_chunks",
		"latency_source":            "jobs",
	})
}

func parseHours(r *http.Request, def, max int) int {
	q := r.URL.Query().Get("hours")
	if q == "" {
		return def
	}
	n, err := strconv.Atoi(q)
	if err != nil || n < 1 {
		return def
	}
	if n > max {
		return max
	}
	return n
}

func handleTimeseries(db *sql.DB, w http.ResponseWriter, r *http.Request, workspaceID string) {
	hours := parseHours(r, 24, 336)

	rows, err := db.Query(`
		SELECT date_trunc('hour', jc.finished_at) AS bucket,
		       COALESCE(SUM(jc.bytes_processed), 0)::bigint,
		       COALESCE(SUM(GREATEST(EXTRACT(EPOCH FROM (jc.finished_at - jc.started_at)), 0.001)), 0)::float8
		FROM job_chunks jc
		JOIN jobs j ON j.id = jc.job_id
		JOIN pipelines p ON p.id = j.pipeline_id
		WHERE p.workspace_id = $1
		  AND jc.state = 'completed'
		  AND jc.finished_at IS NOT NULL
		  AND jc.started_at IS NOT NULL
		  AND jc.finished_at >= NOW() - ($2::int * INTERVAL '1 hour')
		GROUP BY 1
		ORDER BY 1 ASC
	`, workspaceID, hours)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer rows.Close()

	throughput := []map[string]any{}
	for rows.Next() {
		var bucket time.Time
		var bytes int64
		var sec float64
		if err := rows.Scan(&bucket, &bytes, &sec); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		mb := 0.0
		if bytes > 0 && sec > 0 {
			mb = (float64(bytes) / sec) / (1024 * 1024)
		}
		throughput = append(throughput, map[string]any{
			"t":        bucket.UTC().Format(time.RFC3339),
			"mb_per_s": math.Round(mb*100) / 100,
		})
	}
	if err := rows.Err(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	latRows, err := db.Query(`
		SELECT date_trunc('hour', j.finished_at) AS bucket,
		       AVG(EXTRACT(EPOCH FROM (j.finished_at - j.started_at)))::float8
		FROM jobs j
		JOIN pipelines p ON p.id = j.pipeline_id
		WHERE p.workspace_id = $1
		  AND j.finished_at IS NOT NULL
		  AND j.started_at IS NOT NULL
		  AND j.finished_at >= NOW() - ($2::int * INTERVAL '1 hour')
		  AND j.status IN ('completed', 'partial', 'failed')
		GROUP BY 1
		ORDER BY 1 ASC
	`, workspaceID, hours)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer latRows.Close()

	latency := []map[string]any{}
	for latRows.Next() {
		var bucket time.Time
		var avgSec float64
		if err := latRows.Scan(&bucket, &avgSec); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		latency = append(latency, map[string]any{
			"t":         bucket.UTC().Format(time.RFC3339),
			"latency_s": math.Round(avgSec*10) / 10,
		})
	}
	if err := latRows.Err(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"window_hours": hours,
		"throughput":   throughput,
		"latency":      latency,
	})
}

func handleRecentJobs(db *sql.DB, w http.ResponseWriter, r *http.Request, workspaceID string) {
	limit := 25
	if q := r.URL.Query().Get("limit"); q != "" {
		if n, err := strconv.Atoi(q); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}
	statusFilter := strings.TrimSpace(r.URL.Query().Get("status"))

	var q string
	var args []any
	if statusFilter != "" {
		q = `
		SELECT j.id, j.status, j.started_at, j.finished_at,
		       j.total_chunks, j.completed_chunks, j.failed_chunks,
		       p.id, p.name
		FROM jobs j
		JOIN pipelines p ON p.id = j.pipeline_id
		WHERE p.workspace_id = $1 AND LOWER(TRIM(j.status)) = LOWER(TRIM($2))
		ORDER BY j.started_at DESC
		LIMIT $3
	`
		args = []any{workspaceID, statusFilter, limit}
	} else {
		q = `
		SELECT j.id, j.status, j.started_at, j.finished_at,
		       j.total_chunks, j.completed_chunks, j.failed_chunks,
		       p.id, p.name
		FROM jobs j
		JOIN pipelines p ON p.id = j.pipeline_id
		WHERE p.workspace_id = $1
		ORDER BY j.started_at DESC
		LIMIT $2
	`
		args = []any{workspaceID, limit}
	}
	rows, err := db.Query(q, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer rows.Close()

	items := []map[string]any{}
	for rows.Next() {
		var id, status string
		var startedAt time.Time
		var finishedAt sql.NullTime
		var total, completed, failed int
		var pipelineID, pipelineName string
		if err := rows.Scan(&id, &status, &startedAt, &finishedAt, &total, &completed, &failed, &pipelineID, &pipelineName); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		row := map[string]any{
			"id":                id,
			"status":            status,
			"started_at":        startedAt.UTC().Format(time.RFC3339),
			"total_chunks":      total,
			"completed_chunks":  completed,
			"failed_chunks":     failed,
			"pipeline_id":       pipelineID,
			"pipeline_name":     pipelineName,
		}
		if finishedAt.Valid {
			row["finished_at"] = finishedAt.Time.UTC().Format(time.RFC3339)
		}
		items = append(items, row)
	}
	if err := rows.Err(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func handleAlerts(db *sql.DB, w http.ResponseWriter, workspaceID string) {
	items := []map[string]any{}

	var failed24 int
	_ = db.QueryRow(`
		SELECT COUNT(*)
		FROM jobs j
		JOIN pipelines p ON p.id = j.pipeline_id
		WHERE p.workspace_id = $1
		  AND j.status = 'failed'
		  AND j.finished_at >= NOW() - INTERVAL '24 hours'
	`, workspaceID).Scan(&failed24)
	if failed24 > 0 {
		items = append(items, map[string]any{
			"id":       "failed_jobs_24h",
			"severity": "warning",
			"title":    "Jobs failed in the last 24 hours",
			"detail":   strconv.Itoa(failed24) + " job(s) finished with an error in the last 24 hours. Open the jobs list to see which ones.",
			"href":     "/jobs-monitor?status=failed",
			"since":    time.Now().UTC().Add(-24 * time.Hour).Format(time.RFC3339),
		})
	}

	var totalChunks, completedChunks, failedChunks int
	_ = db.QueryRow(`
		SELECT
		  COALESCE(SUM(j.total_chunks), 0),
		  COALESCE(SUM(j.completed_chunks), 0),
		  COALESCE(SUM(j.failed_chunks), 0)
		FROM jobs j
		JOIN pipelines p ON p.id = j.pipeline_id
		WHERE p.workspace_id = $1
	`, workspaceID).Scan(&totalChunks, &completedChunks, &failedChunks)

	backlog := totalChunks - completedChunks - failedChunks
	if backlog < 0 {
		backlog = 0
	}
	if backlog > 50 {
		items = append(items, map[string]any{
			"id":       "queue_backlog",
			"severity": "info",
			"title":    "A lot of work is waiting in the queue",
			"detail":   strconv.Itoa(backlog) + " pipeline steps are still waiting to run across your jobs. Check the jobs page for bottlenecks.",
			"href":     "/jobs-monitor",
			"since":    time.Now().UTC().Format(time.RFC3339),
		})
	}

	if failedChunks > 0 {
		items = append(items, map[string]any{
			"id":       "chunk_failures_total",
			"severity": "warning",
			"title":    "Some pipeline steps failed",
			"detail":   strconv.Itoa(failedChunks) + " individual step(s) failed across your jobs. Review failed jobs for details.",
			"href":     "/jobs-monitor?status=failed",
			"since":    time.Now().UTC().Format(time.RFC3339),
		})
	}

	if len(items) == 0 {
		items = append(items, map[string]any{
			"id":       "all_clear",
			"severity": "success",
			"title":    "Nothing urgent detected",
			"detail":   "No failed jobs in the last 24 hours and the work queue looks normal. You can still set up notifications on the Notifications tab.",
			"href":     "/observability?tab=alerting",
			"since":    time.Now().UTC().Format(time.RFC3339),
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{"items": items})
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
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Workspace-Id, X-Obs-Ingest-Key")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
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
