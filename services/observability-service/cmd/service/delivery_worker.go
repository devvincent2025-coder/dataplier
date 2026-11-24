package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

func startDeliveryWorker(db *sql.DB) {
	if strings.TrimSpace(getenv("OBS_DELIVERY_WORKER", "1")) == "0" {
		log.Println("observability delivery worker disabled (OBS_DELIVERY_WORKER=0)")
		return
	}
	go func() {
		t := time.NewTicker(12 * time.Second)
		defer t.Stop()
		for range t.C {
			processDeliveryBatch(db)
			evaluateAndEnqueueAlerts(db)
		}
	}()
	log.Println("observability delivery worker started (12s tick)")
}

func processDeliveryBatch(db *sql.DB) {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return
	}
	defer func() { _ = tx.Rollback() }()

	rows, err := tx.QueryContext(ctx, `
		SELECT q.id, q.workspace_id, q.channel_id, q.payload_json::text, q.attempt_count, q.max_attempts, q.idempotency_key
		FROM obs_alert_delivery_queue q
		WHERE q.status IN ('pending', 'failed')
		  AND q.channel_id IS NOT NULL
		  AND q.next_attempt_at <= NOW()
		  AND q.attempt_count < q.max_attempts
		ORDER BY q.next_attempt_at ASC
		LIMIT 15
		FOR UPDATE SKIP LOCKED
	`)
	if err != nil {
		return
	}
	defer rows.Close()

	type row struct {
		id, ws, ch, payload, idem string
		attempt, max              int
	}
	var batch []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.id, &r.ws, &r.ch, &r.payload, &r.attempt, &r.max, &r.idem); err != nil {
			return
		}
		batch = append(batch, r)
	}
	if err := rows.Err(); err != nil {
		return
	}
	if len(batch) == 0 {
		_ = tx.Commit()
		return
	}

	for _, item := range batch {
		_, _ = tx.ExecContext(ctx, `UPDATE obs_alert_delivery_queue SET status = 'sending' WHERE id = $1::uuid`, item.id)
	}
	if err := tx.Commit(); err != nil {
		return
	}

	for _, item := range batch {
		sendOneDelivery(db, item.id, item.ws, item.ch, item.payload, item.attempt, item.max, item.idem)
	}
}

func sendOneDelivery(db *sql.DB, id, workspaceID, channelID, payloadJSON string, attempt, maxAttempts int, idem string) {
	var kind, dest, sec sql.NullString
	err := db.QueryRow(`
		SELECT channel_kind, destination, signing_secret FROM obs_alert_channels WHERE id = $1::uuid AND workspace_id = $2::uuid
	`, channelID, workspaceID).Scan(&kind, &dest, &sec)
	if err != nil || !kind.Valid || !dest.Valid {
		markDeliveryDead(db, id, "channel missing or invalid")
		return
	}

	k := strings.ToLower(strings.TrimSpace(kind.String))
	body := []byte(payloadJSON)
	secret := strings.TrimSpace(sec.String)
	if secret == "" {
		secret = strings.TrimSpace(getenv("OBS_WEBHOOK_DEFAULT_SECRET", ""))
	}
	if secret == "" {
		secret = strings.TrimSpace(getenv("OBS_INGEST_SECRET", ""))
	}

	switch k {
	case "webhook", "slack_incoming", "pagerduty_events":
		sigHex := ""
		if secret != "" {
			mac := hmac.New(sha256.New, []byte(secret))
			_, _ = mac.Write(body)
			sigHex = hex.EncodeToString(mac.Sum(nil))
		}
		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimSpace(dest.String), bytes.NewReader(body))
		if err != nil {
			scheduleRetry(db, id, attempt, maxAttempts, err.Error(), sigHex)
			return
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("User-Agent", "dataplier-observability/1.0")
		if sigHex != "" {
			req.Header.Set("X-Dataplier-Signature", "sha256="+sigHex)
		}
		req.Header.Set("X-Dataplier-Delivery-Id", id)
		req.Header.Set("X-Dataplier-Workspace-Id", workspaceID)
		req.Header.Set("X-Dataplier-Idempotency-Key", idem)

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			scheduleRetry(db, id, attempt, maxAttempts, err.Error(), sigHex)
			return
		}
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		_ = resp.Body.Close()
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			markDeliverySent(db, id, sigHex)
			return
		}
		scheduleRetry(db, id, attempt, maxAttempts, fmt.Sprintf("http %d: %s", resp.StatusCode, string(b)), sigHex)
	case "email":
		markDeliverySent(db, id, "")
	default:
		markDeliveryDead(db, id, "unsupported channel_kind: "+k)
	}
}

func markDeliverySent(db *sql.DB, id, sigHex string) {
	_, err := db.Exec(`
		UPDATE obs_alert_delivery_queue
		SET status = 'sent', sent_at = NOW(), signature_hex = COALESCE(NULLIF($2,''), signature_hex), last_error = NULL
		WHERE id = $1::uuid
	`, id, sigHex)
	if err != nil {
		log.Printf("delivery mark sent: %v", err)
	}
}

