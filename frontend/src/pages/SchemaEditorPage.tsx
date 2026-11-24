import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Braces, Check, ChevronDown, Database, Plus, Save, Search, Trash2, WandSparkles } from "lucide-react";

import { DatasetIntelChips } from "../components/DatasetIntelChips";
import { useToast } from "../context/ToastContext";
import { useQueryErrorToast } from "../hooks/useQueryErrorToast";
import { governanceApi, tenantApi, type DataSystemItem } from "../lib/api";
import { useSessionStore } from "../store/session";

const DATASETS_REFRESH_MS = 30_000;

type SchemaRow = {
  id: string;
  field: string;
  type: string;
};

const commonTypes = ["STRING", "INT64", "FLOAT64", "BOOL", "TIMESTAMP", "DATE", "NUMERIC", "JSON"];

const compatibilityMapByProfile: Record<"bigquery" | "databricks" | "snowflake", Record<string, string>> = {
  bigquery: {
    VARCHAR: "STRING",
    CHAR: "STRING",
    TEXT: "STRING",
    STRING: "STRING",
    INT: "INT64",
    INTEGER: "INT64",
    BIGINT: "INT64",
    SMALLINT: "INT64",
    FLOAT: "FLOAT64",
    DOUBLE: "FLOAT64",
    BOOLEAN: "BOOL",
    BOOL: "BOOL",
    DATETIME: "TIMESTAMP",
    TIMESTAMP: "TIMESTAMP",
    DATE: "DATE",
    DECIMAL: "NUMERIC",
    NUMERIC: "NUMERIC",
    JSON: "JSON"
  },
  databricks: {
    STRING: "STRING",
    VARCHAR: "STRING",
    INT64: "BIGINT",
    INTEGER: "INT",
    BIGINT: "BIGINT",
    FLOAT64: "DOUBLE",
    FLOAT: "FLOAT",
    DOUBLE: "DOUBLE",
    BOOL: "BOOLEAN",
    BOOLEAN: "BOOLEAN",
    TIMESTAMP: "TIMESTAMP",
    DATE: "DATE",
    NUMERIC: "DECIMAL(38,9)",
    JSON: "STRING"
  },
  snowflake: {
    STRING: "VARCHAR",
    VARCHAR: "VARCHAR",
    INT64: "NUMBER",
    INTEGER: "NUMBER",
    BIGINT: "NUMBER",
    FLOAT64: "FLOAT",
    DOUBLE: "FLOAT",
    BOOL: "BOOLEAN",
    BOOLEAN: "BOOLEAN",
    TIMESTAMP: "TIMESTAMP_NTZ",
    DATE: "DATE",
    NUMERIC: "NUMBER",
    JSON: "VARIANT"
  }
};

function compatibilityMapForSlug(slug: string): Record<string, string> {
  if (slug === "bigquery") {
    return compatibilityMapByProfile.bigquery;
  }
  if (slug === "databricks") {
    return compatibilityMapByProfile.databricks;
  }
  if (slug === "snowflake") {
    return compatibilityMapByProfile.snowflake;
  }
  return compatibilityMapByProfile.bigquery;
}

