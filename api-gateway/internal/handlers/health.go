package handlers

import (
	"encoding/json"
	"net/http"
)

func Health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"service": "api-gateway", "status": "ok"})
}

func RouteCatalog(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"routes":   []string{"/auth/*", "/connections/*", "/datasets/*", "/pipelines/*", "/jobs/*", "/metadata/*", "/lineage/*", "/metrics/*", "/routing/*"},
		"features": []string{"jwt", "rate-limiting", "request-tracing", "logging"},
	})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
