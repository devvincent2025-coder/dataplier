package router

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"

	"github.com/dataplier/api-gateway/internal/config"
	"github.com/dataplier/api-gateway/internal/handlers"
	"github.com/dataplier/api-gateway/internal/middleware"
)

func New(cfg config.Config) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", handlers.Health)
	mux.HandleFunc("/readyz", handlers.Health)
	mux.Handle("/webhooks/stripe", handlers.StripeWebhookForward(cfg.MetadataServiceURL))
	mux.HandleFunc("/", handlers.RouteCatalog)

	registerProxyGroup(mux, "/auth/", cfg.AuthServiceURL, "/auth", "auth")
	registerProxyGroup(mux, "/connections/", cfg.ConnectionServiceURL, "", "connections")
	registerProxyGroup(mux, "/datasets/", cfg.DatasetServiceURL, "", "datasets")
	registerProxyGroup(mux, "/pipelines/", cfg.PipelineServiceURL, "", "pipelines")
	registerProxyGroup(mux, "/jobs/", cfg.JobServiceURL, "", "jobs")
	registerProxyGroup(mux, "/metadata/", cfg.MetadataServiceURL, "/metadata", "metadata")
	registerProxyGroup(mux, "/lineage/", cfg.LineageServiceURL, "/lineage", "lineage")
	registerProxyGroup(mux, "/metrics/", cfg.ObservabilityServiceURL, "", "observability")
	registerProxyGroup(mux, "/routing/", cfg.RoutingEngineURL, "/routing", "routing-engine")

	var handler http.Handler = mux
	handler = middleware.JWTAuth(handler, cfg)
	handler = middleware.WorkspacePolicy(cfg, handler)
	handler = middleware.GatewaySpanEmitter(cfg, handler)
	handler = middleware.RateLimit(handler)
	handler = middleware.RequestLogger(handler)
	handler = middleware.CORS(handler)
	return handler
}

func registerProxyGroup(mux *http.ServeMux, base string, upstream string, stripPrefix string, serviceKey string) {
	target, err := url.Parse(upstream)
	if err != nil {
		panic(err)
	}

	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		log.Printf("api-gateway proxy error method=%s path=%s service=%s upstream=%s err=%v", r.Method, r.URL.Path, serviceKey, upstream, err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": fmt.Sprintf("upstream service unavailable (%s)", serviceKey),
		})
	}
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		if stripPrefix != "" && strings.HasPrefix(req.URL.Path, stripPrefix) {
			req.URL.Path = strings.TrimPrefix(req.URL.Path, stripPrefix)
			if req.URL.Path == "" {
				req.URL.Path = "/"
			}
		}
	}
	proxy.ModifyResponse = func(resp *http.Response) error {
		resp.Header.Del("Access-Control-Allow-Origin")
		resp.Header.Del("Access-Control-Allow-Headers")
		resp.Header.Del("Access-Control-Allow-Methods")
		return nil
	}

	mux.Handle(base, proxy)
	mux.Handle(strings.TrimSuffix(base, "/"), proxy)
}
