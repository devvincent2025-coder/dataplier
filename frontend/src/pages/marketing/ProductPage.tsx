import { Link } from "react-router-dom";

import { ScrollReveal } from "../../components/marketing/ScrollReveal";
import { SEO, structuredDataSchemas } from "../../components/SEO";

export function ProductPage() {
  return (
    <>
      <SEO
        title="Product Features | Universal Data Router & Control Plane"
        description="Connect existing systems, move large datasets efficiently, and keep analytics and AI workloads fed with governed, optimized flows — without brittle one-off pipelines."
        keywords="data router, data control plane features, multi-cloud data management, data pipeline optimization, enterprise data platform, Snowflake, Databricks integration"
        structuredData={[
          structuredDataSchemas.softwareApplication,
          {
            "@context": "https://schema.org",
            "@type": "WebPage",
            "@id": "https://dataplier.com/product#webpage",
            "url": "https://dataplier.com/product",
            "name": "Product Features - Universal Data Router & Control Plane",
            "description": "Explore Data Plier's product features for multi-cloud data routing, optimization, and governance.",
            "isPartOf": { "@id": "https://dataplier.com/#website" },
            "about": [
              { "@type": "Thing", "name": "Data Router" },
              { "@type": "Thing", "name": "Multi-cloud Integration" },
              { "@type": "Thing", "name": "Data Pipeline Optimization" }
            ]
          }
        ]}
        breadcrumb={[
          { name: "Home", url: "/" },
          { name: "Product", url: "/product" }
        ]}
      />
      <div className="bg-white">
      <section className="border-b border-slate-100 bg-gradient-to-b from-orange-50/30 to-white px-6 py-16 lg:py-20">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-ember">Product</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-slate-900 lg:text-5xl">
            Universal data router &amp; control plane
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-slate-600">
            Connect existing systems, move large datasets efficiently, and keep analytics and AI workloads fed with governed, optimized flows — without brittle one-off pipelines.
          </p>
        </div>
      </section>

      <section id="multi-cloud" className="scroll-mt-24 mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
          <ScrollReveal>
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">What Data Plier does</h2>
              <p className="mt-4 text-slate-600">
                Enterprises run data across <strong className="font-medium text-slate-800">Databricks</strong>, <strong className="font-medium text-slate-800">Snowflake</strong>,{" "}
                <strong className="font-medium text-slate-800">Google Cloud</strong>, <strong className="font-medium text-slate-800">AWS</strong>, and traditional databases. Data Plier
                sits above point tools as the layer that decides <em>how</em> data should move, transform, and land — continuously.
              </p>
              <ul className="mt-6 space-y-3 text-slate-600">
                <li className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ember" />
                  Intelligently route traffic across your infrastructure
                </li>
                <li className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ember" />
                  Optimize transfers for performance and cost
                </li>
                <li className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ember" />
                  Govern with lineage, snapshots, and audit-friendly history
                </li>
              </ul>
            </div>
          </ScrollReveal>
          <ScrollReveal delayMs={100}>
            <ControlPlaneDiagram />
          </ScrollReveal>
        </div>
      </section>

      <section id="security" className="scroll-mt-24 border-t border-slate-200 bg-slate-50 py-16">
        <div className="mx-auto max-w-6xl px-6">
          <ScrollReveal>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-ember">Security</p>
            <h2 className="mt-2 max-w-3xl text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Built for the threat model of a data control plane
            </h2>
            <p className="mt-4 max-w-3xl text-slate-600">
              Data Plier orchestrates movement between systems you already run. That means{" "}
              <strong className="font-medium text-slate-800">credentials, routing decisions, and run history</strong> are security-sensitive by
              default—not “nice to have” metadata.
            </p>
            <ul className="mt-8 max-w-3xl space-y-4 text-slate-600">
              <li className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ember" />
                <span>
                  <strong className="font-medium text-slate-800">Transport &amp; integrity:</strong> modern TLS for data in motion; chunked
                  flows reconcile with checks so bad segments fail loudly instead of polluting downstream tables.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ember" />
                <span>
                  <strong className="font-medium text-slate-800">Least privilege:</strong> workspace and role boundaries, narrowly scoped
                  connector identities, and guardrails against “one key moves everything” anti-patterns.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ember" />
                <span>
                  <strong className="font-medium text-slate-800">Secrets discipline:</strong> integrate with how you already store secrets;
                  avoid logging credentials or payloads in operational traces.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ember" />
                <span>
                  <strong className="font-medium text-slate-800">Audit &amp; forensics:</strong> trace policy, pipeline, and credential
                  changes alongside runs so security and platform teams can answer “who moved what, when, and under which policy.”
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ember" />
                <span>
                  <strong className="font-medium text-slate-800">Shared responsibility:</strong> you still own cloud IAM, network paths, and
                  warehouse roles—Data Plier reduces glue and shadow flows; it does not replace your enterprise security program.
                </span>
              </li>
            </ul>
            <p className="mt-8 text-sm text-slate-500">
              Long-form narrative and review contacts:{" "}
              <Link to="/overview#security" className="font-medium text-ember hover:text-orange-600">
                Overview → Security &amp; trust
              </Link>
              .
            </p>
          </ScrollReveal>
        </div>
      </section>

      <section id="ai-workloads" className="scroll-mt-24 border-y border-slate-200 bg-gradient-to-r from-slate-900 via-slate-900 to-orange-950 px-6 py-14 text-white">
        <div className="mx-auto max-w-6xl">
          <ScrollReveal>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-300/90">AI-ready data paths</p>
            <h2 className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight">Models and agents need reliable throughput — not best-effort batch jobs.</h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400">
              The AI data traffic controller watches congestion, resizes chunks, and reroutes flows so embeddings, training sets, and feature stores stay fresh without burning your
              warehouse budget.
            </p>
            <Link to="/#how-it-works" className="mt-6 inline-block text-sm font-semibold text-orange-300 hover:text-orange-200">
              Watch the simulations →
            </Link>
          </ScrollReveal>
        </div>
      </section>

      <section id="governance" className="scroll-mt-24 border-t border-slate-200 bg-slate-50/50 py-16">
        <div className="mx-auto max-w-6xl px-6">
          <ScrollReveal>
            <h2 className="text-center text-2xl font-semibold text-slate-900">Differentiating capabilities</h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">
              Not another connector-only product — a unified control surface for movement, optimization, and governance.
            </p>
          </ScrollReveal>
          <div className="mt-12 space-y-6">
            {[
              {
                title: "Intelligent data routing",
                body: "Chooses efficient routes using network conditions, dataset size, and compute availability — not static templates."
              },
              {
                title: "Smart chunk teleportation",
                body: "Splits huge datasets into optimized chunks, transfers in parallel with distributed workers, and scales toward terabyte and petabyte movement."
              },
              {
                title: "Autonomous data pipelines",
                body: "You specify outcomes; the platform discovers datasets, assembles pipelines, runs transfers, and watches performance."
              },
              {
                title: "Universal schema translator",
                body: "Converts schemas between Snowflake, BigQuery, PostgreSQL, Databricks, and peers — cutting manual mapping work."
              },
              {
                title: "Data time machine",
                body: "Versioned snapshots support historical queries, pipeline replay, and rollback for compliance and debugging."
              },
              {
                title: "AI data traffic controller",
                body: "Monitors flows, predicts congestion, adapts chunk sizes, and reroutes to maximize throughput."
              },
              {
                title: "Enterprise data lineage",
                body: "A full graph from origin through movement and transformation — visibility for trust and governance."
              }
            ].map((cap, i) => (
              <ScrollReveal key={cap.title} delayMs={(i % 2) * 60}>
                <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:flex md:gap-8 md:p-8">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-sm font-bold text-ember">{i + 1}</div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{cap.title}</h3>
                    <p className="mt-2 text-slate-600">{cap.body}</p>
                  </div>
                </article>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <ScrollReveal>
          <h2 className="text-2xl font-semibold text-slate-900">Why teams choose Data Plier</h2>
          <p className="mt-4 max-w-3xl text-slate-600">
            Traditional stacks combine ingestion (e.g. Fivetran, Airbyte), in-warehouse transforms (dbt), and orchestration (Airflow). Each excels in its lane, but the composite is
            hard to own. Data Plier is the <strong className="font-medium text-slate-800">central intelligent layer</strong> that spans the whole ecosystem — the operating system for how
            data moves and is controlled.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link to="/philosophy" className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              Our philosophy
            </Link>
            <Link to="/pricing" className="rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600">
              View pricing
            </Link>
          </div>
        </ScrollReveal>
      </section>
    </div>
    </>
  );
}

function ControlPlaneDiagram() {
  return (
    <svg viewBox="0 0 340 280" className="mx-auto h-auto w-full max-w-sm animate-float" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id="cp-hub" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fff7ed" />
          <stop offset="100%" stopColor="#ffedd5" />
        </linearGradient>
      </defs>
      <rect x="20" y="20" width="90" height="56" rx="12" fill="white" stroke="#e2e8f0" strokeWidth="1.5" />
      <text x="65" y="54" textAnchor="middle" className="fill-slate-600 text-[10px] font-semibold" style={{ fontFamily: "IBM Plex Sans, sans-serif" }}>
        Sources
      </text>
      <rect x="20" y="100" width="90" height="56" rx="12" fill="white" stroke="#e2e8f0" strokeWidth="1.5" />
      <text x="65" y="134" textAnchor="middle" className="fill-slate-600 text-[10px] font-semibold" style={{ fontFamily: "IBM Plex Sans, sans-serif" }}>
        Warehouses
      </text>
      <rect x="20" y="180" width="90" height="56" rx="12" fill="white" stroke="#e2e8f0" strokeWidth="1.5" />
      <text x="65" y="214" textAnchor="middle" className="fill-slate-600 text-[10px] font-semibold" style={{ fontFamily: "IBM Plex Sans, sans-serif" }}>
        AI / Lake
      </text>
      <line x1="110" y1="48" x2="155" y2="128" stroke="#f97316" strokeWidth="2" strokeOpacity="0.4" />
      <line x1="110" y1="128" x2="155" y2="128" stroke="#f97316" strokeWidth="2" strokeOpacity="0.55" />
      <line x1="110" y1="208" x2="155" y2="128" stroke="#f97316" strokeWidth="2" strokeOpacity="0.4" />
      <rect x="155" y="88" width="130" height="80" rx="16" fill="url(#cp-hub)" stroke="#f97316" strokeWidth="2" />
      <text x="220" y="128" textAnchor="middle" className="fill-slate-800 text-[11px] font-bold" style={{ fontFamily: "IBM Plex Sans, sans-serif" }}>
        Data Plier
      </text>
      <text x="220" y="148" textAnchor="middle" className="fill-slate-500 text-[9px]" style={{ fontFamily: "IBM Plex Sans, sans-serif" }}>
        Route · Optimize · Govern
      </text>
      <line x1="285" y1="128" x2="320" y2="80" stroke="#cbd5e1" strokeWidth="1.5" />
      <line x1="285" y1="128" x2="320" y2="128" stroke="#cbd5e1" strokeWidth="1.5" />
      <line x1="285" y1="128" x2="320" y2="176" stroke="#cbd5e1" strokeWidth="1.5" />
      <circle cx="328" cy="80" r="6" fill="#f97316" />
      <circle cx="328" cy="128" r="6" fill="#f97316" opacity="0.7" />
      <circle cx="328" cy="176" r="6" fill="#f97316" opacity="0.5" />
    </svg>
  );
}
