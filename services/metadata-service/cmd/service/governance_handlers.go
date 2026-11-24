package main

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func registerGovernanceRoutes(mux *http.ServeMux, db *sql.DB) {
	mux.HandleFunc("/audit/events", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}
		limit := 100
		if v := strings.TrimSpace(r.URL.Query().Get("limit")); v != "" {
			if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 500 {
				limit = n
			}
		}
		rows, err := db.Query(`
			SELECT id::text, entity_type, COALESCE(entity_id::text, ''), level, message, context::text,
			       to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
			FROM logs
			WHERE workspace_id = $1::uuid
			ORDER BY created_at DESC
			LIMIT $2
		`, workspaceID, limit)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		defer rows.Close()
		items := []map[string]any{}
		for rows.Next() {
			var id, entityType, entityID, level, message, contextText, createdAt string
			if err := rows.Scan(&id, &entityType, &entityID, &level, &message, &contextText, &createdAt); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			var ctx map[string]any
			_ = json.Unmarshal([]byte(contextText), &ctx)
			items = append(items, map[string]any{
				"id": id, "entity_type": entityType, "entity_id": entityID, "level": level,
				"message": message, "context": ctx, "created_at": createdAt,
			})
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": items})
	})

	mux.HandleFunc("/api-keys", func(w http.ResponseWriter, r *http.Request) {
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}
		switch r.Method {
		case http.MethodGet:
			rows, err := db.Query(`
				SELECT id::text, name, key_prefix, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
				       COALESCE(to_char(last_used_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), '')
				FROM api_keys
				WHERE workspace_id = $1::uuid
				ORDER BY created_at DESC
			`, workspaceID)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			defer rows.Close()
			items := []map[string]any{}
			for rows.Next() {
				var id, name, prefix, createdAt, lastUsed string
				if err := rows.Scan(&id, &name, &prefix, &createdAt, &lastUsed); err != nil {
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
					return
				}
				it := map[string]any{"id": id, "name": name, "key_prefix": prefix, "created_at": createdAt}
				if lastUsed != "" {
					it["last_used_at"] = lastUsed
				}
				items = append(items, it)
			}
			writeJSON(w, http.StatusOK, map[string]any{"items": items})
		case http.MethodPost:
			var req struct {
				Name string `json:"name"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Name) == "" {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required"})
				return
			}
			raw := make([]byte, 32)
			if _, err := rand.Read(raw); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "random source failed"})
				return
			}
			token := "dpl_" + hex.EncodeToString(raw)
			sum := sha256.Sum256([]byte(token))
			hash := hex.EncodeToString(sum[:])
			prefix := token
			if len(prefix) > 14 {
				prefix = prefix[:14]
			}
			var id string
			err := db.QueryRow(`
				INSERT INTO api_keys (workspace_id, name, key_prefix, secret_hash)
				VALUES ($1::uuid, $2, $3, $4)
				RETURNING id::text
			`, workspaceID, strings.TrimSpace(req.Name), prefix, hash).Scan(&id)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusCreated, map[string]any{
				"item": map[string]any{
					"id": id, "name": strings.TrimSpace(req.Name), "key_prefix": prefix,
					"created_at": time.Now().UTC().Format("2006-01-02T15:04:05Z"),
				},
				"token": token,
				"note":  "Store this token securely; it cannot be shown again.",
			})
		default:
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		}
	})

	mux.HandleFunc("DELETE /api-keys/{id}", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}
		id := strings.TrimSpace(r.PathValue("id"))
		if id == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "id required"})
			return
		}
		res, err := db.Exec(`DELETE FROM api_keys WHERE workspace_id = $1::uuid AND id = $2::uuid`, workspaceID, id)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "api key not found"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "deleted", "id": id})
	})

	mux.HandleFunc("/templates", func(w http.ResponseWriter, r *http.Request) {
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}
		switch r.Method {
		case http.MethodGet:
			rows, err := db.Query(`
				SELECT id::text, name, COALESCE(description,''), spec_json::text,
				       to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
				       to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
				FROM pipeline_templates
				WHERE workspace_id = $1::uuid
				ORDER BY updated_at DESC
			`, workspaceID)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			defer rows.Close()
			items := []map[string]any{}
			for rows.Next() {
				var id, name, desc, specText, createdAt, updatedAt string
				if err := rows.Scan(&id, &name, &desc, &specText, &createdAt, &updatedAt); err != nil {
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
					return
				}
				var spec map[string]any
				_ = json.Unmarshal([]byte(specText), &spec)
				if spec == nil {
					spec = map[string]any{}
				}
				items = append(items, map[string]any{
					"id": id, "name": name, "description": desc, "spec_json": spec,
					"created_at": createdAt, "updated_at": updatedAt,
				})
			}
			writeJSON(w, http.StatusOK, map[string]any{"items": items})
		case http.MethodPost:
			var req struct {
				Name        string         `json:"name"`
				Description string         `json:"description"`
				SpecJSON    map[string]any `json:"spec_json"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Name) == "" {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required"})
				return
			}
			if req.SpecJSON == nil {
				req.SpecJSON = map[string]any{}
			}
			specBytes, _ := json.Marshal(req.SpecJSON)
			var id string
			err := db.QueryRow(`
				INSERT INTO pipeline_templates (workspace_id, name, description, spec_json)
				VALUES ($1::uuid, $2, $3, $4::jsonb)
				RETURNING id::text
			`, workspaceID, strings.TrimSpace(req.Name), strings.TrimSpace(req.Description), string(specBytes)).Scan(&id)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusCreated, map[string]any{"item": map[string]any{"id": id, "name": strings.TrimSpace(req.Name)}})
		default:
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		}
	})

	mux.HandleFunc("PATCH /templates/{id}", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPatch {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}
		id := strings.TrimSpace(r.PathValue("id"))
		if id == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "id required"})
			return
		}
		var req struct {
			Name        *string        `json:"name"`
			Description *string        `json:"description"`
			SpecJSON    map[string]any `json:"spec_json"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
			return
		}
		var name, desc, specStr interface{}
		if req.Name != nil {
			name = strings.TrimSpace(*req.Name)
		}
		if req.Description != nil {
			desc = strings.TrimSpace(*req.Description)
		}
		if req.SpecJSON != nil {
			b, _ := json.Marshal(req.SpecJSON)
			specStr = string(b)
		}
		res, err := db.Exec(`
			UPDATE pipeline_templates
			SET name = COALESCE($3::text, name),
			    description = COALESCE($4::text, description),
			    spec_json = COALESCE($5::jsonb, spec_json),
			    updated_at = NOW()
			WHERE workspace_id = $1::uuid AND id = $2::uuid
		`, workspaceID, id, name, desc, specStr)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "template not found"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "updated", "id": id})
	})

	mux.HandleFunc("DELETE /templates/{id}", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}
		id := strings.TrimSpace(r.PathValue("id"))
		res, err := db.Exec(`DELETE FROM pipeline_templates WHERE workspace_id = $1::uuid AND id = $2::uuid`, workspaceID, id)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "template not found"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "deleted", "id": id})
	})

	mux.HandleFunc("/workspace/settings", func(w http.ResponseWriter, r *http.Request) {
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}
		switch r.Method {
		case http.MethodGet:
			var raw string
			err := db.QueryRow(`
				SELECT COALESCE(settings_json::text, '{}')
				FROM workspace_settings
				WHERE workspace_id = $1::uuid
			`, workspaceID).Scan(&raw)
			if err == sql.ErrNoRows {
				writeJSON(w, http.StatusOK, map[string]any{"settings": map[string]any{}})
				return
			}
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			var s map[string]any
			_ = json.Unmarshal([]byte(raw), &s)
			writeJSON(w, http.StatusOK, map[string]any{"settings": s})
		case http.MethodPatch:
			var patch map[string]any
			if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
				return
			}
			var cur map[string]any
			var curText string
			err := db.QueryRow(`SELECT COALESCE(settings_json::text, '{}') FROM workspace_settings WHERE workspace_id = $1::uuid`, workspaceID).Scan(&curText)
			if err != nil && err != sql.ErrNoRows {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			_ = json.Unmarshal([]byte(curText), &cur)
			if cur == nil {
				cur = map[string]any{}
			}
			patchKeys := make([]string, 0, len(patch))
			for k, v := range patch {
				cur[k] = v
				patchKeys = append(patchKeys, k)
			}
			if err := validateEncryptionSettings(cur); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
			out, _ := json.Marshal(cur)
			_, err = db.Exec(`
				INSERT INTO workspace_settings (workspace_id, settings_json, updated_at)
				VALUES ($1::uuid, $2::jsonb, NOW())
				ON CONFLICT (workspace_id) DO UPDATE SET settings_json = EXCLUDED.settings_json, updated_at = NOW()
			`, workspaceID, string(out))
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			keysCopy := append([]string(nil), patchKeys...)
			snapshot := string(out)
			go func(ws string, keys []string, snap string) {
				var m map[string]any
				_ = json.Unmarshal([]byte(snap), &m)
				auditWorkspaceSettingsChange(db, ws, keys)
				postGovernanceWebhooks(m)
			}(workspaceID, keysCopy, snapshot)
			writeJSON(w, http.StatusOK, map[string]any{"settings": cur})
		default:
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		}
	})
}
