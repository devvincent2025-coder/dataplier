package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/google/uuid"
)

type builderConfig map[string]any

type builderNodeIn struct {
	ID         string         `json:"id"`
	NodeType   string         `json:"node_type"`
	Label      string         `json:"label"`
	PositionX  float64        `json:"position_x"`
	PositionY  float64        `json:"position_y"`
	Config     map[string]any `json:"config"`
}

type builderEdgeIn struct {
	ID           string         `json:"id"`
	SourceNodeID string         `json:"source_node_id"`
	TargetNodeID string         `json:"target_node_id"`
	EdgeType     string         `json:"edge_type"`
	Config       map[string]any `json:"config"`
}

type createPipelineBody struct {
	Name          string        `json:"name"`
	Description   string        `json:"description"`
	BuilderConfig builderConfig `json:"builder_config"`
}

type putBuilderBody struct {
	Name          string          `json:"name"`
	Description   string          `json:"description"`
	BuilderConfig builderConfig   `json:"builder_config"`
	Nodes         []builderNodeIn `json:"nodes"`
	Edges         []builderEdgeIn `json:"edges"`
}

func mustUUID(s string) (uuid.UUID, error) {
	return uuid.Parse(strings.TrimSpace(s))
}

func configJSON(m map[string]any) []byte {
	if m == nil {
		return []byte("{}")
	}
	b, err := json.Marshal(m)
	if err != nil {
		return []byte("{}")
	}
	return b
}

func handleCreatePipeline(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}
		var body createPipelineBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
			return
		}
		name := strings.TrimSpace(body.Name)
		if name == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required"})
			return
		}
		cfgBytes := configJSON(body.BuilderConfig)
		var id string
		err := db.QueryRow(`
			INSERT INTO pipelines (workspace_id, name, description, status, builder_config)
			VALUES ($1, $2, NULLIF(trim($3), ''), 'draft', $4::jsonb)
			RETURNING id::text
		`, workspaceID, name, body.Description, string(cfgBytes)).Scan(&id)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"id": id, "name": name})
	}
}

func handleGetBuilder(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}
		pipelineID := r.PathValue("id")
		if _, err := mustUUID(pipelineID); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid pipeline id"})
			return
		}
		var name, description, status string
		var builderRaw []byte
		err := db.QueryRow(`
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
		var bc map[string]any
		_ = json.Unmarshal(builderRaw, &bc)
		if bc == nil {
			bc = map[string]any{}
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
				"id": id, "node_type": ntype, "label": label,
				"position_x": px, "position_y": py, "config": cfg,
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

		writeJSON(w, http.StatusOK, map[string]any{
			"pipeline": map[string]any{
				"id": pipelineID, "name": name, "description": description, "status": status,
				"builder_config": bc,
			},
			"nodes": nodes,
			"edges": edges,
		})
	}
}

func handlePutBuilder(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}
		pipelineID := r.PathValue("id")
		if _, err := mustUUID(pipelineID); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid pipeline id"})
			return
		}
		var body putBuilderBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
			return
		}
		name := strings.TrimSpace(body.Name)
		if name == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required"})
			return
		}
		for i := range body.Nodes {
			n := &body.Nodes[i]
			if _, err := mustUUID(n.ID); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("invalid node id: %q", n.ID)})
				return
			}
			if strings.TrimSpace(n.Label) == "" {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "each node requires a label"})
				return
			}
			if strings.TrimSpace(n.NodeType) == "" {
				n.NodeType = "default"
			}
		}
		for i := range body.Edges {
			e := &body.Edges[i]
			if _, err := mustUUID(e.ID); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("invalid edge id: %q", e.ID)})
				return
			}
			if _, err := mustUUID(e.SourceNodeID); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid edge source_node_id"})
				return
			}
			if _, err := mustUUID(e.TargetNodeID); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid edge target_node_id"})
				return
			}
			if strings.TrimSpace(e.EdgeType) == "" {
				e.EdgeType = "default"
			}
		}

		tx, err := db.Begin()
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		defer func() { _ = tx.Rollback() }()

		var exists bool
		if err := tx.QueryRow(`SELECT EXISTS (SELECT 1 FROM pipelines WHERE id = $1 AND workspace_id = $2)`, pipelineID, workspaceID).Scan(&exists); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		if !exists {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "pipeline not found"})
			return
		}

		cfgBytes := configJSON(body.BuilderConfig)
		_, err = tx.Exec(`
			UPDATE pipelines SET name = $1, description = NULLIF(trim($2), ''), builder_config = $3::jsonb, updated_at = NOW()
			WHERE id = $4 AND workspace_id = $5
		`, name, body.Description, string(cfgBytes), pipelineID, workspaceID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}

		if _, err := tx.Exec(`DELETE FROM pipeline_edges WHERE pipeline_id = $1`, pipelineID); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		if _, err := tx.Exec(`DELETE FROM pipeline_nodes WHERE pipeline_id = $1`, pipelineID); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}

		for _, n := range body.Nodes {
			_, err = tx.Exec(`
				INSERT INTO pipeline_nodes (id, pipeline_id, node_type, label, position_x, position_y, config)
				VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
			`, n.ID, pipelineID, n.NodeType, n.Label, n.PositionX, n.PositionY, string(configJSON(n.Config)))
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
		}
		for _, e := range body.Edges {
			_, err = tx.Exec(`
				INSERT INTO pipeline_edges (id, pipeline_id, source_node_id, target_node_id, edge_type, config)
				VALUES ($1, $2, $3, $4, $5, $6::jsonb)
			`, e.ID, pipelineID, e.SourceNodeID, e.TargetNodeID, e.EdgeType, string(configJSON(e.Config)))
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
		}

		if err := tx.Commit(); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "saved", "id": pipelineID})
	}
}
