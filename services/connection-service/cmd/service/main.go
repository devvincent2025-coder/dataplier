package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path"
	"strconv"
	"strings"
	"time"

	"cloud.google.com/go/bigquery"
	"github.com/Azure/azure-sdk-for-go/sdk/storage/azblob"
	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	awscredentials "github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	_ "github.com/go-sql-driver/mysql"
	_ "github.com/lib/pq"
	"github.com/snowflakedb/gosnowflake"
	bigqueryv2 "google.golang.org/api/bigquery/v2"
	"google.golang.org/api/option"
)

type connectionRecord struct {
	ID           string          `json:"id"`
	Name         string          `json:"name"`
	Platform     string          `json:"platform"`
	Status       string          `json:"status"`
	Config       json.RawMessage `json:"config"`
	LastTestedAt *string         `json:"last_tested_at"`
	CreatedAt    string          `json:"created_at"`
}

type dataSystemRecord struct {
	Slug     string `json:"slug"`
	Name     string `json:"name"`
	Category string `json:"category"`
	Tagline  string `json:"tagline"`
	Accent   string `json:"accent"`
}

type datasetRecord struct {
	ID             string          `json:"id"`
	Name           string          `json:"name"`
	ExternalID     string          `json:"external_id"`
	SchemaJSON     json.RawMessage `json:"schema_json"`
	EstimatedRows  int64           `json:"estimated_rows"`
	EstimatedBytes int64           `json:"estimated_bytes"`
	ConnectionName string          `json:"connection_name"`
	Platform       string          `json:"platform"`
	DiscoveredAt   string          `json:"discovered_at"`
}

type testConnectionRequest struct {
	Name        string                 `json:"name"`
	Platform    string                 `json:"platform"`
	Credentials map[string]string      `json:"credentials"`
	Config      map[string]interface{} `json:"config"`
}

type createConnectionRequest struct {
	Name        string                 `json:"name"`
	Platform    string                 `json:"platform"`
	Credentials map[string]string      `json:"credentials"`
	Config      map[string]interface{} `json:"config"`
}

type datasetTemplate struct {
	ExternalID     string
	Name           string
	Schema         map[string]string
	EstimatedRows  int64
	EstimatedBytes int64
}

func main() {
	db := mustOpenDB()
	defer db.Close()

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"service": "connection-service", "status": "ok"})
	})
	mux.HandleFunc("/connections/catalog/data-systems", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.NotFound(w, r)
			return
		}
		handleListDataSystems(db, w, r)
	})
	mux.HandleFunc("/connections", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			handleListConnections(db, w, r)
		case http.MethodPost:
			handleCreateConnection(db, w, r)
		default:
			http.NotFound(w, r)
		}
	})
	mux.HandleFunc("/connections/test", func(w http.ResponseWriter, r *http.Request) {
		handleTestConnection(w, r)
	})
	mux.HandleFunc("/connections/", func(w http.ResponseWriter, r *http.Request) {
		handleConnectionSubresource(db, w, r)
	})

	log.Println("connection-service listening on :8082")
	_ = http.ListenAndServe(":8082", withCORS(mux))
}

func handleListConnections(db *sql.DB, w http.ResponseWriter, r *http.Request) {
	workspaceID := workspaceIDFromRequest(r)
	if workspaceID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
		return
	}

	rows, err := db.Query(`
		SELECT id, name, platform, status, config::text, COALESCE(to_char(last_tested_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), ''), to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM connections
		WHERE workspace_id = $1
		ORDER BY created_at DESC
	`, workspaceID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer rows.Close()

	items := []connectionRecord{}
	for rows.Next() {
		var item connectionRecord
		var configText string
		var lastTested string
		if err := rows.Scan(&item.ID, &item.Name, &item.Platform, &item.Status, &configText, &lastTested, &item.CreatedAt); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		item.Config = json.RawMessage(configText)
		if lastTested != "" {
			item.LastTestedAt = &lastTested
		}
		items = append(items, item)
	}

	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func handleListDataSystems(db *sql.DB, w http.ResponseWriter, r *http.Request) {
	workspaceID := workspaceIDFromRequest(r)
	if workspaceID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
		return
	}

	rows, err := db.Query(`
		SELECT slug, name, category, tagline, accent
		FROM data_systems
		ORDER BY sort_order ASC, name ASC
	`)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer rows.Close()

	items := []dataSystemRecord{}
	for rows.Next() {
		var rec dataSystemRecord
		if err := rows.Scan(&rec.Slug, &rec.Name, &rec.Category, &rec.Tagline, &rec.Accent); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		items = append(items, rec)
	}

	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func handleTestConnection(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        http.NotFound(w, r)
        return
    }

    workspaceID := workspaceIDFromRequest(r)
    if workspaceID == "" {
        writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
        return
    }

    var payload testConnectionRequest
    if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
        writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
        return
    }

    // Check only the absolute essentials
    if strings.TrimSpace(payload.Name) == "" || strings.TrimSpace(payload.Platform) == "" {
        writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name and platform are required"})
        return
    }

    // REMOVED: The "all credential fields must be filled" loop.
    // The specific test functions (like testDatabricksConnection) will 
    // validate the specific fields they need.

    start := time.Now()
    message, err := testPlatformConnection(payload.Platform, payload.Credentials, payload.Config)
    latency := time.Since(start).Milliseconds()

    if err != nil {
        log.Printf("[Test Connection] Error: %v", err)
        writeJSON(w, http.StatusBadRequest, map[string]any{
            "status":       "error",
            "latency_ms":   latency,
            "workspace_id": workspaceID,
            "message":      err.Error(),
        })
        return
    }

    writeJSON(w, http.StatusOK, map[string]any{
        "status":       "healthy",
        "latency_ms":   latency,
        "workspace_id": workspaceID,
        "message":      message,
    })
}

