package middleware

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/dataplier/api-gateway/internal/config"
)

type settingsCacheEntry struct {
	settings map[string]any
	at       time.Time
}

var workspaceSettingsCache sync.Map // workspaceID -> settingsCacheEntry

const workspaceSettingsCacheTTL = 45 * time.Second

func getenvPolicy(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func workspacePolicyApplies(r *http.Request) bool {
	if r.Method == http.MethodOptions {
		return false
	}
	if strings.HasPrefix(r.URL.Path, "/metrics/ingest/") {
		return false
	}
	if r.URL.Path == "/healthz" || r.URL.Path == "/readyz" || r.URL.Path == "/" {
		return false
	}
	if strings.HasPrefix(r.URL.Path, "/auth/") {
		return false
	}
	return requiresRBAC(r.URL.Path)
}

// WorkspacePolicy enforces workspace JSON settings: API/UI IP allowlists when non-empty.
func WorkspacePolicy(cfg config.Config, next http.Handler) http.Handler {
	failOpen := getenvPolicy("GATEWAY_WORKSPACE_POLICY_FAIL_OPEN", "1") != "0"
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !workspacePolicyApplies(r) {
			next.ServeHTTP(w, r)
			return
		}
		workspaceID := strings.TrimSpace(r.Header.Get("X-Workspace-Id"))
		if workspaceID == "" {
			next.ServeHTTP(w, r)
			return
		}
		settings, err := fetchWorkspaceSettingsCached(cfg.MetadataServiceURL, workspaceID)
		if err != nil {
			if failOpen {
				log.Printf("workspace policy: settings fetch failed workspace=%s err=%v (fail-open)", workspaceID, err)
				next.ServeHTTP(w, r)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "workspace policy unavailable"})
			return
		}
		client := clientIP(r)
		apiList := strings.TrimSpace(toString(settings["api_ip_allowlist"]))
		uiList := strings.TrimSpace(toString(settings["ui_ip_allowlist"]))
		if apiList != "" && !ipMatchesAllowlist(client, apiList) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "client IP not allowed by workspace API IP policy"})
			return
		}
		if uiList != "" && !ipMatchesAllowlist(client, uiList) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "client IP not allowed by workspace UI IP policy"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func fetchWorkspaceSettingsCached(baseURL, workspaceID string) (map[string]any, error) {
	if v, ok := workspaceSettingsCache.Load(workspaceID); ok {
		ent := v.(settingsCacheEntry)
		if time.Since(ent.at) < workspaceSettingsCacheTTL {
			return ent.settings, nil
		}
	}
	base := strings.TrimSuffix(strings.TrimSpace(baseURL), "/")
	if base == "" {
		return nil, io.EOF
	}
	u := base + "/workspace/settings"
	req, err := http.NewRequest(http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Workspace-Id", workspaceID)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("metadata settings status=%d body=%s", resp.StatusCode, string(body))
	}
	var parsed struct {
		Settings map[string]any `json:"settings"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}
	if parsed.Settings == nil {
		parsed.Settings = map[string]any{}
	}
	workspaceSettingsCache.Store(workspaceID, settingsCacheEntry{settings: parsed.Settings, at: time.Now()})
	return parsed.Settings, nil
}

func toString(v any) string {
	if v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return t
	default:
		b, _ := json.Marshal(v)
		return string(b)
	}
}

func clientIP(r *http.Request) string {
xff := strings.TrimSpace(r.Header.Get("X-Forwarded-For"))
	if xff != "" {
		parts := strings.Split(xff, ",")
		if len(parts) > 0 {
			return strings.TrimSpace(parts[0])
		}
	}
	host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err != nil {
		return strings.TrimSpace(r.RemoteAddr)
	}
	return host
}

func ipMatchesAllowlist(clientIP string, raw string) bool {
	ip := net.ParseIP(clientIP)
	if ip == nil {
		return false
	}
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		for _, part := range strings.Split(line, ",") {
			part = strings.TrimSpace(part)
			if part == "" {
				continue
			}
			var n *net.IPNet
			var err error
			if strings.Contains(part, "/") {
				_, n, err = net.ParseCIDR(part)
			} else {
				p := net.ParseIP(part)
				if p == nil {
					continue
				}
				if p4 := p.To4(); p4 != nil {
					_, n, err = net.ParseCIDR(p4.String() + "/32")
				} else {
					_, n, err = net.ParseCIDR(p.String() + "/128")
				}
			}
			if err == nil && n != nil && n.Contains(ip) {
				return true
			}
		}
	}
	return false
}
