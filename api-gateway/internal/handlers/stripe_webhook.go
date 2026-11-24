package handlers

import (
	"bytes"
	"io"
	"log"
	"net/http"
	"strings"
)

// StripeWebhookForward proxies Stripe webhooks to metadata-service with the raw body preserved for signature verification.
func StripeWebhookForward(metadataBaseURL string) http.Handler {
	base := strings.TrimRight(strings.TrimSpace(metadataBaseURL), "/")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, base+"/stripe/webhook", bytes.NewReader(body))
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		if ct := r.Header.Get("Content-Type"); ct != "" {
			req.Header.Set("Content-Type", ct)
		}
		if sig := r.Header.Get("Stripe-Signature"); sig != "" {
			req.Header.Set("Stripe-Signature", sig)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			log.Printf("stripe webhook forward: %v", err)
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		for k, vv := range resp.Header {
			if strings.EqualFold(k, "Content-Length") {
				continue
			}
			for _, v := range vv {
				w.Header().Add(k, v)
			}
		}
		w.WriteHeader(resp.StatusCode)
		_, _ = io.Copy(w, io.LimitReader(resp.Body, 2<<20))
	})
}