func testPlatformConnection(platform string, credentials map[string]string, config map[string]interface{}) (string, error) {
	switch normalizePlatform(platform) {
	case "databricks":
		return testDatabricksConnection(credentials, config)
	case "snowflake":
		return testSnowflakeConnection(credentials, config)
	case "bigquery":
		return testBigQueryConnection(credentials, config)
	case "postgresql":
		return testPostgresConnection(credentials, config)
	case "mysql":
		return testMySQLConnection(credentials, config)
	case "awss3", "s3":
		return testS3Connection(credentials, config)
	case "azureblob":
		return testAzureBlobConnection(credentials, config)
	default:
		return "", fmt.Errorf("no test adapter available for platform %q", platform)
	}
}

// ── Databricks ────────────────────────────────────────────────────────────────

func testDatabricksConnection(credentials map[string]string, config map[string]interface{}) (string, error) {
	rawURL := credentialOrConfig(credentials, config, "workspaceUrl")
	if rawURL == "" {
		rawURL = credentialOrConfig(credentials, config, "host")
	}
	token := credentialOrConfig(credentials, config, "personalAccessToken")
	catalog := credentialOrConfig(credentials, config, "catalog")

	if rawURL == "" {
		return "", errors.New("workspaceUrl is required")
	}
	if token == "" {
		return "", errors.New("personalAccessToken is required")
	}
	if catalog == "" {
		return "", errors.New("catalog is required")
	}

	// Clean URL properly
	u, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || u.Host == "" {
		return "", fmt.Errorf("invalid workspaceUrl: %q — expected https://dbc-....cloud.databricks.com", rawURL)
	}
	u.Scheme = "https"
	u.RawQuery = ""
	u.Path = strings.Trim(u.Path, "/")

	baseURL := u.String()

	client := &http.Client{Timeout: 15 * time.Second}

	// Step 1: Validate token using the CURRENT official endpoint
	meURL := baseURL + "/api/2.0/preview/scim/v2/Me"

	meReq, err := http.NewRequest(http.MethodGet, meURL, nil)
	if err != nil {
		return "", fmt.Errorf("failed to build auth request: %w", err)
	}
	meReq.Header.Set("Authorization", "Bearer "+token)

	meResp, err := client.Do(meReq)
	if err != nil {
		return "", fmt.Errorf("could not reach Databricks at %s: %w", baseURL, err)
	}
	defer meResp.Body.Close()

	if meResp.StatusCode != http.StatusOK {
		if meResp.StatusCode == 401 || meResp.StatusCode == 403 {
			return "", errors.New("personal access token was rejected — verify it is active and has workspace access")
		}
		body, _ := io.ReadAll(io.LimitReader(meResp.Body, 1024))
		return "", fmt.Errorf("Databricks auth failed (%d): %s", meResp.StatusCode, strings.TrimSpace(string(body)))
	}

	var mePayload struct {
		UserName string `json:"userName"`
	}
	_ = json.NewDecoder(meResp.Body).Decode(&mePayload)

	// Step 2: Verify catalog
	catalogURL := baseURL + "/api/2.1/unity-catalog/catalogs/" + url.PathEscape(catalog)

	catalogReq, err := http.NewRequest(http.MethodGet, catalogURL, nil)
	if err != nil {
		return "", fmt.Errorf("failed to build catalog request: %w", err)
	}
	catalogReq.Header.Set("Authorization", "Bearer "+token)

	catalogResp, err := client.Do(catalogReq)
	if err != nil {
		return "", fmt.Errorf("failed to verify catalog: %w", err)
	}
	defer catalogResp.Body.Close()

	if catalogResp.StatusCode != http.StatusOK {
		if catalogResp.StatusCode == 404 {
			return "", fmt.Errorf("catalog %q does not exist or your token lacks 'USE CATALOG' permission on it", catalog)
		}
		body, _ := io.ReadAll(io.LimitReader(catalogResp.Body, 1024))
		return "", fmt.Errorf("catalog check failed (%d): %s", catalogResp.StatusCode, strings.TrimSpace(string(body)))
	}

	userName := mePayload.UserName
	if userName == "" {
		userName = "unknown user"
	}

	return fmt.Sprintf("Databricks connected successfully as %s — workspace reachable and catalog %q is accessible.", userName, catalog), nil
}

// ── Snowflake ─────────────────────────────────────────────────────────────────

