/**
 * Preset routing objectives — plain language for banks, insurers, consumer goods,
 * and large-scale data teams. Labels are sent to the routing API as `objective`.
 */

export type RoutingObjectiveOption = {
  id: string;
  /** Sent to the routing API as `objective`. */
  label: string;
  /** Extra tokens for search (themes, synonyms). */
  search: string;
};

export const ROUTING_OBJECTIVES: RoutingObjectiveOption[] = [
  {
    id: "lower-overnight-cloud",
    label: "Lower cloud spend for overnight loads into our data warehouse",
    search: "cost finops batch nightly snowflake bigquery databricks savings"
  },
  {
    id: "risk-cutoff-latency",
    label: "Finish risk, trading, or market-data loads before strict cut-off times",
    search: "bank trading market risk treasury deadline latency compliance time"
  },
  {
    id: "data-stays-in-region",
    label: "Keep banking or customer data in the required country or region",
    search: "residency sovereignty gdpr basel pci local country region bank"
  },
  {
    id: "clean-restart-after-failure",
    label: "When a job fails, restart safely without duplicate or corrupted rows",
    search: "reliability idempotent retry failure recovery exactly once"
  },
  {
    id: "cheaper-cross-network-move",
    label: "Pay less to move data between regions, clouds, or company data centers",
    search: "egress cross region multi cloud hybrid aws azure gcp interconnect"
  },
  {
    id: "big-historical-catch-up",
    label: "Load months or years of history in one large catch-up or migration",
    search: "backfill migration history bulk one-off reprocessing snapshot"
  },
  {
    id: "cheap-daily-incremental",
    label: "Run low-cost daily updates from source systems as changes happen",
    search: "incremental cdc daily sync operational source database"
  },
  {
    id: "fresh-data-for-models",
    label: "Deliver fresh data on time to fraud, AML, credit, or underwriting models",
    search: "ml model fraud aml underwriting insurance scoring features"
  },
  {
    id: "warehouse-export-bill",
    label: "Pull very large extracts from the warehouse without a surprise compute bill",
    search: "export credits compute snowflake databricks sql reporting spill"
  },
  {
    id: "fix-part-failed-load",
    label: "Recover quickly when only part of a load fails instead of rerunning everything",
    search: "partial failure chunk checkpoint restart staging"
  },
  {
    id: "many-small-files",
    label: "Handle huge numbers of small files from stores, plants, or devices without slowdown",
    search: "pos retail iot store sku cpg pepsi coke manufacturing sensor log"
  },
  {
    id: "hard-reporting-deadline",
    label: "Hit a fixed deadline for month-end, regulatory, or management reporting",
    search: "close finance board sec regulatory filing deadline month end insurance"
  },
  {
    id: "multi-cloud-hybrid",
    label: "Move data reliably between AWS, Azure, Google Cloud, and on-premises systems",
    search: "aws azure gcp on prem hybrid mainframe datacenter vendor"
  },
  {
    id: "backup-dr-archive",
    label: "Copy critical data to backup or long-term archive for disaster recovery",
    search: "dr backup archive rpo rto glacier cold storage resilience"
  },
  {
    id: "avoid-daytime-network-spike",
    label: "Schedule heavy transfers so branches, stores, and daytime apps stay fast",
    search: "throttle nights weekends branch store network qos bandwidth"
  },
  {
    id: "analytics-without-slowing-core",
    label: "Feed analytics from core banking, ERP, or policy systems without slowing them",
    search: "core banking erp sap policy insurance operational read replica offload"
  },
  {
    id: "single-source-of-truth",
    label: "Combine scattered feeds into one official dataset we can audit and govern",
    search: "governance catalog lineage audit single source bronze landing zone"
  },
  {
    id: "faster-dashboards",
    label: "Shorten the gap between new data arriving and dashboards or apps updating",
    search: "bi tableau powerbi looker latency consumer dashboard data product"
  },
  {
    id: "complex-files-to-warehouse",
    label: "Load wide tables, JSON, or nested files into the warehouse without errors",
    search: "json avro parquet nested schema evolution complex types"
  },
  {
    id: "less-overnight-operations-work",
    label: "Reduce manual reruns, overnight pages, and firefighting for the ops team",
    search: "devops sre toil automation pager on call runbook operations"
  },
  {
    id: "insurance-claims-pricing",
    label: "Insurance: keep claims, policies, and pricing data refreshing on a steady schedule",
    search: "insurance claims actuarial underwriting policy pricing personal lines commercial"
  },
  {
    id: "cpg-sales-inventory",
    label: "Consumer goods: unify sales, inventory, and distributor data for planning",
    search: "cpg fmcg pepsi coke bottler distributor demand sku retail wholesale"
  },
  {
    id: "banking-regulatory-reporting",
    label: "Banking: support regulatory and management reporting packs on time",
    search: "basel ccar stress regulatory submission fed reporting bank finance"
  },
  {
    id: "protect-sensitive-in-motion",
    label: "Move customer and employee data with strong protection while it is in transit",
    search: "encryption pii phi pci sensitive tls private link security compliance"
  },
  {
    id: "near-real-time-alerts",
    label: "Support fast pipelines for fraud alerts, service health, or operational KPIs",
    search: "streaming kafka realtime alert monitoring kpi operational fraud detection"
  },
  {
    id: "retention-legal-hold",
    label: "Follow legal retention, legal hold, and deletion rules when copying data",
    search: "retention legal hold deletion privacy records management litigation"
  },
  {
    id: "sandbox-without-hurting-prod",
    label: "Give analysts and data science sandboxes without slowing production loads",
    search: "sandbox dev test nonprod workload isolation data science analyst"
  },
  {
    id: "merger-integration-timeline",
    label: "Integrate data from mergers, acquisitions, or new markets on a tight timeline",
    search: "mna acquisition integration carve out onboarding new entity geography"
  },
  {
    id: "global-consistent-metrics",
    label: "Align sales, risk, or finance metrics consistently across countries and regions",
    search: "global multinational regional consolidation fx leadership reporting"
  },
  {
    id: "audit-trail-lineage",
    label: "Make it easy to show auditors where data came from and how it was moved",
    search: "audit lineage provenance evidence control internal external auditor"
  }
];

export const DEFAULT_ROUTING_OBJECTIVE_LABEL = ROUTING_OBJECTIVES[0].label;
