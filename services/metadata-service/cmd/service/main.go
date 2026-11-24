package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"

	_ "github.com/lib/pq"
)

func main() {
	db := mustOpenDB()
	defer db.Close()

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"service": "metadata-service", "status": "ok"})
	})
	mux.HandleFunc("/summary", func(w http.ResponseWriter, r *http.Request) {
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}

		var workspaceName string
		var connections, datasets, pipelines, jobs, logsCount int
		err := db.QueryRow(`
			SELECT w.name,
			       COALESCE((SELECT COUNT(*) FROM connections c WHERE c.workspace_id = w.id), 0),
			       COALESCE((SELECT COUNT(*) FROM datasets d WHERE d.workspace_id = w.id), 0),
			       COALESCE((SELECT COUNT(*) FROM pipelines p WHERE p.workspace_id = w.id), 0),
			       COALESCE((SELECT COUNT(*) FROM jobs j JOIN pipelines p2 ON p2.id = j.pipeline_id WHERE p2.workspace_id = w.id), 0),
			       COALESCE((SELECT COUNT(*) FROM logs l WHERE l.workspace_id = w.id), 0)
			FROM workspaces w
			WHERE w.id = $1
		`, workspaceID).Scan(&workspaceName, &connections, &datasets, &pipelines, &jobs, &logsCount)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}

		rows, err := db.Query(`
			SELECT entity_type, level, message, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
			FROM logs
			WHERE workspace_id = $1
			ORDER BY created_at DESC
			LIMIT 10
		`, workspaceID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		defer rows.Close()

		recentLogs := []map[string]string{}
		for rows.Next() {
			var entityType, level, message, createdAt string
			if err := rows.Scan(&entityType, &level, &message, &createdAt); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			recentLogs = append(recentLogs, map[string]string{
				"entity_type": entityType,
				"level":       level,
				"message":     message,
				"created_at":  createdAt,
			})
		}

		var settingsJSON string
		_ = db.QueryRow(`
			SELECT COALESCE(settings_json::text, '{}')
			FROM workspace_settings
			WHERE workspace_id = $1::uuid
		`, workspaceID).Scan(&settingsJSON)
		sqlPreview := map[string]any{"default_catalog": "", "default_warehouse": ""}
		var sm map[string]any
		if settingsJSON != "" && json.Unmarshal([]byte(settingsJSON), &sm) == nil && sm != nil {
			sqlPreview["default_catalog"] = sm["sql_preview_default_catalog"]
			sqlPreview["default_warehouse"] = sm["sql_preview_default_warehouse"]
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"workspace_name": workspaceName,
			"counts": map[string]int{
				"connections": connections,
				"datasets":    datasets,
				"pipelines":   pipelines,
				"jobs":        jobs,
				"logs":        logsCount,
			},
			"recent_logs":        recentLogs,
			"sql_preview_defaults": sqlPreview,
		})
	})
	// Governance / policy snapshot (workspace-scoped; extend with real policy engine).
	mux.HandleFunc("/policy/summary", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}
		var workspaceName string
		_ = db.QueryRow(`SELECT name FROM workspaces WHERE id = $1`, workspaceID).Scan(&workspaceName)

		roleRows, err := db.Query(`SELECT role, COUNT(*) FROM users WHERE workspace_id = $1 GROUP BY role`, workspaceID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		membersByRole := map[string]int{}
		for roleRows.Next() {
			var role string
			var n int
			if err := roleRows.Scan(&role, &n); err != nil {
				roleRows.Close()
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			membersByRole[role] = n
		}
		_ = roleRows.Close()

		var datasetCount, pipelineCount int
		var maxDatasetBytes int64
		_ = db.QueryRow(`
			SELECT
				COALESCE((SELECT COUNT(*) FROM datasets d WHERE d.workspace_id = $1), 0),
				COALESCE((SELECT COUNT(*) FROM pipelines p WHERE p.workspace_id = $1), 0),
				COALESCE((SELECT MAX(d.estimated_bytes) FROM datasets d WHERE d.workspace_id = $1), 0)
		`, workspaceID).Scan(&datasetCount, &pipelineCount, &maxDatasetBytes)

		platRows, err := db.Query(`SELECT DISTINCT platform FROM connections WHERE workspace_id = $1 ORDER BY platform`, workspaceID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		connectionPlatforms := []string{}
		for platRows.Next() {
			var p string
			if err := platRows.Scan(&p); err != nil {
				platRows.Close()
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			connectionPlatforms = append(connectionPlatforms, p)
		}
		_ = platRows.Close()

		colRows, err := db.Query(`
			SELECT LOWER(k) AS col_key, COUNT(*) AS cnt
			FROM datasets d, LATERAL jsonb_object_keys(d.schema_json) AS k
			WHERE d.workspace_id = $1 AND jsonb_typeof(d.schema_json) = 'object'
			GROUP BY LOWER(k)
			ORDER BY cnt DESC
			LIMIT 300
		`, workspaceID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		type maskAgg struct {
			scope, rule, status string
			count                int
		}
		maskMap := map[string]*maskAgg{}
		for colRows.Next() {
			var colKey string
			var cnt int
			if err := colRows.Scan(&colKey, &cnt); err != nil {
				colRows.Close()
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			if scope, rule, status, ok := policyMaskingForColumn(colKey); ok {
				key := scope + "|" + rule
				if maskMap[key] == nil {
					maskMap[key] = &maskAgg{scope: scope, rule: rule, status: status, count: 0}
				}
				maskMap[key].count += cnt
			}
		}
		_ = colRows.Close()

		masking := []map[string]any{}
		for _, m := range maskMap {
			masking = append(masking, map[string]any{
				"scope": m.scope, "rule": m.rule, "status": m.status,
				"column_hits": m.count,
			})
		}
		if len(masking) == 0 {
			masking = []map[string]any{
				{"scope": "pii.none_detected", "rule": "n/a", "status": "informational", "column_hits": 0},
			}
		}

		maxGb := float64(maxDatasetBytes) / (1024 * 1024 * 1024)
		approvalGb := int(maxGb*2.0 + 120)
		if approvalGb < 100 {
			approvalGb = 100
		}
		if approvalGb > 5000 {
			approvalGb = 5000
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"workspace_id":   workspaceID,
			"workspace_name": workspaceName,
			"rbac": map[string]any{
				"roles_defined":       []string{"owner", "admin", "engineer", "viewer"},
				"default_deny_writes": false,
				"break_glass_enabled": false,
				"members_by_role":     membersByRole,
				"parity_basis":        "postgres_users_workspace_scope",
			},
			"masking": masking,
			"data_contracts": map[string]any{
				"enforced_tiers":         []string{"bronze", "silver", "gold"},
				"sla_attestation":        "freshness SLOs attach to datasets at publish time",
				"column_lineage_depth":     "table + selected columns (see lineage service)",
				"dataset_count":          datasetCount,
				"connection_platforms":   connectionPlatforms,
				"parity_basis":           "workspace_schema_json_column_scan",
			},
			"egress_policy": map[string]any{
				"require_approval_above_gb_per_day": approvalGb,
				"blocked_destination_classes":       []string{},
				"max_dataset_bytes_observed":        maxDatasetBytes,
				"parity_basis":                      "max_dataset_size_in_workspace",
			},
			"integrations": map[string]any{
				"webhooks":              []string{"POST /hooks/pipeline-status (planned)"},
				"export_dags":           "GET /pipelines/{id}/export?format=yaml",
				"pipeline_count":        pipelineCount,
				"workspace_connections": connectionPlatforms,
			},
		})
	})

	registerGovernanceRoutes(mux, db)
	registerBillingRoutes(mux, db)

	log.Println("metadata-service listening on :8086")
	_ = http.ListenAndServe(":8086", withCORS(mux))
}

func mustOpenDB() *sql.DB {
	dsn := getenv("POSTGRES_DSN", "postgres://dataplier:dataplier@postgres:5432/dataplier?sslmode=disable")
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		panic(err)
	}
	return db
}

func workspaceIDFromRequest(r *http.Request) string { return r.Header.Get("X-Workspace-Id") }

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Workspace-Id")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

// policyMaskingForColumn maps discovered schema column names to coarse masking guidance (name-pattern parity).
func policyMaskingForColumn(columnKey string) (scope, rule, status string, ok bool) {
	k := strings.ToLower(columnKey)
	switch {
	case strings.Contains(k, "email") || strings.HasSuffix(k, "_email") || k == "mail":
		return "pii.email", "hash_tokenize", "recommended", true
	case strings.Contains(k, "phone") || strings.Contains(k, "mobile") || strings.Contains(k, "msisdn") || k == "tel":
		return "pii.phone", "last_four", "optional", true
	case strings.Contains(k, "ssn") || strings.Contains(k, "social_security") || strings.Contains(k, "national_id"):
		return "pii.government_id", "tokenize", "recommended", true
	case strings.Contains(k, "credit_card") || strings.Contains(k, "card_number") || k == "pan":
		return "pii.payment_card", "vault_token", "recommended", true
	case strings.Contains(k, "password") || strings.Contains(k, "passwd") || strings.Contains(k, "secret_key"):
		return "pii.credential", "never_log_clear_text", "required", true
	case strings.Contains(k, "latitude") || strings.Contains(k, "longitude"):
		return "pii.location", "bucket_geohash", "optional", true
	default:
		return "", "", "", false
	}
}
