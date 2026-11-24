import {
  Activity,
  Gauge,
  LayoutDashboard,
  Link2,
  ServerCog,
  ShieldCheck,
  type LucideIcon
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { ScrollReveal } from "../../components/marketing/ScrollReveal";
import { MARKETING_CONTACT_EMAIL } from "../../config/marketing";
import { SEO, structuredDataSchemas } from "../../components/SEO";

const toc = [
  { id: "the-idea", label: "The Idea" },
  { id: "audience", label: "Who this is for" },
  { id: "when-to-use", label: "When to use Data Plier" },
  { id: "transition", label: "From scattered tools to one plane" },
  { id: "consolidates", label: "What it consolidates" },
  { id: "capabilities", label: "Core capabilities" },
  { id: "security", label: "Security & trust" },
  { id: "key-areas", label: "Key areas of the product" },
  { id: "diagram", label: "How it fits together" },
  { id: "get-started", label: "Get started" }
] as const;

/**
 * Conceptual overview page — doc-style narrative for both newcomers and practitioners.
 * Structure inspired by vendor control-plane overviews (e.g. Microsoft Foundry Control Plane).
 */
export function OverviewPage() {
  return (
    <>
      <SEO
        title="What is Data Plier? | Overview & Architecture"
        description="Data Plier is a data movement and orchestration control plane—routing, parallel chunk transfer, schema-aware execution, policy, lineage, and observability in one layer."
        keywords="data control plane overview, data movement architecture, data orchestration platform, multi-cloud data management, data pipeline control, enterprise data infrastructure"
        structuredData={[
          structuredDataSchemas.softwareApplication,
          structuredDataSchemas.article(
            "What is Data Plier? | Overview & Architecture",
            "Comprehensive overview of Data Plier's data movement and orchestration control plane capabilities, architecture, and use cases.",
            "2025-01-08"
          ),
          {
            "@context": "https://schema.org",
            "@type": "WebPage",
            "@id": "https://dataplier.com/overview#webpage",
            "url": "https://dataplier.com/overview",
            "name": "What is Data Plier? - Overview & Architecture",
            "description": "Learn about Data Plier's data movement and orchestration control plane, its architecture, capabilities, and when to use it.",
            "isPartOf": { "@id": "https://dataplier.com/#website" },
            "about": [
              { "@type": "Thing", "name": "Data Control Plane" },
              { "@type": "Thing", "name": "Data Orchestration" },
              { "@type": "Thing", "name": "Multi-cloud Architecture" }
            ]
          }
        ]}
        breadcrumb={[
          { name: "Home", url: "/" },
          { name: "Overview", url: "/overview" }
        ]}
      />
      <div className="bg-white">
      <article className="border-b border-slate-100 bg-gradient-to-b from-slate-50/80 to-white">
        <div className="mx-auto max-w-3xl px-6 pb-12 pt-14 lg:pt-20">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-ember">Overview</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900 lg:text-[2.75rem] lg:leading-[1.1]">
            What is Data Plier?
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-slate-600">
            <strong className="font-semibold text-slate-800">In everyday terms:</strong> Data Plier is the place where your organization
            decides how data gets from A to B—across clouds, warehouses, lakes, and streaming systems—without everyone building their own
            fragile shortcuts.
          </p>
          <p className="mt-4 text-base leading-relaxed text-slate-600">
            <strong className="font-semibold text-slate-800">For practitioners:</strong> it is a{" "}
            <span className="text-slate-800">data movement and orchestration control plane</span>—routing, parallel chunk transfer,
            schema-aware execution, policy, lineage, and observability in one layer above your connectors and SQL jobs.
          </p>
          <p className="mt-6 text-sm leading-relaxed text-slate-500">
            This page explains the idea, who it serves, and how the pieces fit. For feature depth and screenshots, see the{" "}
            <Link to="/product" className="font-medium text-ember hover:text-orange-600">
              product overview
            </Link>
            .
          </p>
        </div>
      </article>

      <div className="mx-auto max-w-6xl px-6 py-10 lg:grid lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-12 lg:py-14">
        <div className="min-w-0">
          <nav
            className="mb-12 rounded-2xl border border-slate-200 bg-slate-50/80 p-5 lg:hidden"
            aria-label="On this page"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">On this page</p>
            <ul className="mt-3 space-y-2 text-sm">
              {toc.map((item) => (
                <li key={item.id}>
                  <a href={`#${item.id}`} className="text-ember hover:text-orange-600">
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="max-w-3xl space-y-16">
            <DocSection id="the-idea" title="The Idea">
              <p>
                Most companies do not have “a data problem” in the abstract—they have{" "}
                <strong className="font-medium text-slate-800">too many moving parts</strong>: copies between regions, nightly batches that
                slip, ad-hoc scripts, and dashboards that break when a column changes upstream.
              </p>
              <p>
                Data Plier is built around a simple shift: instead of treating each pipeline as a one-off project, you run data movement
                through a <strong className="font-medium text-slate-800">shared control layer</strong> that can see congestion, enforce
                rules, split large jobs into parallel chunks, and retry intelligently—so engineers spend less time firefighting and more time
                shipping.
              </p>
            </DocSection>

            <DocSection id="audience" title="Who this page is for">
              <ul className="mt-0 list-disc space-y-2 pl-5 text-slate-600">
                <li>
                  <strong className="font-medium text-slate-800">Executives and buyers</strong> who want a clear story: what category Data
                  Plier is in, why it matters, and how it differs from “yet another connector.”
                </li>
                <li>
                  <strong className="font-medium text-slate-800">Data engineers and platform teams</strong> who own pipelines, SLAs, cost,
                  and governance—and need precise language, not hype.
                </li>
                <li>
                  <strong className="font-medium text-slate-800">Architects</strong> comparing control planes, mesh-style routing, and how
                  Data Plier sits relative to warehouses, ELT tools, and orchestrators.
                </li>
              </ul>
            </DocSection>

            <DocSection id="when-to-use" title="When to use Data Plier">
              <p>Consider Data Plier when your organization:</p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-600">
                <li>Runs data across <strong className="font-medium text-slate-800">multiple clouds or vendors</strong> and needs consistent
                  movement semantics—not a different playbook per tool.</li>
                <li>Moves <strong className="font-medium text-slate-800">large tables, files, or streams</strong> where single-threaded
                  copies become the bottleneck.</li>
                <li>Wants <strong className="font-medium text-slate-800">autonomous pipeline behavior</strong>: smart retries, routing, and
                  backpressure instead of blind reruns and pager fatigue.</li>
                <li>Must show <strong className="font-medium text-slate-800">lineage, replay, and policy</strong> for compliance, audits, or
                  AI training data governance.</li>
                <li>Needs <strong className="font-medium text-slate-800">one operational view</strong> of health, latency, and cost signals
                  across pipelines—not only per-job logs in separate UIs.</li>
                <li>
                  Requires a <strong className="font-medium text-slate-800">credible security story</strong> for a system in the movement
                  path—encryption, least privilege, audit trails, and an honest shared-responsibility model with your cloud and warehouse IAM.
                </li>
              </ul>
            </DocSection>

            <DocSection id="transition" title="From scattered tools to one control plane">
              <p>
                <strong className="font-medium text-slate-800">Without</strong> a control plane, teams usually stitch together orchestrators,
                ingestion tools, warehouse jobs, and custom scripts. Each piece can work well on its own, but{" "}
                <strong className="font-medium text-slate-800">nobody owns the whole path end-to-end</strong>—so failures, drift, and cost
                surprises show up late.
              </p>
              <p>
                <strong className="font-medium text-slate-800">With</strong> Data Plier, the same systems can stay in place, but{" "}
                <strong className="font-medium text-slate-800">movement and control converge</strong>: routing, chunking, retries, policy,
                and visibility are centralized. The mental model matches how mature platforms describe “fleet” or “estate” management—here,
                applied to <strong className="font-medium text-slate-800">data pipelines and transfers</strong>, not only to a single
                warehouse or notebook.
              </p>
              <p className="text-sm text-slate-500">
                If you are familiar with how vendors document a <em>control plane</em> for AI agents and models—unified inventory,
                governance, and operations in one lens—a similar narrative applies to{" "}
                <a
                  href="https://learn.microsoft.com/en-us/azure/foundry/control-plane/overview"
                  className="font-medium text-ember hover:text-orange-600"
                  target="_blank"
                  rel="noreferrer"
                >
                  Microsoft Foundry Control Plane
                </a>
                , but aimed at <strong className="font-medium text-slate-700">data movement and pipeline operations</strong>.
              </p>
            </DocSection>

            <DocSection id="consolidates" title="What Data Plier consolidates">
              <p>
                Data Plier brings <strong className="font-medium text-slate-800">inventory, execution, observability, and governance</strong>{" "}
                for data in motion into one coherent story—similar to how a control plane unifies operations across many underlying
                resources.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-600">
                <li>
                  <strong className="font-medium text-slate-800">Inventory</strong> of connections, pipelines, and flows across workspaces.
                </li>
                <li>
                  <strong className="font-medium text-slate-800">Execution intelligence</strong>: how work is chunked, scheduled, routed, and
                  retried under load.
                </li>
                <li>
                  <strong className="font-medium text-slate-800">Observability</strong>: throughput, errors, and latency in context—not only
                  raw task logs.
                </li>
                <li>
                  <strong className="font-medium text-slate-800">Governance</strong>: lineage, replay boundaries, and policy hooks aligned to
                  how data actually moves.
                </li>
              </ul>
            </DocSection>

            <DocSection id="capabilities" title="Core capabilities">
              <p>At a high level, Data Plier supports tasks such as:</p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-600">
                <li>
                  <strong className="font-medium text-slate-800">Operate a multi-destination estate</strong>—route and optimize flows across
                  the systems you already use (warehouses, lakes, object storage, buses).
                </li>
                <li>
                  <strong className="font-medium text-slate-800">Run super-charged chunking</strong>—split large payloads, parallelize
                  transfers, and reconcile with ordering and integrity checks.
                </li>
                <li>
                  <strong className="font-medium text-slate-800">Make pipelines more autonomous</strong>—adapt retries, paths, and backpressure
                  from live signals instead of static configs alone.
                </li>
                <li>
                  <strong className="font-medium text-slate-800">Improve reliability and freshness</strong>—shorter backfills, fewer manual
                  reruns, clearer ownership of SLAs.
                </li>
                <li>
                  <strong className="font-medium text-slate-800">Strengthen governance</strong>—trace lineage, scope replay, and align policy
                  with how data enters downstream analytics and AI consumers.
                </li>
              </ul>
            </DocSection>

            <DocSection id="security" title="Security &amp; trust">
              <p>
                <strong className="font-medium text-slate-800">A control plane is a high-value target.</strong> It sees metadata about what
                moves where, holds references to credentials, and can initiate transfers on your behalf. That is exactly why security cannot
                be an afterthought: a weak plane widens blast radius across every connection it touches.
              </p>
              <p>
                <strong className="font-medium text-slate-800">Encryption and integrity.</strong> Data in motion should use strong transport
                encryption (TLS). For chunked movement, integrity and ordering checks help ensure partial failures or manipulation do not
                become silent corruption in the warehouse. At-rest posture depends on how you deploy (cloud region, disk, and key
                management)—Data Plier is designed to align with your existing standards rather than invent a parallel secret store.
              </p>
              <p>
                <strong className="font-medium text-slate-800">Identity, roles, and least privilege.</strong> Fine-grained workspace and role
                boundaries limit who can author pipelines, attach connectors, or trigger backfills. Connectors should run with the minimum
                privileges required on each system; the platform should not encourage “super-admin” service accounts shared across teams.
              </p>
              <p>
                <strong className="font-medium text-slate-800">Secrets hygiene.</strong> Credentials belong in vaults or managed secret
                services—not in tickets, notebooks, or git. Operational logs and support exports must avoid echoing tokens, connection strings,
                or row-level payloads.
              </p>
              <p>
                <strong className="font-medium text-slate-800">Audit and incident response.</strong> Security and platform teams need a
                coherent trail of who changed routing, policies, credentials, and pipeline definitions—correlated with run history when
                something goes wrong. That is the same bar you already hold your orchestrators and warehouses to; the control plane should
                meet it.
              </p>
              <p>
                <strong className="font-medium text-slate-800">What remains your responsibility.</strong> Data Plier does not replace Snowflake
                RBAC, AWS IAM, GCP organization policies, network segmentation, or enterprise DLP. It narrows how data moves so those controls
                have fewer dark corners—but you still own identity, network paths, and classification of the datasets themselves.
              </p>
              <p className="text-sm text-slate-500">
                For questionnaires, architecture diagrams, and data-flow reviews, contact{" "}
                <a href={`mailto:${MARKETING_CONTACT_EMAIL}?subject=${encodeURIComponent("Security review — Data Plier")}`} className="font-medium text-ember hover:text-orange-600">
                  {MARKETING_CONTACT_EMAIL}
                </a>
                .
              </p>
            </DocSection>

            <DocSection id="key-areas" title="Key areas of the product">
              <p className="text-slate-600">
                The product is organized around jobs you already recognize from platform work—similar to how a control-plane doc groups{" "}
                <em>overview, assets, compliance, quota, admin</em> into clear panes. Here is the Data Plier analogue:
              </p>
              <div className="mt-8 grid gap-5 sm:grid-cols-2">
                <ProductPane
                  icon={LayoutDashboard}
                  title="Overview"
                  body="A snapshot of pipeline health, run outcomes, and signals that matter for freshness and incidents—so you can spot drift before consumers do."
                />
                <ProductPane
                  icon={Link2}
                  title="Movement & pipelines"
                  body="Author and run flows with intelligent routing, parallel chunk execution, and autonomous retries—built for high-volume and multi-cloud paths."
                />
                <ProductPane
                  icon={ShieldCheck}
                  title="Governance & trust"
                  body="Lineage, replay, and policy aligned to data in motion—so audits and incident response have a clear story, not a pile of disconnected logs."
                />
                <ProductPane
                  icon={Gauge}
                  title="Throughput & cost"
                  body="Visibility into bottlenecks, egress-heavy routes, and capacity-style limits—so teams can tune movement without guessing from warehouse bills alone."
                />
                <ProductPane
                  icon={Activity}
                  title="Observability"
                  body="Correlate runs, errors, and performance trends across pipelines—closer to how you operate a service than how you read one DAG at a time."
                />
                <ProductPane
                  icon={ServerCog}
                  title="Workspace & access"
                  body="Workspaces, roles, and connected resources in one place—so platform teams can govern who can move what, and where."
                />
              </div>
            </DocSection>

            <section id="diagram" className="scroll-mt-24">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">How it fits together</h2>
              <p className="mt-4 text-slate-600">
                Sources and destinations stay where they are. Data Plier sits between them as the{" "}
                <strong className="font-medium text-slate-800">control layer</strong> for how data moves, scales, and is governed.
              </p>
              <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/80 p-8">
                <OverviewDiagram />
                <p className="mt-6 text-center text-sm text-slate-500">
                  Simplified view: one plane coordinates many paths—your real topology can be far larger.
                </p>
              </div>
            </section>

            <section id="get-started" className="scroll-mt-24 rounded-2xl border border-orange-200 bg-orange-50/40 p-8">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Get started</h2>
              <p className="mt-3 text-slate-600">
                Pick the next step that matches your role—then go deeper on the product page or try the live simulations on the home page.
              </p>
              <ul className="mt-6 flex flex-col gap-3 text-sm font-medium sm:flex-row sm:flex-wrap">
                <li>
                  <Link to="/signup" className="inline-flex rounded-full bg-ember px-5 py-2.5 text-white hover:bg-orange-600">
                    Create an account
                  </Link>
                </li>
                <li>
                  <Link
                    to="/product"
                    className="inline-flex rounded-full border border-slate-200 bg-white px-5 py-2.5 text-slate-800 hover:bg-slate-50"
                  >
                    Product capabilities
                  </Link>
                </li>
                <li>
                  <Link
                    to="/#how-it-works"
                    className="inline-flex rounded-full border border-slate-200 bg-white px-5 py-2.5 text-slate-800 hover:bg-slate-50"
                  >
                    See simulations
                  </Link>
                </li>
                <li>
                  <Link
                    to="/philosophy"
                    className="inline-flex rounded-full border border-transparent px-5 py-2.5 text-ember hover:text-orange-600"
                  >
                    Read our philosophy
                  </Link>
                </li>
              </ul>
            </section>
          </div>
        </div>

        <aside className="hidden lg:block" aria-label="On this page">
          <div className="sticky top-28">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">On this page</p>
            <ul className="mt-4 space-y-2.5 border-l border-slate-200 pl-4 text-sm">
              {toc.map((item) => (
                <li key={item.id}>
                  <a href={`#${item.id}`} className="text-slate-600 hover:text-ember">
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
    </>
  );
}

function DocSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <ScrollReveal>
      <section id={id} className="scroll-mt-24">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h2>
        <div className="mt-4 space-y-4 text-base leading-relaxed text-slate-600">{children}</div>
      </section>
    </ScrollReveal>
  );
}

function ProductPane({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-ember">
        <Icon className="h-5 w-5" strokeWidth={2} />
      </div>
      <h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
    </div>
  );
}

function OverviewDiagram() {
  return (
    <svg viewBox="0 0 640 280" className="mx-auto h-auto w-full max-w-2xl" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id="ov-hub" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fff7ed" />
          <stop offset="100%" stopColor="#ffedd5" />
        </linearGradient>
      </defs>
      <rect x="40" y="40" width="120" height="64" rx="14" fill="white" stroke="#e2e8f0" strokeWidth="1.5" />
      <text x="100" y="78" textAnchor="middle" fill="#475569" style={{ fontSize: 11, fontWeight: 600 }}>
        Sources
      </text>
      <rect x="40" y="140" width="120" height="64" rx="14" fill="white" stroke="#e2e8f0" strokeWidth="1.5" />
      <text x="100" y="178" textAnchor="middle" fill="#475569" style={{ fontSize: 11, fontWeight: 600 }}>
        Streams
      </text>
      <line x1="160" y1="72" x2="248" y2="120" stroke="#f97316" strokeWidth="2" strokeOpacity="0.45" />
      <line x1="160" y1="172" x2="248" y2="152" stroke="#f97316" strokeWidth="2" strokeOpacity="0.45" />
      <rect x="248" y="96" width="144" height="88" rx="18" fill="url(#ov-hub)" stroke="#f97316" strokeWidth="2" />
      <text x="320" y="132" textAnchor="middle" fill="#0f172a" style={{ fontSize: 13, fontWeight: 700 }}>
        Data Plier
      </text>
      <text x="320" y="154" textAnchor="middle" fill="#64748b" style={{ fontSize: 10, fontWeight: 600 }}>
        Control plane
      </text>
      <line x1="392" y1="120" x2="480" y2="88" stroke="#cbd5e1" strokeWidth="1.5" />
      <line x1="392" y1="140" x2="480" y2="140" stroke="#cbd5e1" strokeWidth="1.5" />
      <line x1="392" y1="160" x2="480" y2="192" stroke="#cbd5e1" strokeWidth="1.5" />
      <rect x="480" y="56" width="120" height="56" rx="12" fill="white" stroke="#e2e8f0" strokeWidth="1.5" />
      <text x="540" y="88" textAnchor="middle" fill="#475569" style={{ fontSize: 10, fontWeight: 600 }}>
        Warehouse
      </text>
      <rect x="480" y="112" width="120" height="56" rx="12" fill="white" stroke="#e2e8f0" strokeWidth="1.5" />
      <text x="540" y="144" textAnchor="middle" fill="#475569" style={{ fontSize: 10, fontWeight: 600 }}>
        Lake / files
      </text>
      <rect x="480" y="168" width="120" height="56" rx="12" fill="white" stroke="#e2e8f0" strokeWidth="1.5" />
      <text x="540" y="200" textAnchor="middle" fill="#475569" style={{ fontSize: 10, fontWeight: 600 }}>
        AI consumers
      </text>
    </svg>
  );
}
