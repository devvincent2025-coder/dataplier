package main

import (
	"database/sql"
	"encoding/json"
	"io"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func routeTraces(db *sql.DB, w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	ws := workspaceIDFromRequest(r)
	if ws == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
		return
	}
	sub := strings.TrimPrefix(r.URL.Path, "/metrics/traces")
	sub = strings.Trim(sub, "/")
	if sub == "" {
		handleTracesList(db, w, r, ws)
		return
	}
	handleTraceDetail(db, w, ws, sub)
}

func routeAlertRouting(db *sql.DB, w http.ResponseWriter, r *http.Request) {
	ws := workspaceIDFromRequest(r)
	if ws == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
		return
	}
	switch r.Method {
	case http.MethodGet:
		handleAlertRoutingGet(db, w, ws)
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
	}
}

func routeAlertChannels(db *sql.DB, w http.ResponseWriter, r *http.Request) {
	ws := workspaceIDFromRequest(r)
	if ws == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
		return
	}
	if r.Method == http.MethodPost {
		handleAlertChannelCreate(db, w, r, ws)
		return
	}
	writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
}

func routeAlertRules(db *sql.DB, w http.ResponseWriter, r *http.Request) {
	ws := workspaceIDFromRequest(r)
	if ws == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
		return
	}
	if r.Method == http.MethodPost {
		handleAlertRuleCreate(db, w, r, ws)
		return
	}
	writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
}

func routeAlertIncidents(db *sql.DB, w http.ResponseWriter, r *http.Request) {
	ws := workspaceIDFromRequest(r)
	if ws == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
		return
	}
	suffix := strings.TrimPrefix(r.URL.Path, "/metrics/alert-routing/incidents/")
	suffix = strings.Trim(suffix, "/")
	if suffix == "" {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "incident id required"})
		return
	}
	if r.Method == http.MethodPatch {
		handleIncidentPatch(db, w, r, ws, suffix)
		return
	}
	writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
}

// --- Distributed traces (job-correlated + native obs_trace_spans) ---

