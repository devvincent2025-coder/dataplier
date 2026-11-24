import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookMarked, Trash2 } from "lucide-react";

import { governanceApi } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { useSessionStore } from "../store/session";

const card = "rounded border border-slate-200 bg-white p-6 shadow-panel";
const inputClass =
  "mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100";

export function TemplateLibraryPage() {
  const token = useSessionStore((s) => s.token);
  const user = useSessionStore((s) => s.user);
  const workspaceId = user?.workspace_id ?? "";
  const canWrite = user?.permissions?.includes("governance.write") ?? false;
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [specText, setSpecText] = useState('{\n  "kind": "PipelineTemplate",\n  "builder_config": {},\n  "nodes": [],\n  "edges": []\n}');

  const listQuery = useQuery({
    queryKey: ["pipeline-templates", workspaceId],
    queryFn: () => governanceApi.templatesList(token!, workspaceId),
    enabled: Boolean(token && workspaceId)
  });

  const createMutation = useMutation({
    mutationFn: () => {
      let spec: Record<string, unknown> = {};
      try {
        spec = JSON.parse(specText) as Record<string, unknown>;
      } catch {
        throw new Error("Spec JSON is invalid");
      }
      return governanceApi.templateCreate(token!, workspaceId, {
        name: name.trim(),
        description: description.trim(),
        spec_json: spec
      });
    },
    onSuccess: () => {
      setName("");
      setDescription("");
      showToast("Template saved.", { variant: "success" });
      void qc.invalidateQueries({ queryKey: ["pipeline-templates", workspaceId] });
    },
    onError: (e: Error) => showToast(e.message, { variant: "error" })
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => governanceApi.templateDelete(token!, workspaceId, id),
    onSuccess: () => {
      showToast("Template removed.", { variant: "success" });
      void qc.invalidateQueries({ queryKey: ["pipeline-templates", workspaceId] });
    },
    onError: (e: Error) => showToast(e.message, { variant: "error" })
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate();
  }

  return (
    <div className="space-y-8">
      <section className={card}>
        <div className="flex items-start gap-3">
          <BookMarked className="h-8 w-8 shrink-0 text-orange-600" />
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-orange-600">Pipeline design</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Template library</h2>
            <p className="mt-2 text-slate-600">
              Reusable JSON specs stored per workspace. Pair with the pipeline builder export format so teams can promote golden paths from sandbox to
              production.
            </p>
          </div>
        </div>
      </section>

      {canWrite ? (
        <section className={card}>
          <h3 className="text-lg font-semibold text-slate-900">New template</h3>
          <form className="mt-4 space-y-4" onSubmit={onSubmit}>
            <label className="block text-sm text-slate-700">
              Name
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="block text-sm text-slate-700">
              Description
              <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <label className="block text-sm text-slate-700">
              Spec JSON
              <textarea className={`${inputClass} font-mono text-xs`} rows={10} value={specText} onChange={(e) => setSpecText(e.target.value)} />
            </label>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="rounded bg-orange-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {createMutation.isPending ? "Saving…" : "Save template"}
            </button>
          </form>
        </section>
      ) : null}

      <section className={card}>
        <h3 className="text-lg font-semibold text-slate-900">Templates</h3>
        <ul className="mt-4 space-y-4">
          {(listQuery.data?.items ?? []).map((t) => (
            <li key={t.id} className="rounded border border-slate-100 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">{t.name}</p>
                  <p className="mt-1 text-sm text-slate-600">{t.description || "—"}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    Updated {t.updated_at} · id <code className="rounded bg-slate-100 px-1">{t.id}</code>
                  </p>
                </div>
                {canWrite ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete template “${t.name}”?`)) deleteMutation.mutate(t.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                ) : null}
              </div>
              <pre className="mt-3 max-h-40 overflow-auto rounded bg-slate-50 p-2 text-xs text-slate-800">{JSON.stringify(t.spec_json, null, 2)}</pre>
            </li>
          ))}
        </ul>
        {(listQuery.data?.items ?? []).length === 0 ? <p className="mt-3 text-sm text-slate-500">No templates yet.</p> : null}
      </section>
    </div>
  );
}
