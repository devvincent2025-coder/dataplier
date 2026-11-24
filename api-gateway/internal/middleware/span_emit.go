package middleware

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/dataplier/api-gateway/internal/config"
)

type statusRecorder struct {
	http.ResponseWriter
	code int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.code = code
	s.ResponseWriter.WriteHeader(code)
}

// GatewaySpanEmitter records one span per authenticated tenant request (fire-and-forget POST to observability ingest).
func GatewaySpanEmitter(cfg config.Config, next http.Handler) http.Handler {
	if strings.TrimSpace(cfg.ObsIngestSecret) == "" || strings.TrimSpace(cfg.ObservabilityServiceURL) == "" {
		return next
	}
	base := strings.TrimSuffix(cfg.ObservabilityServiceURL, "/")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}
		ws := strings.TrimSpace(r.Header.Get("X-Workspace-Id"))
		if ws == "" || strings.HasPrefix(r.URL.Path, "/metrics/ingest/") {
			next.ServeHTTP(w, r)
			return
		}
		rec := &statusRecorder{ResponseWriter: w, code: 200}
		started := time.Now().UTC()
		traceID := strings.TrimSpace(r.Header.Get("X-Request-Id"))
		if traceID == "" {
			traceID = "gw-" + started.Format("20060102T150405.000000000")
		}
		spanID := "gwspan-" + traceID + "-" + strconv.FormatInt(started.UnixNano(), 10)
		next.ServeHTTP(rec, r)
		dur := time.Since(started).Seconds()
		status := "ok"
		if rec.code >= 500 {
			status = "error"
		} else if rec.code >= 400 {
			status = "unset"
		}
		end := started.Add(time.Duration(dur * float64(time.Second)))
		payload := map[string]any{
			"spans": []map[string]any{
				{
					"trace_id":       traceID,
					"span_id":        spanID,
					"parent_span_id": nil,
					"service_name":   "dataplier.api-gateway",
					"operation_name": r.Method + " " + r.URL.Path,
					"start_at":       started.Format(time.RFC3339Nano),
					"end_at":         end.Format(time.RFC3339Nano),
					"status":         status,
					"attrs": map[string]any{
						"http.path":        r.URL.Path,
						"http.method":      r.Method,
						"http.status_code": rec.code,
						"duration_seconds": dur,
						"gateway.emit":     true,
					},
				},
			},
		}
		body, err := json.Marshal(payload)
		if err != nil {
			return
		}
		secret := cfg.ObsIngestSecret
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
			defer cancel()
			req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/metrics/ingest/spans", bytes.NewReader(body))
			if err != nil {
				return
			}
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-Workspace-Id", ws)
			req.Header.Set("X-Obs-Ingest-Key", secret)
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				log.Printf("gateway span ingest failed: %v", err)
				return
			}
			_ = resp.Body.Close()
			if resp.StatusCode >= 300 {
				log.Printf("gateway span ingest status=%d", resp.StatusCode)
			}
		}()
	})
}
