package main

import (
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"
)

func ingestAuthorized(r *http.Request) bool {
	sec := getenv("OBS_INGEST_SECRET", "")
	if sec == "" {
		return false
	}
	return strings.TrimSpace(r.Header.Get("X-Obs-Ingest-Key")) == sec
}

type ingestSpanIn struct {
	TraceID       string          `json:"trace_id"`
	SpanID        string          `json:"span_id"`
	ParentSpanID  *string         `json:"parent_span_id"`
	ServiceName   string          `json:"service_name"`
	OperationName string          `json:"operation_name"`
	StartAt       string          `json:"start_at"`
	EndAt         *string         `json:"end_at"`
	Status        string          `json:"status"`
	Attrs         json.RawMessage `json:"attrs"`
}

func handleIngestSpans(db *sql.DB, w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	if !ingestAuthorized(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid or missing X-Obs-Ingest-Key (set OBS_INGEST_SECRET on service)"})
		return
	}
	workspaceID := strings.TrimSpace(r.Header.Get("X-Workspace-Id"))
	if workspaceID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
		return
	}
	var body struct {
		Spans []ingestSpanIn `json:"spans"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4<<20)).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	if len(body.Spans) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "spans array required"})
		return
	}
	if len(body.Spans) > 200 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "max 200 spans per batch"})
		return
	}

	tx, err := db.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer func() { _ = tx.Rollback() }()

	for _, sp := range body.Spans {
		if strings.TrimSpace(sp.TraceID) == "" || strings.TrimSpace(sp.SpanID) == "" ||
			strings.TrimSpace(sp.ServiceName) == "" || strings.TrimSpace(sp.OperationName) == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "each span needs trace_id, span_id, service_name, operation_name"})
			return
		}
		st := strings.TrimSpace(sp.Status)
		if st == "" {
			st = "unset"
		}
		startAt, err := time.Parse(time.RFC3339, sp.StartAt)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "start_at must be RFC3339: " + sp.SpanID})
			return
		}
		var endPtr *time.Time
		if sp.EndAt != nil && strings.TrimSpace(*sp.EndAt) != "" {
			t, e2 := time.Parse(time.RFC3339, strings.TrimSpace(*sp.EndAt))
			if e2 != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "end_at RFC3339: " + sp.SpanID})
				return
			}
			endPtr = &t
		}
		attrs := sp.Attrs
		if len(attrs) == 0 || string(attrs) == "null" {
			attrs = []byte("{}")
		}
		parent := ""
		if sp.ParentSpanID != nil {
			parent = strings.TrimSpace(*sp.ParentSpanID)
		}
		_, err = tx.Exec(`
			INSERT INTO obs_trace_spans (workspace_id, trace_id, span_id, parent_span_id, service_name, operation_name, start_at, end_at, status, attrs_json)
			VALUES ($1::uuid, $2, $3, NULLIF($4,''), $5, $6, $7, $8, $9, $10::jsonb)
			ON CONFLICT (trace_id, span_id) DO UPDATE SET
			  service_name = EXCLUDED.service_name,
			  operation_name = EXCLUDED.operation_name,
			  start_at = EXCLUDED.start_at,
			  end_at = EXCLUDED.end_at,
			  status = EXCLUDED.status,
			  attrs_json = EXCLUDED.attrs_json
		`, workspaceID, sp.TraceID, sp.SpanID, parent, sp.ServiceName, sp.OperationName, startAt.UTC(), nullableTime(endPtr), st, string(attrs))
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"accepted": len(body.Spans)})
}

func nullableTime(t *time.Time) any {
	if t == nil {
		return nil
	}
	return t.UTC()
}
