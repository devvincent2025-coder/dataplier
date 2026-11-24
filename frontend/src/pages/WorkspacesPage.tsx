import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Pencil, PlusCircle, SlidersHorizontal, Trash2, UserMinus, UserPlus, X } from "lucide-react";

import {
  authApi,
  type RoleDefinition,
  type WorkspaceAccessItem,
  type WorkspaceInviteItem,
  type WorkspaceItem
} from "../lib/api";
import { useToast } from "../context/ToastContext";
import { useQueryErrorToast } from "../hooks/useQueryErrorToast";
import { useSessionStore } from "../store/session";
import { formatRoleLabel } from "../lib/formatRoleLabel";

const WORKSPACES_REFRESH_MS = 30_000;

type CreateInviteRow = {
  id: string;
  email: string;
  role: WorkspaceAccessItem["role"];
};

export function WorkspacesPage() {
  const token = useSessionStore((state) => state.token);
  const user = useSessionStore((state) => state.user);
  const setUser = useSessionStore((state) => state.setUser);
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [region, setRegion] = useState("us-central1");
  const [environment, setEnvironment] = useState<WorkspaceItem["environment"]>("Development");
  const [description, setDescription] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editWorkspace, setEditWorkspace] = useState<WorkspaceItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editRegion, setEditRegion] = useState("us-central1");
  const [editEnvironment, setEditEnvironment] = useState<WorkspaceItem["environment"]>("Development");
  const [editDescription, setEditDescription] = useState("");
  const [editGrantInvites, setEditGrantInvites] = useState<CreateInviteRow[]>([]);
  const [editGrantDraftEmail, setEditGrantDraftEmail] = useState("");
  const [editGrantDraftRole, setEditGrantDraftRole] = useState<WorkspaceAccessItem["role"]>("viewer");
  const editGrantInputRef = useRef<HTMLInputElement>(null);
  const [createInvites, setCreateInvites] = useState<CreateInviteRow[]>([]);
  const [inviteDraftEmail, setInviteDraftEmail] = useState("");
  const [inviteDraftRole, setInviteDraftRole] = useState<WorkspaceAccessItem["role"]>("viewer");
  const inviteInputRef = useRef<HTMLInputElement>(null);
  const [workspacePendingDelete, setWorkspacePendingDelete] = useState<WorkspaceItem | null>(null);
  const [onlyWorkspaceDeleteOpen, setOnlyWorkspaceDeleteOpen] = useState(false);
  const [editMemberModal, setEditMemberModal] = useState<WorkspaceAccessItem | null>(null);
  const [editMemberRole, setEditMemberRole] = useState<WorkspaceAccessItem["role"]>("viewer");
  const [editMemberPermSelection, setEditMemberPermSelection] = useState<Record<string, boolean>>({});
  const [revokeMemberModal, setRevokeMemberModal] = useState<WorkspaceAccessItem | null>(null);
  const [cancelInviteModal, setCancelInviteModal] = useState<WorkspaceInviteItem | null>(null);

  const workspacesQuery = useQuery({
    queryKey: ["auth-workspaces"],
    queryFn: () => authApi.workspaces(token!),
    enabled: Boolean(token),
    refetchInterval: WORKSPACES_REFRESH_MS
  });

  useQueryErrorToast(
    Boolean(workspacesQuery.isError),
    workspacesQuery.error,
    "Could not load workspaces.",
    showToast
  );

  const createWorkspaceMutation = useMutation({
    mutationFn: async (args: {
      workspace: { name: string; region: string; environment: WorkspaceItem["environment"]; description: string };
      invites: CreateInviteRow[];
    }) => {
      const created = await authApi.createWorkspace(token!, args.workspace);
      const failures: string[] = [];
      let grantedCount = 0;
      const creatorEmail = user?.email?.trim().toLowerCase() ?? "";
      const seen = new Set<string>();
      const rc = queryClient.getQueryData<{ definitions: RoleDefinition[] }>(["role-catalog"]);
      for (const row of args.invites) {
        const em = row.email.trim();
        const key = em.toLowerCase();
        if (!em || seen.has(key)) {
          continue;
        }
        seen.add(key);
        if (key === creatorEmail) {
          continue;
        }
        if (row.role === "owner") {
          failures.push(`${em}: cannot assign owner via invite list`);
          continue;
        }
        try {
          await authApi.assignWorkspaceAccess(token!, {
            workspace_id: created.item.id,
            email: em,
            role: row.role
          });
          grantedCount += 1;
        } catch (err) {
          const msg = (err instanceof Error ? err.message : "").toLowerCase();
          if (msg.includes("not found") || msg.includes("user not found")) {
            try {
              const def = rc?.definitions.find((d) => d.id === row.role);
              const perms = def?.permissions?.length ? def.permissions : [];
              await authApi.sendWorkspaceInvite(token!, {
                workspace_id: created.item.id,
                email: em,
                role: row.role as "admin" | "engineer" | "viewer",
                permissions: perms
              });
              grantedCount += 1;
            } catch (e2) {
              failures.push(`${em}: ${e2 instanceof Error ? e2.message : "invite failed"}`);
            }
          } else {
            failures.push(`${em}: ${err instanceof Error ? err.message : "failed"}`);
          }
        }
      }
      return { created, failures, grantedCount };
    },
    onSuccess: (data) => {
      const { created, failures, grantedCount } = data;
      let msg = `Workspace "${created.item.name}" created.`;
      if (grantedCount > 0) {
        msg += ` ${grantedCount} teammate(s) added or invited.`;
      }
      if (failures.length > 0) {
        msg += ` ${failures.length} invite(s) failed: ${failures.join(" · ")}`;
      }
      showToast(msg, { variant: failures.length ? "info" : "success" });
      setName("");
      setRegion("us-central1");
      setEnvironment("Development");
      setDescription("");
      setCreateInvites([]);
      setInviteDraftEmail("");
      setInviteDraftRole("viewer");
      setCreateModalOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["auth-workspaces"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-members"] });
      void queryClient.invalidateQueries({ queryKey: ["role-catalog"] });
    },
    onError: (error) => {
      showToast(error instanceof Error ? error.message : "Could not create workspace.", { variant: "error" });
    }
  });

  const workspaces = workspacesQuery.data?.items ?? [];
  const canManageAccess = user?.permissions?.includes("workspace.access.manage") ?? false;

  const roleCatalogQuery = useQuery({
    queryKey: ["role-catalog"],
    queryFn: () => authApi.roleCatalog(token!),
    enabled: Boolean(token)
  });

  const roleDefinition = useMemo(
    () => (role: string) => roleCatalogQuery.data?.definitions.find((d) => d.id === role) as RoleDefinition | undefined,
    [roleCatalogQuery.data?.definitions]
  );

  const membersQuery = useQuery({
    queryKey: ["workspace-members", editWorkspace?.id ?? ""],
    queryFn: async () => {
      const data = await authApi.workspaceAccess(token!, editWorkspace!.id);
      return { items: data.items, invites: data.invites ?? [] };
    },
    enabled: Boolean(token && editWorkspace?.id),
    refetchInterval: editWorkspace ? WORKSPACES_REFRESH_MS : false
  });

  useQueryErrorToast(
    Boolean(membersQuery.isError),
    membersQuery.error,
    "Could not load members.",
    showToast
  );

  const assignAccessMutation = useMutation({
    mutationFn: (payload: {
      workspace_id: string;
      email: string;
      role: WorkspaceAccessItem["role"];
      permissions?: string[] | null;
    }) => authApi.assignWorkspaceAccess(token!, payload),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["workspace-members", variables.workspace_id] });
      await queryClient.invalidateQueries({ queryKey: ["auth-workspaces"] });
      await queryClient.invalidateQueries({ queryKey: ["roles-workspace-members", variables.workspace_id] });
    }
  });

  const revokeAccessMutation = useMutation({
    mutationFn: ({ workspaceId, userId }: { workspaceId: string; userId: string }) =>
      authApi.revokeWorkspaceAccess(token!, workspaceId, userId),
    onSuccess: async (_, variables) => {
      showToast("Access revoked.", { variant: "success" });
      setRevokeMemberModal(null);
      await queryClient.invalidateQueries({ queryKey: ["workspace-members", variables.workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ["auth-workspaces"] });
      await queryClient.invalidateQueries({ queryKey: ["roles-workspace-members", variables.workspaceId] });
    },
    onError: (e: Error) => showToast(e.message, { variant: "error" })
  });

  const cancelInviteMutation = useMutation({
    mutationFn: ({ workspaceId, inviteId }: { workspaceId: string; inviteId: string }) =>
      authApi.cancelWorkspaceInvite(token!, workspaceId, inviteId),
    onSuccess: async (_, variables) => {
      showToast("Invitation cancelled.", { variant: "success" });
      setCancelInviteModal(null);
      await queryClient.invalidateQueries({ queryKey: ["workspace-members", variables.workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ["roles-workspace-members", variables.workspaceId] });
    },
    onError: (e: Error) => showToast(e.message, { variant: "error" })
  });

  const updateWorkspaceMutation = useMutation({
    mutationFn: (args: {
      id: string;
      body: { name: string; region: string; environment: WorkspaceItem["environment"]; description: string };
    }) => authApi.updateWorkspace(token!, args.id, args.body),
    onSuccess: async (data, variables) => {
      showToast(`Workspace "${data.item.name}" saved.`, { variant: "success" });
      await queryClient.invalidateQueries({ queryKey: ["auth-workspaces"] });
      await queryClient.invalidateQueries({ queryKey: ["workspace-members", variables.id] });
      setEditWorkspace(data.item);
      if (user?.workspace_id === variables.id && token) {
        try {
          const fresh = await authApi.session(token);
          setUser(fresh.user);
        } catch {
          /* ignore */
        }
      }
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Could not save workspace. Please try again.";
      showToast(message, { variant: "error" });
    }
  });

  const deleteWorkspaceMutation = useMutation({
    mutationFn: ({ id }: { id: string; name: string }) => authApi.deleteWorkspace(token!, id),
    onSuccess: async (_, { id: deletedId, name }) => {
      showToast(`Workspace "${name}" deleted.`, { variant: "success" });
      setWorkspacePendingDelete(null);
      if (editWorkspace?.id === deletedId) {
        setEditWorkspace(null);
      }
      await queryClient.invalidateQueries({ queryKey: ["auth-workspaces"] });
      await queryClient.invalidateQueries({ queryKey: ["workspace-members"] });
      const t = useSessionStore.getState().token;
      if (t) {
        try {
          const fresh = await authApi.session(t);
          setUser(fresh.user);
        } catch {
          /* session refresh is best-effort */
        }
      }
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Could not delete workspace. Please try again.";
      showToast(message, { variant: "error" });
    }
  });

  const totalByEnvironment = useMemo(() => {
    return workspaces.reduce<Record<WorkspaceItem["environment"], number>>(
      (counts, item) => {
        counts[item.environment] += 1;
        return counts;
      },
      { Production: 0, Staging: 0, Development: 0 }
    );
  }, [workspaces]);

  const prevEditWorkspaceIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!editWorkspace) {
      prevEditWorkspaceIdRef.current = null;
      return;
    }
    setEditName(editWorkspace.name);
    setEditRegion(editWorkspace.region);
    setEditEnvironment(editWorkspace.environment);
    setEditDescription(editWorkspace.description);
  }, [editWorkspace]);

  useEffect(() => {
    const id = editWorkspace?.id ?? null;
    if (id === null) {
      return;
    }
    if (id === prevEditWorkspaceIdRef.current) {
      return;
    }
    prevEditWorkspaceIdRef.current = id;
    setEditGrantInvites([]);
    setEditGrantDraftEmail("");
    setEditGrantDraftRole("viewer");
  }, [editWorkspace?.id]);

  function mergeDraftIntoInvites(rows: CreateInviteRow[]): CreateInviteRow[] {
    const raw = inviteDraftEmail.trim();
    if (!raw) {
      return rows;
    }
    const parts = raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    const creatorEmail = user?.email?.trim().toLowerCase() ?? "";
    const seen = new Set(rows.map((r) => r.email.trim().toLowerCase()));
    const next = [...rows];
    for (const em of parts) {
      const key = em.toLowerCase();
      if (!key.includes("@") || seen.has(key) || key === creatorEmail) {
        continue;
      }
      seen.add(key);
      next.push({
        id: `inv-${Date.now()}-${next.length}-${Math.random().toString(36).slice(2, 9)}`,
        email: em,
        role: inviteDraftRole
      });
    }
    return next;
  }

  async function handleCreateWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || !token) {
      return;
    }

    const invitesForSubmit = mergeDraftIntoInvites(createInvites);

    await createWorkspaceMutation.mutateAsync({
      workspace: {
        name: trimmedName,
        region,
        environment,
        description: description.trim()
      },
      invites: invitesForSubmit
    });
  }

  function commitInviteEmails(emails: string[], role: WorkspaceAccessItem["role"]) {
    const creatorEmail = user?.email?.trim().toLowerCase() ?? "";
    setCreateInvites((rows) => {
      const existing = new Set(rows.map((r) => r.email.trim().toLowerCase()));
      const next = [...rows];
      for (const raw of emails) {
        const em = raw.trim();
        const key = em.toLowerCase();
        if (!em || !key.includes("@") || existing.has(key) || key === creatorEmail) {
          continue;
        }
        existing.add(key);
        next.push({
          id: `inv-${Date.now()}-${next.length}-${Math.random().toString(36).slice(2, 9)}`,
          email: em,
          role
        });
      }
      return next;
    });
  }

  function flushInviteDraft() {
    const raw = inviteDraftEmail.trim();
    if (!raw) {
      return;
    }
    const parts = raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length) {
      commitInviteEmails(parts, inviteDraftRole);
    }
    setInviteDraftEmail("");
  }

  function removeCreateInvite(id: string) {
    setCreateInvites((rows) => rows.filter((r) => r.id !== id));
  }

  function openCreateWorkspaceModal() {
    setCreateInvites([]);
    setInviteDraftEmail("");
    setInviteDraftRole("viewer");
    setCreateModalOpen(true);
  }

  function mergeEditGrantDraft(rows: CreateInviteRow[]): CreateInviteRow[] {
    const raw = editGrantDraftEmail.trim();
    if (!raw) {
      return rows;
    }
    const parts = raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    const creatorEmail = user?.email?.trim().toLowerCase() ?? "";
    const seen = new Set(rows.map((r) => r.email.trim().toLowerCase()));
    const next = [...rows];
    for (const em of parts) {
      const key = em.toLowerCase();
      if (!key.includes("@") || seen.has(key) || key === creatorEmail) {
        continue;
      }
      seen.add(key);
      next.push({
        id: `eg-${Date.now()}-${next.length}-${Math.random().toString(36).slice(2, 9)}`,
        email: em,
        role: editGrantDraftRole
      });
    }
    return next;
  }

  function commitEditGrantEmails(emails: string[], role: WorkspaceAccessItem["role"]) {
    const creatorEmail = user?.email?.trim().toLowerCase() ?? "";
    setEditGrantInvites((rows) => {
      const existing = new Set(rows.map((r) => r.email.trim().toLowerCase()));
      const next = [...rows];
      for (const raw of emails) {
        const em = raw.trim();
        const key = em.toLowerCase();
        if (!em || !key.includes("@") || existing.has(key) || key === creatorEmail) {
          continue;
        }
        existing.add(key);
        next.push({
          id: `eg-${Date.now()}-${next.length}-${Math.random().toString(36).slice(2, 9)}`,
          email: em,
          role
        });
      }
      return next;
    });
  }

  function flushEditGrantDraft() {
    const raw = editGrantDraftEmail.trim();
    if (!raw) {
      return;
    }
    const parts = raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length) {
      commitEditGrantEmails(parts, editGrantDraftRole);
    }
    setEditGrantDraftEmail("");
  }

  function removeEditGrantInvite(id: string) {
    setEditGrantInvites((rows) => rows.filter((r) => r.id !== id));
  }

  async function handleSaveWorkspaceDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editWorkspace || !token) {
      return;
    }
    const trimmed = editName.trim();
    if (!trimmed) {
      return;
    }
    try {
      await updateWorkspaceMutation.mutateAsync({
        id: editWorkspace.id,
        body: {
          name: trimmed,
          region: editRegion,
          environment: editEnvironment,
          description: editDescription.trim()
        }
      });
    } catch {
      /* updateWorkspaceMutation.onError shows toast */
    }
  }

  async function handleGrantAccessFromEdit() {
    if (!editWorkspace || !token || !canManageAccess) {
      return;
    }
    const toGrant = mergeEditGrantDraft(editGrantInvites);
    if (toGrant.length === 0) {
      showToast("Add at least one email (comma or Enter), then grant access.", { variant: "info" });
      return;
    }
    const failures: string[] = [];
    let ok = 0;
    const rc = queryClient.getQueryData<{ definitions: RoleDefinition[] }>(["role-catalog"]);
    for (const row of toGrant) {
      const em = row.email.trim();
      if (row.role === "owner") {
        failures.push(`${em}: use Roles to manage ownership`);
        continue;
      }
      try {
        await assignAccessMutation.mutateAsync({
          workspace_id: editWorkspace.id,
          email: em,
          role: row.role
        });
        ok += 1;
      } catch (err) {
        const msg = (err instanceof Error ? err.message : "").toLowerCase();
        if (msg.includes("not found") || msg.includes("user not found")) {
          try {
            const def = rc?.definitions.find((d) => d.id === row.role);
            const perms = def?.permissions?.length ? def.permissions : [];
            await authApi.sendWorkspaceInvite(token, {
              workspace_id: editWorkspace.id,
              email: em,
              role: row.role as "admin" | "engineer" | "viewer",
              permissions: perms
            });
            ok += 1;
          } catch (e2) {
            failures.push(`${em}: ${e2 instanceof Error ? e2.message : "invite failed"}`);
          }
        } else {
          failures.push(`${em}: ${err instanceof Error ? err.message : "failed"}`);
        }
      }
    }
    setEditGrantInvites([]);
    setEditGrantDraftEmail("");
    if (failures.length) {
      showToast(`${ok} processed. Some failed: ${failures.join(" · ")}`, { variant: "info" });
    } else {
      showToast(`${ok} teammate(s) added or invited.`, { variant: "success" });
    }
  }

  function openMemberPermissions(member: WorkspaceAccessItem) {
    setEditMemberModal(member);
    setEditMemberRole(member.role);
    const def = roleDefinition(member.role);
    const next: Record<string, boolean> = {};
    const effective = member.permissions?.length ? member.permissions : def?.permissions ?? [];
    for (const p of def?.permissions ?? []) {
      next[p] = effective.includes(p);
    }
    setEditMemberPermSelection(next);
  }

  function syncEditMemberPermsForRole(role: WorkspaceAccessItem["role"]) {
    const def = roleDefinition(role);
    const next: Record<string, boolean> = {};
    for (const p of def?.permissions ?? []) next[p] = true;
    setEditMemberPermSelection(next);
  }

  function saveMemberPermissions() {
    if (!editMemberModal || !editWorkspace) return;
    const def = roleDefinition(editMemberRole);
    const selected = Object.entries(editMemberPermSelection)
      .filter(([, on]) => on)
      .map(([p]) => p)
      .filter((p) => def?.permissions.includes(p));
    if (selected.length === 0) {
      showToast("Select at least one permission.", { variant: "error" });
      return;
    }
    assignAccessMutation.mutate(
      {
        workspace_id: editWorkspace.id,
        email: editMemberModal.email,
        role: editMemberRole,
        permissions: selected
      },
      {
        onSuccess: () => {
          setEditMemberModal(null);
          showToast("Permissions saved.", { variant: "success" });
        }
      }
    );
  }

  function workspaceRoleCanDelete(role: string | undefined) {
    return role === "owner" || role === "admin";
  }

  function openDeleteWorkspaceDialog(workspace: WorkspaceItem) {
    if (!workspaceRoleCanDelete(workspace.role)) {
      return;
    }
    if (workspaces.length <= 1) {
      setOnlyWorkspaceDeleteOpen(true);
      return;
    }
    setWorkspacePendingDelete(workspace);
  }

  function confirmDeleteWorkspace() {
    if (!workspacePendingDelete) {
      return;
    }
    deleteWorkspaceMutation.mutate({
      id: workspacePendingDelete.id,
      name: workspacePendingDelete.name
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs uppercase tracking-[0.24em] text-orange-600">Workspace Management</p>
        <h2 className="mt-2 text-3xl font-semibold text-slate-950">Create and manage workspaces</h2>
        <p className="mt-3 max-w-3xl text-slate-600">
          Workspaces isolate connections, datasets, pipelines, and governance policies for each team or environment.
        </p>
        {workspacesQuery.isFetching && !workspacesQuery.isLoading ? (
          <p className="mt-2 text-xs text-slate-500">Refreshing workspace list…</p>
        ) : null}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <StatsCard title="Total Workspaces" value={String(workspaces.length)} />
          <StatsCard title="Production" value={String(totalByEnvironment.Production)} />
          <StatsCard title="Staging + Dev" value={String(totalByEnvironment.Staging + totalByEnvironment.Development)} />
        </div>
      </section>

      <section className="rounded border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-slate-700" />
              <h3 className="text-xl font-semibold text-slate-900">Existing Workspaces</h3>
            </div>
            <p className="mt-1 text-sm text-slate-500">Click a card to edit details and manage access.</p>
          </div>
          <button
            type="button"
            onClick={openCreateWorkspaceModal}
            className="inline-flex items-center gap-2 rounded bg-orange-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-600"
          >
            <PlusCircle className="h-4 w-4" />
            Create Workspace
          </button>
        </div>
        <div className="mt-2 space-y-3">
          {workspacesQuery.isLoading ? <p className="text-sm text-slate-600">Loading workspaces...</p> : null}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workspaces.map((workspace) => {
              const canDelete = workspaceRoleCanDelete(workspace.role) && workspaces.length > 1;
              const isDeleting =
                deleteWorkspaceMutation.isPending && deleteWorkspaceMutation.variables?.id === workspace.id;
              return (
                <article
                  key={workspace.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setEditWorkspace(workspace)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setEditWorkspace(workspace);
                    }
                  }}
                  className="flex h-full cursor-pointer flex-col rounded border border-slate-200 bg-slate-50 p-4 text-left outline-none transition hover:border-orange-300 hover:bg-orange-50/40 focus-visible:ring-2 focus-visible:ring-orange-400"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">{workspace.name}</p>
                      <p className="mt-1 truncate text-sm text-slate-600">slug: {workspace.slug}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700">{workspace.environment}</span>
                      {canDelete ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openDeleteWorkspaceDialog(workspace);
                          }}
                          disabled={isDeleting}
                          className="inline-flex items-center gap-1 rounded border border-rose-200 bg-white px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                          aria-label={`Delete workspace ${workspace.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {isDeleting ? "…" : "Delete"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-3 flex-1 text-sm text-slate-600 line-clamp-4">{workspace.description || "No description provided."}</p>
                  <div className="mt-3 flex flex-wrap items-end justify-between gap-x-2 gap-y-1 border-t border-slate-200 pt-3 text-xs text-slate-500">
                    <span>Region: {workspace.region}</span>
                    <span>Created: {new Date(workspace.created_at).toLocaleDateString()}</span>
                  </div>
                </article>
              );
            })}
          </div>
          {!workspacesQuery.isLoading && workspaces.length === 0 ? <p className="text-sm text-slate-600">No workspaces yet.</p> : null}
        </div>
      </section>

      {onlyWorkspaceDeleteOpen ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="only-workspace-delete-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setOnlyWorkspaceDeleteOpen(false);
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h3 id="only-workspace-delete-title" className="text-lg font-semibold text-slate-900">
              Cannot delete workspace
            </h3>
            <p className="mt-3 text-sm text-slate-600">
              You must keep at least one workspace. Create another workspace first, then you can delete this one.
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setOnlyWorkspaceDeleteOpen(false)}
                className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {workspacePendingDelete ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-workspace-title"
          aria-describedby="delete-workspace-desc"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deleteWorkspaceMutation.isPending) {
              setWorkspacePendingDelete(null);
            }
          }}
        >
          <div
            className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100">
                <Trash2 className="h-5 w-5 text-rose-700" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <h3 id="delete-workspace-title" className="text-lg font-semibold text-slate-900">
                  Delete workspace?
                </h3>
                <p className="mt-1 text-sm font-medium text-slate-800">
                  {workspacePendingDelete.name}
                </p>
                <p id="delete-workspace-desc" className="mt-4 text-sm leading-relaxed text-slate-600">
                  This action permanently removes the workspace for all members. It will also remove{" "}
                  <strong className="font-semibold text-slate-800">all services, resources, and connections</strong> tied to this workspace in the control plane. This
                  cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                disabled={deleteWorkspaceMutation.isPending}
                onClick={() => setWorkspacePendingDelete(null)}
                className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteWorkspaceMutation.isPending}
                onClick={confirmDeleteWorkspace}
                className="rounded bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {deleteWorkspaceMutation.isPending &&
                deleteWorkspaceMutation.variables?.id === workspacePendingDelete.id
                  ? "Deleting…"
                  : "Delete workspace"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editWorkspace ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setEditWorkspace(null);
            }
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded border border-slate-200 bg-white p-6 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Pencil className="h-5 w-5 text-orange-600" />
                <h3 className="text-xl font-semibold text-slate-900">Edit workspace</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditWorkspace(null)}
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
              >
                Close
              </button>
            </div>
           

            <form className="mt-5 space-y-4" onSubmit={(event) => void handleSaveWorkspaceDetails(event)}>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Workspace name</span>
                <input
                  className="mt-2 w-full rounded border border-slate-300 px-3 py-2.5 text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  required
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Region</span>
                <select
                  className="mt-2 w-full rounded border border-slate-300 px-3 py-2.5 text-slate-900"
                  value={editRegion}
                  onChange={(event) => setEditRegion(event.target.value)}
                >
                  <option value="us-central1">us-central1</option>
                  <option value="us-east1">us-east1</option>
                  <option value="europe-west1">europe-west1</option>
                  <option value="asia-southeast1">asia-southeast1</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Environment</span>
                <select
                  className="mt-2 w-full rounded border border-slate-300 px-3 py-2.5 text-slate-900"
                  value={editEnvironment}
                  onChange={(event) => setEditEnvironment(event.target.value as WorkspaceItem["environment"])}
                >
                  <option value="Development">Development</option>
                  <option value="Staging">Staging</option>
                  <option value="Production">Production</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Description</span>
                <textarea
                  className="mt-2 min-h-[100px] w-full rounded border border-slate-300 px-3 py-2.5 text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                  value={editDescription}
                  onChange={(event) => setEditDescription(event.target.value)}
                />
              </label>
              <button
                type="submit"
                disabled={updateWorkspaceMutation.isPending}
                className="rounded bg-orange-500 px-4 py-2.5 font-medium text-white hover:bg-orange-600 disabled:opacity-60"
              >
                {updateWorkspaceMutation.isPending ? "Saving…" : "Save changes"}
              </button>
            </form>

            <div className="mt-8 border-t border-slate-200 pt-6">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">Members &amp; access</h4>
                  <p className="mt-1 text-xs text-slate-500">
                    Same data as <Link to="/roles" className="font-medium text-orange-600 hover:underline">Workspace roles</Link>. Adjust roles, custom permissions,
                    or revoke access here.
                  </p>
                </div>
              </div>
              {membersQuery.isLoading ? <p className="mt-3 text-sm text-slate-600">Loading members…</p> : null}
              <ul className="mt-3 space-y-2">
                {(membersQuery.data?.items ?? []).map((item) => (
                  <li
                    key={item.user_id}
                    className="flex flex-col gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">{item.full_name}</p>
                      <p className="truncate text-xs text-slate-600">{item.email}</p>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-500">{(item.permissions ?? []).join(" · ") || "—"}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {canManageAccess ? (
                        <select
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                          value={item.role}
                          disabled={assignAccessMutation.isPending || item.user_id === user?.id}
                          onChange={(e) => {
                            const role = e.target.value as WorkspaceAccessItem["role"];
                            assignAccessMutation.mutate({
                              workspace_id: editWorkspace!.id,
                              email: item.email,
                              role
                            });
                          }}
                        >
                          {(["owner", "admin", "engineer", "viewer"] as const).map((r) => (
                            <option key={r} value={r}>
                              {formatRoleLabel(r)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700">{formatRoleLabel(item.role)}</span>
                      )}
                      {canManageAccess ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-100"
                          onClick={() => openMemberPermissions(item)}
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                          Permissions
                        </button>
                      ) : null}
                      {canManageAccess && item.user_id !== user?.id && item.role !== "owner" ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded border border-rose-200 bg-white px-2 py-1 text-xs font-medium text-rose-800 hover:bg-rose-50"
                          disabled={revokeAccessMutation.isPending}
                          onClick={() => setRevokeMemberModal(item)}
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                          Revoke
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
              {!membersQuery.isLoading && !membersQuery.isError && !(membersQuery.data?.items.length) ? (
                <p className="mt-3 text-sm text-slate-600">No members listed.</p>
              ) : null}
            </div>

            {(membersQuery.data?.invites?.length ?? 0) > 0 ? (
              <div className="mt-8 border-t border-slate-200 pt-6">
                <h4 className="text-sm font-semibold text-slate-900">Pending invitations</h4>
                <p className="mt-1 text-xs text-slate-500">Recipients must use the emailed link to join (or sign in and open it again).</p>
                <ul className="mt-3 space-y-2">
                  {(membersQuery.data?.invites ?? []).map((inv) => (
                    <li
                      key={inv.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-100 bg-amber-50/60 px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium text-slate-900">{inv.email}</p>
                        <p className="text-xs text-slate-600">
                          <span className="capitalize">{inv.role}</span>
                          <span className="text-slate-400"> · </span>
                          {new Date(inv.created_at).toLocaleString()}
                        </p>
                      </div>
                      {canManageAccess ? (
                        <button
                          type="button"
                          className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          disabled={cancelInviteMutation.isPending}
                          onClick={() => setCancelInviteModal(inv)}
                        >
                          Cancel invite
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-8 border-t border-slate-200 pt-6">
              <h4 className="text-sm font-semibold text-slate-900">Grant access</h4>
              <p className="mt-1 text-xs text-slate-600">
                Add emails as tags, choose a role, then use <strong className="text-slate-800">Grant access</strong>. Existing users are added immediately; others get
                an email invite (full role permissions by default).
              </p>
              {canManageAccess ? (
                <>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start">
                    <div
                      className="flex min-h-[46px] w-full flex-1 cursor-text flex-wrap items-center gap-1.5 rounded border border-slate-300 bg-white px-2 py-1.5 outline-none transition focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100"
                      onMouseDown={(event) => {
                        if (event.target === event.currentTarget) {
                          event.preventDefault();
                          editGrantInputRef.current?.focus();
                        }
                      }}
                      onClick={() => editGrantInputRef.current?.focus()}
                    >
                      {editGrantInvites.map((row) => (
                        <span
                          key={row.id}
                          className="inline-flex max-w-full items-center gap-1 rounded-full border border-orange-200 bg-orange-50 py-0.5 pl-2.5 pr-0.5 text-sm text-slate-800"
                        >
                          <span className="max-w-[min(100%,220px)] truncate" title={`${row.email} · ${row.role}`}>
                            {row.email}
                          </span>
                          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-orange-800/80">{row.role}</span>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              removeEditGrantInvite(row.id);
                            }}
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-orange-100 hover:text-slate-900"
                            aria-label={`Remove ${row.email}`}
                          >
                            <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                          </button>
                        </span>
                      ))}
                      <input
                        ref={editGrantInputRef}
                        type="text"
                        inputMode="email"
                        autoComplete="off"
                        aria-label="Email to grant access"
                        placeholder={editGrantInvites.length === 0 ? "Type email, then comma or Enter…" : ""}
                        className="min-w-[10ch] flex-1 border-0 bg-transparent py-1.5 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                        value={editGrantDraftEmail}
                        onChange={(event) => setEditGrantDraftEmail(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            flushEditGrantDraft();
                            return;
                          }
                          if (event.key === "," || event.key === ";") {
                            event.preventDefault();
                            flushEditGrantDraft();
                            return;
                          }
                          if (event.key === "Backspace" && editGrantDraftEmail === "") {
                            event.preventDefault();
                            setEditGrantInvites((rows) => rows.slice(0, -1));
                          }
                        }}
                        onPaste={(event) => {
                          const text = event.clipboardData.getData("text");
                          if (/[,\n;]/.test(text)) {
                            event.preventDefault();
                            const parts = text
                              .split(/[\s,;\n]+/)
                              .map((s) => s.trim())
                              .filter(Boolean);
                            commitEditGrantEmails(parts, editGrantDraftRole);
                          }
                        }}
                      />
                    </div>
                    <label className="flex shrink-0 flex-col gap-1 sm:w-[148px]" style={{marginTop: "-15px"}}>
                      <span className="text-xs font-medium text-slate-600">Role for new tags</span>
                      <select
                        className="rounded border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900"
                        value={editGrantDraftRole}
                        onChange={(event) => setEditGrantDraftRole(event.target.value as WorkspaceAccessItem["role"])}
                      >
                        <option value="viewer">Viewer</option>
                        <option value="engineer">Engineer</option>
                        <option value="admin">Admin</option>
                      </select>
                    </label>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Enter or comma to add tags; paste multiple emails at once.
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleGrantAccessFromEdit()}
                    disabled={assignAccessMutation.isPending}
                    className="mt-4 rounded bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {assignAccessMutation.isPending ? "Granting…" : "Grant access to listed emails"}
                  </button>
                </>
              ) : (
                <p className="mt-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  You do not have permission to grant workspace access for this tenant.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {editMemberModal && editWorkspace ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditMemberModal(null);
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900">Permissions — {editMemberModal.email}</h3>
            <p className="mt-2 text-sm text-slate-600">Tune role and checkboxes; at least one permission must remain enabled.</p>
            <label className="mt-4 block text-sm font-medium text-slate-700">Role</label>
            <select
              className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-900"
              value={editMemberRole}
              onChange={(e) => {
                const r = e.target.value as WorkspaceAccessItem["role"];
                setEditMemberRole(r);
                syncEditMemberPermsForRole(r);
              }}
            >
              {(["owner", "admin", "engineer", "viewer"] as const).map((r) => (
                <option key={r} value={r} disabled={editMemberModal.user_id === user?.id && r !== "owner"}>
                  {formatRoleLabel(r)}
                </option>
              ))}
            </select>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Permissions</p>
            <ul className="mt-2 max-h-52 space-y-2 overflow-y-auto rounded border border-slate-100 bg-slate-50/80 p-3">
              {(roleDefinition(editMemberRole)?.permissions ?? []).map((p) => (
                <li key={p} className="flex items-center gap-2 text-sm text-slate-800">
                  <input
                    id={`ws-m-${p}`}
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300"
                    checked={Boolean(editMemberPermSelection[p])}
                    onChange={(e) => setEditMemberPermSelection((prev) => ({ ...prev, [p]: e.target.checked }))}
                  />
                  <label htmlFor={`ws-m-${p}`} className="cursor-pointer select-none">
                    {p}
                  </label>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setEditMemberModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
                disabled={assignAccessMutation.isPending}
                onClick={saveMemberPermissions}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {revokeMemberModal && editWorkspace ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setRevokeMemberModal(null);
          }}
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">Remove member?</h3>
            <p className="mt-3 text-sm text-slate-600">
              <span className="font-medium text-slate-900">{revokeMemberModal.full_name}</span> ({revokeMemberModal.email}) will lose access to this workspace.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setRevokeMemberModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-900 hover:bg-rose-100 disabled:opacity-50"
                disabled={revokeAccessMutation.isPending}
                onClick={() =>
                  revokeAccessMutation.mutate({ workspaceId: editWorkspace.id, userId: revokeMemberModal.user_id })
                }
              >
                Remove access
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {cancelInviteModal && editWorkspace ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCancelInviteModal(null);
          }}
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">Cancel invitation?</h3>
            <p className="mt-3 text-sm text-slate-600">The pending invite to {cancelInviteModal.email} will be removed.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setCancelInviteModal(null)}
              >
                Keep invite
              </button>
              <button
                type="button"
                className="rounded border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-900 hover:bg-rose-100 disabled:opacity-50"
                disabled={cancelInviteMutation.isPending}
                onClick={() =>
                  cancelInviteMutation.mutate({ workspaceId: editWorkspace.id, inviteId: cancelInviteModal.id })
                }
              >
                Cancel invite
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {createModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/95 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <PlusCircle className="h-5 w-5 text-orange-600" />
                <h3 className="text-xl font-semibold text-slate-900">Create Workspace</h3>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
              >
                Close
              </button>
            </div>
            <form className="mt-5" onSubmit={(event) => void handleCreateWorkspace(event)}>
              <div className="space-y-4">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Workspace Name</span>
                  <input
                    className="mt-2 w-full rounded border border-slate-300 px-3 py-2.5 text-slate-900 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                    placeholder="Fraud Analytics Team"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Region</span>
                  <select
                    className="mt-2 w-full rounded border border-slate-300 px-3 py-2.5 text-slate-900 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                    value={region}
                    onChange={(event) => setRegion(event.target.value)}
                  >
                    <option value="us-central1">us-central1</option>
                    <option value="us-east1">us-east1</option>
                    <option value="europe-west1">europe-west1</option>
                    <option value="asia-southeast1">asia-southeast1</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Environment</span>
                  <select
                    className="mt-2 w-full rounded border border-slate-300 px-3 py-2.5 text-slate-900 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                    value={environment}
                    onChange={(event) => setEnvironment(event.target.value as WorkspaceItem["environment"])}
                  >
                    <option value="Development">Development</option>
                    <option value="Staging">Staging</option>
                    <option value="Production">Production</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Description (optional)</span>
                  <textarea
                    className="mt-2 min-h-[110px] w-full rounded border border-slate-300 px-3 py-2.5 text-slate-900 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                    placeholder="Describe what this workspace is used for."
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </label>

                <div className="rounded border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start gap-2">
                    <UserPlus className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">Teammates &amp; permissions (optional)</p>
                     
                      <p className="mt-2 text-xs text-slate-600">
                        You stay <strong>owner</strong> of the new workspace. Roles here are <strong>admin</strong>, <strong>engineer</strong>, or <strong>viewer</strong>.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start">
                    <div
                      className="flex min-h-[46px] w-full flex-1 cursor-text flex-wrap items-center gap-1.5 rounded border border-slate-300 bg-white px-2 py-1.5 outline-none transition focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100"
                      onMouseDown={(event) => {
                        if (event.target === event.currentTarget) {
                          event.preventDefault();
                          inviteInputRef.current?.focus();
                        }
                      }}
                      onClick={() => inviteInputRef.current?.focus()}
                    >
                      {createInvites.map((row) => (
                        <span
                          key={row.id}
                          className="inline-flex max-w-full items-center gap-1 rounded-full border border-orange-200 bg-orange-50 py-0.5 pl-2.5 pr-0.5 text-sm text-slate-800"
                        >
                          <span className="max-w-[min(100%,220px)] truncate" title={`${row.email} · ${row.role}`}>
                            {row.email}
                          </span>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              removeCreateInvite(row.id);
                            }}
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-orange-100 hover:text-slate-900"
                            aria-label={`Remove ${row.email}`}
                          >
                            <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                          </button>
                        </span>
                      ))}
                      <input
                        ref={inviteInputRef}
                        type="text"
                        inputMode="email"
                        autoComplete="off"
                        aria-label="Add teammate email"
                        placeholder={createInvites.length === 0 ? "Type email, then comma or Enter…" : ""}
                        className="min-w-[10ch] flex-1 border-0 bg-transparent py-1.5 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                        value={inviteDraftEmail}
                        onChange={(event) => setInviteDraftEmail(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            flushInviteDraft();
                            return;
                          }
                          if (event.key === "," || event.key === ";") {
                            event.preventDefault();
                            flushInviteDraft();
                            return;
                          }
                          if (event.key === "Backspace" && inviteDraftEmail === "") {
                            event.preventDefault();
                            setCreateInvites((rows) => rows.slice(0, -1));
                          }
                        }}
                        onPaste={(event) => {
                          const text = event.clipboardData.getData("text");
                          if (/[,\n;]/.test(text)) {
                            event.preventDefault();
                            const parts = text
                              .split(/[\s,;\n]+/)
                              .map((s) => s.trim())
                              .filter(Boolean);
                            commitInviteEmails(parts, inviteDraftRole);
                          }
                        }}
                      />
                    </div>
                    <label className="flex shrink-0 flex-col gap-1 sm:w-[148px]" style={{marginTop: "-15px"}}>
                      <span className="text-xs font-medium text-slate-600">Role for new tags</span>
                      <select
                        className="rounded border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900"
                        value={inviteDraftRole}
                        onChange={(event) => setInviteDraftRole(event.target.value as WorkspaceAccessItem["role"])}
                      >
                        <option value="viewer">Viewer</option>
                        <option value="engineer">Engineer</option>
                        <option value="admin">Admin</option>
                      </select>
                    </label>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Press <strong className="font-medium text-slate-700">Enter</strong> or <strong className="font-medium text-slate-700">comma</strong> after each
                    address; paste a comma-separated list to add several at once. Empty field + Backspace removes the last tag. You can add more teammates later by
                    editing the workspace from <strong className="text-slate-700">Existing Workspaces</strong>.
                  </p>
                </div>
              </div>
              <button
                type="submit"
                disabled={createWorkspaceMutation.isPending}
                className="mt-5 inline-flex items-center gap-2 rounded bg-orange-500 px-4 py-2.5 font-medium text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <PlusCircle className="h-4 w-4" />
                {createWorkspaceMutation.isPending ? "Creating..." : "Create Workspace"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatsCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