func markDeliveryDead(db *sql.DB, id, msg string) {
	_, _ = db.Exec(`
		UPDATE obs_alert_delivery_queue SET status = 'dead', last_error = $2, attempt_count = max_attempts WHERE id = $1::uuid
	`, id, truncateErr(msg))
}

func scheduleRetry(db *sql.DB, id string, attempt, maxAttempts int, errMsg, sigHex string) {
	next := attempt + 1
	if next >= maxAttempts {
		_, _ = db.Exec(`
			UPDATE obs_alert_delivery_queue
			SET status = 'dead', attempt_count = attempt_count + 1, last_error = $2, signature_hex = COALESCE(NULLIF($3,''), signature_hex)
			WHERE id = $1::uuid
		`, id, truncateErr(errMsg), sigHex)
		return
	}
	d := backoffForAttempt(next)
	secs := int(d.Seconds())
	if secs < 1 {
		secs = 1
	}
	_, err := db.Exec(`
		UPDATE obs_alert_delivery_queue
		SET status = 'failed', attempt_count = attempt_count + 1, last_error = $2,
		    next_attempt_at = NOW() + ($3 * INTERVAL '1 second'),
		    signature_hex = COALESCE(NULLIF($4,''), signature_hex)
		WHERE id = $1::uuid
	`, id, truncateErr(errMsg), secs, sigHex)
	if err != nil {
		log.Printf("delivery retry schedule: %v", err)
	}
}

func truncateErr(s string) string {
	if len(s) > 900 {
		return s[:900]
	}
	return s
}

func backoffForAttempt(attempt int) time.Duration {
	switch attempt {
	case 1:
		return 30 * time.Second
	case 2:
		return 2 * time.Minute
	case 3:
		return 8 * time.Minute
	case 4:
		return 20 * time.Minute
	default:
		return time.Hour
	}
}

func evaluateAndEnqueueAlerts(db *sql.DB) {
	rows, err := db.Query(`SELECT DISTINCT workspace_id FROM obs_alert_rules WHERE enabled`)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var ws string
		if err := rows.Scan(&ws); err != nil {
			return
		}
		enqueueForWorkspace(db, ws)
	}
}

func enqueueForWorkspace(db *sql.DB, workspaceID string) {
	ruleRows, err := db.Query(`
		SELECT id, name, threshold_kind, threshold_json::text, channel_id::text
		FROM obs_alert_rules WHERE workspace_id = $1::uuid AND enabled AND channel_id IS NOT NULL
	`, workspaceID)
	if err != nil {
		return
	}
	defer ruleRows.Close()
	for ruleRows.Next() {
		var id, name, tk, tj, ch string
		if err := ruleRows.Scan(&id, &name, &tk, &tj, &ch); err != nil {
			return
		}
		firing, reason := evalOneRule(db, workspaceID, tk, tj)
		if !firing {
			continue
		}
		hourBucket := time.Now().UTC().Format("2006010215")
		idem := tk + ":" + hourBucket + ":" + id
		payload := map[string]any{
			"type":          "dataplier.alert",
			"version":       1,
			"workspace_id":  workspaceID,
			"rule_id":       id,
			"rule_name":     name,
			"threshold_kind": tk,
			"fired_at":      time.Now().UTC().Format(time.RFC3339),
			"reason":        reason,
		}
		pj, _ := json.Marshal(payload)
		_, err := db.Exec(`
			INSERT INTO obs_alert_delivery_queue (workspace_id, channel_id, payload_json, idempotency_key, max_attempts, status)
			VALUES ($1::uuid, $2::uuid, $3::jsonb, $4, 8, 'pending')
			ON CONFLICT (workspace_id, idempotency_key) DO NOTHING
		`, workspaceID, ch, string(pj), idem)
		if err != nil {
			log.Printf("enqueue delivery: %v", err)
		}
	}
}

func handleDispatchTest(db *sql.DB, w http.ResponseWriter, r *http.Request, workspaceID string) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	var body struct {
		ChannelID string `json:"channel_id"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	if strings.TrimSpace(body.ChannelID) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "channel_id required"})
		return
	}
	idem := "manual-test:" + time.Now().UTC().Format(time.RFC3339Nano)
	payload := map[string]any{
		"type":         "dataplier.alert.test",
		"workspace_id": workspaceID,
		"message":      "Manual dispatch test from observability-service",
		"sent_at":      time.Now().UTC().Format(time.RFC3339),
	}
	pj, _ := json.Marshal(payload)
	_, err := db.Exec(`
		INSERT INTO obs_alert_delivery_queue (workspace_id, channel_id, payload_json, idempotency_key, max_attempts, status)
		VALUES ($1::uuid, $2::uuid, $3::jsonb, $4, 8, 'pending')
	`, workspaceID, body.ChannelID, string(pj), idem)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"status": "queued", "idempotency_key": idem})
}