func testSnowflakeConnection(credentials map[string]string, config map[string]interface{}) (string, error) {
	account := credentialOrConfig(credentials, config, "account")
	username := credentialOrConfig(credentials, config, "username")
	password := credentialOrConfig(credentials, config, "password")
	warehouse := credentialOrConfig(credentials, config, "warehouse")
	role := credentialOrConfig(credentials, config, "role")
	database := credentialOrConfig(credentials, config, "database")

	if account == "" || username == "" || password == "" || warehouse == "" {
		return "", errors.New("snowflake test requires account, username, password, and warehouse")
	}

	cfg := &gosnowflake.Config{
		Account:   account,
		User:      username,
		Password:  password,
		Warehouse: warehouse,
		Role:      role,
		Database:  database,
	}
	dsn, err := gosnowflake.DSN(cfg)
	if err != nil {
		return "", fmt.Errorf("failed to build Snowflake DSN: %w", err)
	}

	db, err := sql.Open("snowflake", dsn)
	if err != nil {
		return "", fmt.Errorf("failed to open Snowflake connection: %w", err)
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var version string
	if err := db.QueryRowContext(ctx, "SELECT CURRENT_VERSION()").Scan(&version); err != nil {
		return "", fmt.Errorf("Snowflake connection test query failed — check credentials and warehouse: %w", err)
	}

	return fmt.Sprintf("Snowflake connected successfully — version %s, warehouse %q is active.", version, warehouse), nil
}

// ── BigQuery ──────────────────────────────────────────────────────────────────

func testBigQueryConnection(credentials map[string]string, config map[string]interface{}) (string, error) {
	projectID := credentialOrConfig(credentials, config, "projectId")
	datasetID := credentialOrConfig(credentials, config, "dataset")
	serviceAccountJSON := credentialOrConfig(credentials, config, "serviceAccount")

	if projectID == "" || serviceAccountJSON == "" {
		return "", errors.New("bigquery test requires projectId and serviceAccount JSON")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	client, err := bigquery.NewClient(ctx, projectID, option.WithCredentialsJSON([]byte(serviceAccountJSON)))
	if err != nil {
		return "", fmt.Errorf("failed to initialise BigQuery client — check service account JSON: %w", err)
	}
	defer client.Close()

	if datasetID != "" {
		if _, err := client.Dataset(datasetID).Metadata(ctx); err != nil {
			return "", fmt.Errorf("BigQuery project reachable but dataset %q not found or not accessible: %w", datasetID, err)
		}
		return fmt.Sprintf("BigQuery connected successfully — project %q and dataset %q are accessible.", projectID, datasetID), nil
	}

	// no dataset provided — just confirm project access by listing datasets
	it := client.Datasets(ctx)
	it.ProjectID = projectID
	if _, err := it.Next(); err != nil && err.Error() != "no more items in iterator" {
		return "", fmt.Errorf("BigQuery credentials valid but could not list datasets in project %q: %w", projectID, err)
	}

	return fmt.Sprintf("BigQuery connected successfully — project %q is accessible.", projectID), nil
}

// ── PostgreSQL ────────────────────────────────────────────────────────────────

func testPostgresConnection(credentials map[string]string, config map[string]interface{}) (string, error) {
	host := credentialOrConfig(credentials, config, "host")
	port := credentialOrConfig(credentials, config, "port")
	database := credentialOrConfig(credentials, config, "database")
	username := credentialOrConfig(credentials, config, "username")
	password := credentialOrConfig(credentials, config, "password")

	if host == "" || database == "" || username == "" || password == "" {
		return "", errors.New("postgres test requires host, database, username, and password")
	}
	if port == "" {
		port = "5432"
	}

	dsn := fmt.Sprintf("host=%s port=%s dbname=%s user=%s password=%s sslmode=disable connect_timeout=8",
		host, port, database, username, password)

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return "", fmt.Errorf("failed to open PostgreSQL connection: %w", err)
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var version string
	if err := db.QueryRowContext(ctx, "SELECT version()").Scan(&version); err != nil {
		return "", fmt.Errorf("PostgreSQL connection test failed — check host, port, and credentials: %w", err)
	}

	// trim the long version string
	if idx := strings.Index(version, " on "); idx != -1 {
		version = version[:idx]
	}

	return fmt.Sprintf("PostgreSQL connected successfully — %s, database %q is accessible.", version, database), nil
}

// ── MySQL ─────────────────────────────────────────────────────────────────────

func testMySQLConnection(credentials map[string]string, config map[string]interface{}) (string, error) {
	host := credentialOrConfig(credentials, config, "host")
	port := credentialOrConfig(credentials, config, "port")
	database := credentialOrConfig(credentials, config, "database")
	username := credentialOrConfig(credentials, config, "username")
	password := credentialOrConfig(credentials, config, "password")

	if host == "" || database == "" || username == "" || password == "" {
		return "", errors.New("mysql test requires host, database, username, and password")
	}
	if port == "" {
		port = "3306"
	}

	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true&timeout=8s",
		username, password, host, port, database)

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return "", fmt.Errorf("failed to open MySQL connection: %w", err)
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var version string
	if err := db.QueryRowContext(ctx, "SELECT VERSION()").Scan(&version); err != nil {
		return "", fmt.Errorf("MySQL connection test failed — check host, port, and credentials: %w", err)
	}

	return fmt.Sprintf("MySQL connected successfully — version %s, database %q is accessible.", version, database), nil
}

// ── AWS S3 ────────────────────────────────────────────────────────────────────

func testS3Connection(credentials map[string]string, config map[string]interface{}) (string, error) {
	bucket := credentialOrConfig(credentials, config, "bucket")
	region := credentialOrConfig(credentials, config, "region")
	accessKey := credentialOrConfig(credentials, config, "accessKey")
	secretKey := credentialOrConfig(credentials, config, "secretKey")

	if bucket == "" || region == "" || accessKey == "" || secretKey == "" {
		return "", errors.New("s3 test requires bucket, region, accessKey, and secretKey")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion(region),
		awsconfig.WithCredentialsProvider(awscredentials.NewStaticCredentialsProvider(accessKey, secretKey, "")),
	)
	if err != nil {
		return "", fmt.Errorf("failed to initialise AWS config: %w", err)
	}

	client := s3.NewFromConfig(cfg)

	// HeadBucket is the lightest possible check — confirms bucket exists and creds are valid
	_, err = client.HeadBucket(ctx, &s3.HeadBucketInput{
		Bucket: aws.String(bucket),
	})
	if err != nil {
		errMsg := err.Error()
		if strings.Contains(errMsg, "NoSuchBucket") {
			return "", fmt.Errorf("bucket %q does not exist in region %q", bucket, region)
		}
		if strings.Contains(errMsg, "AccessDenied") || strings.Contains(errMsg, "403") {
			return "", fmt.Errorf("access denied to bucket %q — verify IAM permissions include s3:ListBucket and s3:GetObject", bucket)
		}
		return "", fmt.Errorf("S3 connection test failed: %w", err)
	}

	return fmt.Sprintf("AWS S3 connected successfully — bucket %q in region %q is accessible.", bucket, region), nil
}

// ── Azure Blob ────────────────────────────────────────────────────────────────

func testAzureBlobConnection(credentials map[string]string, config map[string]interface{}) (string, error) {
	account := credentialOrConfig(credentials, config, "storageAccount")
	containerName := credentialOrConfig(credentials, config, "container")
	accountKey := credentialOrConfig(credentials, config, "accountKey")

	if account == "" || containerName == "" || accountKey == "" {
		return "", errors.New("azure blob test requires storageAccount, container, and accountKey")
	}

	cred, err := azblob.NewSharedKeyCredential(account, accountKey)
	if err != nil {
		return "", fmt.Errorf("invalid Azure storage account key: %w", err)
	}

	client, err := azblob.NewClientWithSharedKeyCredential(
		"https://"+account+".blob.core.windows.net/", cred, nil)
	if err != nil {
		return "", fmt.Errorf("failed to initialise Azure Blob client: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// GetProperties on the container is the lightest check
	containerClient := client.ServiceClient().NewContainerClient(containerName)
	_, err = containerClient.GetProperties(ctx, nil)
	if err != nil {
		errMsg := err.Error()
		if strings.Contains(errMsg, "ContainerNotFound") {
			return "", fmt.Errorf("container %q not found in storage account %q", containerName, account)
		}
		if strings.Contains(errMsg, "AuthenticationFailed") || strings.Contains(errMsg, "403") {
			return "", fmt.Errorf("authentication failed — verify storage account name and account key are correct")
		}
		return "", fmt.Errorf("Azure Blob connection test failed: %w", err)
	}

	return fmt.Sprintf("Azure Blob connected successfully — container %q in storage account %q is accessible.", containerName, account), nil
}

func handleCreateConnection(db *sql.DB, w http.ResponseWriter, r *http.Request) {
	workspaceID := workspaceIDFromRequest(r)
	if workspaceID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
		return
	}

	var payload createConnectionRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	if strings.TrimSpace(payload.Name) == "" || strings.TrimSpace(payload.Platform) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name and platform are required"})
		return
	}

	configJSON, err := json.Marshal(payload.Config)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid config payload"})
		return
	}
	credentialsJSON, err := json.Marshal(payload.Credentials)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid credentials payload"})
		return
	}

	var item connectionRecord
	var configText string
	var lastTested string
	err = db.QueryRow(`
		INSERT INTO connections (workspace_id, name, platform, encrypted_credentials, config, status, last_tested_at)
		VALUES ($1, $2, $3, $4, $5::jsonb, 'healthy', NOW())
		RETURNING id, name, platform, status, config::text, COALESCE(to_char(last_tested_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), ''), to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
	`, workspaceID, payload.Name, payload.Platform, credentialsJSON, string(configJSON)).Scan(
		&item.ID,
		&item.Name,
		&item.Platform,
		&item.Status,
		&configText,
		&lastTested,
		&item.CreatedAt,
	)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	item.Config = json.RawMessage(configText)
	if lastTested != "" {
		item.LastTestedAt = &lastTested
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"item":    item,
		"message": "connection created successfully",
	})
}

