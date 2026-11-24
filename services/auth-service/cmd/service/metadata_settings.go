package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

type wsCacheEntry struct {
	settings map[string]any
	at       time.Time
}

var workspaceSettingsCache sync.Map

const workspaceSettingsTTL = 45 * time.Second

func getenvMetadataURL() string {
	return strings.TrimSuffix(strings.TrimSpace(os.Getenv("METADATA_SERVICE_URL")), "/")
}

func fetchWorkspaceSettingsMap(workspaceID string) (map[string]any, error) {
	if v, ok := workspaceSettingsCache.Load(workspaceID); ok {
		e := v.(wsCacheEntry)
		if time.Since(e.at) < workspaceSettingsTTL {
			return e.settings, nil
		}
	}
	base := getenvMetadataURL()
	if base == "" {
		return nil, fmt.Errorf("metadata url not configured")
	}
	req, err := http.NewRequest(http.MethodGet, base+"/workspace/settings", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Workspace-Id", workspaceID)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("metadata %d", resp.StatusCode)
	}
	var parsed struct {
		Settings map[string]any `json:"settings"`
	}
	if err := json.Unmarshal(b, &parsed); err != nil {
		return nil, err
	}
	if parsed.Settings == nil {
		parsed.Settings = map[string]any{}
	}
	workspaceSettingsCache.Store(workspaceID, wsCacheEntry{settings: parsed.Settings, at: time.Now()})
	return parsed.Settings, nil
}

func sessionMaxAgeMinutes(workspaceID string) int {
	if strings.TrimSpace(workspaceID) == "" {
		return 24 * 60
	}
	st, err := fetchWorkspaceSettingsMap(workspaceID)
	if err != nil {
		return 24 * 60
	}
	v, ok := st["session_max_age_minutes"]
	if !ok || v == nil {
		return 24 * 60
	}
	n := intFromAny(v)
	if n < 5 {
		return 5
	}
	if n > 43200 {
		return 43200
	}
	return n
}

func sessionIdleMinutes(workspaceID string) int {
	if strings.TrimSpace(workspaceID) == "" {
		return 0
	}
	st, err := fetchWorkspaceSettingsMap(workspaceID)
	if err != nil {
		return 0
	}
	v, ok := st["session_idle_timeout_minutes"]
	if !ok || v == nil {
		return 0
	}
	n := intFromAny(v)
	if n < 5 {
		return 5
	}
	if n > 1440 {
		return 1440
	}
	return n
}

func intFromAny(v any) int {
	switch t := v.(type) {
	case float64:
		return int(t)
	case int:
		return t
	case json.Number:
		i, _ := t.Int64()
		return int(i)
	default:
		return 0
	}
}
