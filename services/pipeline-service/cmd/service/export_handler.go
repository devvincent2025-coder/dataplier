package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"gopkg.in/yaml.v3"
)

// handleExportPipeline returns a portable DAG-as-code YAML for CI, GitOps, and Airflow-class workflows.
func handleExportPipeline(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}
		pipelineID := r.PathValue("id")
		if _, err := uuid.Parse(strings.TrimSpace(pipelineID)); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid pipeline id"})
			return
		}

		st, err := loadWorkspaceSettingsMap(db, workspaceID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		prefixes := exportApprovedPrefixes(st)
		dest := strings.TrimSpace(r.URL.Query().Get("destination"))
		if len(prefixes) > 0 {
			if dest == "" {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "destination query parameter is required when export allowlists are configured"})
				return
			}
			if !destinationMatchesApproved(dest, prefixes) {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "export destination not permitted for this workspace"})
				return
			}
		}
		maxRows := exportMaxRowsFromSettings(st)

		var name, description, status string
		var builderRaw []byte
		err = db.QueryRow(`
			SELECT p.name, COALESCE(p.description, ''), p.status, COALESCE(p.builder_config::text, '{}')
			FROM pipelines p
			WHERE p.id = $1 AND p.workspace_id = $2
		`, pipelineID, workspaceID).Scan(&name, &description, &status, &builderRaw)
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "pipeline not found"})
			return
		}
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}

		nrows, err := db.Query(`
			SELECT id::text, node_type, label, position_x, position_y, COALESCE(config::text, '{}')
			FROM pipeline_nodes WHERE pipeline_id = $1 ORDER BY label
		`, pipelineID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		defer nrows.Close()
		nodes := []map[string]any{}
		for nrows.Next() {
			var id, ntype, label, cfgText string
			var px, py float64
			if err := nrows.Scan(&id, &ntype, &label, &px, &py, &cfgText); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			var cfg map[string]any
			_ = json.Unmarshal([]byte(cfgText), &cfg)
			if cfg == nil {
				cfg = map[string]any{}
			}
			nodes = append(nodes, map[string]any{
				"id": id, "node_type": ntype, "label": label, "position_x": px, "position_y": py, "config": cfg,
			})
		}

		erows, err := db.Query(`
			SELECT id::text, source_node_id::text, target_node_id::text, edge_type, COALESCE(config::text, '{}')
			FROM pipeline_edges WHERE pipeline_id = $1
		`, pipelineID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		defer erows.Close()
		edges := []map[string]any{}
		for erows.Next() {
			var id, src, tgt, etype, cfgText string
			if err := erows.Scan(&id, &src, &tgt, &etype, &cfgText); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			var cfg map[string]any
			_ = json.Unmarshal([]byte(cfgText), &cfg)
			if cfg == nil {
				cfg = map[string]any{}
			}
			edges = append(edges, map[string]any{
				"id": id, "source_node_id": src, "target_node_id": tgt, "edge_type": etype, "config": cfg,
			})
		}

		var bc map[string]any
		_ = json.Unmarshal(builderRaw, &bc)
		if bc == nil {
			bc = map[string]any{}
		}

		doc := map[string]any{
			"apiVersion": "dataplier.dev/v1",
			"kind":       "Pipeline",
			"metadata": map[string]any{
				"id":          pipelineID,
				"name":        name,
				"workspaceId": workspaceID,
				"status":      status,
			},
			"spec": map[string]any{
				"description":     description,
				"builder_config":  bc,
				"nodes":           nodes,
				"edges":           edges,
				"orchestration": map[string]any{
					"export_engine":   "dataplier-pipeline-service",
					"compatible_with": []string{"temporal", "airflow-dagbag", "argo-workflows"},
					"notes":           "Import into your orchestrator or store in Git for reviewable DAG-as-code.",
				},
			},
		}

		format := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("format")))
		if format == "" || format == "yaml" || format == "yml" {
			out, err := yaml.Marshal(doc)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			w.Header().Set("Content-Type", "application/yaml")
			w.Header().Set("X-Export-Max-Rows-Allowance", fmt.Sprintf("%d", maxRows))
			w.Header().Set("Content-Disposition", `attachment; filename="pipeline-`+pipelineID+`.yaml"`)
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(out)
			return
		}

		if format == "json" {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("X-Export-Max-Rows-Allowance", fmt.Sprintf("%d", maxRows))
			w.Header().Set("Content-Disposition", `attachment; filename="pipeline-`+pipelineID+`.json"`)
			writeJSON(w, http.StatusOK, doc)
			return
		}

		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unsupported format; use format=yaml or format=json"})
	}
}
