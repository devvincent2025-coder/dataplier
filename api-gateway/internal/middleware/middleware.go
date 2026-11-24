package middleware

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/dataplier/api-gateway/internal/config"
)

func RequestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("method=%s path=%s duration=%s", r.Method, r.URL.Path, time.Since(started))
	})
}

func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Workspace-Id, X-Obs-Ingest-Key, X-Request-Id")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func RateLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-RateLimit-Policy", "workspace-burst-120")
		next.ServeHTTP(w, r)
	})
}

func JWTAuth(next http.Handler, cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/metrics/ingest/") {
			if cfg.ObsIngestSecret != "" && strings.TrimSpace(r.Header.Get("X-Obs-Ingest-Key")) == cfg.ObsIngestSecret {
				next.ServeHTTP(w, r)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "invalid ingest key"})
			return
		}
		if r.URL.Path == "/healthz" ||
			r.URL.Path == "/readyz" ||
			r.URL.Path == "/" ||
			r.URL.Path == "/webhooks/stripe" ||
			r.URL.Path == "/auth/login" ||
			r.URL.Path == "/auth/signup" ||
			r.URL.Path == "/auth/forgot-password" ||
			r.URL.Path == "/auth/pricing/plans" ||
			r.URL.Path == "/auth/oauth/providers" ||
			r.URL.Path == "/auth/invite/preview" ||
			r.URL.Path == "/auth/invite/accept" {
			next.ServeHTTP(w, r)
			return
		}

		if r.Header.Get("Authorization") == "" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "missing authorization header"})
			return
		}

		if requiresRBAC(r.URL.Path) {
			workspaceID := r.Header.Get("X-Workspace-Id")
			if workspaceID == "" {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusBadRequest)
				_ = json.NewEncoder(w).Encode(map[string]string{"error": "missing x-workspace-id header"})
				return
			}
			allowed, role, permissions, authErr := authorizeRequest(r, cfg.AuthServiceURL, workspaceID)
			if authErr != nil {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				_ = json.NewEncoder(w).Encode(map[string]string{"error": authErr.Error()})
				return
			}
			if !allowed {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				_ = json.NewEncoder(w).Encode(map[string]string{"error": "forbidden"})
				return
			}
			r.Header.Set("X-Workspace-Role", role)
			r.Header.Set("X-Workspace-Permissions", permissions)
		}

		next.ServeHTTP(w, r)
	})
}

func authorizeRequest(r *http.Request, authServiceURL string, workspaceID string) (bool, string, string, error) {
	payload := map[string]string{
		"workspace_id": workspaceID,
		"method":       r.Method,
		"path":         r.URL.Path,
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPost, fmt.Sprintf("%s/authorize", authServiceURL), bytes.NewBuffer(body))
	if err != nil {
		return false, "", "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", r.Header.Get("Authorization"))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false, "", "", err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1024*1024))
	if resp.StatusCode != http.StatusOK {
		return false, "", "", fmt.Errorf("authorization failed")
	}
	var parsed struct {
		Allowed     bool     `json:"allowed"`
		Role        string   `json:"role"`
		Permissions []string `json:"permissions"`
	}
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return false, "", "", err
	}
	return parsed.Allowed, parsed.Role, joinPermissions(parsed.Permissions), nil
}

func requiresRBAC(path string) bool {
	return path == "/connections" ||
		path == "/connections/test" ||
		path == "/datasets" ||
		path == "/pipelines" ||
		path == "/jobs" ||
		strings.HasPrefix(path, "/metadata/") ||
		(strings.HasPrefix(path, "/metrics/") && !strings.HasPrefix(path, "/metrics/ingest/")) ||
		path == "/lineage/graph" ||
		(len(path) > 9 && path[:9] == "/lineage/") ||
		(len(path) > 9 && path[:9] == "/routing/") ||
		strings.HasPrefix(path, "/connections/catalog/") ||
		(len(path) > 12 && path[:12] == "/connections/") ||
		(len(path) > 10 && path[:10] == "/datasets/") ||
		(len(path) > 11 && path[:11] == "/pipelines/") ||
		(len(path) > 6 && path[:6] == "/jobs/")
}

func joinPermissions(permissions []string) string {
	if len(permissions) == 0 {
		return ""
	}
	joined := permissions[0]
	for idx := 1; idx < len(permissions); idx++ {
		joined += "," + permissions[idx]
	}
	return joined
}
