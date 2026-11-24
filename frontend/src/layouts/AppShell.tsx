import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Blocks,
  BookMarked,
  ChevronLeft,
  ChevronRight,
  DatabaseZap,
  FileJson2,
  Fingerprint,
  GitBranch,
  HardDrive,
  KeyRound,
  LayoutDashboard,
  Link2,
  Logs,
  Shield,
  Network,
  Settings2,
  ShieldCheck,
  User
} from "lucide-react";

import { SITE_NAME } from "../config/site";
import { useToast } from "../context/ToastContext";
import { authApi } from "../lib/api";
import { formatRoleLabel } from "../lib/formatRoleLabel";
import { applyPageSeo, removePageJsonLd } from "../lib/seoDocument";
import { useSessionStore } from "../store/session";
import brandLogo from "../assets/logo.svg";

const primaryNav = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Workspaces", href: "/workspaces", icon: Blocks },
  { label: "Connections", href: "/connections", icon: Link2 },
  { label: "Datasets", href: "/dataset-explorer", icon: Network },
  { label: "Schema Editor", href: "/schema-editor", icon: FileJson2 },
  { label: "Routing Center", href: "/routing-center", icon: Network },
  { label: "Pipelines", href: "/pipelines", icon: GitBranch },
  { label: "Templates", href: "/template-library", icon: BookMarked },
  { label: "Builder", href: "/pipeline-builder", icon: Activity },
  { label: "Jobs", href: "/jobs-monitor", icon: Logs },
  { label: "Observability", href: "/observability", icon: Activity },
  { label: "Governance", href: "/audit-trail", icon: Shield },
  { label: "API Access", href: "/api-keys", icon: DatabaseZap }
];

const secondaryNav = [
  { label: "Profile", href: "/dashboard" },
  { label: "Roles", href: "/roles" },
  { label: "API Keys", href: "/api-keys" },
  { label: "Billing", href: "/billing" },
  { label: "Settings", href: "/settings" }
];

