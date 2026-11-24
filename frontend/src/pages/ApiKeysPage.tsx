import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Trash2 } from "lucide-react";

import { governanceApi } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { useSessionStore } from "../store/session";

const card = "rounded border border-slate-200 bg-white p-6 shadow-panel";
const inputClass =
  "mt-1 w-full max-w-md rounded border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100";

export function ApiKeysPage() {
  const token = useSessionStore((s) => s.token);
  const user = useSessionStore((s) => s.user);
  const workspaceId = user?.workspace_id ?? "";
  const canWrite = user?.permissions?.includes("governance.write") ?? false;
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["api-keys", workspaceId],
    queryFn: () => governanceApi.apiKeysList(token!, workspaceId),
    enabled: Boolean(token && workspaceId)
  });

  const createMutation = useMutation({
    mutationFn: () => governanceApi.apiKeyCreate(token!, workspaceId, name.trim()),
    onSuccess: (data) => {
      setRevealed(data.token);
      setName("");
      showToast("API key created. Copy the token now — it will not be shown again.", { variant: "success" });
      void qc.invalidateQueries({ queryKey: ["api-keys", workspaceId] });
    },
    onError: (e: Error) => showToast(e.message, { variant: "error" })
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => governanceApi.apiKeyDelete(token!, workspaceId, id),
    onSuccess: () => {
      showToast("API key deleted.", { variant: "success" });
      void qc.invalidateQueries({ queryKey: ["api-keys", workspaceId] });
    },
    onError: (e: Error) => showToast(e.message, { variant: "error" })
  });

  function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate();
  }

  return (
    <div className="space-y-8">
      <section className={card}>
        <div className="flex items-start gap-3">
          <KeyRound className="h-8 w-8 shrink-0 text-orange-600" />
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-orange-600">Automation</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">API keys</h2>
            <p className="mt-2 text-slate-600">
              Keys are scoped to this workspace and hashed at rest. Use them for CI, agents, or internal tools calling the gateway with{" "}
              <code className="rounded bg-slate-100 px-1">Authorization: Bearer …</code> alongside{" "}
              <code className="rounded bg-slate-100 px-1">X-Workspace-Id</code>.
            </p>
          </div>
        </div>
      </section>

      {canWrite ? (
        <section className={card}>
          <h3 className="text-lg font-semibold text-slate-900">Create key</h3>
          <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={onCreate}>
            <label className="block min-w-[200px] flex-1 text-sm text-slate-700">
              Label
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CI deploy bot" />
            </label>
            <button
              type="submit"
              disabled={createMutation.isPending || !name.trim()}
              className="rounded bg-orange-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {createMutation.isPending ? "Creating…" : "Generate key"}
            </button>
          </form>
          {revealed ? (
            <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <p className="font-medium">New token (copy now)</p>
              <code className="mt-2 block break-all rounded bg-white p-2 text-xs">{revealed}</code>
              <button type="button" className="mt-2 text-xs font-medium text-amber-900 underline" onClick={() => setRevealed(null)}>
                Dismiss
              </button>
            </div>
          ) : null}
        </section>
      ) : (
        <p className="text-sm text-slate-600">Your role can list keys but not create or revoke them.</p>
      )}

      <section className={card}>
        <h3 className="text-lg font-semibold text-slate-900">Active keys</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Prefix</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(listQuery.data?.items ?? []).map((k) => (
                <tr key={k.id} className="border-b border-slate-100">
                  <td className="py-3 pr-4 font-medium text-slate-900">{k.name}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-slate-600">{k.key_prefix}…</td>
                  <td className="py-3 pr-4 text-slate-600">{k.created_at}</td>
                  <td className="py-3">
                    {canWrite ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (window.confirm(`Delete API key “${k.name}”?`)) deleteMutation.mutate(k.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Revoke
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(listQuery.data?.items ?? []).length === 0 ? <p className="mt-3 text-sm text-slate-500">No keys yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
