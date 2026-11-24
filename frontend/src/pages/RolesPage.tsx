import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Shield, UserMinus, UserPlus, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  authApi,
  type RoleDefinition,
  type WorkspaceAccessItem,
  type WorkspaceInviteItem,
  type WorkspaceItem
} from "../lib/api";
import { useToast } from "../context/ToastContext";
import { useSessionStore } from "../store/session";
import { formatRoleLabel } from "../lib/formatRoleLabel";

const card = "rounded border border-slate-200 bg-white p-6 shadow-panel";

const backdrop =
  "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[1px]";

const modalPanel = "max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-xl";

function ModalFrame({
  title,
  description,
  children,
  footer
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className={backdrop} role="dialog" aria-modal="true">
      <div className={modalPanel}>
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        {description ? <p className="mt-2 text-sm text-slate-600">{description}</p> : null}
        <div className="mt-4">{children}</div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>
      </div>
    </div>
  );
}

const INVITE_ROLES = ["admin", "engineer", "viewer"] as const;
type InviteRole = (typeof INVITE_ROLES)[number];

export function RolesPage() {
  const token = useSessionStore((s) => s.token);
  const user = useSessionStore((s) => s.user);
  const workspaceId = user?.workspace_id ?? "";
  const canManage = user?.permissions?.includes("workspace.access.manage") ?? false;
  const { showToast } = useToast();
  const qc = useQueryClient();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteTargetWorkspaceId, setInviteTargetWorkspaceId] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("engineer");
  const [invitePermSelection, setInvitePermSelection] = useState<Record<string, boolean>>({});

  const [editMember, setEditMember] = useState<WorkspaceAccessItem | null>(null);
  const [editRole, setEditRole] = useState<WorkspaceAccessItem["role"]>("viewer");
  const [editPermSelection, setEditPermSelection] = useState<Record<string, boolean>>({});

  const [revokeMember, setRevokeMember] = useState<WorkspaceAccessItem | null>(null);
  const [revokeInvite, setRevokeInvite] = useState<WorkspaceInviteItem | null>(null);

  const catalogQuery = useQuery({
    queryKey: ["role-catalog"],
    queryFn: () => authApi.roleCatalog(token!),
    enabled: Boolean(token)
  });

  const workspacesQuery = useQuery({
    queryKey: ["auth-workspaces"],
    queryFn: () => authApi.workspaces(token!),
    enabled: Boolean(token && canManage)
  });

  const inviteWorkspaceOptions = useMemo((): WorkspaceItem[] => {
    const items = workspacesQuery.data?.items ?? [];
    if (items.length > 0) return items;
    if (user?.workspace_id) {
      return [
        {
          id: user.workspace_id,
          name: user.workspace_name || "Current workspace",
          slug: user.workspace_slug ?? "",
          region: "",
          environment: "Production",
          description: "",
          created_at: "",
          role: user.workspace_role
        }
      ];
    }
    return [];
  }, [workspacesQuery.data?.items, user?.workspace_id, user?.workspace_name, user?.workspace_slug, user?.workspace_role]);

  useEffect(() => {
    if (!inviteOpen || inviteWorkspaceOptions.length === 0) return;
    const valid = inviteWorkspaceOptions.some((w) => w.id === inviteTargetWorkspaceId);
    if (valid) return;
    const preferred =
      user?.workspace_id && inviteWorkspaceOptions.some((w) => w.id === user.workspace_id)
        ? user.workspace_id
        : inviteWorkspaceOptions[0]!.id;
    setInviteTargetWorkspaceId(preferred);
  }, [inviteOpen, inviteWorkspaceOptions, inviteTargetWorkspaceId, user?.workspace_id]);

  const membersQuery = useQuery({
    queryKey: ["roles-workspace-members", workspaceId],
    queryFn: async () => {
      const data = await authApi.workspaceAccess(token!, workspaceId);
      return {
        items: data.items,
        invites: data.invites ?? []
      };
    },
    enabled: Boolean(token && workspaceId)
  });

  const defs = catalogQuery.data?.definitions ?? [];

  const roleDefinition = useMemo(
    () => (role: string) => defs.find((d) => d.id === role) as RoleDefinition | undefined,
    [defs]
  );

  const openInviteModal = () => {
    const cached = qc.getQueryData<{ items: WorkspaceItem[] }>(["auth-workspaces"])?.items ?? [];
    const fromList =
      user?.workspace_id && cached.some((w) => w.id === user.workspace_id) ? user.workspace_id : cached[0]?.id ?? "";
    const fallback = user?.workspace_id ?? "";
    setInviteTargetWorkspaceId(fromList || fallback);
    const def = roleDefinition(inviteRole);
    const next: Record<string, boolean> = {};
    for (const p of def?.permissions ?? []) next[p] = true;
    setInvitePermSelection(next);
    setInviteEmail("");
    setInviteOpen(true);
  };

  const syncInvitePermsForRole = (role: InviteRole) => {
    const def = roleDefinition(role);
    const next: Record<string, boolean> = {};
    for (const p of def?.permissions ?? []) next[p] = true;
    setInvitePermSelection(next);
  };

  const openEditMember = (m: WorkspaceAccessItem) => {
    setEditMember(m);
    setEditRole(m.role);
    const def = roleDefinition(m.role);
    const allowed = new Set(def?.permissions ?? []);
    const next: Record<string, boolean> = {};
    const effective = m.permissions?.length ? m.permissions : def?.permissions ?? [];
    for (const p of def?.permissions ?? []) {
      next[p] = effective.includes(p) && allowed.has(p);
    }
    setEditPermSelection(next);
  };

  const syncEditPermsForRole = (role: WorkspaceAccessItem["role"]) => {
    const def = roleDefinition(role);
    const next: Record<string, boolean> = {};
    for (const p of def?.permissions ?? []) next[p] = true;
    setEditPermSelection(next);
  };

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const selected = Object.entries(invitePermSelection)
        .filter(([, on]) => on)
        .map(([p]) => p);
      if (!inviteEmail.trim()) throw new Error("Email is required.");
      const targetWs = inviteTargetWorkspaceId.trim() || workspaceId;
      if (!targetWs) throw new Error("Select a workspace for this invite.");
      return authApi.sendWorkspaceInvite(token!, {
        workspace_id: targetWs,
        email: inviteEmail.trim(),
        role: inviteRole,
        permissions: selected
      });
    },
    onSuccess: () => {
      showToast("Invitation sent.", { variant: "success" });
      const targetWs = inviteTargetWorkspaceId.trim() || workspaceId;
      setInviteOpen(false);
      void qc.invalidateQueries({ queryKey: ["roles-workspace-members", targetWs] });
      if (targetWs !== workspaceId) {
        void qc.invalidateQueries({ queryKey: ["roles-workspace-members", workspaceId] });
      }
      void qc.invalidateQueries({ queryKey: ["workspace-members"] });
    },
    onError: (e: Error) => showToast(e.message, { variant: "error" })
  });

  const cancelInviteMutation = useMutation({
    mutationFn: (inv: WorkspaceInviteItem) => authApi.cancelWorkspaceInvite(token!, workspaceId, inv.id),
    onSuccess: () => {
      showToast("Invitation cancelled.", { variant: "success" });
      setRevokeInvite(null);
      void qc.invalidateQueries({ queryKey: ["roles-workspace-members", workspaceId] });
    },
    onError: (e: Error) => showToast(e.message, { variant: "error" })
  });

  const assignMutation = useMutation({
    mutationFn: (payload: {
      user_id: string;
      role: WorkspaceAccessItem["role"];
      permissions?: string[] | null;
    }) => {
      const row = membersQuery.data?.items.find((m) => m.user_id === payload.user_id);
      if (!row) throw new Error("Member not found.");
      return authApi.assignWorkspaceAccess(token!, {
        workspace_id: workspaceId,
        email: row.email,
        role: payload.role,
        ...(payload.permissions !== undefined ? { permissions: payload.permissions } : {})
      });
    },
    onSuccess: () => {
      showToast("Member updated.", { variant: "success" });
      void qc.invalidateQueries({ queryKey: ["roles-workspace-members", workspaceId] });
    },
    onError: (e: Error) => showToast(e.message, { variant: "error" })
  });

  const saveEditMember = () => {
    if (!editMember) return;
    const def = roleDefinition(editRole);
    const selected = Object.entries(editPermSelection)
      .filter(([, on]) => on)
      .map(([p]) => p)
      .filter((p) => def?.permissions.includes(p));
    if (selected.length === 0) {
      showToast("Select at least one permission.", { variant: "error" });
      return;
    }
    assignMutation.mutate(
      { user_id: editMember.user_id, role: editRole, permissions: selected },
      {
        onSuccess: () => setEditMember(null)
      }
    );
  };

  const revokeMutation = useMutation({
    mutationFn: (userId: string) => authApi.revokeWorkspaceAccess(token!, workspaceId, userId),
    onSuccess: () => {
      showToast("Access revoked.", { variant: "success" });
      setRevokeMember(null);
      void qc.invalidateQueries({ queryKey: ["roles-workspace-members", workspaceId] });
    },
    onError: (e: Error) => showToast(e.message, { variant: "error" })
  });

  const inviteDef = roleDefinition(inviteRole);
  const editDef = editMember ? roleDefinition(editRole) : undefined;

  return (
    <div className="space-y-8">
      <section className={card}>
        <div className="flex items-start gap-3">
          <Shield className="h-8 w-8 shrink-0 text-orange-600" />
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-orange-600">Access control</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Workspace roles</h2>
            <p className="mt-2 text-slate-600">
              Owners and admins can invite teammates by email, tune permissions per role, and revoke access. Pending invitations appear below until
              the recipient accepts.
            </p>
          </div>
        </div>
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-900">Workspace Members</h3>
          <div className="flex flex-wrap gap-2">
            {canManage ? (
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700"
                onClick={openInviteModal}
              >
                <UserPlus className="h-4 w-4" />
                Invite member
              </button>
            ) : null}
            <Link to="/workspaces" className="inline-flex items-center rounded border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Workspace admin
            </Link>
          </div>
        </div>
        {!canManage ? (
          <p className="mt-3 text-sm text-slate-600">You need the workspace.access.manage permission to change roles or revoke access.</p>
        ) : null}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Permissions</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(membersQuery.data?.items ?? []).map((m) => (
                <tr key={m.user_id} className="border-b border-slate-100">
                  <td className="py-3 pr-4 font-medium text-slate-900">{m.full_name}</td>
                  <td className="py-3 pr-4 text-slate-600">{m.email}</td>
                  <td className="py-3 pr-4">
                    {canManage ? (
                      <select
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-900"
                        value={m.role}
                        disabled={assignMutation.isPending || m.user_id === user?.id}
                        onChange={(e) => {
                          const role = e.target.value as WorkspaceAccessItem["role"];
                          assignMutation.mutate({ user_id: m.user_id, role });
                        }}
                      >
                        {(["owner", "admin", "engineer", "viewer"] as const).map((r) => (
                          <option key={r} value={r}>
                            {formatRoleLabel(r)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-slate-800">{formatRoleLabel(m.role)}</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-xs text-slate-600">{(m.permissions ?? []).join(", ") || "—"}</td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-2">
                      {canManage ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50"
                          onClick={() => openEditMember(m)}
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                          Permissions
                        </button>
                      ) : null}
                      {canManage && m.user_id !== user?.id && m.role !== "owner" ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-100"
                          disabled={revokeMutation.isPending}
                          onClick={() => setRevokeMember(m)}
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                          Revoke
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={card}>
        <h3 className="text-lg font-semibold text-slate-900">Role capabilities</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {defs.map((d) => (
            <div key={d.id} className="rounded border border-slate-100 bg-slate-50/80 p-4">
              <p className="font-medium text-slate-900">{d.label}</p>
              <p className="mt-1 text-sm text-slate-600">{d.description}</p>
              <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-500">Permissions</p>
              <ul className="mt-1 max-h-28 list-disc overflow-y-auto pl-4 text-xs text-slate-700">
                {d.permissions.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

    

      {(membersQuery.data?.invites?.length ?? 0) > 0 ? (
        <section className={card}>
          <h3 className="text-lg font-semibold text-slate-900">Pending invitations</h3>
          <p className="mt-1 text-sm text-slate-600">These people have been emailed a link to join this workspace.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Sent</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(membersQuery.data?.invites ?? []).map((inv) => (
                  <tr key={inv.id} className="border-b border-slate-100">
                    <td className="py-3 pr-4 text-slate-800">{inv.email}</td>
                    <td className="py-3 pr-4 text-slate-700">{formatRoleLabel(inv.role)}</td>
                    <td className="py-3 pr-4 text-xs text-slate-500">{new Date(inv.created_at).toLocaleString()}</td>
                    <td className="py-3">
                      {canManage ? (
                        <button
                          type="button"
                          className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          disabled={cancelInviteMutation.isPending}
                          onClick={() => setRevokeInvite(inv)}
                        >
                          Cancel invite
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {inviteOpen ? (
        <ModalFrame
          title="Invite teammate"
          description="Pick which workspace they will join when they accept, then set role and permissions. They must use the emailed link to finish signup (or sign in, if they already have an account)."
          footer={
            <>
              <button type="button" className="rounded border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => setInviteOpen(false)}>
                Close
              </button>
              <button
                type="button"
                className="rounded bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
                disabled={
                  inviteMutation.isPending ||
                  !inviteTargetWorkspaceId ||
                  workspacesQuery.isLoading ||
                  inviteWorkspaceOptions.length === 0
                }
                onClick={() => inviteMutation.mutate()}
              >
                Send invite
              </button>
            </>
          }
        >
          <label className="block text-sm font-medium text-slate-700">Workspace</label>
          <select
            className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-900"
            aria-label="Workspace for invite"
            value={inviteTargetWorkspaceId}
            disabled={workspacesQuery.isLoading || inviteWorkspaceOptions.length === 0}
            onChange={(e) => setInviteTargetWorkspaceId(e.target.value)}
          >
            {inviteWorkspaceOptions.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}
                {ws.environment ? ` · ${ws.environment}` : ""}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            You can only invite to workspaces where you have member-administration rights. The invite is tied to this workspace; accept opens it as their active context.
          </p>
          <label className="mt-4 block text-sm font-medium text-slate-700">Email</label>
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-slate-900"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="colleague@company.com"
            autoComplete="email"
          />
          <label className="mt-4 block text-sm font-medium text-slate-700">Role</label>
          <select
            className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-900"
            value={inviteRole}
            onChange={(e) => {
              const r = e.target.value as InviteRole;
              setInviteRole(r);
              syncInvitePermsForRole(r);
            }}
          >
            {INVITE_ROLES.map((r) => (
              <option key={r} value={r}>
                {formatRoleLabel(r)}
              </option>
            ))}
          </select>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Permissions for this role</p>
          <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded border border-slate-100 bg-slate-50/80 p-3">
            {(inviteDef?.permissions ?? []).map((p) => (
              <li key={p} className="flex items-center gap-2 text-sm text-slate-800">
                <input
                  id={`inv-${p}`}
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={Boolean(invitePermSelection[p])}
                  onChange={(e) => setInvitePermSelection((prev) => ({ ...prev, [p]: e.target.checked }))}
                />
                <label htmlFor={`inv-${p}`} className="cursor-pointer select-none">
                  {p}
                </label>
              </li>
            ))}
          </ul>
        </ModalFrame>
      ) : null}

      {editMember && editDef ? (
        <ModalFrame
          title={`Permissions — ${editMember.email}`}
          description="Adjust role and fine-grained permissions. At least one permission must stay enabled."
          footer={
            <>
              <button type="button" className="rounded border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => setEditMember(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
                disabled={assignMutation.isPending}
                onClick={saveEditMember}
              >
                Save
              </button>
            </>
          }
        >
          <label className="block text-sm font-medium text-slate-700">Role</label>
          <select
            className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-900"
            value={editRole}
            onChange={(e) => {
              const r = e.target.value as WorkspaceAccessItem["role"];
              setEditRole(r);
              syncEditPermsForRole(r);
            }}
          >
            {(["owner", "admin", "engineer", "viewer"] as const).map((r) => (
              <option key={r} value={r} disabled={editMember.user_id === user?.id && r !== "owner"}>
                {formatRoleLabel(r)}
              </option>
            ))}
          </select>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Permissions</p>
          <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded border border-slate-100 bg-slate-50/80 p-3">
            {editDef.permissions.map((p) => (
              <li key={p} className="flex items-center gap-2 text-sm text-slate-800">
                <input
                  id={`edit-${p}`}
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={Boolean(editPermSelection[p])}
                  onChange={(e) => setEditPermSelection((prev) => ({ ...prev, [p]: e.target.checked }))}
                />
                <label htmlFor={`edit-${p}`} className="cursor-pointer select-none">
                  {p}
                </label>
              </li>
            ))}
          </ul>
        </ModalFrame>
      ) : null}

      {revokeMember ? (
        <ModalFrame
          title="Remove member?"
          description={`${revokeMember.email} will lose access to this workspace. This cannot be undone from the UI.`}
          footer={
            <>
              <button type="button" className="rounded border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => setRevokeMember(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="rounded border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
                disabled={revokeMutation.isPending}
                onClick={() => revokeMutation.mutate(revokeMember.user_id)}
              >
                Remove access
              </button>
            </>
          }
        >
          <p className="text-sm text-slate-700">
            You are about to revoke workspace access for <span className="font-medium">{revokeMember.full_name}</span>.
          </p>
        </ModalFrame>
      ) : null}

      {revokeInvite ? (
        <ModalFrame
          title="Cancel invitation?"
          description={`The pending invite to ${revokeInvite.email} will be removed. They will not be able to use the old link.`}
          footer={
            <>
              <button type="button" className="rounded border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => setRevokeInvite(null)}>
                Keep invite
              </button>
              <button
                type="button"
                className="rounded border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
                disabled={cancelInviteMutation.isPending}
                onClick={() => cancelInviteMutation.mutate(revokeInvite)}
              >
                Cancel invite
              </button>
            </>
          }
        >
          <p className="text-sm text-slate-700">No email is sent when an invite is cancelled.</p>
        </ModalFrame>
      ) : null}
    </div>
  );
}
