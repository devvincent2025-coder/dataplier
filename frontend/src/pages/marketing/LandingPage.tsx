import {
  Activity,
  BarChart3,
  Blocks,
  Cloud,
  Cpu,
  Gauge,
  GitBranch,
  KeyRound,
  Layers,
  Lock,
  Server,
  Shield,
  ShieldAlert,
  Zap,
  type LucideIcon
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { ChunkTeleportSimulation } from "../../components/marketing/ChunkTeleportSimulation";
import { ControlPlaneSimulation } from "../../components/marketing/ControlPlaneSimulation";
import { HeroDataOrchestra } from "../../components/marketing/HeroDataOrchestra";
import { MarketingMeshBackground } from "../../components/marketing/MarketingMeshBackground";
import { ScrollReveal } from "../../components/marketing/ScrollReveal";
import { DataSystemLogo } from "../../components/data-system-logo";
import { MARKETING_CONTACT_EMAIL } from "../../config/marketing";
import { SEO, structuredDataSchemas } from "../../components/SEO";

const logos = ["databricks", "snowflake", "bigquery", "postgresql", "aws-s3", "dbt", "airbyte", "kafka", "clickhouse"];

const problemCards = [
  {
    title: "Too much pipeline babysitting",
    body: "Engineers spend nights rerunning failed DAGs, patching one-off SQL, and clearing backlogs instead of shipping new data products."
  },
  {
    title: "Pipelines break on schema drift",
    body: "One upstream change can break downstream models, dashboards, and alerts. Root-cause and replay are slow when lineage is scattered."
  },
  {
    title: "Throughput collapses at peak load",
    body: "Large tables and files hit single-thread bottlenecks. Batch windows slip and model freshness drops when movement is not parallelized."
  },
  {
    title: "Costs rise without clear controls",
    body: "Cross-cloud egress, duplicate copies, and over-provisioned workers burn budget. Teams need policy and observability before costs spike."
  }
];

const capabilities = [
  {
    icon: Zap,
    title: "Routing intelligence",
    body: "Policy-aware paths across regions and vendors with automatic failover and backpressure."
  },
  {
    icon: Layers,
    title: "Chunk parallelization",
    body: "Split, teleport, and reassemble large payloads so wide tables and files land without choking the network."
  },
  {
    icon: GitBranch,
    title: "Schema coherence",
    body: "Drift detection, coercion, and contract checks keep downstream models and dashboards trustworthy."
  },
  {
    icon: Shield,
    title: "Governance & lineage",
    body: "End-to-end provenance, replay, and audit trails designed for regulated and AI-heavy workloads."
  },
  {
    icon: Activity,
    title: "Real-time observability",
    body: "Latency, throughput, and error budgets surfaced where operators already work—no black boxes."
  },
  {
    icon: Cpu,
    title: "Policy-aware execution",
    body: "Quotas, residency, and workload classes enforced at the control plane, not buried in scripts."
  },
  {
    icon: Gauge,
    title: "Cost & capacity",
    body: "Right-size movement, spot expensive egress patterns early, and align spend with SLAs."
  }
];

export function LandingPage() {
  return (
    <>
      <SEO
        title="Data Plier | Intelligent data control plane for multi-cloud & AI"
        description="Data Plier routes, optimizes, transforms, and governs data across Databricks, Snowflake, object stores, streaming buses, and everything in between—one orchestration layer your teams can trust."
        keywords="data control plane, multi-cloud data, AI data pipelines, data orchestration, Snowflake, Databricks, data governance, data lineage, autonomous pipelines, parallel chunking"
        structuredData={[
          structuredDataSchemas.softwareApplication,
          structuredDataSchemas.service,
          {
            "@context": "https://schema.org",
            "@type": "WebPage",
            "@id": "https://dataplier.com/#webpage",
            "url": "https://dataplier.com/",
            "name": "Data Plier - Intelligent data control plane for multi-cloud & AI",
            "description": "Autonomous pipelines, parallel chunking, and governed data movement across clouds—built for data engineers and platform teams.",
            "isPartOf": { "@id": "https://dataplier.com/#website" },
            "about": [
              { "@type": "Thing", "name": "Data Control Plane" },
              { "@type": "Thing", "name": "Multi-cloud Data Management" },
              { "@type": "Thing", "name": "Data Pipeline Automation" }
            ],
            "mainEntity": {
              "@type": "SoftwareApplication",
              "@id": "https://dataplier.com/#software",
              "name": "Data Plier",
              "applicationCategory": "BusinessApplication",
              "operatingSystem": "Web"
            }
          }
        ]}
        breadcrumb={[
          { name: "Home", url: "/" }
        ]}
      />
      <section className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-b from-orange-50/40 via-white to-white">
        <MarketingMeshBackground />
        <div className="relative mx-auto grid max-w-6xl gap-14 px-6 py-16 lg:grid-cols-2 lg:items-center lg:py-24">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-ember">Intelligent data infrastructure</p>
            <h1 className="mt-4 text-4xl font-semibold leading-[1.08] tracking-tight text-slate-900 sm:text-5xl lg:text-[3.25rem]">
              The control plane for multi-cloud &amp; AI-era data.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
              Data Plier routes, optimizes, transforms, and governs data across Databricks, Snowflake, object stores, streaming buses, and
              everything in between—one orchestration layer your teams can trust.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/signup"
                className="rounded-full bg-ember px-6 py-3 text-sm font-semibold text-white shadow-sm shadow-orange-500/25 transition hover:bg-orange-600"
              >
                Get started
              </Link>
              <Link
                to="/product"
                className="rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300"
              >
                Explore platform
              </Link>
              <Link
                to="/#how-it-works"
                className="rounded-full px-6 py-3 text-sm font-semibold text-slate-600 transition hover:text-slate-900"
              >
                See it in motion →
              </Link>
            </div>
            <p className="mt-5 text-sm text-slate-500">
              New here?{" "}
              <Link to="/overview" className="font-medium text-ember underline decoration-orange-200 underline-offset-2 hover:text-orange-600 hover:decoration-orange-300">
                Read the overview
              </Link>{" "}
              <span className="text-slate-400">— what it is, who it is for, and how the pieces fit.</span>
            </p>
            <p className="mt-5 text-sm text-slate-500">
              Built for teams modernizing analytics, ML, and operational data products—without ripping out the stacks you already run.
            </p>
          </div>
          <div className="flex justify-center lg:justify-end">
            <HeroDataOrchestra />
          </div>
        </div>
        <div className="relative mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-4 px-6 pb-12 sm:gap-5">
          <span className="w-full text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:w-auto sm:text-left">
            Works with your stack
          </span>
          {logos.map((slug) => (
            <span
              key={slug}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200/90 bg-white/90 text-slate-700 shadow-sm backdrop-blur-sm sm:h-12 sm:w-12 [&_svg]:h-6 [&_svg]:w-6"
            >
              <DataSystemLogo slug={slug} />
            </span>
          ))}
        </div>
      </section>

      <section id="problem" className="scroll-mt-24 border-b border-slate-100 bg-white py-20">
        <div className="mx-auto max-w-6xl px-6">
          <ScrollReveal>
            <p className="text-center text-xs font-semibold uppercase tracking-[0.28em] text-ember">The problem</p>
            <h2 className="mx-auto mt-3 max-w-3xl text-center text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Your team should build pipelines, not babysit them.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-slate-600">
              Data Plier gives data engineers a control plane that keeps movement reliable, catches drift early, and scales throughput without
              adding brittle glue code.
            </p>
          </ScrollReveal>
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {problemCards.map((card, i) => (
              <ScrollReveal key={card.title} delayMs={i * 70}>
                <article className="h-full rounded-2xl border border-slate-200 bg-slate-50/40 p-6 shadow-sm transition hover:border-orange-200/80 hover:bg-white">
                  <h3 className="text-lg font-semibold text-slate-900">{card.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">{card.body}</p>
                </article>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-24 border-b border-slate-100 bg-slate-950 py-20 text-white">
        <div className="mx-auto max-w-6xl px-6">
          <ScrollReveal>
            <p className="text-center text-xs font-semibold uppercase tracking-[0.28em] text-orange-300/90">How it works</p>
            <h2 className="mx-auto mt-3 max-w-3xl text-center text-3xl font-semibold tracking-tight sm:text-4xl">
              Engineered data movement for speed, trust, and control.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-slate-400">
              Data Plier continuously orchestrates routing, chunk parallelization, and schema intelligence so mission-critical data arrives
              faster, cleaner, and fully governed—whether you are feeding warehouses, lakes, or model features.
            </p>
          </ScrollReveal>
          <div className="mt-14 grid gap-8 lg:grid-cols-2">
            <ScrollReveal delayMs={80}>
              <ControlPlaneSimulation />
            </ScrollReveal>
            <ScrollReveal delayMs={160}>
              <ChunkTeleportSimulation />
            </ScrollReveal>
          </div>
        </div>
      </section>

      <section id="autonomous-chunking" className="scroll-mt-24 border-b border-slate-100 bg-white py-20">
        <div className="mx-auto max-w-6xl px-6">
          <ScrollReveal>
            <p className="text-center text-xs font-semibold uppercase tracking-[0.28em] text-ember">Why teams switch</p>
            <h2 className="mx-auto mt-3 max-w-2xl text-center text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Autonomous pipelines and parallel chunking you can explain to your team in one standup.
            </h2>
          </ScrollReveal>
          <div className="mt-12 grid gap-10 lg:grid-cols-2 lg:items-start">
            <ScrollReveal delayMs={40}>
              <article className="h-full rounded-3xl border border-slate-200 bg-slate-50/50 p-8 shadow-sm">
                <h3 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">Autonomous pipelines</h3>
                <div className="mt-4 flex flex-wrap gap-2">
                  <MetricPill label="On-call reruns" value="−40–60%" />
                  <MetricPill label="MTTR typical jobs" value="~3× faster" />
                  <MetricPill label="Policy blocks" value="pre-flight" />
                </div>
                <p className="mt-4 text-sm leading-relaxed text-slate-600">
                  Pipelines should adapt to runtime reality. Data Plier watches latency, failure patterns, drift, and policy constraints, then
                  automatically chooses safer routes, retries intelligently, and applies backpressure before incidents spread.
                </p>
                <ul className="mt-5 space-y-2 text-sm text-slate-700">
                  <li>• Self-healing retries with context-aware reruns</li>
                  <li>• Automatic path selection across clouds and destinations</li>
                  <li>• Guardrails for residency, quotas, and quality contracts</li>
                </ul>
              </article>
            </ScrollReveal>
            <ScrollReveal delayMs={100}>
              <article className="h-full rounded-3xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-8 shadow-sm">
                <h3 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">Super-charged data chunking</h3>
                <div className="mt-4 flex flex-wrap gap-2">
                  <MetricPill label="Throughput" value="↑ ~4.2×" accent />
                  <MetricPill label="P95 latency" value="↓ ~38%" accent />
                  <MetricPill label="Backfill wall time" value="2–4× faster" accent />
                </div>
                <p className="mt-4 text-sm leading-relaxed text-slate-600">
                  Move large datasets like a distributed system, not a single copy job. Data Plier splits payloads into smart chunks, ships them
                  in parallel, and reassembles with ordering and integrity checks built in.
                </p>
                <ul className="mt-5 space-y-2 text-sm text-slate-700">
                  <li>• Parallel chunk teleportation for high-volume transfers</li>
                  <li>• Adaptive chunk sizing based on real throughput and errors</li>
                  <li>• Faster backfills and fresher downstream tables</li>
                </ul>
              </article>
            </ScrollReveal>
          </div>
          <ScrollReveal delayMs={120}>
            <div className="mt-12 rounded-3xl border border-slate-200 bg-slate-50/80 p-6 shadow-sm sm:p-8">
              <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Before vs after</p>
              <h3 className="mt-2 text-center text-lg font-semibold text-slate-900 sm:text-xl">Same stack. Different operating model.</h3>
              <div className="mt-8 grid gap-8 lg:grid-cols-2 lg:gap-0">
                <div className="lg:border-r lg:border-slate-200 lg:pr-8">
                  <p className="text-sm font-semibold text-slate-500">Before Data Plier</p>
                  <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600">
                    <BeforeAfterItem negative>One fat connection per job; backfills eat the whole window.</BeforeAfterItem>
                    <BeforeAfterItem negative>Retries are blind—same query, same failure, same pager.</BeforeAfterItem>
                    <BeforeAfterItem negative>Root cause is tribal: grep logs, Slack threads, and hope.</BeforeAfterItem>
                    <BeforeAfterItem negative>Egress and duplicate copies show up on the bill, not the dashboard.</BeforeAfterItem>
                  </ul>
                </div>
                <div className="lg:pl-8">
                  <p className="text-sm font-semibold text-ember">After Data Plier</p>
                  <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-700">
                    <BeforeAfterItem>N-way chunk fan-out with merge + checksums—throughput scales with workers.</BeforeAfterItem>
                    <BeforeAfterItem>Control plane picks routes, backoff, and reruns from live signals.</BeforeAfterItem>
                    <BeforeAfterItem>Lineage-aware replay: re-run only what broke, not the whole DAG.</BeforeAfterItem>
                    <BeforeAfterItem>Policy + observability catch bad paths before they become invoices.</BeforeAfterItem>
                  </ul>
                </div>
              </div>
             
            </div>
          </ScrollReveal>
        </div>
      </section>

      <section id="security" className="scroll-mt-24 border-b border-slate-100 bg-slate-950 py-20 text-white">
        <div className="mx-auto max-w-6xl px-6">
          <ScrollReveal>
            <p className="text-center text-xs font-semibold uppercase tracking-[0.28em] text-orange-300/90">Security &amp; trust</p>
            <h2 className="mx-auto mt-3 max-w-3xl text-center text-3xl font-semibold tracking-tight sm:text-4xl">
              A control plane sits in the critical path—we design for that reality.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-sm leading-relaxed text-slate-400">
              Data Plier orchestrates movement between systems your organization already trusts. That convenience comes with responsibility: if
              the plane is weak, your blast radius grows. We treat security as a product requirement, not a brochure checkbox—and we are
              upfront about what you still own (identity in Snowflake, IAM in AWS, network boundaries in your VPC).
            </p>
          </ScrollReveal>
          <div className="mt-14 grid gap-6 sm:grid-cols-2">
            <ScrollReveal delayMs={40}>
              <SecurityHighlight
                icon={Lock}
                title="Data in motion &amp; integrity"
                body="Transfers run over modern TLS. Chunked pipelines are reconciled with ordering and integrity checks so tampering or partial
                failures surface as hard errors—not silent corruption downstream."
              />
            </ScrollReveal>
            <ScrollReveal delayMs={80}>
              <SecurityHighlight
                icon={KeyRound}
                title="Secrets &amp; credentials"
                body="Connection credentials belong in scoped, rotatable secrets—not in repo YAML or chat logs. The platform is built so operators can
                integrate vault-style patterns and avoid leaking tokens into run logs or support bundles."
              />
            </ScrollReveal>
            <ScrollReveal delayMs={120}>
              <SecurityHighlight
                icon={Shield}
                title="Access control &amp; isolation"
                body="Workspaces, roles, and least-privilege connector scopes limit who can define movement, to which destinations, and from which
                sources—so a compromised account cannot silently exfiltrate an entire estate."
              />
            </ScrollReveal>
            <ScrollReveal delayMs={160}>
              <SecurityHighlight
                icon={ShieldAlert}
                title="Auditability &amp; honest limits"
                body="Sensitive actions leave an audit trail for review and incident response. We do not pretend to replace your cloud IAM, data
                catalog, or DLP—Data Plier narrows the moving parts so your existing controls have fewer shadows to chase."
              />
            </ScrollReveal>
          </div>
         
        </div>
      </section>

      <section id="capabilities" className="scroll-mt-24 border-b border-slate-100 bg-slate-50/50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <ScrollReveal>
            <p className="text-center text-xs font-semibold uppercase tracking-[0.28em] text-ember">Capabilities</p>
            <h2 className="mx-auto mt-3 max-w-3xl text-center text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Everything you expect from a modern data plane.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-slate-600">
              Compose building blocks into pipelines that respect policy, scale with your estate, and stay observable from day one.
            </p>
          </ScrollReveal>
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((cap, i) => (
              <ScrollReveal key={cap.title} delayMs={i * 50}>
                <CapabilityCard icon={cap.icon} title={cap.title} body={cap.body} />
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
        <ScrollReveal>
          <p className="text-center text-xs font-semibold uppercase tracking-[0.28em] text-ember">Building blocks</p>
          <h2 className="mx-auto mt-3 max-w-2xl text-center text-2xl font-semibold text-slate-900 sm:text-3xl">
            Visual language for how teams actually ship data products.
          </h2>
        </ScrollReveal>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FeaturePillar icon={Blocks} title="Bricks & blocks" body="Compose reusable units—sources, transforms, sinks—with shared contracts." />
          <FeaturePillar icon={BarChart3} title="Chart & analysis" body="Throughput, latency, and health surfaced where analysts and ops collaborate." />
          <FeaturePillar icon={Cloud} title="Multi-cloud" body="Run the same orchestration semantics on AWS, GCP, Azure, and hybrid footprints." />
          <FeaturePillar icon={Server} title="Server fabric" body="Scale workers and partitions with policy-aware scheduling and backpressure." />
        </div>
      </section>

      <section id="why-dataplier" className="scroll-mt-24 border-y border-slate-200 bg-white py-20">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 lg:grid-cols-[1fr_minmax(0,320px)] lg:items-center">
          <ScrollReveal>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-ember">Philosophy</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Grip. Cut. Twist. Pull.</h2>
            <p className="mt-4 max-w-xl text-lg text-slate-600">
              We treat data operations like precision work: secure the problem, remove waste, reorient quickly, and extract value with intent.
              The product is opinionated about outcomes—not about which warehouse badge you wear.
            </p>
            <Link
              to="/philosophy"
              className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-ember hover:text-orange-600"
            >
              Read the full philosophy <span aria-hidden>→</span>
            </Link>
          </ScrollReveal>
          <ScrollReveal delayMs={100}>
            <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 to-orange-50/40 p-8 shadow-sm">
              <PhilosophyMiniDiagram />
              <p className="mt-6 text-center text-sm text-slate-600">
                A single control plane turns fragmented infrastructure into a coherent operating model.
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <section id="investors" className="scroll-mt-24 bg-slate-950 py-20 text-white">
        <div className="mx-auto max-w-6xl px-6">
          <ScrollReveal>
            <p className="text-center text-xs font-semibold uppercase tracking-[0.28em] text-orange-300/90">For data platform teams</p>
            <h2 className="mx-auto mt-3 max-w-3xl text-center text-3xl font-semibold tracking-tight sm:text-4xl">
              Built for operators who own uptime, freshness, and cost.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-slate-400">
              Use Data Plier to reduce failed runs, shrink backfill times, and keep downstream consumers fresh without multiplying orchestration
              complexity.
            </p>
          </ScrollReveal>
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {[
              { k: "Less firefighting", v: "Autonomous controls and replayability cut manual reruns and midnight intervention." },
              { k: "Higher throughput", v: "Parallel chunking moves large workloads faster, so dashboards and models are fresher." },
              { k: "Lower data movement waste", v: "Policy-aware routing and observability reduce avoidable egress and duplicate flows." }
            ].map((item, i) => (
              <ScrollReveal key={item.k} delayMs={i * 80}>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
                  <p className="text-sm font-semibold text-orange-200">{item.k}</p>
                  <p className="mt-3 text-sm leading-relaxed text-slate-300">{item.v}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
          <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href={`mailto:${MARKETING_CONTACT_EMAIL}?subject=${encodeURIComponent("Technical walkthrough — Data Plier")}`}
              className="rounded-full bg-ember px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-900/30 transition hover:bg-orange-500"
            >
              Request technical walkthrough
            </a>
            <Link to="/pricing" className="rounded-full border border-white/20 px-8 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
              See deployment options
            </Link>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-gradient-to-br from-ember via-orange-500 to-amber-500 py-20 text-center text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(255,255,255,0.2),transparent)]" />
        <div className="relative mx-auto max-w-3xl px-6">
          <ScrollReveal>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Ready to unify your data estate?</h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-white/90">
              Spin up a workspace, connect your first sources, and let the control plane prove throughput and governance in your environment.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link
                to="/signup"
                className="rounded-full bg-white px-8 py-3 text-sm font-semibold text-orange-600 shadow-md transition hover:bg-orange-50"
              >
                Create account
              </Link>
              <Link
                to="/product"
                className="rounded-full border border-white/40 bg-white/10 px-8 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
              >
                Product tour
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}

function SecurityHighlight({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="h-full rounded-2xl border border-white/10 bg-white/[0.04] p-6">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/15 text-orange-300">
        <Icon className="h-5 w-5" strokeWidth={2} />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-slate-400">{body}</p>
    </div>
  );
}

function CapabilityCard({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <article className="h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-orange-200 hover:shadow-md">
      <Icon className="h-6 w-6 text-ember" strokeWidth={2} />
      <h3 className="mt-4 text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
    </article>
  );
}

function FeaturePillar({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <Icon className="h-6 w-6 text-ember" strokeWidth={2} />
      <h3 className="mt-3 font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{body}</p>
    </div>
  );
}

function MetricPill({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <span
      className={`inline-flex items-baseline gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
        accent ? "border-orange-200/90 bg-white/90 text-slate-800 shadow-sm" : "border-slate-200 bg-white text-slate-800"
      }`}
    >
      <span className="font-medium text-slate-500">{label}</span>
      <span className="font-mono text-[11px] font-semibold text-ember">{value}</span>
    </span>
  );
}

function BeforeAfterItem({ children, negative }: { children: ReactNode; negative?: boolean }) {
  return (
    <li className="flex gap-2.5">
      <span
        className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${negative ? "bg-slate-300" : "bg-ember shadow-sm shadow-orange-500/40"}`}
        aria-hidden
      />
      <span>{children}</span>
    </li>
  );
}

function PhilosophyMiniDiagram() {
  return (
    <svg viewBox="0 0 280 200" className="mx-auto h-auto w-full max-w-[280px]" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="24" y="36" width="72" height="52" rx="12" fill="white" stroke="#e2e8f0" strokeWidth="1.5" />
      <rect x="116" y="28" width="88" height="68" rx="14" fill="#fff7ed" stroke="#fdba74" strokeWidth="1.5" />
      <rect x="220" y="40" width="44" height="44" rx="10" fill="white" stroke="#e2e8f0" strokeWidth="1.5" />
      <path
        d="M96 62h20M204 62h16M140 100v24M140 124l-32 40M140 124l32 40"
        stroke="#f97316"
        strokeWidth="2"
        strokeLinecap="round"
        strokeOpacity="0.45"
      />
      <circle cx="140" cy="100" r="22" fill="white" stroke="#f97316" strokeWidth="2" />
      <path d="M140 88v24M132 100h16" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" />
      <text x="60" y="68" textAnchor="middle" fill="#64748b" style={{ fontSize: 9, fontWeight: 700 }}>
        SOURCES
      </text>
      <text x="160" y="64" textAnchor="middle" fill="#f97316" style={{ fontSize: 9, fontWeight: 700 }}>
        CONTROL PLANE
      </text>
      <text x="242" y="66" textAnchor="middle" fill="#64748b" style={{ fontSize: 9, fontWeight: 700 }}>
        AI
      </text>
    </svg>
  );
}
