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

type datasetRecord struct {
	ID                  string          `json:"id"`
	Name                string          `json:"name"`
	ExternalID          string          `json:"external_id"`
	SchemaJSON          json.RawMessage `json:"schema_json"`
	EstimatedRows       int64           `json:"estimated_rows"`
	EstimatedBytes      int64           `json:"estimated_bytes"`
	ConnectionName      string          `json:"connection_name"`
	Platform            string          `json:"platform"`
	DiscoveredAt        string          `json:"discovered_at"`
	TableFormat         string          `json:"table_format"`
	CDCEligible         bool            `json:"cdc_eligible"`
	MultiVendorProfile  string          `json:"multi_vendor_profile"`
	DataContract        json.RawMessage `json:"data_contract"`
	TransferCostHint    json.RawMessage `json:"transfer_cost_hint"`
}

func main() {
	db := mustOpenDB()
	defer db.Close()

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"service": "dataset-service", "status": "ok"})
	})
	mux.HandleFunc("/datasets", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			methodNotAllowed(w)
			return
		}
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}

		rows, err := db.Query(`
			SELECT d.id, d.name, d.external_id, d.schema_json::text, COALESCE(d.estimated_rows, 0), COALESCE(d.estimated_bytes, 0), c.name, c.platform,
			       to_char(d.discovered_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), c.config::text
			FROM datasets d
			JOIN connections c ON c.id = d.connection_id
			WHERE d.workspace_id = $1
			ORDER BY d.discovered_at DESC
		`, workspaceID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		defer rows.Close()

		items := []datasetRecord{}
		for rows.Next() {
			var item datasetRecord
			var schemaText, connConfigText string
			if err := rows.Scan(&item.ID, &item.Name, &item.ExternalID, &schemaText, &item.EstimatedRows, &item.EstimatedBytes, &item.ConnectionName, &item.Platform, &item.DiscoveredAt, &connConfigText); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			item.SchemaJSON = json.RawMessage(schemaText)
			var connCfg map[string]any
			if connConfigText != "" && connConfigText != "{}" {
				_ = json.Unmarshal([]byte(connConfigText), &connCfg)
			}
			item.TableFormat = inferTableFormat(item.Platform, item.Name, item.ExternalID, connCfg)
			item.CDCEligible = inferCDCEligible(item.Platform, item.Name, item.ExternalID, connCfg)
			item.MultiVendorProfile = inferMultiVendorProfile(item.Platform, connCfg)
			dc := buildDataContract(item.Name, item.Platform, item.TableFormat, connCfg)
			item.DataContract = mustJSONObject(dc)
			item.TransferCostHint = mustJSONObject(buildTransferCostHint(item.EstimatedBytes, item.Platform, connCfg))
			items = append(items, item)
		}

		writeJSON(w, http.StatusOK, map[string]any{"items": items})
	})
	mux.HandleFunc("/datasets/", func(w http.ResponseWriter, r *http.Request) {
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}

		path := strings.TrimPrefix(r.URL.Path, "/datasets/")
		path = strings.Trim(path, "/")
		parts := strings.Split(path, "/")
		if len(parts) != 2 || parts[1] != "schema" {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "route not found"})
			return
		}
		datasetID := parts[0]
		if datasetID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "dataset id is required"})
			return
		}

		switch r.Method {
		case http.MethodGet:
			var schemaText string
			err := db.QueryRow(`SELECT schema_json::text FROM datasets WHERE workspace_id = $1 AND id = $2`, workspaceID, datasetID).Scan(&schemaText)
			if err == sql.ErrNoRows {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "dataset not found"})
				return
			}
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"schema_json": json.RawMessage(schemaText)})
		case http.MethodPut:
			var payload struct {
				SchemaJSON json.RawMessage `json:"schema_json"`
			}
			defer r.Body.Close()
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json payload"})
				return
			}
			if len(payload.SchemaJSON) == 0 {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "schema_json is required"})
				return
			}
			if !json.Valid(payload.SchemaJSON) {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "schema_json must be valid json"})
				return
			}

			result, err := db.Exec(`UPDATE datasets SET schema_json = $3::jsonb WHERE workspace_id = $1 AND id = $2`, workspaceID, datasetID, string(payload.SchemaJSON))
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			rowsAffected, _ := result.RowsAffected()
			if rowsAffected == 0 {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "dataset not found"})
				return
			}

			writeJSON(w, http.StatusOK, map[string]any{"status": "updated", "dataset_id": datasetID, "schema_json": payload.SchemaJSON})
		default:
			methodNotAllowed(w)
		}
	})

	log.Println("dataset-service listening on :8083")
	_ = http.ListenAndServe(":8083", withCORS(mux))
}

func mustOpenDB() *sql.DB {
	dsn := getenv("POSTGRES_DSN", "postgres://dataplier:dataplier@postgres:5432/dataplier?sslmode=disable")
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		panic(err)
	}
	return db
}

func workspaceIDFromRequest(r *http.Request) string {
	return r.Header.Get("X-Workspace-Id")
}

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
		w.Header().Set("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
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

func methodNotAllowed(w http.ResponseWriter) {
	writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
}
