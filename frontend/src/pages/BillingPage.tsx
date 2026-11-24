import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { CreditCard, Download, ExternalLink, FileText, MapPin, Pencil, Plus, Receipt, Sparkles, X } from "lucide-react";

import { BillingConfirmRemoveCardModal, BillingPaymentMethodsModal } from "../components/billing/BillingPaymentMethodsModal";
import type { BillingInvoiceDetail, BillingInvoiceListItem, BillingPaymentMethod, BillingStatusResponse } from "../lib/api";
import { governanceApi } from "../lib/api";
import { USE_DEMO_DATA, isDemoBearerToken } from "../config/demoMode";
import { useToast } from "../context/ToastContext";
import { useSessionStore } from "../store/session";

const card = "rounded border border-slate-200 bg-white p-6 shadow-panel";
const inputClass =
  "mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100";
const btnPrimary = "rounded bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50";
const btnSecondary = "rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50";

type BillingCycle = "monthly" | "annual";
type PlanId = "starter" | "professional" | "enterprise";

const PLAN_LABELS: Record<PlanId, string> = {
  starter: "Starter",
  professional: "Professional",
  enterprise: "Enterprise"
};

type ModalKind = "none" | "subscription" | "address" | "invoice";

function billingReturnBase(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}${window.location.pathname}`;
}

export function BillingPage() {
  const token = useSessionStore((s) => s.token);
  const user = useSessionStore((s) => s.user);
  const workspaceId = user?.workspace_id ?? "";
  const canWrite =
    user?.permissions?.some((p) => p === "governance.write" || p === "*" || p === "all") ?? false;
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const billingSimulated = Boolean(USE_DEMO_DATA && token && isDemoBearerToken(token));

  const [modal, setModal] = useState<ModalKind>("none");
  const [invoiceFocus, setInvoiceFocus] = useState<BillingInvoiceListItem | null>(null);
  const [cardsModalOpen, setCardsModalOpen] = useState(false);
  const [pmRemoveTarget, setPmRemoveTarget] = useState<BillingPaymentMethod | null>(null);
  const [addressMode, setAddressMode] = useState<"add" | "edit">("edit");

  const closeModal = useCallback(() => {
    setModal("none");
    setInvoiceFocus(null);
  }, []);

  useEffect(() => {
    if (modal === "none") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal, closeModal]);

  const checkoutFlag = searchParams.get("checkout");
  useEffect(() => {
    if (checkoutFlag !== "success" && checkoutFlag !== "canceled") return;
    void qc.invalidateQueries({ queryKey: ["billing"] });
    showToast(checkoutFlag === "success" ? "Checkout completed. Syncing subscription…" : "Checkout canceled.", {
      variant: checkoutFlag === "success" ? "success" : "info"
    });
    const next = new URLSearchParams(searchParams);
    next.delete("checkout");
    setSearchParams(next, { replace: true });
  }, [checkoutFlag, qc, showToast, searchParams, setSearchParams]);

  const configQuery = useQuery({
    queryKey: ["billing", "config", workspaceId],
    queryFn: () => governanceApi.billingConfig(token!, workspaceId),
    enabled: Boolean(token && workspaceId)
  });

  const statusQuery = useQuery({
    queryKey: ["billing", "status", workspaceId],
    queryFn: () => governanceApi.billingStatus(token!, workspaceId),
    enabled: Boolean(token && workspaceId)
  });

  const invoicesQuery = useQuery({
    queryKey: ["billing", "invoices", workspaceId],
    queryFn: () => governanceApi.billingInvoices(token!, workspaceId),
    enabled: Boolean(token && workspaceId && (statusQuery.data as BillingStatusResponse | undefined)?.has_customer)
  });

  const invoiceDetailQuery = useQuery({
    queryKey: ["billing", "invoice", workspaceId, invoiceFocus?.id],
    queryFn: () => governanceApi.billingInvoice(token!, workspaceId, invoiceFocus!.id),
    enabled: Boolean(token && workspaceId && invoiceFocus?.id && modal === "invoice")
  });

  const checkoutMutation = useMutation({
    mutationFn: (body: { plan: PlanId; billing_period: BillingCycle }) =>
      governanceApi.billingCheckout(token!, workspaceId, {
        plan: body.plan,
        billing_period: body.billing_period,
        success_url: `${billingReturnBase()}?checkout=success`,
        cancel_url: `${billingReturnBase()}?checkout=canceled`,
        email: user?.email ?? ""
      }),
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      if (billingSimulated) {
        showToast("Demo: plan saved locally (no Stripe redirect).", { variant: "success" });
        closeModal();
        void qc.invalidateQueries({ queryKey: ["billing"] });
      }
    },
    onError: (e: Error) => showToast(e.message, { variant: "error" })
  });

  const portalMutation = useMutation({
    mutationFn: () => governanceApi.billingPortal(token!, workspaceId, billingReturnBase()),
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      if (billingSimulated) {
        showToast("Demo: would open Stripe Customer Portal here.", { variant: "info" });
      }
    },
    onError: (e: Error) => showToast(e.message, { variant: "error" })
  });

  const addressMutation = useMutation({
    mutationFn: (body: { line1: string; line2: string; city: string; region: string; postal: string; country: string }) =>
      governanceApi.billingCustomerPatch(token!, workspaceId, body),
    onSuccess: () => {
      showToast(billingSimulated ? "Demo: billing address saved." : "Billing address updated in Stripe.", { variant: "success" });
      void qc.invalidateQueries({ queryKey: ["billing", "status", workspaceId] });
      closeModal();
    },
    onError: (e: Error) => showToast(e.message, { variant: "error" })
  });

  const defaultPmMutation = useMutation({
    mutationFn: (paymentMethodId: string) => governanceApi.billingPaymentMethodDefault(token!, workspaceId, paymentMethodId),
    onSuccess: () => {
      showToast("Default payment method updated.", { variant: "success" });
      void qc.invalidateQueries({ queryKey: ["billing", "status", workspaceId] });
    },
    onError: (e: Error) => showToast(e.message, { variant: "error" })
  });

  const detachPmMutation = useMutation({
    mutationFn: (paymentMethodId: string) => governanceApi.billingPaymentMethodDetach(token!, workspaceId, paymentMethodId),
    onSuccess: () => {
      showToast("Payment method removed.", { variant: "success" });
      void qc.invalidateQueries({ queryKey: ["billing", "status", workspaceId] });
    },
    onError: (e: Error) => showToast(e.message, { variant: "error" })
  });

  const stripeConfigured = billingSimulated || configQuery.data?.stripe_configured === true;
  const status: BillingStatusResponse | undefined = statusQuery.data;
  const hasCustomer = status?.has_customer === true;
  const paymentMethods: BillingPaymentMethod[] = status?.payment_methods ?? [];
  const addr = status?.address;

  const sessionPlanLabel = user?.plan?.trim() || "—";

  const renewalLabel = useMemo(() => {
    if (!status?.current_period_end) return "—";
    try {
      return new Date(status.current_period_end).toLocaleDateString(undefined, { dateStyle: "medium" });
    } catch {
      return status.current_period_end;
    }
  }, [status?.current_period_end]);

  function openInvoice(inv: BillingInvoiceListItem) {
    setInvoiceFocus(inv);
    setModal("invoice");
  }

  function downloadInvoice(inv: BillingInvoiceListItem) {
    const url = inv.invoice_pdf || inv.hosted_invoice_url;
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    showToast("No PDF link for this invoice yet.", { variant: "info" });
  }

  return (
    <div className="space-y-8">
      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Sparkles className="h-8 w-8 shrink-0 text-orange-600" />
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-orange-600">Account</p>
              <h2 className="mt-1 text-2xl font-semibold text-slate-900">Billing</h2>
              <p className="mt-2 max-w-2xl text-slate-600">
                {billingSimulated
                  ? "Demo mode uses in-memory billing data. Production uses Stripe Checkout, the Customer Portal, and webhooks."
                  : "Subscriptions, invoices, and cards are handled by Stripe. Use Checkout to subscribe and the Customer Portal to manage payment methods and download PDF invoices."}
              </p>
            </div>
          </div>
        </div>
        {billingSimulated ? (
          <div className="mt-4 rounded border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
            <span className="font-medium">Demo billing.</span> Data is simulated in the browser. Set{" "}
            <code className="rounded bg-white px-1">VITE_USE_DEMO_DATA=false</code> (or sign in against a live API) to use real Stripe.
          </div>
        ) : !stripeConfigured ? (
          <div className="mt-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Stripe is not configured on the server. Set <code className="rounded bg-white px-1">STRIPE_SECRET_KEY</code> and price IDs (see{" "}
            <code className="rounded bg-white px-1">.env.example</code>), restart metadata-service, and point Stripe webhooks to{" "}
            <code className="rounded bg-white px-1">POST /webhooks/stripe</code> on the API gateway.
          </div>
        ) : null}
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Subscription</h3>
            <p className="mt-1 text-sm text-slate-600">
              Account plan (from session): <span className="font-medium text-slate-900">{sessionPlanLabel}</span>
              {user?.subscription_state ? (
                <>
                  {" "}
                  · <span className="font-medium text-slate-900">{user.subscription_state}</span>
                </>
              ) : null}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Stripe subscription status:{" "}
              <span className="font-medium text-slate-900">{status?.subscription_status ? status.subscription_status : "none"}</span>
              {status?.cancel_at_period_end ? (
                <span className="ml-2 text-amber-800">· Cancels at period end</span>
              ) : null}
              <br />
              Current period ends: <span className="font-medium text-slate-900">{renewalLabel}</span>
              {status?.price_id ? (
                <>
                  {" "}
                  · Price <span className="font-mono text-xs">{status.price_id}</span>
                </>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canWrite && stripeConfigured ? (
              <button type="button" className={btnSecondary} onClick={() => setModal("subscription")}>
                Change plan
              </button>
            ) : null}
            {canWrite && stripeConfigured && hasCustomer && !billingSimulated ? (
              <button
                type="button"
                className={`${btnSecondary} inline-flex items-center gap-2`}
                disabled={portalMutation.isPending}
                onClick={() => portalMutation.mutate()}
              >
                <ExternalLink className="h-4 w-4" />
                Stripe portal
              </button>
            ) : null}
          </div>
        </div>
        {!hasCustomer && stripeConfigured ? (
          <p className="mt-3 text-sm text-slate-600">Complete checkout once to create a Stripe customer for this workspace.</p>
        ) : null}
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-5 w-5 text-slate-500" />
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Billing address</h3>
              <p className="mt-2 text-sm text-slate-600">
                {addr?.line1 || "—"}
                {addr?.line2 ? `, ${addr.line2}` : ""}
                <br />
                {[addr?.city, addr?.region, addr?.postal].filter(Boolean).join(", ") || "—"}
                <br />
                {addr?.country || ""}
              </p>
            </div>
          </div>
          {canWrite && stripeConfigured && (hasCustomer || billingSimulated) ? (
            <div className="flex flex-wrap gap-2">
              {!String(addr?.line1 ?? "").trim() ? (
                <button
                  type="button"
                  className={`${btnPrimary} inline-flex items-center gap-2`}
                  onClick={() => {
                    setAddressMode("add");
                    setModal("address");
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Add billing address
                </button>
              ) : (
                <button
                  type="button"
                  className={`${btnSecondary} inline-flex items-center gap-2`}
                  onClick={() => {
                    setAddressMode("edit");
                    setModal("address");
                  }}
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </button>
              )}
            </div>
          ) : null}
        </div>
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <CreditCard className="mt-0.5 h-5 w-5 text-slate-500" />
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Payment methods</h3>
              <p className="mt-1 text-sm text-slate-600">
                {billingSimulated
                  ? "Demo cards are stored in memory. Add cards with validation, or remove them after confirming in a dialog."
                  : "Cards are stored in Stripe. Add a card with the secure form, or use the portal for full wallet management."}
              </p>
            </div>
          </div>
          {canWrite && stripeConfigured && hasCustomer ? (
            <button type="button" className={btnPrimary} onClick={() => setCardsModalOpen(true)}>
              Add or manage cards
            </button>
          ) : null}
        </div>
        {!hasCustomer ? (
          <p className="mt-3 text-sm text-slate-500">No Stripe customer yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {paymentMethods.map((pm) => (
              <li key={pm.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-slate-900">
                    {pm.brand} ·••• {pm.last4}
                    {pm.is_default ? (
                      <span className="ml-2 rounded bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-800">Default</span>
                    ) : null}
                  </p>
                  <p className="text-sm text-slate-500">
                    Expires {String(pm.exp_month).padStart(2, "0")}/{pm.exp_year}
                  </p>
                </div>
                {canWrite ? (
                  <div className="flex flex-wrap gap-2">
                    {!pm.is_default ? (
                      <button
                        type="button"
                        className={btnSecondary}
                        disabled={defaultPmMutation.isPending}
                        onClick={() => defaultPmMutation.mutate(pm.id)}
                      >
                        Set default
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="rounded border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                      disabled={detachPmMutation.isPending}
                      onClick={() => setPmRemoveTarget(pm)}
                    >
                      Remove
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <div className="flex items-start gap-3">
          <Receipt className="mt-0.5 h-5 w-5 text-slate-500" />
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-slate-900">Invoices</h3>
            <p className="mt-1 text-sm text-slate-600">Open hosted invoice or PDF from Stripe.</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-4">Invoice</th>
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Amount</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {((invoicesQuery.data?.items ?? []) as BillingInvoiceListItem[]).map((inv) => (
                    <tr key={inv.id} className="border-b border-slate-100">
                      <td className="py-3 pr-4 font-mono text-xs text-slate-900">{inv.number || inv.id}</td>
                      <td className="py-3 pr-4 text-slate-600">{inv.issued_at}</td>
                      <td className="py-3 pr-4 text-slate-900">
                        {inv.currency} {inv.amount}
                      </td>
                      <td className="py-3 pr-4 capitalize text-slate-600">{inv.status}</td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" className={`${btnSecondary} inline-flex items-center gap-1 px-3 py-1.5 text-xs`} onClick={() => openInvoice(inv)}>
                            <FileText className="h-3.5 w-3.5" />
                            View
                          </button>
                          <button
                            type="button"
                            className={`${btnSecondary} inline-flex items-center gap-1 px-3 py-1.5 text-xs`}
                            onClick={() => downloadInvoice(inv)}
                          >
                            <Download className="h-3.5 w-3.5" />
                            PDF / hosted
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(invoicesQuery.data?.items ?? []).length === 0 ? <p className="mt-3 text-sm text-slate-500">No invoices yet.</p> : null}
            </div>
          </div>
        </div>
      </section>

      {modal === "subscription" && stripeConfigured ? (
        <SubscriptionModal
          priceMap={configQuery.data?.price_map ?? {}}
          onClose={closeModal}
          onCheckout={(plan, period) => checkoutMutation.mutate({ plan, billing_period: period })}
          loading={checkoutMutation.isPending}
        />
      ) : null}

      {modal === "address" && (hasCustomer || billingSimulated) ? (
        <AddressModal
          mode={addressMode}
          initial={{
            line1: addr?.line1 ?? "",
            line2: addr?.line2 ?? "",
            city: addr?.city ?? "",
            region: addr?.region ?? "",
            postal: addr?.postal ?? "",
            country: addr?.country ?? ""
          }}
          onClose={closeModal}
          onSave={(body) => {
            if (!hasCustomer && !billingSimulated) {
              showToast("Complete checkout once to create a Stripe customer, then you can save a billing address.", { variant: "info" });
              return;
            }
            addressMutation.mutate(body);
          }}
          loading={addressMutation.isPending}
        />
      ) : null}

      <BillingPaymentMethodsModal
        open={cardsModalOpen}
        onClose={() => setCardsModalOpen(false)}
        billingSimulated={billingSimulated}
        publishableKey={configQuery.data?.publishable_key ?? ""}
        hasCustomer={hasCustomer}
        token={token!}
        workspaceId={workspaceId}
        paymentMethods={paymentMethods}
        onInvalidate={() => void qc.invalidateQueries({ queryKey: ["billing"] })}
        onOpenPortal={() => portalMutation.mutate()}
        onSetDefault={(id) => defaultPmMutation.mutate(id)}
        onDetach={(id) => setPmRemoveTarget(paymentMethods.find((p) => p.id === id) ?? null)}
        defaultPmPending={defaultPmMutation.isPending}
        detachPending={detachPmMutation.isPending}
      />

      <BillingConfirmRemoveCardModal
        open={Boolean(pmRemoveTarget)}
        brand={pmRemoveTarget?.brand ?? ""}
        last4={pmRemoveTarget?.last4 ?? ""}
        loading={detachPmMutation.isPending}
        onCancel={() => setPmRemoveTarget(null)}
        onConfirm={() => {
          if (!pmRemoveTarget) return;
          const id = pmRemoveTarget.id;
          detachPmMutation.mutate(id, {
            onSuccess: () => setPmRemoveTarget(null),
            onError: () => setPmRemoveTarget(null)
          });
        }}
      />

      {modal === "invoice" && invoiceFocus ? (
        <InvoiceModal
          summary={invoiceFocus}
          detail={invoiceDetailQuery.data}
          loading={invoiceDetailQuery.isLoading}
          error={invoiceDetailQuery.isError ? (invoiceDetailQuery.error as Error).message : null}
          onClose={closeModal}
          onOpenPdf={() => downloadInvoice(invoiceFocus)}
        />
      ) : null}
    </div>
  );
}

function BillingModalShell({
  eyebrow,
  title,
  description,
  onClose,
  children
}: {
  eyebrow: string;
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[min(90vh,680px)] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-orange-600">{eyebrow}</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-600">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function SubscriptionModal({
  priceMap,
  onClose,
  onCheckout,
  loading
}: {
  priceMap: Record<string, { monthly?: string; annual?: string }>;
  onClose: () => void;
  onCheckout: (plan: PlanId, period: BillingCycle) => void;
  loading: boolean;
}) {
  const [localPlan, setLocalPlan] = useState<PlanId>("professional");
  const [localCycle, setLocalCycle] = useState<BillingCycle>("monthly");

  const priceConfigured = Boolean(priceMap[localPlan]?.[localCycle === "monthly" ? "monthly" : "annual"]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!priceConfigured) return;
    onCheckout(localPlan, localCycle);
  }

  return (
    <BillingModalShell
      eyebrow="Subscription"
      title="Change plan"
      description="You will be redirected to Stripe Checkout to confirm payment. Create matching Products / Prices in Stripe and set STRIPE_PRICE_* env vars."
      onClose={onClose}
    >
      <form className="space-y-4" onSubmit={submit}>
        <fieldset>
          <legend className="text-sm font-medium text-slate-800">Plan</legend>
          <div className="mt-2 space-y-2">
            {(["starter", "professional", "enterprise"] as PlanId[]).map((id) => (
              <label key={id} className="flex cursor-pointer items-center gap-3 rounded border border-slate-200 px-3 py-2 hover:bg-slate-50">
                <input type="radio" name="plan" checked={localPlan === id} onChange={() => setLocalPlan(id)} />
                <span className="text-sm text-slate-800">{PLAN_LABELS[id]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block text-sm text-slate-700">
          Billing cadence
          <select className={inputClass} value={localCycle} onChange={(e) => setLocalCycle(e.target.value as BillingCycle)}>
            <option value="monthly">Monthly</option>
            <option value="annual">Annual</option>
          </select>
        </label>
        {!priceConfigured ? (
          <p className="text-sm text-amber-800">No Stripe price ID is configured for this combination. Set the matching STRIPE_PRICE env variable.</p>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={btnPrimary} disabled={loading || !priceConfigured}>
            {loading ? "Redirecting…" : "Continue to Stripe Checkout"}
          </button>
        </div>
      </form>
    </BillingModalShell>
  );
}

type AddrForm = { line1: string; line2: string; city: string; region: string; postal: string; country: string };

function AddressModal({
  mode,
  initial,
  onClose,
  onSave,
  loading
}: {
  mode: "add" | "edit";
  initial: AddrForm;
  onClose: () => void;
  onSave: (body: AddrForm) => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<AddrForm>(initial);

  function submit(e: FormEvent) {
    e.preventDefault();
    onSave(form);
  }

  const title = mode === "add" ? "Add billing address" : "Edit billing address";
  const desc =
    mode === "add"
      ? "This address appears on invoices. For live Stripe, a customer record must exist (complete checkout first unless you are in demo mode)."
      : "Updates the Stripe customer billing address (shown on invoices).";

  return (
    <BillingModalShell
      eyebrow="Billing address"
      title={title}
      description={desc}
      onClose={onClose}
    >
      <form className="space-y-3" onSubmit={submit}>
        <label className="block text-sm text-slate-700">
          Address line 1
          <input className={inputClass} value={form.line1} onChange={(e) => setForm((f) => ({ ...f, line1: e.target.value }))} required />
        </label>
        <label className="block text-sm text-slate-700">
          Address line 2
          <input className={inputClass} value={form.line2} onChange={(e) => setForm((f) => ({ ...f, line2: e.target.value }))} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm text-slate-700">
            City
            <input className={inputClass} value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} required />
          </label>
          <label className="block text-sm text-slate-700">
            State / region
            <input className={inputClass} value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} required />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm text-slate-700">
            Postal code
            <input className={inputClass} value={form.postal} onChange={(e) => setForm((f) => ({ ...f, postal: e.target.value }))} required />
          </label>
          <label className="block text-sm text-slate-700">
            Country
            <input className={inputClass} value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} required />
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={btnPrimary} disabled={loading}>
            {loading ? "Saving…" : mode === "add" ? "Save address" : "Save"}
          </button>
        </div>
      </form>
    </BillingModalShell>
  );
}

function InvoiceModal({
  summary,
  detail,
  loading,
  error,
  onClose,
  onOpenPdf
}: {
  summary: BillingInvoiceListItem;
  detail: BillingInvoiceDetail | undefined;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onOpenPdf: () => void;
}) {
  const display: Partial<BillingInvoiceDetail> = detail ?? {
    number: summary.number,
    currency: summary.currency,
    total: summary.amount,
    issued_at: summary.issued_at,
    status: summary.status,
    lines: []
  };

  return (
    <BillingModalShell
      eyebrow="Invoice"
      title={display.number || summary.id}
      description={`Issued ${display.issued_at ?? summary.issued_at} · ${display.status ?? summary.status}`}
      onClose={onClose}
    >
      {loading ? <p className="text-sm text-slate-600">Loading line items…</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="space-y-4 text-sm text-slate-700">
        <div className="rounded border border-slate-100 bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {display.currency ?? summary.currency} {display.total ?? summary.amount}
          </p>
        </div>
        {(display.lines ?? []).length > 0 ? (
          <table className="w-full text-left text-sm">
            <tbody>
              {(display.lines ?? []).map((line, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <th className="py-2 pr-4 font-medium text-slate-600">{line.description}</th>
                  <td className="py-2 text-right text-slate-900">
                    {line.currency} {line.amount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Close
          </button>
          <button type="button" className={`${btnPrimary} inline-flex items-center gap-2`} onClick={onOpenPdf}>
            <Download className="h-4 w-4" />
            PDF / hosted
          </button>
        </div>
      </div>
    </BillingModalShell>
  );
}
