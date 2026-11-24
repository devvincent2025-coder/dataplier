import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings2 } from "lucide-react";

import { AZURE_REGION_GROUPS, AZURE_REGION_IDS, azureRegionLabel } from "../data/azure-regions";
import { COMMON_TIMEZONES } from "../data/common-timezones";
import { governanceApi } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { useSessionStore } from "../store/session";

const card = "rounded border border-slate-200 bg-white p-6 shadow-panel";
const inputClass =
  "mt-1 w-full max-w-md rounded border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100";
const selectClass = `${inputClass} max-w-lg`;
const textareaClass =
  "mt-1 w-full max-w-2xl rounded border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100";

const OTHER_REGION = "__other__";

type EnvDefault = "production" | "staging" | "development";
type EncryptionMode = "platform" | "customer_managed";

const WEEKDAYS = [
  { id: "any", label: "Any day (rolling window only)" },
  { id: "monday", label: "Monday" },
  { id: "tuesday", label: "Tuesday" },
  { id: "wednesday", label: "Wednesday" },
  { id: "thursday", label: "Thursday" },
  { id: "friday", label: "Friday" },
  { id: "saturday", label: "Saturday" },
  { id: "sunday", label: "Sunday" }
] as const;

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function linesToArray(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function utcTimeOk(value: string): boolean {
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(value.trim());
}

export function SettingsPage() {
  const token = useSessionStore((s) => s.token);
  const user = useSessionStore((s) => s.user);
  const workspaceId = user?.workspace_id ?? "";
  const canWrite = user?.permissions?.includes("governance.write") ?? false;
  const { showToast } = useToast();
  const qc = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ["workspace-settings", workspaceId],
    queryFn: () => governanceApi.workspaceSettingsGet(token!, workspaceId),
    enabled: Boolean(token && workspaceId)
  });

  const [regionChoice, setRegionChoice] = useState("");
  const [regionCustom, setRegionCustom] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [contactEmail, setContactEmail] = useState("");
  const [environment, setEnvironment] = useState<EnvDefault>("production");
  const [approval, setApproval] = useState(false);
  const [retention, setRetention] = useState(90);

  const [apiIpAllowlist, setApiIpAllowlist] = useState("");
  const [uiIpAllowlist, setUiIpAllowlist] = useState("");
  const [sessionMaxAgeMinutes, setSessionMaxAgeMinutes] = useState(480);
  const [sessionIdleMinutes, setSessionIdleMinutes] = useState(60);

  const [sqlCatalog, setSqlCatalog] = useState("");
  const [sqlWarehouse, setSqlWarehouse] = useState("");

  const [encryptionMode, setEncryptionMode] = useState<EncryptionMode>("platform");
  const [cmkVaultUri, setCmkVaultUri] = useState("");
  const [cmkKeyName, setCmkKeyName] = useState("");

  const [exportMaxRows, setExportMaxRows] = useState(1_000_000);
  const [exportDestinationsText, setExportDestinationsText] = useState("");

  const [maintenanceWeekday, setMaintenanceWeekday] = useState<string>("sunday");
  const [maintenanceStartUtc, setMaintenanceStartUtc] = useState("06:00");
  const [maintenanceDurationMinutes, setMaintenanceDurationMinutes] = useState(120);

  const [governanceSlackUrl, setGovernanceSlackUrl] = useState("");
  const [governanceTeamsUrl, setGovernanceTeamsUrl] = useState("");

  useEffect(() => {
    const s = settingsQuery.data?.settings ?? {};
    const dr = String(s.default_region ?? "").trim();
    if (!dr) {
      setRegionChoice("");
      setRegionCustom("");
    } else if (AZURE_REGION_IDS.has(dr)) {
      setRegionChoice(dr);
      setRegionCustom("");
    } else {
      setRegionChoice(OTHER_REGION);
      setRegionCustom(dr);
    }
    setTimezone(String(s.default_timezone ?? "UTC"));
    setContactEmail(str(s.primary_contact_email));
    const env = String(s.default_environment ?? "production").toLowerCase();
    if (env === "staging" || env === "development") {
      setEnvironment(env);
    } else {
      setEnvironment("production");
    }
    setRetention(num(s.log_retention_days, 90));
    setApproval(Boolean(s.require_connector_approval));

    setApiIpAllowlist(str(s.api_ip_allowlist));
    setUiIpAllowlist(str(s.ui_ip_allowlist));
    setSessionMaxAgeMinutes(Math.min(43200, Math.max(5, num(s.session_max_age_minutes, 480))));
    setSessionIdleMinutes(Math.min(1440, Math.max(5, num(s.session_idle_timeout_minutes, 60))));

    setSqlCatalog(str(s.sql_preview_default_catalog));
    setSqlWarehouse(str(s.sql_preview_default_warehouse));

    const em = String(s.encryption_mode ?? "platform").toLowerCase();
    setEncryptionMode(em === "customer_managed" ? "customer_managed" : "platform");
    setCmkVaultUri(str(s.customer_managed_key_vault_uri));
    setCmkKeyName(str(s.customer_managed_key_name));

    setExportMaxRows(Math.min(10_000_000_000, Math.max(1000, num(s.export_max_rows_per_run, 1_000_000))));
    const dest = s.export_approved_destination_prefixes;
    if (Array.isArray(dest)) {
      setExportDestinationsText(dest.map(String).join("\n"));
    } else if (typeof dest === "string") {
      setExportDestinationsText(dest);
    } else {
      setExportDestinationsText("");
    }

    const wd = String(s.maintenance_weekday ?? "sunday").toLowerCase();
    setMaintenanceWeekday(WEEKDAYS.some((w) => w.id === wd) ? wd : "sunday");
    const st = str(s.maintenance_start_time_utc) || "06:00";
    setMaintenanceStartUtc(utcTimeOk(st) ? st.trim() : "06:00");
    setMaintenanceDurationMinutes(Math.min(24 * 60, Math.max(15, num(s.maintenance_duration_minutes, 120))));

    setGovernanceSlackUrl(str(s.governance_slack_webhook_url));
    setGovernanceTeamsUrl(str(s.governance_teams_webhook_url));
  }, [settingsQuery.data]);

  const resolvedRegion = useMemo(() => {
    if (regionChoice === OTHER_REGION) {
      return regionCustom.trim();
    }
    return regionChoice.trim();
  }, [regionChoice, regionCustom]);

  const regionSelectLabel = useMemo(() => {
    if (!regionChoice) return "Not set";
    if (regionChoice === OTHER_REGION) {
      return regionCustom.trim() ? `Other: ${regionCustom.trim()}` : "Other region…";
    }
    return azureRegionLabel(regionChoice) ?? regionChoice;
  }, [regionChoice, regionCustom]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const exportPrefixes = linesToArray(exportDestinationsText);
      return governanceApi.workspaceSettingsPatch(token!, workspaceId, {
        default_region: resolvedRegion,
        default_timezone: timezone.trim() || "UTC",
        primary_contact_email: contactEmail.trim(),
        default_environment: environment,
        require_connector_approval: approval,
        log_retention_days: retention,
        api_ip_allowlist: apiIpAllowlist.trim(),
        ui_ip_allowlist: uiIpAllowlist.trim(),
        session_max_age_minutes: sessionMaxAgeMinutes,
        session_idle_timeout_minutes: sessionIdleMinutes,
        sql_preview_default_catalog: sqlCatalog.trim(),
        sql_preview_default_warehouse: sqlWarehouse.trim(),
        encryption_mode: encryptionMode,
        customer_managed_key_vault_uri: cmkVaultUri.trim(),
        customer_managed_key_name: cmkKeyName.trim(),
        export_max_rows_per_run: exportMaxRows,
        export_approved_destination_prefixes: exportPrefixes,
        maintenance_weekday: maintenanceWeekday,
        maintenance_start_time_utc: maintenanceStartUtc.trim(),
        maintenance_duration_minutes: maintenanceDurationMinutes,
        governance_slack_webhook_url: governanceSlackUrl.trim(),
        governance_teams_webhook_url: governanceTeamsUrl.trim()
      });
    },
    onSuccess: () => {
      showToast("Settings saved.", { variant: "success" });
      void qc.invalidateQueries({ queryKey: ["workspace-settings", workspaceId] });
    },
    onError: (e: Error) => showToast(e.message, { variant: "error" })
  });

  function onSave(e: FormEvent) {
    e.preventDefault();
    if (regionChoice === OTHER_REGION && !regionCustom.trim()) {
      showToast("Enter a region name, or pick a region from the list.", { variant: "error" });
      return;
    }
    if (!utcTimeOk(maintenanceStartUtc)) {
      showToast("Maintenance start time must be UTC in HH:MM (e.g. 06:00).", { variant: "error" });
      return;
    }
    if (encryptionMode === "customer_managed" && (!cmkVaultUri.trim() || !cmkKeyName.trim())) {
      showToast("Customer-managed keys need both a vault URI and a key name.", { variant: "error" });
      return;
    }
    saveMutation.mutate();
  }

  return (
    <div className="space-y-8">
      <section className={card}>
        <div className="flex items-start gap-3">
          <Settings2 className="h-8 w-8 shrink-0 text-orange-600" aria-hidden />
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-orange-600">Workspace</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Settings</h2>
            <p className="mt-2 max-w-3xl text-slate-600">
              Defaults and policies for this workspace.
            </p>
          </div>
        </div>
      </section>

      <section className={card}>
        <h3 className="text-lg font-semibold text-slate-900">Workspace configuration</h3>
        {!canWrite ? (
          <p className="mt-2 text-sm text-slate-600">You can view these settings; only members with governance write access can change them.</p>
        ) : null}
        <form className="mt-6 max-w-3xl space-y-10" onSubmit={onSave}>
          <div className="space-y-6">
            <h4 className="border-b border-slate-100 pb-2 text-base font-semibold text-slate-800">General</h4>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-800" htmlFor="default-region">
                Default Region
              </label>
             
              <select
                id="default-region"
                className={selectClass}
                value={regionChoice}
                onChange={(e) => {
                  const v = e.target.value;
                  setRegionChoice(v);
                  if (v !== OTHER_REGION) {
                    setRegionCustom("");
                  }
                }}
                disabled={!canWrite}
                aria-label={`Default Azure region, current: ${regionSelectLabel}`}
              >
                <option value="">Not set</option>
                {AZURE_REGION_GROUPS.map((g) => (
                  <optgroup key={g.geography} label={g.geography}>
                    {g.regions.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label} ({r.id})
                      </option>
                    ))}
                  </optgroup>
                ))}
                <option value={OTHER_REGION}>Other region…</option>
              </select>
              {regionChoice === OTHER_REGION ? (
                <label className="mt-2 block text-sm text-slate-700">
                  Region name
                  <input
                    className={inputClass}
                    value={regionCustom}
                    onChange={(e) => setRegionCustom(e.target.value)}
                    placeholder="e.g. westus2, us-central1, eu-west-1"
                    disabled={!canWrite}
                  />
                </label>
              ) : null}
            </div>

            <label className="block text-sm font-medium text-slate-800">
              Default time zone
              <p className="mb-1 font-normal text-xs text-slate-500">For schedules, reports, and in-app timestamps.</p>
              <select className={selectClass} value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={!canWrite}>
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz.id} value={tz.id}>
                    {tz.label} ({tz.id})
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-slate-800">
              Primary workspace contact (email)
              <p className="mb-1 font-normal text-xs text-slate-500">Optional. Billing, security, or escalation notices.</p>
              <input
                type="email"
                className={inputClass}
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="team@company.com"
                disabled={!canWrite}
              />
            </label>

            <label className="block text-sm font-medium text-slate-800">
              Default environment label
              <p className="mb-1 font-normal text-xs text-slate-500">Suggested tier label for new pipelines and connectors.</p>
              <select
                className={selectClass}
                value={environment}
                onChange={(e) => setEnvironment(e.target.value as EnvDefault)}
                disabled={!canWrite}
              >
                <option value="production">Production</option>
                <option value="staging">Staging</option>
                <option value="development">Development</option>
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={approval} onChange={(e) => setApproval(e.target.checked)} disabled={!canWrite} />
              Require explicit approval before connectors can use production credentials
            </label>

            <label className="block text-sm font-medium text-slate-800">
              Audit log retention (days)
              <p className="mb-1 font-normal text-xs text-slate-500">Target retention for governance audit entries (7–3650).</p>
              <input
                type="number"
                min={7}
                max={3650}
                className={inputClass}
                value={retention}
                onChange={(e) => setRetention(Number(e.target.value))}
                disabled={!canWrite}
              />
            </label>
          </div>

          <div className="space-y-6">
            <h4 className="border-b border-slate-100 pb-2 text-base font-semibold text-slate-800">Security & access</h4>
            <p className="text-xs text-slate-500">
              One IPv4/CIDR per line (e.g. <span className="mono">203.0.113.0/24</span>). Empty means no allowlist (all IPs allowed, subject to auth).
            </p>
            <label className="block text-sm font-medium text-slate-800">
              API IP allowlist
              <textarea
                className={textareaClass}
                rows={4}
                value={apiIpAllowlist}
                onChange={(e) => setApiIpAllowlist(e.target.value)}
                placeholder={"203.0.113.10/32\n198.51.100.0/24"}
                disabled={!canWrite}
              />
            </label>
            <label className="block text-sm font-medium text-slate-800">
              UI (browser app) IP allowlist
              <textarea
                className={textareaClass}
                rows={4}
                value={uiIpAllowlist}
                onChange={(e) => setUiIpAllowlist(e.target.value)}
                placeholder="Often the same as API; leave blank to inherit or disable UI restriction."
                disabled={!canWrite}
              />
            </label>
            <label className="block text-sm font-medium text-slate-800">
              Maximum session length (minutes)
              <p className="mb-1 font-normal text-xs text-slate-500">Hard cap on how long a signed-in session can last (5–43200).</p>
              <input
                type="number"
                min={5}
                max={43200}
                className={inputClass}
                value={sessionMaxAgeMinutes}
                onChange={(e) => setSessionMaxAgeMinutes(Number(e.target.value))}
                disabled={!canWrite}
              />
            </label>
            <label className="block text-sm font-medium text-slate-800">
              Idle timeout (minutes)
              <p className="mb-1 font-normal text-xs text-slate-500">Sign out after this many minutes without activity (5–1440).</p>
              <input
                type="number"
                min={5}
                max={1440}
                className={inputClass}
                value={sessionIdleMinutes}
                onChange={(e) => setSessionIdleMinutes(Number(e.target.value))}
                disabled={!canWrite}
              />
            </label>
          </div>

          <div className="space-y-6">
            <h4 className="border-b border-slate-100 pb-2 text-base font-semibold text-slate-800">SQL previews</h4>
            <label className="block text-sm font-medium text-slate-800">
              Default catalog (Iceberg / Hive / Unity Catalog name)
              <input
                className={inputClass}
                value={sqlCatalog}
                onChange={(e) => setSqlCatalog(e.target.value)}
                placeholder="e.g. analytics_prod"
                disabled={!canWrite}
              />
            </label>
            <label className="block text-sm font-medium text-slate-800">
              Default warehouse / compute (Snowflake, Databricks SQL warehouse, etc.)
              <input
                className={inputClass}
                value={sqlWarehouse}
                onChange={(e) => setSqlWarehouse(e.target.value)}
                placeholder="e.g. COMPUTE_WH or sql-warehouse-id"
                disabled={!canWrite}
              />
            </label>
          </div>

          <div className="space-y-6">
            <h4 className="border-b border-slate-100 pb-2 text-base font-semibold text-slate-800">Encryption</h4>
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-slate-800">Workspace data keys</legend>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="enc-mode"
                  checked={encryptionMode === "platform"}
                  onChange={() => setEncryptionMode("platform")}
                  disabled={!canWrite}
                />
                Platform-managed keys (default)
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="enc-mode"
                  checked={encryptionMode === "customer_managed"}
                  onChange={() => setEncryptionMode("customer_managed")}
                  disabled={!canWrite}
                />
                Customer-managed key (CMK) in Azure Key Vault or compatible vault
              </label>
            </fieldset>
            {encryptionMode === "customer_managed" ? (
              <div className="space-y-3 rounded border border-amber-100 bg-amber-50/50 p-4">
                <label className="block text-sm font-medium text-slate-800">
                  Key vault URI
                  <input
                    className={inputClass}
                    value={cmkVaultUri}
                    onChange={(e) => setCmkVaultUri(e.target.value)}
                    placeholder="https://myvault.vault.azure.net/"
                    disabled={!canWrite}
                  />
                </label>
                <label className="block text-sm font-medium text-slate-800">
                  Key name / version path
                  <input
                    className={inputClass}
                    value={cmkKeyName}
                    onChange={(e) => setCmkKeyName(e.target.value)}
                    placeholder="e.g. dataplier-workspace or key/version id"
                    disabled={!canWrite}
                  />
                </label>
              </div>
            ) : null}
          </div>

          <div className="space-y-6">
            <h4 className="border-b border-slate-100 pb-2 text-base font-semibold text-slate-800">Data export</h4>
            <label className="block text-sm font-medium text-slate-800">
              Max rows per export run
              <input
                type="number"
                min={1000}
                max={10000000000}
                step={1000}
                className={inputClass}
                value={exportMaxRows}
                onChange={(e) => setExportMaxRows(Number(e.target.value))}
                disabled={!canWrite}
              />
            </label>
            <label className="block text-sm font-medium text-slate-800">
              Approved export destination prefixes
              <p className="mb-1 font-normal text-xs text-slate-500">One prefix per line (scheme + host or bucket path). Exports must match one of these.</p>
              <textarea
                className={textareaClass}
                rows={5}
                value={exportDestinationsText}
                onChange={(e) => setExportDestinationsText(e.target.value)}
                placeholder={"s3://company-approved-bucket/\nhttps://datalake.example.com/export/"}
                disabled={!canWrite}
              />
            </label>
          </div>

          <div className="space-y-6">
            <h4 className="border-b border-slate-100 pb-2 text-base font-semibold text-slate-800">Maintenance (scheduled jobs)</h4>
            <p className="text-xs text-slate-500">Jobs should avoid starting new work during this weekly window (UTC). Duration includes deferring new runs.</p>
            <label className="block text-sm font-medium text-slate-800">
              Day of week
              <select
                className={selectClass}
                value={maintenanceWeekday}
                onChange={(e) => setMaintenanceWeekday(e.target.value)}
                disabled={!canWrite}
              >
                {WEEKDAYS.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-800">
              Window start (UTC, HH:MM)
              <input
                className={inputClass}
                value={maintenanceStartUtc}
                onChange={(e) => setMaintenanceStartUtc(e.target.value)}
                placeholder="06:00"
                disabled={!canWrite}
              />
            </label>
            <label className="block text-sm font-medium text-slate-800">
              Duration (minutes)
              <input
                type="number"
                min={15}
                max={1440}
                step={15}
                className={inputClass}
                value={maintenanceDurationMinutes}
                onChange={(e) => setMaintenanceDurationMinutes(Number(e.target.value))}
                disabled={!canWrite}
              />
            </label>
          </div>

          <div className="space-y-6">
            <h4 className="border-b border-slate-100 pb-2 text-base font-semibold text-slate-800">Governance webhooks</h4>
            <p className="text-xs text-slate-500">Incoming webhook URLs for workspace governance events (connector changes, policy updates, approvals). Secrets belong in vaults—prefer short-lived workflow URLs.</p>
            <label className="block text-sm font-medium text-slate-800">
              Slack incoming webhook URL
              <input
                type="url"
                className={inputClass}
                value={governanceSlackUrl}
                onChange={(e) => setGovernanceSlackUrl(e.target.value)}
                placeholder="https://hooks.slack.com/services/…"
                disabled={!canWrite}
              />
            </label>
            <label className="block text-sm font-medium text-slate-800">
              Microsoft Teams workflow / webhook URL
              <input
                type="url"
                className={inputClass}
                value={governanceTeamsUrl}
                onChange={(e) => setGovernanceTeamsUrl(e.target.value)}
                placeholder='Power Automate HTTP-trigger URL or Teams incoming webhook'
                disabled={!canWrite}
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={!canWrite || saveMutation.isPending}
            className="rounded bg-orange-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saveMutation.isPending ? "Saving…" : "Save all settings"}
          </button>
        </form>
      </section>
    </div>
  );
}
