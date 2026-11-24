import type { IconType } from "react-icons";
import * as SI from "react-icons/si";

function resolveSiIcon(iconKey: string): IconType | undefined {
  const Icon = (SI as Record<string, IconType | undefined>)[iconKey];
  return typeof Icon === "function" ? Icon : undefined;
}

const slugToSimpleIconKey: Record<string, string> = {
  snowflake: "SiSnowflake",
  databricks: "SiDatabricks",
  bigquery: "SiGooglebigquery",
  redshift: "SiAmazonredshift",
  synapse: "SiMicrosoftazure",
  fabric: "SiMicrosoft",
  oracle: "SiOracle",
  "sql-server": "SiMicrosoftsqlserver",
  postgresql: "SiPostgresql",
  mysql: "SiMysql",
  mongodb: "SiMongodb",
  cassandra: "SiApachecassandra",
  dynamodb: "SiAmazondynamodb",
  "cosmos-db": "SiMicrosoftazure",
  singlestore: "SiDatabricks",
  teradata: "SiDatabricks",
  vertica: "SiDatabricks",
  greenplum: "SiPostgresql",
  db2: "SiIbm",
  "sap-hana": "SiSap",
  clickhouse: "SiClickhouse",
  pinot: "SiApache",
  druid: "SiApache",
  trino: "SiTrino",
  presto: "SiPresto",
  hive: "SiApachehive",
  spark: "SiApachespark",
  iceberg: "SiApache",
  "delta-lake": "SiDatabricks",
  hudi: "SiApache",
  "aws-s3": "SiAmazons3",
  gcs: "SiGooglecloud",
  "azure-blob": "SiMicrosoftazure",
  minio: "SiMinio",
  kafka: "SiApachekafka",
  confluent: "SiConfluent",
  elasticsearch: "SiElasticsearch",
  opensearch: "SiOpensearch",
  timescaledb: "SiTimescale",
  influxdb: "SiInfluxdb",
  redis: "SiRedis",
  neo4j: "SiNeo4J",
  couchbase: "SiCouchbase",
  snowplow: "SiSnowflake",
  segment: "SiTwilio",
  fivetran: "SiFivetran",
  airbyte: "SiAirbyte",
  dbt: "SiDbt",
  /** Many AWS / Microsoft SI glyphs were removed in newer simple-icons builds; resolveSiIcon falls back to monogram. */
  "aws-glue": "SiAmazon",
  "azure-data-factory": "SiMicrosoftazure"
};

const monogramOverride: Record<string, string> = {
  "aws-s3": "S3",
  "azure-blob": "Az",
  gcs: "GCS",
  "aws-glue": "Glue",
  "azure-data-factory": "ADF",
  synapse: "Syn",
  "cosmos-db": "CDB"
};

function MonogramLogo({ slug }: { slug: string }) {
  const fromOverride = monogramOverride[slug];
  if (fromOverride) {
    return <span className="text-[10px] font-bold leading-none tracking-tight text-slate-700">{fromOverride}</span>;
  }

  const letters =
    slug
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "DS";

  return <span className="text-[11px] font-bold tabular-nums tracking-tight text-slate-700">{letters}</span>;
}

export function DataSystemLogo({ slug }: { slug: string }) {
  const iconKey = slugToSimpleIconKey[slug];
  const Icon = iconKey ? resolveSiIcon(iconKey) : undefined;

  if (Icon) {
    return <Icon className="h-7 w-7 shrink-0 text-slate-700" aria-hidden="true" />;
  }

  return (
    <span
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700 ring-1 ring-slate-200/80"
      aria-hidden="true"
      title={slug}
    >
      <MonogramLogo slug={slug} />
    </span>
  );
}