func handleConnectionSubresource(db *sql.DB, w http.ResponseWriter, r *http.Request) {
	workspaceID := workspaceIDFromRequest(r)
	if workspaceID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
		return
	}

	trimmed := strings.Trim(strings.TrimPrefix(r.URL.Path, "/connections/"), "/")
	pathParts := strings.Split(trimmed, "/")
	if len(pathParts) == 0 || pathParts[0] == "" {
		http.NotFound(w, r)
		return
	}
	connectionID := pathParts[0]

	if len(pathParts) == 1 {
		if r.Method == http.MethodDelete {
			handleDeleteConnection(db, w, workspaceID, connectionID)
			return
		}
		http.NotFound(w, r)
		return
	}

	if len(pathParts) == 2 && pathParts[1] == "discover" && r.Method == http.MethodPost {
		items, err := discoverDatasetsForConnection(db, workspaceID, connectionID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "connection not found"})
				return
			}
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{"items": items, "message": "discovery completed"})
		return
	}

	http.NotFound(w, r)
}

func handleDeleteConnection(db *sql.DB, w http.ResponseWriter, workspaceID, connectionID string) {
	tx, err := db.Begin()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.Exec(`DELETE FROM datasets WHERE workspace_id = $1 AND connection_id = $2`, workspaceID, connectionID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	res, err := tx.Exec(`DELETE FROM connections WHERE workspace_id = $1 AND id = $2`, workspaceID, connectionID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	n, err := res.RowsAffected()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if n == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "connection not found"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted", "id": connectionID})
}

func discoverDatasetsForConnection(db *sql.DB, workspaceID string, connectionID string) ([]datasetRecord, error) {
	var (
		connectionName string
		platform       string
		configText     string
		credsText      string
	)
	if err := db.QueryRow(`
		SELECT name, platform, config::text, convert_from(encrypted_credentials, 'UTF8')
		FROM connections
		WHERE id = $1 AND workspace_id = $2
	`, connectionID, workspaceID).Scan(&connectionName, &platform, &configText, &credsText); err != nil {
		return nil, err
	}

	var existingCount int
	if err := db.QueryRow(`SELECT COUNT(*) FROM datasets WHERE workspace_id = $1 AND connection_id = $2`, workspaceID, connectionID).Scan(&existingCount); err != nil {
		return nil, err
	}

	if existingCount == 0 {
		var config map[string]interface{}
		var credentials map[string]string
		if configText != "" {
			_ = json.Unmarshal([]byte(configText), &config)
		}
		if credsText != "" {
			_ = json.Unmarshal([]byte(credsText), &credentials)
		}

		templates, liveErr := discoverDatasetsViaAdapter(platform, credentials, config)
		if liveErr != nil {
			return nil, fmt.Errorf("live discovery failed for %s: %w", platform, liveErr)
		}
		if len(templates) == 0 {
			return nil, fmt.Errorf("live discovery returned no datasets for %s", platform)
		}
		if err := insertDatasetTemplates(db, workspaceID, connectionID, templates); err != nil {
			return nil, err
		}
	}

	rows, err := db.Query(`
		SELECT d.id, d.name, d.external_id, d.schema_json::text, COALESCE(d.estimated_rows, 0), COALESCE(d.estimated_bytes, 0),
		       c.name, c.platform, to_char(d.discovered_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM datasets d
		JOIN connections c ON c.id = d.connection_id
		WHERE d.workspace_id = $1 AND d.connection_id = $2
		ORDER BY d.discovered_at DESC, d.name ASC
	`, workspaceID, connectionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []datasetRecord{}
	for rows.Next() {
		var item datasetRecord
		var schemaText string
		if err := rows.Scan(
			&item.ID,
			&item.Name,
			&item.ExternalID,
			&schemaText,
			&item.EstimatedRows,
			&item.EstimatedBytes,
			&item.ConnectionName,
			&item.Platform,
			&item.DiscoveredAt,
		); err != nil {
			return nil, err
		}
		item.SchemaJSON = json.RawMessage(schemaText)
		items = append(items, item)
	}

	_ = connectionName
	return items, nil
}

func insertDatasetTemplates(db *sql.DB, workspaceID string, connectionID string, templates []datasetTemplate) error {
	for _, template := range templates {
		schemaJSON, err := json.Marshal(template.Schema)
		if err != nil {
			return err
		}
		if _, err := db.Exec(`
			INSERT INTO datasets (id, workspace_id, connection_id, external_id, name, schema_json, estimated_rows, estimated_bytes, discovered_at)
			VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5::jsonb, $6, $7, NOW())
		`, workspaceID, connectionID, template.ExternalID, template.Name, string(schemaJSON), template.EstimatedRows, template.EstimatedBytes); err != nil {
			return err
		}
	}
	return nil
}

func discoverDatasetsViaAdapter(platform string, credentials map[string]string, config map[string]interface{}) ([]datasetTemplate, error) {
	switch normalizePlatform(platform) {
	case "postgresql":
		return discoverPostgresDatasets(credentials, config)
	case "mysql":
		return discoverMySQLDatasets(credentials, config)
	case "databricks":
		return discoverDatabricksDatasets(credentials, config)
	case "snowflake":
		return discoverSnowflakeDatasets(credentials, config)
	case "bigquery":
		return discoverBigQueryDatasets(credentials, config)
	case "awss3", "s3":
		return discoverS3Datasets(credentials, config)
	case "azureblob":
		return discoverAzureBlobDatasets(credentials, config)
	default:
		return nil, errors.New("no adapter available for platform")
	}
}

func discoverPostgresDatasets(credentials map[string]string, config map[string]interface{}) ([]datasetTemplate, error) {
	host := credentialOrConfig(credentials, config, "host")
	port := credentialOrConfig(credentials, config, "port")
	database := credentialOrConfig(credentials, config, "database")
	username := credentialOrConfig(credentials, config, "username")
	password := credentialOrConfig(credentials, config, "password")
	if host == "" || database == "" || username == "" || password == "" {
		return nil, errors.New("postgres discovery requires host, database, username, and password")
	}
	if port == "" {
		port = "5432"
	}

	dsn := fmt.Sprintf("host=%s port=%s dbname=%s user=%s password=%s sslmode=disable", host, port, database, username, password)
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	rows, err := db.Query(`
		SELECT table_schema, table_name
		FROM information_schema.tables
		WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
		AND table_type = 'BASE TABLE'
		ORDER BY table_schema, table_name
		LIMIT 10
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	templates := []datasetTemplate{}
	for rows.Next() {
		var schemaName, tableName string
		if err := rows.Scan(&schemaName, &tableName); err != nil {
			return nil, err
		}
		schemaMap, estimatedRows, estimatedBytes := discoverPostgresTableStats(db, schemaName, tableName)
		templates = append(templates, datasetTemplate{
			ExternalID:     fmt.Sprintf("postgresql://%s/%s.%s", database, schemaName, tableName),
			Name:           fmt.Sprintf("%s.%s", schemaName, tableName),
			Schema:         schemaMap,
			EstimatedRows:  estimatedRows,
			EstimatedBytes: estimatedBytes,
		})
	}
	return templates, nil
}

func discoverMySQLDatasets(credentials map[string]string, config map[string]interface{}) ([]datasetTemplate, error) {
	host := credentialOrConfig(credentials, config, "host")
	port := credentialOrConfig(credentials, config, "port")
	database := credentialOrConfig(credentials, config, "database")
	username := credentialOrConfig(credentials, config, "username")
	password := credentialOrConfig(credentials, config, "password")
	if host == "" || database == "" || username == "" || password == "" {
		return nil, errors.New("mysql discovery requires host, database, username, and password")
	}
	if port == "" {
		port = "3306"
	}

	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true", username, password, host, port, database)
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	rows, err := db.Query(`
		SELECT table_name
		FROM information_schema.tables
		WHERE table_schema = ?
		ORDER BY table_name
		LIMIT 10
	`, database)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	templates := []datasetTemplate{}
	for rows.Next() {
		var tableName string
		if err := rows.Scan(&tableName); err != nil {
			return nil, err
		}
		schemaMap, estimatedRows, estimatedBytes := discoverMySQLTableStats(db, database, tableName)
		templates = append(templates, datasetTemplate{
			ExternalID:     fmt.Sprintf("mysql://%s/%s", database, tableName),
			Name:           fmt.Sprintf("%s.%s", database, tableName),
			Schema:         schemaMap,
			EstimatedRows:  estimatedRows,
			EstimatedBytes: estimatedBytes,
		})
	}
	return templates, nil
}

func discoverDatabricksDatasets(credentials map[string]string, config map[string]interface{}) ([]datasetTemplate, error) {
	rawURL := credentialOrConfig(credentials, config, "workspaceUrl")
	if rawURL == "" {
		rawURL = credentialOrConfig(credentials, config, "host")
	}
	token := credentialOrConfig(credentials, config, "personalAccessToken")
	catalog := credentialOrConfig(credentials, config, "catalog")
	schema := credentialOrConfig(credentials, config, "schema")

	if rawURL == "" || token == "" || catalog == "" {
		return nil, errors.New("databricks discovery requires workspaceUrl, personalAccessToken, and catalog")
	}

	// Clean URL (critical for dbc- workspaces)
	u, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || u.Host == "" {
		return nil, fmt.Errorf("invalid workspaceUrl: %q", rawURL)
	}
	u.Scheme = "https"
	u.RawQuery = ""
	u.Path = strings.Trim(u.Path, "/")

	baseURL := u.String()

	client := &http.Client{Timeout: 15 * time.Second}

	// Auto-detect schema if not provided
	if schema == "" {
		schemasURL := baseURL + "/api/2.1/unity-catalog/schemas?catalog_name=" + url.QueryEscape(catalog)

		schemaReq, err := http.NewRequest(http.MethodGet, schemasURL, nil)
		if err != nil {
			return nil, fmt.Errorf("failed to build schemas request: %w", err)
		}
		schemaReq.Header.Set("Authorization", "Bearer "+token)

		schemaResp, err := client.Do(schemaReq)
		if err != nil {
			return nil, fmt.Errorf("failed to list schemas: %w", err)
		}
		defer schemaResp.Body.Close()

		if schemaResp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(io.LimitReader(schemaResp.Body, 2048))
			return nil, fmt.Errorf("schemas API error %d: %s", schemaResp.StatusCode, strings.TrimSpace(string(body)))
		}

		var schemasPayload struct {
			Schemas []struct {
				Name string `json:"name"`
			} `json:"schemas"`
		}
		_ = json.NewDecoder(schemaResp.Body).Decode(&schemasPayload)

		for _, s := range schemasPayload.Schemas {
			if s.Name != "" && s.Name != "information_schema" && s.Name != "__databricks_internal" && s.Name != "system" {
				schema = s.Name
				break
			}
		}

		if schema == "" {
			return nil, fmt.Errorf("no usable schemas found in catalog %q", catalog)
		}
	}

	// List tables
	tablesURL := baseURL + "/api/2.1/unity-catalog/tables?catalog_name=" +
		url.QueryEscape(catalog) + "&schema_name=" + url.QueryEscape(schema) + "&max_results=10"

	tableReq, err := http.NewRequest(http.MethodGet, tablesURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to build tables request: %w", err)
	}
	tableReq.Header.Set("Authorization", "Bearer "+token)

	tableResp, err := client.Do(tableReq)
	if err != nil {
		return nil, fmt.Errorf("failed to list tables: %w", err)
	}
	defer tableResp.Body.Close()

	if tableResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(tableResp.Body, 2048))
		return nil, fmt.Errorf("tables API returned %d: %s", tableResp.StatusCode, strings.TrimSpace(string(body)))
	}

	var tablesPayload struct {
		Tables []struct {
			Name            string            `json:"name"`
			FullName        string            `json:"full_name"`
			TableType       string            `json:"table_type"`
			StorageLocation string            `json:"storage_location"`
			Columns         []struct {
				Name     string `json:"name"`
				TypeText string `json:"type_text"`
			} `json:"columns"`
			Properties map[string]string `json:"properties"`
		} `json:"tables"`
	}
	if err := json.NewDecoder(tableResp.Body).Decode(&tablesPayload); err != nil {
		return nil, fmt.Errorf("failed to decode tables response: %w", err)
	}

	if len(tablesPayload.Tables) == 0 {
		return nil, fmt.Errorf("no tables found in %s.%s", catalog, schema)
	}

	// Build templates
	templates := []datasetTemplate{}
	for _, table := range tablesPayload.Tables {
		fullName := table.FullName
		if fullName == "" {
			fullName = fmt.Sprintf("%s.%s.%s", catalog, schema, table.Name)
		}

		schemaMap := map[string]string{}
		for _, col := range table.Columns {
			if col.Name != "" {
				schemaMap[col.Name] = col.TypeText
			}
		}

		// Fallback detail fetch if needed
		if len(schemaMap) == 0 {
			detailURL := baseURL + "/api/2.1/unity-catalog/tables/" + url.PathEscape(fullName)
			detailReq, _ := http.NewRequest(http.MethodGet, detailURL, nil)
			detailReq.Header.Set("Authorization", "Bearer "+token)
			if detailResp, err := client.Do(detailReq); err == nil && detailResp.StatusCode == http.StatusOK {
				var detail struct {
					Columns []struct {
						Name     string `json:"name"`
						TypeText string `json:"type_text"`
					} `json:"columns"`
				}
				if json.NewDecoder(detailResp.Body).Decode(&detail) == nil {
					for _, col := range detail.Columns {
						if col.Name != "" {
							schemaMap[col.Name] = col.TypeText
						}
					}
				}
				detailResp.Body.Close()
			}
		}

		var estimatedRows, estimatedBytes int64
		if v, ok := table.Properties["delta.numRecords"]; ok {
			estimatedRows, _ = strconv.ParseInt(v, 10, 64)
		}
		if v, ok := table.Properties["delta.sizeInBytes"]; ok {
			estimatedBytes, _ = strconv.ParseInt(v, 10, 64)
		}

		externalID := "databricks://" + fullName
		if table.StorageLocation != "" {
			externalID = table.StorageLocation
		}

		templates = append(templates, datasetTemplate{
			ExternalID:     externalID,
			Name:           fullName,
			Schema:         schemaMap,
			EstimatedRows:  estimatedRows,
			EstimatedBytes: estimatedBytes,
		})

		if len(templates) >= 10 {
			break
		}
	}

	return templates, nil
}


func discoverSnowflakeDatasets(credentials map[string]string, config map[string]interface{}) ([]datasetTemplate, error) {
	account := credentialOrConfig(credentials, config, "account")
	username := credentialOrConfig(credentials, config, "username")
	password := credentialOrConfig(credentials, config, "password")
	warehouse := credentialOrConfig(credentials, config, "warehouse")
	role := credentialOrConfig(credentials, config, "role")
	databaseName := credentialOrConfig(credentials, config, "database")
	if account == "" || username == "" || password == "" || warehouse == "" {
		return nil, errors.New("snowflake discovery requires account, username, password, and warehouse")
	}
	if databaseName == "" {
		databaseName = "PUBLIC"
	}

	cfg := &gosnowflake.Config{
		Account:   account,
		User:      username,
		Password:  password,
		Warehouse: warehouse,
		Role:      role,
		Database:  databaseName,
	}
	dsn, err := gosnowflake.DSN(cfg)
	if err != nil {
		return nil, err
	}
	db, err := sql.Open("snowflake", dsn)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	rows, err := db.Query(fmt.Sprintf(`
		SELECT table_schema, table_name
		FROM %s.information_schema.tables
		WHERE table_type = 'BASE TABLE'
		ORDER BY table_schema, table_name
		LIMIT 10
	`, databaseName))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	templates := []datasetTemplate{}
	for rows.Next() {
		var schemaName, tableName string
		if err := rows.Scan(&schemaName, &tableName); err != nil {
			return nil, err
		}
		schemaMap := map[string]string{}
		colRows, err := db.Query(fmt.Sprintf(`
			SELECT column_name, data_type
			FROM %s.information_schema.columns
			WHERE table_schema = ? AND table_name = ?
			ORDER BY ordinal_position
			LIMIT 20
		`, databaseName), schemaName, tableName)
		if err == nil {
			for colRows.Next() {
				var colName, colType string
				if scanErr := colRows.Scan(&colName, &colType); scanErr == nil {
					schemaMap[colName] = colType
				}
			}
			colRows.Close()
		}
		templates = append(templates, datasetTemplate{
			ExternalID:     fmt.Sprintf("snowflake://%s/%s.%s", databaseName, schemaName, tableName),
			Name:           fmt.Sprintf("%s.%s", schemaName, tableName),
			Schema:         schemaMap,
			EstimatedRows:  0,
			EstimatedBytes: 0,
		})
	}
	return templates, nil
}

func discoverBigQueryDatasets(credentials map[string]string, config map[string]interface{}) ([]datasetTemplate, error) {
	projectID := credentialOrConfig(credentials, config, "projectId")
	datasetID := credentialOrConfig(credentials, config, "dataset")
	serviceAccountJSON := credentialOrConfig(credentials, config, "serviceAccount")
	if projectID == "" || datasetID == "" || serviceAccountJSON == "" {
		return nil, errors.New("bigquery discovery requires projectId, dataset, and serviceAccount")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	service, err := bigqueryv2.NewService(ctx, option.WithCredentialsJSON([]byte(serviceAccountJSON)))
	if err != nil {
		return nil, err
	}

	call := service.Tables.List(projectID, datasetID).MaxResults(10)
	resp, err := call.Do()
	if err != nil {
		return nil, err
	}

	client, err := bigquery.NewClient(ctx, projectID, option.WithCredentialsJSON([]byte(serviceAccountJSON)))
	if err != nil {
		return nil, err
	}
	defer client.Close()

	templates := []datasetTemplate{}
	for _, table := range resp.Tables {
		if table.TableReference == nil {
			continue
		}
		meta, metaErr := client.Dataset(datasetID).Table(table.TableReference.TableId).Metadata(ctx)
		schemaMap := map[string]string{}
		var estimatedBytes int64
		if metaErr == nil {
			for _, field := range meta.Schema {
				schemaMap[field.Name] = string(field.Type)
			}
			estimatedBytes = meta.NumBytes
		}
		templates = append(templates, datasetTemplate{
			ExternalID:     fmt.Sprintf("bigquery://%s/%s", datasetID, table.TableReference.TableId),
			Name:           fmt.Sprintf("%s.%s", datasetID, table.TableReference.TableId),
			Schema:         schemaMap,
			EstimatedRows:  0,
			EstimatedBytes: estimatedBytes,
		})
	}
	return templates, nil
}

func discoverS3Datasets(credentials map[string]string, config map[string]interface{}) ([]datasetTemplate, error) {
	bucket := credentialOrConfig(credentials, config, "bucket")
	region := credentialOrConfig(credentials, config, "region")
	accessKey := credentialOrConfig(credentials, config, "accessKey")
	secretKey := credentialOrConfig(credentials, config, "secretKey")
	if bucket == "" || region == "" || accessKey == "" || secretKey == "" {
		return nil, errors.New("s3 discovery requires bucket, region, accessKey, and secretKey")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	cfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion(region),
		awsconfig.WithCredentialsProvider(awscredentials.NewStaticCredentialsProvider(accessKey, secretKey, "")),
	)
	if err != nil {
		return nil, err
	}
	client := s3.NewFromConfig(cfg)

	resp, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket:  aws.String(bucket),
		MaxKeys: aws.Int32(100),
	})
	if err != nil {
		return nil, err
	}

	prefixes := aggregateS3Prefixes(resp.Contents)
	templates := []datasetTemplate{}
	for prefix, bytes := range prefixes {
		templates = append(templates, datasetTemplate{
			ExternalID:     fmt.Sprintf("s3://%s/%s", bucket, prefix),
			Name:           fmt.Sprintf("%s.%s", bucket, sanitizeDatasetName(prefix)),
			Schema:         map[string]string{"object_key": "string", "last_modified": "timestamp"},
			EstimatedRows:  0,
			EstimatedBytes: bytes,
		})
		if len(templates) == 10 {
			break
		}
	}
	return templates, nil
}

func discoverAzureBlobDatasets(credentials map[string]string, config map[string]interface{}) ([]datasetTemplate, error) {
	account := credentialOrConfig(credentials, config, "storageAccount")
	containerName := credentialOrConfig(credentials, config, "container")
	accountKey := credentialOrConfig(credentials, config, "accountKey")
	prefix := credentialOrConfig(credentials, config, "prefix")
	if account == "" || containerName == "" || accountKey == "" {
		return nil, errors.New("azure blob discovery requires storageAccount, container, and accountKey")
	}

	cred, err := azblob.NewSharedKeyCredential(account, accountKey)
	if err != nil {
		return nil, err
	}
	client, err := azblob.NewClientWithSharedKeyCredential("https://"+account+".blob.core.windows.net/", cred, nil)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	pager := client.ServiceClient().NewContainerClient(containerName).NewListBlobsFlatPager(&azblob.ListBlobsFlatOptions{
		Prefix: &prefix,
	})

	templates := []datasetTemplate{}
	prefixes := map[string]int64{}
	pageCount := 0
	for pager.More() && pageCount < 3 {
		page, err := pager.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		pageCount++
		for _, item := range page.Segment.BlobItems {
			name := strings.TrimPrefix(stringValueFromPointer(item.Name), prefix)
			group := firstPrefixSegment(name)
			if group == "" {
				group = sanitizeDatasetName(name)
			}
			prefixes[group] += int64ValueFromPointer(item.Properties.ContentLength)
		}
	}
	for group, bytes := range prefixes {
		templates = append(templates, datasetTemplate{
			ExternalID:     fmt.Sprintf("abfs://%s@%s.blob.core.windows.net/%s", containerName, account, group),
			Name:           fmt.Sprintf("%s.%s", containerName, sanitizeDatasetName(group)),
			Schema:         map[string]string{"blob_name": "string", "last_modified": "timestamp"},
			EstimatedRows:  0,
			EstimatedBytes: bytes,
		})
		if len(templates) == 10 {
			break
		}
	}
	return templates, nil
}

func discoverPostgresTableStats(db *sql.DB, schemaName string, tableName string) (map[string]string, int64, int64) {
	schemaMap := map[string]string{}
	columnRows, err := db.Query(`
		SELECT column_name, data_type
		FROM information_schema.columns
		WHERE table_schema = $1 AND table_name = $2
		ORDER BY ordinal_position
		LIMIT 20
	`, schemaName, tableName)
	if err == nil {
		defer columnRows.Close()
		for columnRows.Next() {
			var col, typ string
			if scanErr := columnRows.Scan(&col, &typ); scanErr == nil {
				schemaMap[col] = typ
			}
		}
	}

	var estimatedRows int64
	_ = db.QueryRow(`
		SELECT COALESCE(reltuples::bigint, 0)
		FROM pg_class c
		JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = $1 AND c.relname = $2
	`, schemaName, tableName).Scan(&estimatedRows)

	var estimatedBytes int64
	_ = db.QueryRow(`SELECT COALESCE(pg_total_relation_size(format('%I.%I', $1, $2)), 0)`, schemaName, tableName).Scan(&estimatedBytes)
	return schemaMap, estimatedRows, estimatedBytes
}

func discoverMySQLTableStats(db *sql.DB, database string, tableName string) (map[string]string, int64, int64) {
	schemaMap := map[string]string{}
	columnRows, err := db.Query(`
		SELECT column_name, data_type
		FROM information_schema.columns
		WHERE table_schema = ? AND table_name = ?
		ORDER BY ordinal_position
		LIMIT 20
	`, database, tableName)
	if err == nil {
		defer columnRows.Close()
		for columnRows.Next() {
			var col, typ string
			if scanErr := columnRows.Scan(&col, &typ); scanErr == nil {
				schemaMap[col] = typ
			}
		}
	}

	var estimatedRows, estimatedBytes int64
	_ = db.QueryRow(`
		SELECT COALESCE(table_rows, 0), COALESCE(data_length + index_length, 0)
		FROM information_schema.tables
		WHERE table_schema = ? AND table_name = ?
	`, database, tableName).Scan(&estimatedRows, &estimatedBytes)
	return schemaMap, estimatedRows, estimatedBytes
}

func aggregateS3Prefixes(contents []types.Object) map[string]int64 {
	result := map[string]int64{}
	for _, object := range contents {
		key := stringValueFromPointer(object.Key)
		prefix := firstPrefixSegment(key)
		if prefix == "" {
			prefix = sanitizeDatasetName(key)
		}
		result[prefix] += int64ValueFromPointer(object.Size)
	}
	return result
}

func credentialOrConfig(credentials map[string]string, config map[string]interface{}, key string) string {
	if value := strings.TrimSpace(credentials[key]); value != "" {
		return value
	}
	return stringValue(config, key, "")
}

func stringValue(config map[string]interface{}, key string, fallback string) string {
	raw, ok := config[key]
	if !ok || raw == nil {
		return fallback
	}
	switch value := raw.(type) {
	case string:
		if strings.TrimSpace(value) == "" {
			return fallback
		}
		return value
	case float64:
		return strconv.FormatInt(int64(value), 10)
	default:
		return fallback
	}
}

func stringValueFromPointer(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func int64ValueFromPointer(value *int64) int64 {
	if value == nil {
		return 0
	}
	return *value
}

func firstPrefixSegment(value string) string {
	trimmed := strings.Trim(value, "/")
	if trimmed == "" {
		return ""
	}
	parts := strings.Split(trimmed, "/")
	if len(parts) >= 2 {
		return path.Join(parts[0], parts[1])
	}
	return parts[0]
}

func sanitizeDatasetName(value string) string {
	trimmed := strings.Trim(strings.ReplaceAll(value, "/", "_"), "_")
	if trimmed == "" {
		return "discovered_dataset"
	}
	return trimmed
}

func normalizePlatform(value string) string {
	return strings.ToLower(strings.ReplaceAll(value, " ", ""))
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
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
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