function isElevatedWorkspaceRole(role: string | undefined): boolean {
  return role === "owner" || role === "admin";
}

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = useSessionStore((s) => s.token);
  const setSession = useSessionStore((s) => s.setSession);
  const { user, logout } = useSessionStore();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [workspaceSwitching, setWorkspaceSwitching] = useState(false);

  const workspacesQuery = useQuery({
    queryKey: ["auth-workspaces"],
    queryFn: () => authApi.workspaces(token!),
    enabled: Boolean(token)
  });

  const workspaceItems = workspacesQuery.data?.items ?? [];
  const hasMultipleWorkspaces = workspaceItems.length > 1;
  const canPickAnotherWorkspace = useMemo(() => {
    if (!isElevatedWorkspaceRole(user?.workspace_role)) return false;
    return workspaceItems.some((w) => w.id !== user?.workspace_id);
  }, [workspaceItems, user?.workspace_id, user?.workspace_role]);

  useEffect(() => {
    if (location.pathname === "/pipeline-builder") {
      setInspectorOpen(false);
    }
  }, [location.pathname]);

  const currentSection = useMemo(() => {
    const activePrimary = primaryNav.find((item) => item.href === location.pathname);
    const activeSecondary = secondaryNav.find((item) => item.href === location.pathname);
    return activePrimary?.label ?? activeSecondary?.label ?? "Workspace";
  }, [location.pathname]);

  useEffect(() => {
    removePageJsonLd();
    applyPageSeo({
      title: `${currentSection} | ${SITE_NAME}`,
      description: `Signed-in ${SITE_NAME} workspace: pipelines, connections, jobs, lineage, and observability.`,
      canonicalPath: location.pathname,
      robots: "noindex, nofollow",
      jsonLdGraph: []
    });
  }, [currentSection, location.pathname]);

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  async function handleWorkspaceSwitch(nextWorkspaceId: string) {
    if (!token || !user || nextWorkspaceId === user.workspace_id) return;
    if (!workspaceItems.some((w) => w.id === nextWorkspaceId)) return;
    if (!isElevatedWorkspaceRole(user.workspace_role)) {
      showToast("Only workspace owners and admins in your current workspace may switch.", { variant: "error" });
      return;
    }
    setWorkspaceSwitching(true);
    try {
      const res = await authApi.selectWorkspace(token, nextWorkspaceId);
      setSession({ token, user: res.user, session: res.session });
      const roleLabel = formatRoleLabel(res.user.workspace_role ?? "member");
      showToast(
        `Active workspace is now “${res.user.workspace_name}”. Your role here is ${roleLabel} — menus and data use this workspace’s permissions only.`,
        { variant: "success", durationMs: 8000 }
      );
      void queryClient.invalidateQueries({ queryKey: ["auth-workspaces"] });
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not switch workspace.", { variant: "error" });
    } finally {
      setWorkspaceSwitching(false);
    }
  }

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-[248px] border-r border-slate-200 bg-white text-slate-900 lg:flex lg:flex-col">
          <div className="border-b border-slate-200 px-6 py-6">
            <Link to="/dashboard" className="flex items-center gap-3 text-2xl font-semibold tracking-tight text-slate-900">
              <img src={brandLogo} alt="Data Plier logo" className="h-8 w-8 rounded" />
              <span>Data Plier</span>
            </Link>
            {/* <p className="mt-2 text-sm text-slate-500">Universal data control layer for enterprise routing, discovery, and movement.</p> */}
          </div>

          <nav className="flex-1 space-y-1 px-4 py-6">
            {primaryNav.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.label}
                  to={item.href}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded px-4 py-3 text-sm transition ${
                      isActive ? "bg-orange-500 text-white" : "text-slate-600 hover:bg-orange-50 hover:text-slate-900"
                    }`
                  }
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>

          <div className="border-t border-slate-200 px-4 py-5">
            <div className="rounded border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Session</p>
              <p className="mt-3 font-medium text-slate-900">{user?.full_name}</p>
              <p className="mt-1 text-sm text-slate-600">{user?.email}</p>
              <p className="mt-3 text-xs uppercase tracking-[0.18em] text-orange-300">
                {user?.plan} · {user?.subscription_state}
              </p>
              <button className="mt-4 w-full rounded border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-700" onClick={() => void handleLogout()}>
                Sign out
              </button>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1">
          <main className="min-w-0 flex-1">
            <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
              <div className="flex items-center justify-between gap-4 px-6 py-4 lg:px-8">
                <div>
                  {/* <p className="text-xs uppercase tracking-[0.24em] text-orange-600">Data Operations Workspace</p> */}
                  <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{currentSection}</h1>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-3">
                  {user?.workspace_name ? (
                    <div className="flex max-w-full flex-col items-end gap-0.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Active workspace</span>
                      {hasMultipleWorkspaces ? (
                        <>
                          <select
                            aria-label="Active workspace"
                            title={
                              canPickAnotherWorkspace
                                ? "Switch workspace (you must be owner or admin in the workspace you are in now)"
                                : "Only workspace owners and admins can switch. Ask an owner or admin in this workspace."
                            }
                            className="max-w-[min(100%,280px)] truncate rounded border border-slate-300 bg-white px-2 py-1.5 text-sm font-medium text-slate-900 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                            value={user.workspace_id}
                            disabled={workspaceSwitching || workspacesQuery.isLoading}
                            onChange={(e) => void handleWorkspaceSwitch(e.target.value)}
                          >
                            {workspaceItems.map((ws) => (
                              <option
                                key={ws.id}
                                value={ws.id}
                                disabled={ws.id !== user.workspace_id && !isElevatedWorkspaceRole(user.workspace_role)}
                              >
                                {ws.name}
                                {ws.environment ? ` (${ws.environment})` : ""}
                              </option>
                            ))}
                          </select>
                          {!canPickAnotherWorkspace ? (
                            <span className="max-w-[min(100%,320px)] text-right text-[11px] leading-snug text-slate-500">
                              You must be owner or admin in this workspace to switch. Contact an owner or admin here.
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="max-w-[min(100%,280px)] truncate text-sm font-medium text-slate-900">{user.workspace_name}</span>
                      )}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setInspectorOpen((value) => !value)}
                    className="inline-flex items-center gap-2 bg-white px-4 py-2 text-sm text-slate-700"
                  >
                    {inspectorOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                    {inspectorOpen ? "" : ""}
                  </button>
                </div>
              </div>
            </header>

            <div className="px-6 py-6 lg:px-8">
              <Outlet />
            </div>
          </main>

          {inspectorOpen ? (
            <aside className="hidden w-[320px] shrink-0 border-l border-slate-200 bg-white xl:flex xl:flex-col">
            
              <div className="space-y-6 overflow-y-auto px-6 py-6">
                <section>
                  <p className="flex items-center gap-1.5 text-xs uppercase tracking-[0.2em] text-slate-500">
                    <User className="h-3.5 w-3.5" />
                    Account
                  </p>
                  <div className="mt-3 space-y-1">
                    {secondaryNav.map((item) => (
                      <NavLink
                        key={item.label}
                        to={item.href}
                        className={({ isActive }) =>
                          `flex items-center justify-between rounded px-3 py-2.5 text-sm ${
                            isActive ? "bg-orange-50 text-orange-700" : "text-slate-600 hover:bg-slate-50"
                          }`
                        }
                      >
                        <span>{item.label}</span>
                        <ChevronRight className="h-4 w-4" />
                      </NavLink>
                    ))}
                  </div>
                </section>


                <section className="rounded border border-orange-200 bg-orange-50 p-4">
                  <div className="flex items-center gap-2">
                    <Fingerprint className="h-4 w-4 text-orange-600" />
                    <p className="text-sm font-medium text-slate-900">Shortcuts</p>
                  </div>
                  <div className="mt-4 space-y-2 text-sm text-slate-700">
                    <Link to="/connections" className="block rounded bg-white px-3 py-2 shadow-sm">
                      Connect a new platform
                    </Link>
                    <Link to="/pipeline-builder" className="block rounded bg-white px-3 py-2 shadow-sm">
                      Start a pipeline from live data
                    </Link>
                    <Link to="/api-keys" className="block rounded bg-white px-3 py-2 shadow-sm">
                      Manage API automation keys
                    </Link>
                  </div>
                </section>

               {
                /* updates and announcements */
               }
              </div>
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}