export function SchemaEditorPage() {
  const { token, user } = useSessionStore();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const datasetIdFromQuery = searchParams.get("datasetId") ?? "";
  const [selectedDatasetId, setSelectedDatasetId] = useState(datasetIdFromQuery);
  const [destinationSlug, setDestinationSlug] = useState("bigquery");
  const [rows, setRows] = useState<SchemaRow[]>([]);
  const [jsonDraft, setJsonDraft] = useState("{}");
  const [strictCompliance, setStrictCompliance] = useState(true);

  const datasetsQuery = useQuery({
    queryKey: ["datasets", user?.workspace_id],
    queryFn: () => tenantApi.datasets(token!, user!.workspace_id),
    enabled: Boolean(token && user?.workspace_id),
    refetchInterval: DATASETS_REFRESH_MS
  });

  const dataSystemsQuery = useQuery({
    queryKey: ["data-systems", user?.workspace_id],
    queryFn: () => tenantApi.dataSystems(token!, user!.workspace_id),
    enabled: Boolean(token && user?.workspace_id)
  });

  const catalogSystems = dataSystemsQuery.data?.items ?? [];
  const destinationLabel =
    catalogSystems.find((s) => s.slug === destinationSlug)?.name ?? destinationSlug;
  const activeCompatibilityMap = useMemo(() => compatibilityMapForSlug(destinationSlug), [destinationSlug]);

  useEffect(() => {
    if (!catalogSystems.length) {
      return;
    }
    if (catalogSystems.some((s) => s.slug === destinationSlug)) {
      return;
    }
    setDestinationSlug(catalogSystems[0].slug);
  }, [catalogSystems, destinationSlug]);

  useEffect(() => {
    if (selectedDatasetId) {
      return;
    }
    if (datasetIdFromQuery && datasetsQuery.data?.items.some((item) => item.id === datasetIdFromQuery)) {
      setSelectedDatasetId(datasetIdFromQuery);
      return;
    }
    if (datasetsQuery.data?.items.length) {
      setSelectedDatasetId(datasetsQuery.data.items[0].id);
    }
  }, [datasetIdFromQuery, datasetsQuery.data?.items, selectedDatasetId]);

  const selectedDataset = useMemo(
    () => datasetsQuery.data?.items.find((item) => item.id === selectedDatasetId),
    [datasetsQuery.data?.items, selectedDatasetId]
  );

  const schemaQuery = useQuery({
    queryKey: ["dataset-schema", user?.workspace_id, selectedDatasetId],
    queryFn: () => tenantApi.datasetSchema(token!, user!.workspace_id, selectedDatasetId),
    enabled: Boolean(token && user?.workspace_id && selectedDatasetId)
  });

  const columnLineageQuery = useQuery({
    queryKey: ["dataset-column-lineage", user?.workspace_id, selectedDatasetId],
    queryFn: () => governanceApi.datasetColumnLineage(token!, user!.workspace_id, selectedDatasetId!),
    enabled: Boolean(token && user?.workspace_id && selectedDatasetId)
  });

  useQueryErrorToast(
    Boolean(datasetsQuery.isError),
    datasetsQuery.error,
    "Could not load datasets.",
    showToast
  );
  useQueryErrorToast(Boolean(schemaQuery.isError), schemaQuery.error, "Could not load schema for this dataset.", showToast);
  useQueryErrorToast(
    Boolean(columnLineageQuery.isError),
    columnLineageQuery.error,
    "Column lineage unavailable.",
    showToast
  );

  useEffect(() => {
    if (!schemaQuery.data?.schema_json) {
      return;
    }
    const schema = schemaQuery.data.schema_json;
    const nextRows = Object.entries(schema).map(([field, type], index) => ({
      id: `${field}-${index}`,
      field,
      type
    }));
    setRows(nextRows.length ? nextRows : [{ id: `row-${Date.now()}`, field: "", type: "STRING" }]);
    setJsonDraft(JSON.stringify(schema, null, 2));
  }, [schemaQuery.data?.schema_json]);

  const saveMutation = useMutation({
    mutationFn: (schema: Record<string, string>) => tenantApi.updateDatasetSchema(token!, user!.workspace_id, selectedDatasetId, schema),
    onSuccess: () => {
      showToast("Schema saved successfully.", { variant: "success" });
    },
    onError: (error) => {
      showToast(error instanceof Error ? error.message : "Failed to save schema.", { variant: "error" });
    }
  });

  const compatibilityIssues = useMemo(() => {
    return rows
      .map((row) => {
        const normalized = row.type.trim().toUpperCase();
        if (!normalized) {
          return null;
        }
        const mapped = activeCompatibilityMap[normalized];
        if (mapped) {
          return null;
        }
        return {
          rowId: row.id,
          field: row.field || "(unnamed field)",
          currentType: normalized,
          suggestedType: "STRING"
        };
      })
      .filter(Boolean) as Array<{ rowId: string; field: string; currentType: string; suggestedType: string }>;
  }, [activeCompatibilityMap, rows]);

  const pipelineBlocked = strictCompliance && compatibilityIssues.length > 0;

  function addRow() {
    setRows((current) => [...current, { id: `row-${Date.now()}-${current.length}`, field: "", type: "STRING" }]);
  }

  function removeRow(id: string) {
    setRows((current) => current.filter((item) => item.id !== id));
  }

  function updateRow(id: string, key: "field" | "type", value: string) {
    setRows((current) => current.map((item) => (item.id === id ? { ...item, [key]: value } : item)));
  }

  function buildSchemaFromRows() {
    const schema: Record<string, string> = {};
    for (const row of rows) {
      const field = row.field.trim();
      const type = row.type.trim().toUpperCase();
      if (!field || !type) {
        continue;
      }
      schema[field] = type;
    }
    return schema;
  }

  function applyRowsToJson() {
    const schema = buildSchemaFromRows();
    setJsonDraft(JSON.stringify(schema, null, 2));
    showToast("Table changes synced to JSON.", { variant: "success" });
  }

  function autoFixDestinationTypes() {
    setRows((current) =>
      current.map((row) => {
        const normalized = row.type.trim().toUpperCase();
        const mapped = activeCompatibilityMap[normalized] ?? "STRING";
        return { ...row, type: mapped };
      })
    );
    showToast(`Applied destination type mapping for ${destinationLabel}.`, { variant: "success" });
  }

  function applyJsonToRows() {
    try {
      const parsed = JSON.parse(jsonDraft) as Record<string, string>;
      const nextRows = Object.entries(parsed).map(([field, type], index) => ({
        id: `${field}-${index}-${Date.now()}`,
        field,
        type: String(type).toUpperCase()
      }));
      setRows(nextRows.length ? nextRows : [{ id: `row-${Date.now()}`, field: "", type: "STRING" }]);
      showToast("JSON changes synced to table.", { variant: "success" });
    } catch {
      showToast("JSON is invalid. Fix syntax before applying.", { variant: "error" });
    }
  }

  async function saveSchema() {
    try {
      const parsed = JSON.parse(jsonDraft) as Record<string, string>;
      await saveMutation.mutateAsync(parsed);
    } catch {
      showToast("Cannot save: JSON must be valid.", { variant: "error" });
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs uppercase tracking-[0.24em] text-orange-600">• Schema Editing Gate</p>
        <h2 className="mt-2 text-3xl font-semibold text-slate-950">Schema editor before data movement</h2>
        <p className="mt-3 max-w-3xl text-slate-600">
          Review and edit discovered source schemas before sending data into destination systems like BigQuery.
          The dataset list refetches every {DATASETS_REFRESH_MS / 1000}s.
        </p>
       
      </section>

      <section className="rounded border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <label className="block min-w-[320px]">
            <span className="text-sm font-medium text-slate-700">Choose discovered dataset</span>
            <select
              value={selectedDatasetId}
              onChange={(event) => setSelectedDatasetId(event.target.value)}
              disabled={!datasetsQuery.data?.items.length}
              className="mt-2 w-full rounded border border-slate-300 px-3 py-2.5 text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              {(datasetsQuery.data?.items ?? []).length === 0 ? (
                <option value="">No datasets yet</option>
              ) : null}
              {(datasetsQuery.data?.items ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.platform} via {item.connection_name})
                </option>
              ))}
            </select>
          </label>
          <div className="text-sm text-slate-600">
            {selectedDataset ? (
              <span>
                Rows: {selectedDataset.estimated_rows.toLocaleString()} | Size: {Math.round(selectedDataset.estimated_bytes / 1024 / 1024)} MB
              </span>
            ) : (
              <span>No dataset selected.</span>
            )}
            {datasetsQuery.isFetching && !datasetsQuery.isLoading ? (
              <span className="mt-1 block text-xs text-slate-400">Refreshing datasets…</span>
            ) : null}
          </div>
        </div>
        {selectedDataset ? (
          <div className="mt-4 space-y-3 rounded border border-slate-200 bg-slate-50/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dataset intelligence</p>
            <DatasetIntelChips item={selectedDataset} />
            <details className="text-sm text-slate-700">
              <summary className="cursor-pointer font-medium text-slate-900">Column lineage (governance plane)</summary>
              {columnLineageQuery.isLoading ? <p className="mt-2 text-xs text-slate-500">Loading column graph…</p> : null}
              {columnLineageQuery.data ? (
                <div className="mt-2 space-y-2 text-xs">
                  <p className="text-slate-600">{columnLineageQuery.data.note}</p>
                  <p className="font-mono text-slate-500">
                    {columnLineageQuery.data.columns.length} columns · {columnLineageQuery.data.edges.length} synthetic hops
                  </p>
                </div>
              ) : null}
            </details>
          </div>
        ) : null}
        {!datasetsQuery.isLoading && !datasetsQuery.data?.items.length && !datasetsQuery.isError ? (
          <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            No datasets in this workspace.{" "}
            <Link to="/connections" className="font-medium underline">
              Connect a source
            </Link>{" "}
            and run discovery first.
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded border border-slate-200 bg-slate-50 p-3">
          <label className="text-sm font-medium text-slate-700">Destination compatibility</label>
          <SearchableSystemSelect
            value={destinationSlug}
            onChange={setDestinationSlug}
            systems={catalogSystems}
            placeholder="Select destination"
            disabled={!catalogSystems.length}
          />
          <span className={`rounded-full px-2.5 py-1 text-xs ${compatibilityIssues.length ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"}`}>
            {compatibilityIssues.length ? `${compatibilityIssues.length} compatibility warning(s)` : "All field types are compatible"}
          </span>
          <button onClick={autoFixDestinationTypes} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
            Auto-fix Types
          </button>
          <label className="ml-auto inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
            <input type="checkbox" checked={strictCompliance} onChange={(event) => setStrictCompliance(event.target.checked)} />
            Enforce strict compatibility gate
          </label>
        </div>
        {pipelineBlocked ? (
          <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Continue to pipeline is blocked because strict compatibility is enabled and unresolved type warnings remain.
          </p>
        ) : null}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
              <Database className="h-5 w-5 text-orange-600" />
              Table Editor
            </h3>
            <button onClick={addRow} className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
              <Plus className="h-4 w-4" />
              Add Field
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {rows.map((row) => (
              <div key={row.id} className="grid grid-cols-[1fr_180px_auto] gap-2">
                <input
                  value={row.field}
                  onChange={(event) => updateRow(row.id, "field", event.target.value)}
                  placeholder="field_name"
                  className="rounded border border-slate-300 px-3 py-2"
                />
                <select value={row.type} onChange={(event) => updateRow(row.id, "type", event.target.value)} className="rounded border border-slate-300 px-3 py-2">
                  {commonTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                <button onClick={() => removeRow(row.id)} className="rounded border border-slate-300 bg-white px-3 py-2 text-slate-600">
                  <Trash2 className="h-4 w-4" />
                </button>
                {compatibilityIssues.some((issue) => issue.rowId === row.id) ? (
                  <div className="col-span-3 text-xs text-amber-700">
                    Type <span className="mono">{row.type || "(empty)"}</span> is not mapped for {destinationLabel}. Auto-fix will convert it to STRING.
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <button onClick={applyRowsToJson} className="mt-4 inline-flex items-center gap-2 rounded bg-slate-900 px-3 py-2 text-sm text-white">
            <WandSparkles className="h-4 w-4" />
            Sync Table {"->"} JSON
          </button>
        </div>

        <div className="rounded border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            <Braces className="h-5 w-5 text-orange-600" />
            JSON Schema Editor
          </h3>
          <textarea
            value={jsonDraft}
            onChange={(event) => setJsonDraft(event.target.value)}
            className="mono mt-4 min-h-[360px] w-full rounded border border-slate-300 p-3 text-sm text-slate-900"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={applyJsonToRows} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
              Sync JSON {"->"} Table
            </button>
            <button
              onClick={() => void saveSchema()}
              disabled={saveMutation.isPending || !selectedDatasetId || !datasetsQuery.data?.items.length}
              className="inline-flex items-center gap-2 rounded bg-orange-500 px-3 py-2 text-sm text-white disabled:opacity-70"
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? "Saving..." : "Save Schema"}
            </button>
            {selectedDataset ? (
              <Link
                to={`/pipeline-builder?source=${encodeURIComponent(selectedDataset.platform)}&connectionName=${encodeURIComponent(selectedDataset.connection_name)}&dataset=${encodeURIComponent(selectedDataset.name)}&mode=manual`}
                aria-disabled={pipelineBlocked}
                onClick={(event) => {
                  if (pipelineBlocked) {
                    event.preventDefault();
                    showToast(
                      "Pipeline is blocked until all compatibility warnings are fixed or strict gate is disabled.",
                      { variant: "error" }
                    );
                  }
                }}
                className={`rounded border px-3 py-2 text-sm ${
                  pipelineBlocked ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400" : "border-slate-300 bg-white text-slate-700"
                }`}
              >
                Continue to Pipeline
              </Link>
            ) : null}
          </div>
          {schemaQuery.isLoading ? <p className="mt-3 text-sm text-slate-600">Loading schema...</p> : null}
        </div>
      </section>
    </div>
  );
}

function SearchableSystemSelect({
  value,
  onChange,
  systems,
  placeholder,
  disabled
}: {
  value: string;
  onChange: (slug: string) => void;
  systems: DataSystemItem[];
  placeholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = systems.find((s) => s.slug === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return systems;
    }
    return systems.filter((s) => `${s.name} ${s.slug} ${s.category}`.toLowerCase().includes(q));
  }, [query, systems]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    function onDocMouseDown(event: MouseEvent) {
      if (!rootRef.current) {
        return;
      }
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  return (
    <div className="relative min-w-[220px]" ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        className="flex w-full items-center justify-between rounded border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-slate-100"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{selected?.name ?? placeholder}</span>
        <ChevronDown className="h-4 w-4 text-slate-500" />
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 w-full rounded border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-200 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search systems..."
                className="w-full rounded border border-slate-300 bg-white py-2 pl-8 pr-2 text-sm text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              />
            </div>
          </div>
          <ul className="max-h-64 overflow-y-auto py-1" role="listbox">
            {filtered.map((system) => (
              <li key={system.slug}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(system.slug);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-700 hover:bg-orange-50"
                  role="option"
                  aria-selected={value === system.slug}
                >
                  <span className="truncate">{system.name}</span>
                  {value === system.slug ? <Check className="h-4 w-4 text-orange-600" /> : null}
                </button>
              </li>
            ))}
            {filtered.length === 0 ? <li className="px-3 py-2 text-sm text-slate-500">No matching systems.</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
