package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

func strSetting(v any) string {
	if v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return strings.TrimSpace(t)
	default:
		return strings.TrimSpace(fmt.Sprint(t))
	}
}

func validateEncryptionSettings(cur map[string]any) error {
	if strings.ToLower(strSetting(cur["encryption_mode"])) != "customer_managed" {
		return nil
	}
	if strSetting(cur["customer_managed_key_vault_uri"]) == "" || strSetting(cur["customer_managed_key_name"]) == "" {
		return fmt.Errorf("customer_managed_key_vault_uri and customer_managed_key_name are required when encryption_mode is customer_managed")
	}
	return nil
}

func auditWorkspaceSettingsChange(db *sql.DB, workspaceID string, keys []string) {
	ctx, _ := json.Marshal(map[string]any{"keys": keys, "at": time.Now().UTC().Format(time.RFC3339)})
	msg := "Workspace settings updated"
	_, _ = db.Exec(`
		INSERT INTO logs (workspace_id, entity_type, level, message, context)
		VALUES ($1::uuid, 'governance', 'info', $2, $3::jsonb)
	`, workspaceID, msg, string(ctx))
}

func postGovernanceWebhooks(settings map[string]any) {
	slackURL := strSetting(settings["governance_slack_webhook_url"])
	teamsURL := strSetting(settings["governance_teams_webhook_url"])
	text := "Data Plier: workspace settings were updated."
	payload := map[string]string{"text": text}
	body, _ := json.Marshal(payload)
	client := &http.Client{Timeout: 8 * time.Second}
	for _, u := range []string{slackURL, teamsURL} {
		if u == "" {
			continue
		}
		req, err := http.NewRequest(http.MethodPost, u, bytes.NewReader(body))
		if err != nil {
			continue
		}
		req.Header.Set("Content-Type", "application/json")
		_, _ = client.Do(req)
	}
}
