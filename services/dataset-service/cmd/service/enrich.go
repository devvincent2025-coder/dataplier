package main

import (
	"encoding/json"
	"math"
	"strings"
)

// Enrichment fields support warehouse/orchestration/governance UX without new DB columns (heuristic layer).
// When connection JSON config is present, hints align with that connector (parity with saved connections).

func cfgString(cfg map[string]any, keys ...string) string {
	if cfg == nil {
		return ""
	}
	for _, k := range keys {
		v, ok := cfg[k]
		if !ok || v == nil {
			continue
		}
		if s, ok := v.(string); ok {
			s = strings.TrimSpace(s)
			if s != "" {
				return s
			}
		}
	}
	return ""
}

func cfgBool(cfg map[string]any, keys ...string) bool {
	if cfg == nil {
		return false
	}
	for _, k := range keys {
		v, ok := cfg[k]
		if !ok || v == nil {
			continue
		}
		switch t := v.(type) {
		case bool:
			return t
		case string:
			s := strings.ToLower(strings.TrimSpace(t))
			return s == "1" || s == "true" || s == "yes" || s == "on"
		case float64:
			return t != 0
		}
	}
	return false
}

func inferTableFormat(platform, name, externalID string, cfg map[string]any) string {
	if f := strings.ToLower(cfgString(cfg, "table_format", "storage_format", "file_format", "format")); f != "" {
		switch f {
		case "iceberg":
			return "iceberg"
		case "delta", "deltalake":
			return "delta"
		case "parquet", "parquet_objects":
			if platform == "aws-s3" || platform == "azure-blob" {
				return "parquet_objects"
			}
		case "json", "jsonl", "csv", "avro", "orc":
			return f + "_objects"
		}
	}
	lower := strings.ToLower(name + " " + externalID)
	if strings.Contains(lower, "iceberg") {
		return "iceberg"
	}
	if strings.Contains(lower, "_delta") || strings.Contains(lower, "/delta/") || strings.Contains(lower, ".delta") {
		return "delta"
	}
	switch platform {
	case "databricks":
		if strings.Contains(lower, "parquet") {
			return "parquet_objects"
		}
		return "native"
	case "aws-s3", "azure-blob":
		if strings.Contains(lower, "parquet") {
			return "parquet_objects"
		}
		return "object_prefix"
	default:
		return "native"
	}
}

func inferCDCEligible(platform, name, externalID string, cfg map[string]any) bool {
	if cfgBool(cfg, "cdc", "enable_cdc", "debezium", "changefeed", "stream") {
		return true
	}
	cfgBlob, _ := json.Marshal(cfg)
	if strings.Contains(strings.ToLower(string(cfgBlob)), "debezium") ||
		strings.Contains(strings.ToLower(string(cfgBlob)), "changefeed") {
		return true
	}
	lower := strings.ToLower(name + " " + externalID)
	if strings.Contains(lower, "cdc") || strings.Contains(lower, "changefeed") || strings.Contains(lower, "debezium") {
		return true
	}
	switch platform {
	case "postgresql", "mysql", "snowflake", "bigquery", "databricks":
		return true
	default:
		return false
	}
}

func inferMultiVendorProfile(platform string, cfg map[string]any) string {
	if cfgString(cfg, "external_stage", "gcs_bucket", "s3_stage", "azure_stage") != "" {
		return "warehouse_with_object_staging"
	}
	switch platform {
	case "snowflake", "bigquery", "databricks":
		return "warehouse_native"
	case "aws-s3", "azure-blob":
		return "object_store"
	default:
		return "control_plane"
	}
}

func connectionScopesFromConfig(platform string, cfg map[string]any) map[string]string {
	if cfg == nil {
		return map[string]string{}
	}
	keys := []string{
		"database", "catalog", "warehouse", "schema", "default_schema",
		"project_id", "dataset", "dataset_id", "location", "region",
		"bucket", "container", "account", "account_name", "storageAccount",
		"host", "workspace_url", "http_path", "cluster_id",
	}
	out := make(map[string]string)
	for _, k := range keys {
		if v := cfgString(cfg, k); v != "" {
			out[k] = v
		}
	}
	if len(out) == 0 {
		return out
	}
	_ = platform
	return out
}

func buildDataContract(name, platform, tableFormat string, cfg map[string]any) map[string]any {
	tier := "bronze"
	ln := strings.ToLower(name)
	if strings.Contains(ln, "gold") || strings.Contains(ln, "mart") || strings.Contains(ln, "curated") {
		tier = "gold"
	} else if strings.Contains(ln, "silver") || strings.Contains(ln, "enriched") || strings.Contains(ln, "staging") {
		tier = "silver"
	}
	fresh := 24
	if tier == "gold" {
		fresh = 4
	}
	scopes := connectionScopesFromConfig(platform, cfg)
	dc := map[string]any{
		"tier":                    tier,
		"owner_team":              "data-engineering",
		"freshness_slo_hours":     fresh,
		"deprecation_policy":      "none",
		"schema_evolution":        "additive_only",
		"table_format_detected":   tableFormat,
		"source_platform_profile": platform,
		"parity_basis":            "connector_config_and_name_heuristics",
	}
	if len(scopes) > 0 {
		dc["connection_scopes"] = scopes
	}
	return dc
}

func platformEgressAnchorPerGB(platform string) float64 {
	switch strings.ToLower(strings.ReplaceAll(platform, " ", "")) {
	case "snowflake":
		return 0.11
	case "bigquery":
		return 0.09
	case "databricks":
		return 0.10
	case "postgresql", "mysql":
		return 0.07
	case "aws-s3", "azure-blob":
		return 0.035
	default:
		return 0.09
	}
}

func buildTransferCostHint(estimatedBytes int64, platform string, cfg map[string]any) map[string]any {
	gb := float64(estimatedBytes) / (1024 * 1024 * 1024)
	anchor := platformEgressAnchorPerGB(platform)
	monthlyFull := gb * anchor
	low := math.Max(0, monthlyFull*0.35)
	high := monthlyFull * 1.4
	confidence := "low"
	methodology := "Heuristic from dataset size and connector class; connect cloud billing APIs for accuracy."
	if cfg != nil && len(cfg) > 0 {
		confidence = "medium-low"
		methodology = "Uses saved connection config (non-secret fields) plus connector class for egress anchoring; still not billing truth."
	}
	if r := cfgString(cfg, "region", "location", "aws_region"); r != "" {
		methodology += " Region hint from connector: " + r + "."
	}
	hint := map[string]any{
		"estimated_egress_usd_monthly_low":  round2(low),
		"estimated_egress_usd_monthly_high": round2(high),
		"confidence":                        confidence,
		"methodology":                       methodology,
		"object_store_ingress_discount":     platform == "aws-s3" || platform == "azure-blob",
		"parity_basis":                      "workspace_connection_config",
		"source_platform":                   platform,
	}
	if r := cfgString(cfg, "region", "location", "aws_region"); r != "" {
		hint["connector_region_hint"] = r
	}
	return hint
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}

func mustJSONObject(v map[string]any) json.RawMessage {
	b, err := json.Marshal(v)
	if err != nil {
		return json.RawMessage("{}")
	}
	return json.RawMessage(b)
}
