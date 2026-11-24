import type { DatasetItem } from "../lib/api";

/** Warehouse / governance enrichment from dataset-service (or demo). */
export function DatasetIntelChips({ item }: { item: DatasetItem }) {
  const tier = typeof item.data_contract?.tier === "string" ? String(item.data_contract.tier) : null;
  const hint = item.transfer_cost_hint;
  const low = hint && typeof hint.estimated_egress_usd_monthly_low === "number" ? hint.estimated_egress_usd_monthly_low : null;
  const high = hint && typeof hint.estimated_egress_usd_monthly_high === "number" ? hint.estimated_egress_usd_monthly_high : null;
  const profile = item.multi_vendor_profile;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-medium uppercase tracking-wide">
      {item.table_format ? (
        <span className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-slate-700 normal-case">{item.table_format}</span>
      ) : null}
      {item.cdc_eligible ? (
        <span className="rounded border border-orange-200 bg-orange-50 px-2 py-0.5 text-orange-900">CDC-ready</span>
      ) : (
        <span className="rounded border border-slate-200 bg-white px-2 py-0.5 text-slate-500 normal-case">CDC n/a</span>
      )}
      {tier ? (
        <span className="rounded border border-orange-200 bg-orange-50 px-2 py-0.5 text-orange-900 normal-case">Contract: {tier}</span>
      ) : null}
      {profile ? (
        <span className="rounded border border-slate-200 bg-white px-2 py-0.5 text-slate-600 normal-case">{profile.replace(/_/g, " ")}</span>
      ) : null}
      {low != null && high != null ? (
        <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-950 normal-case" title="Illustrative egress band">
          Egress est. ${low}–${high}/mo
        </span>
      ) : null}
    </div>
  );
}
