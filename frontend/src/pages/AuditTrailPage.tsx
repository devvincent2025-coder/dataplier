import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";

import { governanceApi } from "../lib/api";
import { useSessionStore } from "../store/session";

const card = "rounded border border-slate-200 bg-white p-6 shadow-panel";

export function AuditTrailPage() {
  const token = useSessionStore((s) => s.token);
  const workspaceId = useSessionStore((s) => s.user?.workspace_id ?? "");

  const auditQuery = useQuery({
    queryKey: ["audit-events", workspaceId],
    queryFn: () => governanceApi.auditEvents(token!, workspaceId, 150),
    enabled: Boolean(token && workspaceId),
    refetchInterval: 30_000
  });

  const items = auditQuery.data?.items ?? [];

  return (
    <div className="space-y-8">
      <section className={card}>
        <div className="flex items-start gap-3">
          <ScrollText className="h-8 w-8 shrink-0 text-orange-600" />
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-orange-600">Governance plane</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Audit trail</h2>
            <p className="mt-2 text-slate-600">
              Workspace-scoped events from the <code className="rounded bg-slate-100 px-1">logs</code> table (connection checks, pipeline edits,
              discovery, and future auth hooks). Refreshes every 30 seconds.
            </p>
          </div>
        </div>
      </section>

      <section className={card}>
        <h3 className="text-lg font-semibold text-slate-900">Recent events</h3>
        <ul className="mt-4 divide-y divide-slate-100">
          {items.map((ev) => (
            <li key={ev.id} className="py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-slate-900">{ev.message}</p>
                <time className="text-xs text-slate-500">{ev.created_at}</time>
              </div>
              <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                {ev.entity_type} · <span className="text-orange-600">{ev.level}</span>
                {ev.entity_id ? <> · id {ev.entity_id}</> : null}
              </p>
              {Object.keys(ev.context ?? {}).length > 0 ? (
                <pre className="mt-2 max-h-32 overflow-auto rounded bg-slate-50 p-2 text-xs text-slate-700">{JSON.stringify(ev.context, null, 2)}</pre>
              ) : null}
            </li>
          ))}
        </ul>
        {items.length === 0 && !auditQuery.isLoading ? (
          <p className="mt-4 text-sm text-slate-500">No log rows for this workspace yet. Run discovery or touch a connection to generate entries.</p>
        ) : null}
      </section>
    </div>
  );
}
