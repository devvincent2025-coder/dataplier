package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

func loadWorkspaceSettingsMap(db *sql.DB, workspaceID string) (map[string]any, error) {
	var raw string
	err := db.QueryRow(`
		SELECT COALESCE(settings_json::text, '{}')
		FROM workspace_settings
		WHERE workspace_id = $1::uuid
	`, workspaceID).Scan(&raw)
	if err == sql.ErrNoRows {
		return map[string]any{}, nil
	}
	if err != nil {
		return nil, err
	}
	var m map[string]any
	if err := json.Unmarshal([]byte(raw), &m); err != nil {
		return nil, err
	}
	if m == nil {
		m = map[string]any{}
	}
	return m, nil
}

func exportMaxRowsFromSettings(m map[string]any) int {
	v, ok := m["export_max_rows_per_run"]
	if !ok || v == nil {
		return 1_000_000
	}
	switch t := v.(type) {
	case float64:
		return int(t)
	case int:
		return t
	case int64:
		return int(t)
	case json.Number:
		i, _ := t.Int64()
		return int(i)
	default:
		n, err := strconv.ParseInt(strings.TrimSpace(fmt.Sprint(v)), 10, 64)
		if err != nil {
			return 1_000_000
		}
		return int(n)
	}
}

func exportApprovedPrefixes(m map[string]any) []string {
	raw, ok := m["export_approved_destination_prefixes"]
	if !ok || raw == nil {
		return nil
	}
	switch t := raw.(type) {
	case []any:
		out := make([]string, 0, len(t))
		for _, x := range t {
			s := strings.TrimSpace(fmt.Sprint(x))
			if s != "" {
				out = append(out, s)
			}
		}
		return out
	case string:
		var parts []string
		for _, line := range strings.Split(t, "\n") {
			line = strings.TrimSpace(line)
			if line != "" {
				parts = append(parts, line)
			}
		}
		return parts
	default:
		return nil
	}
}

func destinationMatchesApproved(dest string, prefixes []string) bool {
	dest = strings.TrimSpace(dest)
	if dest == "" {
		return false
	}
	for _, p := range prefixes {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if strings.HasPrefix(strings.ToLower(dest), strings.ToLower(p)) {
			return true
		}
	}
	return false
}