func handleTracesList(db *sql.DB, w http.ResponseWriter, r *http.Request, workspaceID string) {
	limit := 40
	if q := r.URL.Query().Get("limit"); q != "" {
		if n, err := strconv.Atoi(q); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}
	rows, err := db.Query(`
		SELECT j.id, j.status, j.started_at, j.finished_at, p.name,
		       (SELECT COUNT(*) FROM job_chunks jc WHERE jc.job_id = j.id) AS span_hint
		FROM jobs j
		JOIN pipelines p ON p.id = j.pipeline_id
		WHERE p.workspace_id = $1
		ORDER BY j.started_at DESC
		LIMIT $2
	`, workspaceID, limit)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, status, pipelineName string
		var started time.Time
		var finished sql.NullTime
		var spanHint int
		if err := rows.Scan(&id, &status, &started, &finished, &pipelineName, &spanHint); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		durMs := 0.0
		if finished.Valid {
			durMs = float64(finished.Time.Sub(started).Milliseconds())
		} else {
			durMs = float64(time.Since(started).Milliseconds())
		}
		items = append(items, map[string]any{
			"trace_id":       id,
			"kind":           "pipeline_execution",
			"pipeline_name":  pipelineName,
			"status":         status,
			"started_at":     started.UTC().Format(time.RFC3339),
			"duration_ms":    math.Round(durMs),
			"span_count_hint": spanHint + 3,
			"href_jobs":      "/jobs-monitor?job=" + id,
		})
	}
	if err := rows.Err(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func handleTraceDetail(db *sql.DB, w http.ResponseWriter, workspaceID, traceID string) {
	traceID = strings.TrimSpace(traceID)
	if traceID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing trace id"})
		return
	}

	var jobID, status, pipelineName, src, dst string
	var started time.Time
	var finished sql.NullTime
	err := db.QueryRow(`
		SELECT j.id, j.status, j.started_at, j.finished_at, p.name, j.source_platform, j.destination_platform
		FROM jobs j
		JOIN pipelines p ON p.id = j.pipeline_id
		WHERE p.workspace_id = $1 AND j.id = $2::uuid
	`, workspaceID, traceID).Scan(&jobID, &status, &started, &finished, &pipelineName, &src, &dst)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "trace not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	spans := []map[string]any{}

	rows, err := db.Query(`
		SELECT span_id, COALESCE(parent_span_id,''), service_name, operation_name, start_at, end_at, status, attrs_json
		FROM obs_trace_spans
		WHERE workspace_id = $1 AND trace_id = $2
		ORDER BY start_at ASC NULLS LAST
	`, workspaceID, traceID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var sid, pid, svc, op, st string
			var stAt time.Time
			var en sql.NullTime
			var attrs []byte
			if err := rows.Scan(&sid, &pid, &svc, &op, &stAt, &en, &st, &attrs); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			dur := 0.0
			if en.Valid {
				dur = en.Time.Sub(stAt).Seconds() * 1000
			}
			var attrObj any
			_ = json.Unmarshal(attrs, &attrObj)
			row := map[string]any{
				"span_id":         sid,
				"parent_span_id":  nilIfEmpty(pid),
				"service_name":    svc,
				"operation_name":  op,
				"start_at":        stAt.UTC().Format(time.RFC3339),
				"duration_ms":     math.Round(dur),
				"status":          st,
				"attributes":      attrObj,
				"source":          "native",
			}
			if !en.Valid {
				row["end_at"] = nil
			} else {
				row["end_at"] = en.Time.UTC().Format(time.RFC3339)
			}
			spans = append(spans, row)
		}
		if err := rows.Err(); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
	}

	chunkRows, err := db.Query(`
		SELECT jc.chunk_index, jc.state, jc.started_at, jc.finished_at, jc.bytes_processed
		FROM job_chunks jc
		JOIN jobs j ON j.id = jc.job_id
		JOIN pipelines p ON p.id = j.pipeline_id
		WHERE p.workspace_id = $1 AND jc.job_id = $2::uuid
		ORDER BY jc.chunk_index ASC
	`, workspaceID, traceID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer chunkRows.Close()
	jobParent := "00job00000000000"
	for _, s := range spans {
		if op, ok := s["operation_name"].(string); ok && strings.Contains(op, "job.") {
			if sid, ok := s["span_id"].(string); ok {
				jobParent = sid
				break
			}
		}
	}
	if len(spans) == 0 {
		spans = append(spans, defaultSyntheticSpans(traceID, pipelineName, started, finished, status, src, dst)...)
		jobParent = "synthetic-job"
	}
	for chunkRows.Next() {
		var idx int
		var st string
		var stAt, enAt sql.NullTime
		var bytes int64
		if err := chunkRows.Scan(&idx, &st, &stAt, &enAt, &bytes); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		sid := "chunk-" + strconv.Itoa(idx)
		startedC := started
		if stAt.Valid {
			startedC = stAt.Time
		}
		dur := 0.0
		if enAt.Valid && stAt.Valid {
			dur = enAt.Time.Sub(stAt.Time).Seconds() * 1000
		}
		spans = append(spans, map[string]any{
			"span_id":        sid,
			"parent_span_id": jobParent,
			"service_name":   "dataplier.transfer-worker",
			"operation_name": "chunk.execute",
			"start_at":       startedC.UTC().Format(time.RFC3339),
			"duration_ms":    math.Round(dur),
			"status":         mapChunkSpanStatus(st),
			"attributes": map[string]any{
				"chunk_index": idx, "state": st, "bytes_processed": bytes,
			},
			"source": "derived",
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"trace_id":        traceID,
		"pipeline_name":   pipelineName,
		"job_status":      status,
		"source_platform": src,
		"dest_platform":   dst,
		"spans":           spans,
	})
}

func nilIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func mapChunkSpanStatus(state string) string {
	switch strings.ToLower(state) {
	case "failed":
		return "error"
	case "completed":
		return "ok"
	default:
		return "unset"
	}
}

func defaultSyntheticSpans(traceID, pipeline string, started time.Time, finished sql.NullTime, status, src, dst string) []map[string]any {
	end := time.Now()
	if finished.Valid {
		end = finished.Time
	}
	rootDur := end.Sub(started).Seconds() * 1000
	return []map[string]any{
		{
			"span_id": "synthetic-root", "parent_span_id": nil,
			"service_name": "dataplier.control-plane", "operation_name": "pipeline.schedule",
			"start_at": started.UTC().Format(time.RFC3339), "duration_ms": math.Round(rootDur),
			"status": "ok", "attributes": map[string]any{"pipeline": pipeline, "trace_id": traceID},
			"source": "synthetic",
		},
		{
			"span_id": "synthetic-job", "parent_span_id": "synthetic-root",
			"service_name": "dataplier.job-runner", "operation_name": "job.run",
			"start_at": started.UTC().Format(time.RFC3339), "duration_ms": math.Round(rootDur * 0.95),
			"status": mapJobTraceStatus(status), "attributes": map[string]any{"job_id": traceID, "route": src + "→" + dst},
			"source": "synthetic",
		},
	}
}

func mapJobTraceStatus(jobStatus string) string {
	switch strings.ToLower(jobStatus) {
	case "failed":
		return "error"
	case "completed":
		return "ok"
	default:
		return "unset"
	}
}

// --- SLOs + burn ---

func handleSLOs(db *sql.DB, w http.ResponseWriter, workspaceID string) {
	rows, err := db.Query(`
		SELECT id, name, description, sli_kind, target_numeric, comparison, window_hours, enabled
		FROM obs_slo_definitions
		WHERE workspace_id = $1
		ORDER BY name ASC
	`, workspaceID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, name, desc, kind, comp string
		var target float64
		var wh int
		var en bool
		if err := rows.Scan(&id, &name, &desc, &kind, &target, &comp, &wh, &en); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		burn := computeSLOBurn(db, workspaceID, kind, target, comp, wh)
		burn["id"] = id
		burn["name"] = name
		burn["description"] = desc
		burn["sli_kind"] = kind
		burn["target_numeric"] = target
		burn["comparison"] = comp
		burn["window_hours"] = wh
		burn["enabled"] = en
		items = append(items, burn)
	}
	if err := rows.Err(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func computeSLOBurn(db *sql.DB, workspaceID, kind string, target float64, comp string, windowH int) map[string]any {
	out := map[string]any{
		"sli_value":                     1.0,
		"error_budget_remaining_ratio":  1.0,
		"burn_rate_1h":                  0.0,
		"burn_rate_6h":                  0.0,
		"burn_rate_24h":                 0.0,
		"slo_status":                    "healthy",
		"events_good":                   0,
		"events_bad":                    0,
		"events_total":                  0,
	}

	switch kind {
	case "job_success_ratio":
		var good, total int
		_ = db.QueryRow(`
			SELECT
			  COUNT(*) FILTER (WHERE LOWER(j.status) IN ('completed','succeeded')),
			  COUNT(*) FILTER (WHERE LOWER(j.status) IN ('completed','succeeded','failed','partial'))
			FROM jobs j
			JOIN pipelines p ON p.id = j.pipeline_id
			WHERE p.workspace_id = $1
			  AND j.finished_at >= NOW() - ($2::int * INTERVAL '1 hour')
		`, workspaceID, windowH).Scan(&good, &total)
		out["events_good"], out["events_bad"] = good, total-good
		out["events_total"] = total
		if total > 0 {
			out["sli_value"] = float64(good) / float64(total)
		}
	case "chunk_success_ratio":
		var good, total int
		_ = db.QueryRow(`
			SELECT
			  COUNT(*) FILTER (WHERE jc.state = 'completed'),
			  COUNT(*) FILTER (WHERE jc.state IN ('completed','failed') AND jc.finished_at IS NOT NULL)
			FROM job_chunks jc
			JOIN jobs j ON j.id = jc.job_id
			JOIN pipelines p ON p.id = j.pipeline_id
			WHERE p.workspace_id = $1
			  AND jc.finished_at >= NOW() - ($2::int * INTERVAL '1 hour')
		`, workspaceID, windowH).Scan(&good, &total)
		out["events_good"], out["events_bad"] = good, total-good
		out["events_total"] = total
		if total > 0 {
			out["sli_value"] = float64(good) / float64(total)
		}
	case "p95_job_duration_sec":
		var p95 sql.NullFloat64
		_ = db.QueryRow(`
			SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (j.finished_at - j.started_at)))
			FROM jobs j
			JOIN pipelines p ON p.id = j.pipeline_id
			WHERE p.workspace_id = $1
			  AND j.finished_at >= NOW() - ($2::int * INTERVAL '1 hour')
			  AND j.finished_at IS NOT NULL AND j.started_at IS NOT NULL
		`, workspaceID, windowH).Scan(&p95)
		if p95.Valid {
			out["sli_value"] = p95.Float64
		}
		out["events_total"] = 1
	}

	sli := out["sli_value"].(float64)
	if comp == "gte" && target < 1 {
		denom := 1 - target
		if denom > 0 {
			rem := (sli - target) / denom
			if rem < 0 {
				rem = 0
			}
			if rem > 1 {
				rem = 1
			}
			out["error_budget_remaining_ratio"] = math.Round(rem*1000) / 1000
		}
		if sli < target {
			out["slo_status"] = "exhausted"
		} else if sli < target+((1-target)*0.25) {
			out["slo_status"] = "at_risk"
		}
	} else if comp == "lte" {
		if sli <= target {
			out["slo_status"] = "healthy"
			out["error_budget_remaining_ratio"] = 1.0
		} else if sli <= target*1.1 {
			out["slo_status"] = "at_risk"
			out["error_budget_remaining_ratio"] = 0.35
		} else {
			out["slo_status"] = "exhausted"
			out["error_budget_remaining_ratio"] = 0.0
		}
	}

	var bad1h, bad6h, bad24h float64
	_ = db.QueryRow(`
		SELECT COUNT(*)::float FROM jobs j JOIN pipelines p ON p.id = j.pipeline_id
		WHERE p.workspace_id = $1 AND LOWER(j.status) = 'failed' AND j.finished_at >= NOW() - INTERVAL '1 hour'
	`, workspaceID).Scan(&bad1h)
	_ = db.QueryRow(`
		SELECT COUNT(*)::float FROM jobs j JOIN pipelines p ON p.id = j.pipeline_id
		WHERE p.workspace_id = $1 AND LOWER(j.status) = 'failed' AND j.finished_at >= NOW() - INTERVAL '6 hours'
	`, workspaceID).Scan(&bad6h)
	_ = db.QueryRow(`
		SELECT COUNT(*)::float FROM jobs j JOIN pipelines p ON p.id = j.pipeline_id
		WHERE p.workspace_id = $1 AND LOWER(j.status) = 'failed' AND j.finished_at >= NOW() - INTERVAL '24 hours'
	`, workspaceID).Scan(&bad24h)

	budgetPerHour := (1 - target) / float64(intMax(1, windowH))
	if budgetPerHour < 1e-6 {
		budgetPerHour = 1e-6
	}
	out["burn_rate_1h"] = math.Round((bad1h/budgetPerHour)*100) / 100
	out["burn_rate_6h"] = math.Round(((bad6h/6)/budgetPerHour)*100) / 100
	out["burn_rate_24h"] = math.Round(((bad24h/24)/budgetPerHour)*100) / 100

	return out
}

func intMax(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// --- Alert routing ---

func handleAlertRoutingGet(db *sql.DB, w http.ResponseWriter, workspaceID string) {
	channels := []map[string]any{}
	cr, err := db.Query(`
		SELECT id, name, channel_kind, destination, enabled, created_at
		FROM obs_alert_channels WHERE workspace_id = $1 ORDER BY name
	`, workspaceID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer cr.Close()
	for cr.Next() {
		var id, name, kind, dest string
		var en bool
		var cat time.Time
		if err := cr.Scan(&id, &name, &kind, &dest, &en, &cat); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		channels = append(channels, map[string]any{
			"id": id, "name": name, "channel_kind": kind,
			"destination_preview": redactDestination(kind, dest),
			"enabled":             en, "created_at": cat.UTC().Format(time.RFC3339),
		})
	}

	rules := []map[string]any{}
	rr, err := db.Query(`
		SELECT r.id, r.name, r.description, r.threshold_kind, r.threshold_json::text, r.channel_id, r.enabled, r.cooldown_minutes
		FROM obs_alert_rules r WHERE r.workspace_id = $1 ORDER BY r.name
	`, workspaceID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer rr.Close()
	for rr.Next() {
		var id, name, desc, tk, tj string
		var ch sql.NullString
		var en bool
		var cd int
		if err := rr.Scan(&id, &name, &desc, &tk, &tj, &ch, &en, &cd); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		ruleRow := map[string]any{
			"id": id, "name": name, "description": desc, "threshold_kind": tk,
			"threshold_json": json.RawMessage(tj), "enabled": en,
			"cooldown_minutes": cd,
		}
		if ch.Valid {
			ruleRow["channel_id"] = ch.String
		}
		rules = append(rules, ruleRow)
	}

	incidents := []map[string]any{}
	ir, err := db.Query(`
		SELECT id, rule_id, severity, title, detail, status, fingerprint, fired_at,
		       acknowledged_at, closed_at, deliveries_json::text
		FROM obs_alert_incidents
		WHERE workspace_id = $1
		ORDER BY fired_at DESC
		LIMIT 50
	`, workspaceID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer ir.Close()
	for ir.Next() {
		var id, sev, title, detail, st, fp, delJSON string
		var ruleID sql.NullString
		var fired time.Time
		var ack, clo sql.NullTime
		if err := ir.Scan(&id, &ruleID, &sev, &title, &detail, &st, &fp, &fired, &ack, &clo, &delJSON); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		row := map[string]any{
			"id": id, "severity": sev, "title": title, "detail": detail, "status": st,
			"fingerprint": fp, "fired_at": fired.UTC().Format(time.RFC3339),
			"deliveries":  json.RawMessage(delJSON),
		}
		if ruleID.Valid {
			row["rule_id"] = ruleID.String
		}
		if ack.Valid {
			row["acknowledged_at"] = ack.Time.UTC().Format(time.RFC3339)
		}
		if clo.Valid {
			row["closed_at"] = clo.Time.UTC().Format(time.RFC3339)
		}
		incidents = append(incidents, row)
	}

	evaluations := evaluateAlertRules(db, workspaceID)

	writeJSON(w, http.StatusOK, map[string]any{
		"channels": channels, "rules": rules, "incidents": incidents, "evaluations": evaluations,
	})
}

func redactDestination(kind, dest string) string {
	if len(dest) < 12 {
		return dest
	}
	if kind == "email" {
		return dest
	}
	return dest[:8] + "…" + dest[len(dest)-6:]
}

func evaluateAlertRules(db *sql.DB, workspaceID string) []map[string]any {
	out := []map[string]any{}
	rows, err := db.Query(`
		SELECT id, name, threshold_kind, threshold_json::text, channel_id, enabled
		FROM obs_alert_rules WHERE workspace_id = $1
	`, workspaceID)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var id, name, tk, tj string
		var ch sql.NullString
		var en bool
		if err := rows.Scan(&id, &name, &tk, &tj, &ch, &en); err != nil {
			continue
		}
		if !en {
			out = append(out, map[string]any{"rule_id": id, "rule_name": name, "firing": false, "reason": "disabled"})
			continue
		}
		firing, reason := evalOneRule(db, workspaceID, tk, tj)
		out = append(out, map[string]any{
			"rule_id": id, "rule_name": name, "firing": firing, "reason": reason,
			"routed_channel_id": ch.String,
		})
	}
	return out
}

func evalOneRule(db *sql.DB, workspaceID, kind, thresholdJSON string) (bool, string) {
	var th map[string]any
	_ = json.Unmarshal([]byte(thresholdJSON), &th)
	switch kind {
	case "failed_jobs_24h":
		minV := 1.0
		if v, ok := th["min"].(float64); ok {
			minV = v
		}
		var n int
		_ = db.QueryRow(`
			SELECT COUNT(*) FROM jobs j JOIN pipelines p ON p.id = j.pipeline_id
			WHERE p.workspace_id = $1 AND LOWER(j.status)='failed' AND j.finished_at >= NOW() - INTERVAL '24 hours'
		`, workspaceID).Scan(&n)
		if float64(n) >= minV {
			return true, strconv.Itoa(n) + " failed job(s) in 24h (min " + strconv.FormatFloat(minV, 'f', -1, 64) + ")"
		}
		return false, "below threshold"
	case "queue_backlog":
		minV := 50.0
		if v, ok := th["min"].(float64); ok {
			minV = v
		}
		var tot, comp, fail int
		_ = db.QueryRow(`
			SELECT COALESCE(SUM(j.total_chunks),0), COALESCE(SUM(j.completed_chunks),0), COALESCE(SUM(j.failed_chunks),0)
			FROM jobs j JOIN pipelines p ON p.id = j.pipeline_id WHERE p.workspace_id = $1
		`, workspaceID).Scan(&tot, &comp, &fail)
		backlog := tot - comp - fail
		if backlog < 0 {
			backlog = 0
		}
		if float64(backlog) >= minV {
			return true, "queue backlog " + strconv.Itoa(backlog)
		}
		return false, "backlog nominal"
	case "slo_burn_fast":
		br := 3.0
		if v, ok := th["burn_threshold"].(float64); ok {
			br = v
		}
		var bad1h float64
		_ = db.QueryRow(`
			SELECT COUNT(*)::float FROM jobs j JOIN pipelines p ON p.id = j.pipeline_id
			WHERE p.workspace_id = $1 AND LOWER(j.status)='failed' AND j.finished_at >= NOW() - INTERVAL '1 hour'
		`, workspaceID).Scan(&bad1h)
		if bad1h >= br {
			return true, "fast burn: " + strconv.FormatFloat(bad1h, 'f', -1, 64) + " failed jobs in 1h vs threshold " + strconv.FormatFloat(br, 'f', -1, 64)
		}
		return false, "burn nominal"
	default:
		return false, "unknown rule kind"
	}
}

func handleAlertChannelCreate(db *sql.DB, w http.ResponseWriter, r *http.Request, workspaceID string) {
	var body struct {
		Name           string  `json:"name"`
		ChannelKind    string  `json:"channel_kind"`
		Destination    string  `json:"destination"`
		HeadersJSON    any     `json:"headers_json"`
		Enabled        *bool   `json:"enabled"`
		SigningSecret  *string `json:"signing_secret"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	if strings.TrimSpace(body.Name) == "" || strings.TrimSpace(body.ChannelKind) == "" || strings.TrimSpace(body.Destination) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name, channel_kind, destination required"})
		return
	}
	hj, _ := json.Marshal(body.HeadersJSON)
	if hj == nil || string(hj) == "null" {
		hj = []byte("{}")
	}
	en := true
	if body.Enabled != nil {
		en = *body.Enabled
	}
	sec := ""
	if body.SigningSecret != nil {
		sec = strings.TrimSpace(*body.SigningSecret)
	}
	var id string
	err := db.QueryRow(`
		INSERT INTO obs_alert_channels (workspace_id, name, channel_kind, destination, headers_json, enabled, signing_secret)
		VALUES ($1, $2, $3, $4, $5::jsonb, $6, NULLIF(TRIM($7),''))
		RETURNING id
	`, workspaceID, body.Name, body.ChannelKind, body.Destination, string(hj), en, sec).Scan(&id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": id, "status": "created"})
}

func handleAlertRuleCreate(db *sql.DB, w http.ResponseWriter, r *http.Request, workspaceID string) {
	var body struct {
		Name           string         `json:"name"`
		Description    string         `json:"description"`
		ThresholdKind  string         `json:"threshold_kind"`
		ThresholdJSON  map[string]any `json:"threshold_json"`
		ChannelID      string         `json:"channel_id"`
		Enabled        *bool          `json:"enabled"`
		CooldownMinutes *int          `json:"cooldown_minutes"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	if strings.TrimSpace(body.Name) == "" || strings.TrimSpace(body.ThresholdKind) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name and threshold_kind required"})
		return
	}
	tj, _ := json.Marshal(body.ThresholdJSON)
	if string(tj) == "null" || len(tj) == 0 {
		tj = []byte("{}")
	}
	en := true
	if body.Enabled != nil {
		en = *body.Enabled
	}
	cd := 60
	if body.CooldownMinutes != nil && *body.CooldownMinutes > 0 {
		cd = *body.CooldownMinutes
	}
	ch := sql.NullString{String: body.ChannelID, Valid: body.ChannelID != ""}
	var id string
	err := db.QueryRow(`
		INSERT INTO obs_alert_rules (workspace_id, name, description, threshold_kind, threshold_json, channel_id, enabled, cooldown_minutes)
		VALUES ($1, $2, $3, $4, $5::jsonb, NULLIF($6,'')::uuid, $7, $8)
		RETURNING id
	`, workspaceID, body.Name, body.Description, body.ThresholdKind, string(tj), ch.String, en, cd).Scan(&id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": id, "status": "created"})
}

func handleIncidentPatch(db *sql.DB, w http.ResponseWriter, r *http.Request, workspaceID, incidentID string) {
	var body struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	st := strings.ToLower(strings.TrimSpace(body.Status))
	if st != "acknowledged" && st != "closed" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "status must be acknowledged or closed"})
		return
	}
	var res sql.Result
	var err error
	if st == "acknowledged" {
		res, err = db.Exec(`
			UPDATE obs_alert_incidents SET status = 'acknowledged', acknowledged_at = COALESCE(acknowledged_at, NOW())
			WHERE id = $1::uuid AND workspace_id = $2::uuid
		`, incidentID, workspaceID)
	} else {
		res, err = db.Exec(`
			UPDATE obs_alert_incidents SET status = 'closed', closed_at = NOW()
			WHERE id = $1::uuid AND workspace_id = $2::uuid
		`, incidentID, workspaceID)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "incident not found"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": incidentID, "status": st})
}

// --- Correlation bundle ---

func handleCorrelation(db *sql.DB, w http.ResponseWriter, r *http.Request, workspaceID string) {
	jobID := strings.TrimSpace(r.URL.Query().Get("job_id"))
	if jobID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "job_id required"})
		return
	}
	var payload = map[string]any{"job_id": jobID, "logs": []map[string]any{}}

	logRows, err := db.Query(`
		SELECT entity_type, level, message, created_at
		FROM logs
		WHERE workspace_id = $1 AND entity_id = $2::uuid
		ORDER BY created_at DESC
		LIMIT 40
	`, workspaceID, jobID)
	if err == nil {
		defer logRows.Close()
		logs := []map[string]any{}
		for logRows.Next() {
			var et, lvl, msg string
			var cat time.Time
			if err := logRows.Scan(&et, &lvl, &msg, &cat); err != nil {
				break
			}
			logs = append(logs, map[string]any{
				"entity_type": et, "level": lvl, "message": msg, "created_at": cat.UTC().Format(time.RFC3339),
			})
		}
		payload["logs"] = logs
	}

	payload["links"] = map[string]string{
		"jobs":     "/jobs-monitor?job=" + jobID,
		"lineage":  "/jobs-monitor?lineage=1&lineageJob=" + jobID,
		"trace":    "/observability?tab=traces&trace=" + jobID,
		"explorer": "/dataset-explorer",
	}
	writeJSON(w, http.StatusOK, payload)
}
