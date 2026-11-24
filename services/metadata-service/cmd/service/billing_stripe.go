package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/stripe/stripe-go/v81"
	billingportalsession "github.com/stripe/stripe-go/v81/billingportal/session"
	checkoutsession "github.com/stripe/stripe-go/v81/checkout/session"
	"github.com/stripe/stripe-go/v81/customer"
	"github.com/stripe/stripe-go/v81/invoice"
	"github.com/stripe/stripe-go/v81/paymentmethod"
	setupintent "github.com/stripe/stripe-go/v81/setupintent"
	"github.com/stripe/stripe-go/v81/subscription"
	"github.com/stripe/stripe-go/v81/webhook"
)

type workspaceStripeRow struct {
	CustomerID         sql.NullString
	SubscriptionID     sql.NullString
	Status             sql.NullString
	PriceID            sql.NullString
	CurrentPeriodEnd   sql.NullTime
	CancelAtPeriodEnd  bool
}

func stripeSecretKey() string { return strings.TrimSpace(os.Getenv("STRIPE_SECRET_KEY")) }

func stripeWebhookSecret() string { return strings.TrimSpace(os.Getenv("STRIPE_WEBHOOK_SECRET")) }

func stripePublishableKey() string { return strings.TrimSpace(os.Getenv("STRIPE_PUBLISHABLE_KEY")) }

func stripeConfigured() bool { return stripeSecretKey() != "" }

func initStripeKey() {
	if k := stripeSecretKey(); k != "" {
		stripe.Key = k
	}
}

func priceForPlan(plan, period string) string {
	plan = strings.ToLower(strings.TrimSpace(plan))
	period = strings.ToLower(strings.TrimSpace(period))
	suffix := "MONTHLY"
	if period == "annual" || period == "yearly" {
		suffix = "ANNUAL"
	}
	key := fmt.Sprintf("STRIPE_PRICE_%s_%s", strings.ToUpper(plan), suffix)
	return strings.TrimSpace(os.Getenv(key))
}

func billingPriceMapJSON() map[string]map[string]string {
	out := map[string]map[string]string{}
	for _, plan := range []string{"starter", "professional", "enterprise"} {
		m := map[string]string{}
		if p := strings.TrimSpace(os.Getenv(fmt.Sprintf("STRIPE_PRICE_%s_MONTHLY", strings.ToUpper(plan)))); p != "" {
			m["monthly"] = p
		}
		if p := strings.TrimSpace(os.Getenv(fmt.Sprintf("STRIPE_PRICE_%s_ANNUAL", strings.ToUpper(plan)))); p != "" {
			m["annual"] = p
		}
		if len(m) > 0 {
			out[plan] = m
		}
	}
	return out
}

func loadWorkspaceStripe(db *sql.DB, workspaceID string) (workspaceStripeRow, error) {
	var r workspaceStripeRow
	err := db.QueryRow(`
		SELECT stripe_customer_id, stripe_subscription_id, subscription_status, price_id,
		       current_period_end, cancel_at_period_end
		FROM workspace_stripe
		WHERE workspace_id = $1::uuid
	`, workspaceID).Scan(
		&r.CustomerID, &r.SubscriptionID, &r.Status, &r.PriceID,
		&r.CurrentPeriodEnd, &r.CancelAtPeriodEnd,
	)
	if err == sql.ErrNoRows {
		return workspaceStripeRow{}, nil
	}
	return r, err
}

func strOrNull(s string) interface{} {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return s
}

func upsertWorkspaceStripe(db *sql.DB, workspaceID, customerID, subID, status, priceID string, periodEnd time.Time, cancelAtEnd bool) error {
	var pe interface{}
	if !periodEnd.IsZero() {
		pe = periodEnd
	}
	_, err := db.Exec(`
		INSERT INTO workspace_stripe (
			workspace_id, stripe_customer_id, stripe_subscription_id, subscription_status,
			price_id, current_period_end, cancel_at_period_end, updated_at
		) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, NOW())
		ON CONFLICT (workspace_id) DO UPDATE SET
			stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, workspace_stripe.stripe_customer_id),
			stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, workspace_stripe.stripe_subscription_id),
			subscription_status = COALESCE(EXCLUDED.subscription_status, workspace_stripe.subscription_status),
			price_id = COALESCE(EXCLUDED.price_id, workspace_stripe.price_id),
			current_period_end = COALESCE(EXCLUDED.current_period_end, workspace_stripe.current_period_end),
			cancel_at_period_end = EXCLUDED.cancel_at_period_end,
			updated_at = NOW()
	`, workspaceID, strOrNull(customerID), strOrNull(subID), strOrNull(status), strOrNull(priceID), pe, cancelAtEnd)
	return err
}

