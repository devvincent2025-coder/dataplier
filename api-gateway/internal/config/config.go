package config

import "os"

type Config struct {
	Port                    string
	JWTSecret               string
	RedisAddr               string
	TracingAgent            string
	AuthServiceURL          string
	ConnectionServiceURL    string
	DatasetServiceURL       string
	PipelineServiceURL      string
	JobServiceURL           string
	MetadataServiceURL      string
	ObservabilityServiceURL string
	LineageServiceURL       string
	RoutingEngineURL        string
	ObsIngestSecret         string
}

func Load() Config {
	return Config{
		Port:                    getenv("API_GATEWAY_PORT", "8080"),
		JWTSecret:               getenv("JWT_SECRET", "change-me"),
		RedisAddr:               getenv("REDIS_ADDR", "redis:6379"),
		TracingAgent:            getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://otel-collector:4317"),
		AuthServiceURL:          getenv("AUTH_SERVICE_URL", "http://auth-service:8081"),
		ConnectionServiceURL:    getenv("CONNECTION_SERVICE_URL", "http://connection-service:8082"),
		DatasetServiceURL:       getenv("DATASET_SERVICE_URL", "http://dataset-service:8083"),
		PipelineServiceURL:      getenv("PIPELINE_SERVICE_URL", "http://pipeline-service:8084"),
		JobServiceURL:           getenv("JOB_SERVICE_URL", "http://job-service:8085"),
		MetadataServiceURL:      getenv("METADATA_SERVICE_URL", "http://metadata-service:8086"),
		ObservabilityServiceURL: getenv("OBSERVABILITY_SERVICE_URL", "http://observability-service:8087"),
		LineageServiceURL:       getenv("LINEAGE_SERVICE_URL", "http://lineage-service:8088"),
		RoutingEngineURL:        getenv("ROUTING_ENGINE_URL", "http://routing-engine:8092"),
		ObsIngestSecret:         getenv("OBS_INGEST_SECRET", ""),
	}
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
