import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { loadStripe, type Stripe, type StripeElements } from "@stripe/stripe-js";

type MountedPaymentElement = { unmount: () => void };
import { X } from "lucide-react";

import { validateCardForm } from "../../lib/billingCardValidation";
import { governanceApi } from "../../lib/api";
import { useToast } from "../../context/ToastContext";

const btnPrimary = "rounded bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50";
const btnSecondary = "rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50";
const inputClass =
  "mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100";

type Pm = { id: string; brand: string; last4: string; exp_month: number; exp_year: number; is_default: boolean };

type Props = {
  open: boolean;
  onClose: () => void;
  billingSimulated: boolean;
  publishableKey: string;
  hasCustomer: boolean;
  token: string;
  workspaceId: string;
  paymentMethods: Pm[];
  onInvalidate: () => void;
  onOpenPortal: () => void;
  onSetDefault: (id: string) => void;
  onDetach: (id: string) => void;
  defaultPmPending: boolean;
  detachPending: boolean;
};

export function BillingPaymentMethodsModal({
  open,
  onClose,
  billingSimulated,
  publishableKey,
  hasCustomer,
  token,
  workspaceId,
  paymentMethods,
  onInvalidate,
  onOpenPortal,
  onSetDefault,
  onDetach,
  defaultPmPending,
  detachPending
}: Props) {
  const { showToast } = useToast();
  const [tab, setTab] = useState<"list" | "add">("list");
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const payMountRef = useRef<HTMLDivElement>(null);
  const stripeRef = useRef<Stripe | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const paymentElementRef = useRef<MountedPaymentElement | null>(null);

  const resetAddForm = useCallback(() => {
    setName("");
    setNumber("");
    setExpiry("");
    setCvc("");
  }, []);

  useEffect(() => {
    if (!open) {
      setTab("list");
      resetAddForm();
      setClientSecret(null);
      try {
        paymentElementRef.current?.unmount();
      } catch {
        /* ignore */
      }
      paymentElementRef.current = null;
      elementsRef.current = null;
      stripeRef.current = null;
    }
  }, [open, resetAddForm]);

  useEffect(() => {
    if (!open || billingSimulated || tab !== "add" || !hasCustomer || !publishableKey) return;
    let cancelled = false;
    (async () => {
      setSetupLoading(true);
      try {
        const res = await governanceApi.billingSetupIntent(token, workspaceId);
        if (!cancelled) setClientSecret(res.client_secret);
      } catch (e) {
        if (!cancelled) showToast((e as Error).message, { variant: "error" });
      } finally {
        if (!cancelled) setSetupLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, billingSimulated, tab, hasCustomer, publishableKey, token, workspaceId, showToast]);

  useEffect(() => {
    if (!open || billingSimulated || tab !== "add" || !clientSecret || !publishableKey || !payMountRef.current) return;
    const el = payMountRef.current;
    let destroyed = false;
    (async () => {
      const stripe = await loadStripe(publishableKey);
      if (!stripe || destroyed || !el) return;
      stripeRef.current = stripe;
      const elements = stripe.elements({ clientSecret, appearance: { theme: "stripe" } });
      elementsRef.current = elements;
      const payment = elements.create("payment", { layout: "tabs" });
      paymentElementRef.current = payment;
      payment.mount(el);
    })();
    return () => {
      destroyed = true;
      try {
        paymentElementRef.current?.unmount();
      } catch {
        /* ignore */
      }
      paymentElementRef.current = null;
      elementsRef.current = null;
      stripeRef.current = null;
    };
  }, [open, billingSimulated, tab, clientSecret, publishableKey]);

  async function submitDemoAdd(e: FormEvent) {
    e.preventDefault();
    const v = validateCardForm({ name, number, expiry, cvc });
    if (!v.ok) {
      showToast(v.message, { variant: "error" });
      return;
    }
    setAddSubmitting(true);
    try {
      await governanceApi.billingDemoAddCard(token, workspaceId, { name, number, expiry, cvc });
      showToast("Card added (demo).", { variant: "success" });
      resetAddForm();
      setTab("list");
      onInvalidate();
    } catch (err) {
      showToast((err as Error).message, { variant: "error" });
    } finally {
      setAddSubmitting(false);
    }
  }

  async function submitStripeAdd(e: FormEvent) {
    e.preventDefault();
    const stripe = stripeRef.current;
    const elements = elementsRef.current;
    if (!stripe || !elements || !clientSecret) {
      showToast("Payment form is not ready yet.", { variant: "error" });
      return;
    }
    setAddSubmitting(true);
    try {
      const { error } = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: window.location.href
        },
        redirect: "if_required"
      });
      if (error) {
        showToast(error.message ?? "Card setup failed", { variant: "error" });
        return;
      }
      showToast("Card saved.", { variant: "success" });
      setTab("list");
      setClientSecret(null);
      onInvalidate();
    } finally {
      setAddSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[min(92vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pm-modal-title"
        onMouseDown={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-orange-600">Billing</p>
            <h2 id="pm-modal-title" className="mt-1 text-xl font-semibold text-slate-900">
              Payment methods
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {billingSimulated
                ? "Simulated cards for local demo. Numbers are validated with Luhn; nothing leaves your browser."
                : "Add a card with Stripe’s secure form, or open the Customer Portal for full wallet management."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-slate-100 px-5 pt-3">
          <div className="flex gap-1">
            <button
              type="button"
              className={`rounded-t px-3 py-2 text-sm font-medium ${tab === "list" ? "bg-orange-50 text-orange-800" : "text-slate-600 hover:bg-slate-50"}`}
              onClick={() => setTab("list")}
            >
              Saved cards
            </button>
            <button
              type="button"
              className={`rounded-t px-3 py-2 text-sm font-medium ${tab === "add" ? "bg-orange-50 text-orange-800" : "text-slate-600 hover:bg-slate-50"}`}
              onClick={() => setTab("add")}
            >
              Add card
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {tab === "list" ? (
            <div className="space-y-3">
              <ul className="divide-y divide-slate-100 rounded border border-slate-100">
                {paymentMethods.map((pm) => (
                  <li key={pm.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-3">
                    <div>
                      <p className="font-medium text-slate-900">
                        {pm.brand} ·••• {pm.last4}
                        {pm.is_default ? (
                          <span className="ml-2 rounded bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-800">Default</span>
                        ) : null}
                      </p>
                      <p className="text-xs text-slate-500">
                        Expires {String(pm.exp_month).padStart(2, "0")}/{pm.exp_year}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!pm.is_default ? (
                        <button type="button" className={btnSecondary} disabled={defaultPmPending} onClick={() => onSetDefault(pm.id)}>
                          Set default
                        </button>
                      ) : null}
                      <button type="button" className="rounded border border-red-200 px-2 py-1 text-xs text-red-700" disabled={detachPending} onClick={() => onDetach(pm.id)}>
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              {!billingSimulated ? (
                <button type="button" className={`${btnSecondary} w-full`} onClick={onOpenPortal}>
                  Open Stripe Customer Portal
                </button>
              ) : null}
            </div>
          ) : billingSimulated ? (
            <form className="space-y-3" onSubmit={submitDemoAdd}>
              <label className="block text-sm text-slate-700">
                Name on card
                <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete="cc-name" />
              </label>
              <label className="block text-sm text-slate-700">
                Card number
                <input className={inputClass} inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value)} autoComplete="cc-number" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm text-slate-700">
                  Expires MM / YY
                  <input className={inputClass} placeholder="12 / 28" value={expiry} onChange={(e) => setExpiry(e.target.value)} autoComplete="cc-exp" />
                </label>
                <label className="block text-sm text-slate-700">
                  CVC
                  <input className={inputClass} inputMode="numeric" value={cvc} onChange={(e) => setCvc(e.target.value)} autoComplete="cc-csc" />
                </label>
              </div>
              <p className="text-xs text-slate-500">Use a test pattern such as 4242 4242 4242 4242. We never store full PAN in demo.</p>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className={btnSecondary} onClick={() => setTab("list")}>
                  Back
                </button>
                <button type="submit" className={btnPrimary} disabled={addSubmitting}>
                  {addSubmitting ? "Adding…" : "Add card"}
                </button>
              </div>
            </form>
          ) : !hasCustomer ? (
            <p className="text-sm text-slate-600">Complete subscription checkout once so a Stripe customer exists, then you can add cards here.</p>
          ) : setupLoading || !clientSecret ? (
            <p className="text-sm text-slate-600">{setupLoading ? "Preparing secure form…" : "Loading…"}</p>
          ) : (
            <form className="space-y-4" onSubmit={submitStripeAdd}>
              <div ref={payMountRef} className="min-h-[200px] rounded border border-slate-100 bg-slate-50 p-3" />
              <div className="flex justify-end gap-2">
                <button type="button" className={btnSecondary} onClick={() => setTab("list")}>
                  Back
                </button>
                <button type="submit" className={btnPrimary} disabled={addSubmitting}>
                  {addSubmitting ? "Saving…" : "Save card"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export function BillingConfirmRemoveCardModal({
  open,
  brand,
  last4,
  loading,
  onCancel,
  onConfirm
}: {
  open: boolean;
  brand: string;
  last4: string;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rm-card-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="rm-card-title" className="text-lg font-semibold text-slate-900">
          Remove card?
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Remove <span className="font-medium text-slate-900">{brand}</span> ending in <span className="font-mono">{last4}</span> from this workspace
          billing profile. You can add a card again later.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button type="button" className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50" onClick={onConfirm} disabled={loading}>
            {loading ? "Removing…" : "Remove card"}
          </button>
        </div>
      </div>
    </div>
  );
}