func clearWorkspaceSubscription(db *sql.DB, workspaceID string) error {
	_, err := db.Exec(`
		UPDATE workspace_stripe SET
			stripe_subscription_id = NULL,
			subscription_status = 'canceled',
			price_id = NULL,
			current_period_end = NULL,
			cancel_at_period_end = false,
			updated_at = NOW()
		WHERE workspace_id = $1::uuid
	`, workspaceID)
	return err
}

func registerBillingRoutes(mux *http.ServeMux, db *sql.DB) {
	initStripeKey()

	mux.HandleFunc("/stripe/webhook", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		secret := stripeWebhookSecret()
		if secret == "" {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "stripe webhook secret not configured"})
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "read body"})
			return
		}
		sig := r.Header.Get("Stripe-Signature")
		event, err := webhook.ConstructEvent(body, sig, secret)
		if err != nil {
			log.Printf("stripe webhook: signature verify failed: %v", err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		switch event.Type {
		case stripe.EventTypeCheckoutSessionCompleted:
			var sess stripe.CheckoutSession
			if err := json.Unmarshal(event.Data.Raw, &sess); err != nil {
				log.Printf("stripe webhook: unmarshal session: %v", err)
				break
			}
			if sess.Mode != stripe.CheckoutSessionModeSubscription {
				break
			}
			wsID := strings.TrimSpace(sess.ClientReferenceID)
			if wsID == "" && sess.Subscription != nil {
				subObj, err := subscription.Get(sess.Subscription.ID, nil)
				if err == nil && subObj.Metadata != nil {
					wsID = strings.TrimSpace(subObj.Metadata["workspace_id"])
				}
			}
			if wsID == "" {
				log.Printf("stripe webhook: checkout.session.completed missing workspace reference session=%s", sess.ID)
				break
			}
			custID := ""
			if sess.Customer != nil {
				custID = sess.Customer.ID
			}
			subID := ""
			var priceID string
			var periodEnd time.Time
			var status string
			if sess.Subscription != nil {
				subID = sess.Subscription.ID
				subObj, err := subscription.Get(subID, nil)
				if err == nil {
					status = string(subObj.Status)
					if len(subObj.Items.Data) > 0 && subObj.Items.Data[0].Price != nil {
						priceID = subObj.Items.Data[0].Price.ID
					}
					periodEnd = time.Unix(subObj.CurrentPeriodEnd, 0).UTC()
				}
			}
			if err := upsertWorkspaceStripe(db, wsID, custID, subID, status, priceID, periodEnd, false); err != nil {
				log.Printf("stripe webhook: upsert workspace_stripe: %v", err)
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
			log.Printf("stripe webhook: linked workspace=%s customer=%s subscription=%s", wsID, custID, subID)

		case stripe.EventTypeCustomerSubscriptionUpdated, stripe.EventTypeCustomerSubscriptionDeleted:
			var subObj stripe.Subscription
			if err := json.Unmarshal(event.Data.Raw, &subObj); err != nil {
				log.Printf("stripe webhook: unmarshal subscription: %v", err)
				break
			}
			wsID := strings.TrimSpace(subObj.Metadata["workspace_id"])
			var custID string
			if subObj.Customer != nil {
				custID = subObj.Customer.ID
			}
			if wsID == "" && custID != "" {
				_ = db.QueryRow(`SELECT workspace_id::text FROM workspace_stripe WHERE stripe_customer_id = $1`, custID).Scan(&wsID)
			}
			if wsID == "" {
				log.Printf("stripe webhook: subscription event without workspace sub=%s", subObj.ID)
				break
			}
			if event.Type == stripe.EventTypeCustomerSubscriptionDeleted {
				if err := clearWorkspaceSubscription(db, wsID); err != nil {
					log.Printf("stripe webhook: clear subscription: %v", err)
					w.WriteHeader(http.StatusInternalServerError)
					return
				}
				break
			}
			priceID := ""
			if len(subObj.Items.Data) > 0 && subObj.Items.Data[0].Price != nil {
				priceID = subObj.Items.Data[0].Price.ID
			}
			periodEnd := time.Unix(subObj.CurrentPeriodEnd, 0).UTC()
			if err := upsertWorkspaceStripe(db, wsID, custID, subObj.ID, string(subObj.Status), priceID, periodEnd, subObj.CancelAtPeriodEnd); err != nil {
				log.Printf("stripe webhook: subscription update: %v", err)
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
		default:
			// ignore
		}
		w.WriteHeader(http.StatusOK)
	})

	mux.HandleFunc("/billing/config", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"stripe_configured": stripeConfigured(),
			"publishable_key":   stripePublishableKey(),
			"price_map":         billingPriceMapJSON(),
		})
	})

	mux.HandleFunc("/billing/status", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}
		if !stripeConfigured() {
			writeJSON(w, http.StatusOK, map[string]any{"stripe_configured": false})
			return
		}
		row, err := loadWorkspaceStripe(db, workspaceID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		out := map[string]any{
			"stripe_configured": true,
			"has_customer":      row.CustomerID.Valid,
		}
		if row.CustomerID.Valid {
			out["customer_id"] = row.CustomerID.String
		}
		if row.SubscriptionID.Valid {
			out["subscription_id"] = row.SubscriptionID.String
		}
		if row.Status.Valid {
			out["subscription_status"] = row.Status.String
		}
		if row.PriceID.Valid {
			out["price_id"] = row.PriceID.String
		}
		if row.CurrentPeriodEnd.Valid {
			out["current_period_end"] = row.CurrentPeriodEnd.Time.UTC().Format(time.RFC3339)
		}
		out["cancel_at_period_end"] = row.CancelAtPeriodEnd

		if row.CustomerID.Valid {
			cust, err := customer.Get(row.CustomerID.String, nil)
			if err == nil {
				addr := map[string]string{}
				if cust.Address != nil {
					addr["line1"] = cust.Address.Line1
					addr["line2"] = cust.Address.Line2
					addr["city"] = cust.Address.City
					addr["region"] = cust.Address.State
					addr["postal"] = cust.Address.PostalCode
					addr["country"] = cust.Address.Country
				}
				out["address"] = addr
			}
			pms := []map[string]any{}
			params := &stripe.PaymentMethodListParams{Customer: stripe.String(row.CustomerID.String), Type: stripe.String("card")}
			iter := paymentmethod.List(params)
			defPM := ""
			if cust, err := customer.Get(row.CustomerID.String, nil); err == nil && cust.InvoiceSettings.DefaultPaymentMethod != nil {
				defPM = cust.InvoiceSettings.DefaultPaymentMethod.ID
			}
			for iter.Next() {
				pm := iter.PaymentMethod()
				if pm.Card == nil {
					continue
				}
				pms = append(pms, map[string]any{
					"id":         pm.ID,
					"brand":      string(pm.Card.Brand),
					"last4":      pm.Card.Last4,
					"exp_month":  pm.Card.ExpMonth,
					"exp_year":   pm.Card.ExpYear,
					"is_default": pm.ID == defPM,
				})
			}
			out["payment_methods"] = pms
		} else {
			out["payment_methods"] = []map[string]any{}
		}
		writeJSON(w, http.StatusOK, out)
	})

	mux.HandleFunc("/billing/checkout", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}
		if !stripeConfigured() {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "stripe is not configured (set STRIPE_SECRET_KEY)"})
			return
		}
		var req struct {
			Plan          string `json:"plan"`
			BillingPeriod string `json:"billing_period"`
			SuccessURL    string `json:"success_url"`
			CancelURL     string `json:"cancel_url"`
			Email         string `json:"email"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<14)).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
			return
		}
		priceID := priceForPlan(req.Plan, req.BillingPeriod)
		if priceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "no Stripe price configured for this plan and billing period (set STRIPE_PRICE_<PLAN>_<MONTHLY|ANNUAL>)"})
			return
		}
		if req.SuccessURL == "" || req.CancelURL == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "success_url and cancel_url are required"})
			return
		}
		params := &stripe.CheckoutSessionParams{
			Mode:              stripe.String(string(stripe.CheckoutSessionModeSubscription)),
			ClientReferenceID: stripe.String(workspaceID),
			SuccessURL:        stripe.String(req.SuccessURL),
			CancelURL:         stripe.String(req.CancelURL),
			LineItems: []*stripe.CheckoutSessionLineItemParams{{
				Price:    stripe.String(priceID),
				Quantity: stripe.Int64(1),
			}},
			SubscriptionData: &stripe.CheckoutSessionSubscriptionDataParams{
				Metadata: map[string]string{"workspace_id": workspaceID},
			},
		}
		email := strings.TrimSpace(req.Email)
		if email != "" {
			params.CustomerEmail = stripe.String(email)
		}
		row, _ := loadWorkspaceStripe(db, workspaceID)
		if row.CustomerID.Valid {
			params.Customer = stripe.String(row.CustomerID.String)
			params.CustomerEmail = nil
		}
		sess, err := checkoutsession.New(params)
		if err != nil {
			log.Printf("billing checkout: %v", err)
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"url": sess.URL})
	})

	mux.HandleFunc("/billing/portal", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}
		if !stripeConfigured() {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "stripe is not configured"})
			return
		}
		var req struct {
			ReturnURL string `json:"return_url"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 1<<14)).Decode(&req)
		if strings.TrimSpace(req.ReturnURL) == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "return_url is required"})
			return
		}
		row, err := loadWorkspaceStripe(db, workspaceID)
		if err != nil || !row.CustomerID.Valid {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "no Stripe customer for this workspace yet — complete checkout first"})
			return
		}
		ps, err := billingportalsession.New(&stripe.BillingPortalSessionParams{
			Customer:  stripe.String(row.CustomerID.String),
			ReturnURL: stripe.String(req.ReturnURL),
		})
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"url": ps.URL})
	})

	mux.HandleFunc("/billing/invoices", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}
		if !stripeConfigured() {
			writeJSON(w, http.StatusOK, map[string]any{"items": []any{}})
			return
		}
		row, err := loadWorkspaceStripe(db, workspaceID)
		if err != nil || !row.CustomerID.Valid {
			writeJSON(w, http.StatusOK, map[string]any{"items": []any{}})
			return
		}
		params := &stripe.InvoiceListParams{Customer: stripe.String(row.CustomerID.String)}
		iter := invoice.List(params)
		items := []map[string]any{}
		for iter.Next() {
			inv := iter.Invoice()
			amt := float64(inv.AmountDue) / 100
			if inv.AmountDue == 0 && inv.AmountPaid > 0 {
				amt = float64(inv.AmountPaid) / 100
			}
			items = append(items, map[string]any{
				"id":                 inv.ID,
				"number":             inv.Number,
				"status":             string(inv.Status),
				"currency":           strings.ToUpper(string(inv.Currency)),
				"amount":             fmt.Sprintf("%.2f", amt),
				"issued_at":          time.Unix(inv.Created, 0).UTC().Format("2006-01-02"),
				"hosted_invoice_url": inv.HostedInvoiceURL,
				"invoice_pdf":        inv.InvoicePDF,
			})
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": items})
	})

	mux.HandleFunc("/billing/invoice", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}
		invID := strings.TrimSpace(r.URL.Query().Get("id"))
		if invID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing id query"})
			return
		}
		row, err := loadWorkspaceStripe(db, workspaceID)
		if err != nil || !row.CustomerID.Valid {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "billing not found"})
			return
		}
		inv, err := invoice.Get(invID, nil)
		if err != nil || inv.Customer == nil || inv.Customer.ID != row.CustomerID.String {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "invoice not found"})
			return
		}
		lines := []map[string]any{}
		for _, line := range inv.Lines.Data {
			desc := line.Description
			if desc == "" && line.Price != nil && line.Price.Product != nil {
				desc = line.Price.Product.Name
			}
			lines = append(lines, map[string]any{
				"description": desc,
				"amount":      fmt.Sprintf("%.2f", float64(line.Amount)/100),
				"currency":    strings.ToUpper(string(inv.Currency)),
			})
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"id":                 inv.ID,
			"number":             inv.Number,
			"status":             string(inv.Status),
			"currency":           strings.ToUpper(string(inv.Currency)),
			"amount_due":         fmt.Sprintf("%.2f", float64(inv.AmountDue)/100),
			"subtotal":           fmt.Sprintf("%.2f", float64(inv.Subtotal)/100),
			"total":              fmt.Sprintf("%.2f", float64(inv.Total)/100),
			"issued_at":          time.Unix(inv.Created, 0).UTC().Format("2006-01-02"),
			"lines":              lines,
			"hosted_invoice_url": inv.HostedInvoiceURL,
			"invoice_pdf":        inv.InvoicePDF,
		})
	})

	mux.HandleFunc("/billing/customer", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPatch {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}
		if !stripeConfigured() {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "stripe is not configured"})
			return
		}
		row, err := loadWorkspaceStripe(db, workspaceID)
		if err != nil || !row.CustomerID.Valid {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "no Stripe customer for this workspace"})
			return
		}
		var body struct {
			Line1   string `json:"line1"`
			Line2   string `json:"line2"`
			City    string `json:"city"`
			Region  string `json:"region"`
			Postal  string `json:"postal"`
			Country string `json:"country"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<14)).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
			return
		}
		_, err = customer.Update(row.CustomerID.String, &stripe.CustomerParams{
			Address: &stripe.AddressParams{
				Line1:      stripe.String(body.Line1),
				Line2:      stripe.String(body.Line2),
				City:       stripe.String(body.City),
				State:      stripe.String(body.Region),
				PostalCode: stripe.String(body.Postal),
				Country:    stripe.String(body.Country),
			},
		})
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	mux.HandleFunc("/billing/payment-method/default", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}
		var req struct {
			PaymentMethodID string `json:"payment_method_id"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<14)).Decode(&req); err != nil || strings.TrimSpace(req.PaymentMethodID) == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "payment_method_id required"})
			return
		}
		row, err := loadWorkspaceStripe(db, workspaceID)
		if err != nil || !row.CustomerID.Valid {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "no Stripe customer"})
			return
		}
		_, err = customer.Update(row.CustomerID.String, &stripe.CustomerParams{
			InvoiceSettings: &stripe.CustomerInvoiceSettingsParams{
				DefaultPaymentMethod: stripe.String(req.PaymentMethodID),
			},
		})
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	mux.HandleFunc("/billing/payment-method/detach", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}
		var req struct {
			PaymentMethodID string `json:"payment_method_id"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<14)).Decode(&req); err != nil || strings.TrimSpace(req.PaymentMethodID) == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "payment_method_id required"})
			return
		}
		row, err := loadWorkspaceStripe(db, workspaceID)
		if err != nil || !row.CustomerID.Valid {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "no Stripe customer"})
			return
		}
		pm, err := paymentmethod.Get(req.PaymentMethodID, nil)
		if err != nil || pm.Customer == nil || pm.Customer.ID != row.CustomerID.String {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "payment method not on this customer"})
			return
		}
		_, err = paymentmethod.Detach(req.PaymentMethodID, nil)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	mux.HandleFunc("/billing/setup-intent", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		workspaceID := workspaceIDFromRequest(r)
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing x-workspace-id header"})
			return
		}
		if !stripeConfigured() {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "stripe is not configured"})
			return
		}
		row, err := loadWorkspaceStripe(db, workspaceID)
		if err != nil || !row.CustomerID.Valid {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "no Stripe customer for this workspace"})
			return
		}
		si, err := setupintent.New(&stripe.SetupIntentParams{
			Customer:           stripe.String(row.CustomerID.String),
			PaymentMethodTypes: stripe.StringSlice([]string{"card"}),
		})
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{
			"client_secret":   si.ClientSecret,
			"publishable_key": stripePublishableKey(),
		})
	})
}
