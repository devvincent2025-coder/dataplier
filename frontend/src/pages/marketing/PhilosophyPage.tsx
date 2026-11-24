import { Link } from "react-router-dom";

import { ScrollReveal } from "../../components/marketing/ScrollReveal";
import { SEO, structuredDataSchemas } from "../../components/SEO";

const PILLARS = [
  {
    id: "grip",
    title: "Grip",
    headline: "Hold every connection",
    body: "Securely connect to databases, SaaS, warehouses, APIs, and cloud storage — one fabric for discovery and control.",
    accent: "from-amber-400 to-ember"
  },
  {
    id: "cut",
    title: "Cut",
    headline: "Slice scale into speed",
    body: "Break massive datasets into optimized chunks for distributed processing and high-throughput transfers.",
    accent: "from-orange-400 to-orange-600"
  },
  {
    id: "twist",
    title: "Twist",
    headline: "Reshape across platforms",
    body: "Transform and translate schemas between Snowflake, Databricks, PostgreSQL, BigQuery, and the rest of your stack.",
    accent: "from-ember to-red-500"
  },
  {
    id: "pull",
    title: "Pull",
    headline: "Route with intent",
    body: "Move and steer data across clouds, pipelines, analytics, and AI — intelligently, with lineage you can trust.",
    accent: "from-orange-500 to-amber-600"
  }
] as const;

export function PhilosophyPage() {
  return (
    <>
      <SEO
        title="Our Philosophy | Grip, Cut, Twist, Pull | Data Plier"
        description="The name Data Plier is deliberate. A plier is one tool that grips, cuts, twists, and pulls — versatile pressure applied exactly where you need it. We bring that same idea to enterprise data infrastructure."
        keywords="data infrastructure philosophy, enterprise data platform design, data plier philosophy, grip cut twist pull, data engineering principles, data platform architecture"
        structuredData={[
          structuredDataSchemas.article(
            "Our Philosophy | Grip, Cut, Twist, Pull | Data Plier",
            "Learn about Data Plier's philosophy: grip every connection, cut scale into speed, reshape across platforms, and route with intent.",
            "2025-01-08"
          ),
          {
            "@context": "https://schema.org",
            "@type": "WebPage",
            "@id": "https://dataplier.com/philosophy#webpage",
            "url": "https://dataplier.com/philosophy",
            "name": "Our Philosophy - Grip, Cut, Twist, Pull",
            "description": "Discover Data Plier's philosophy for enterprise data infrastructure - grip, cut, twist, and pull principles.",
            "isPartOf": { "@id": "https://dataplier.com/#website" },
            "about": [
              { "@type": "Thing", "name": "Data Infrastructure Philosophy" },
              { "@type": "Thing", "name": "Enterprise Platform Design" },
              { "@type": "Thing", "name": "Data Engineering Principles" }
            ]
          }
        ]}
        breadcrumb={[
          { name: "Home", url: "/" },
          { name: "Philosophy", url: "/philosophy" }
        ]}
      />
      <div>
      <section className="border-b border-slate-100 bg-gradient-to-br from-orange-50/40 via-white to-amber-50/20 px-6 py-16 lg:py-20">
        <div className="mx-auto max-w-6xl lg:flex lg:items-center lg:gap-16">
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-ember">Philosophy</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900 lg:text-5xl">Grip, cut, twist, pull</h1>
            <p className="mt-5 max-w-xl text-lg text-slate-600">
              The name <strong className="font-medium text-slate-800">Data Plier</strong> is deliberate. A plier is one tool that grips, cuts, twists, and pulls — versatile pressure
              applied exactly where you need it. We bring that same idea to enterprise data infrastructure.
            </p>
            <p className="mt-4 max-w-xl text-slate-600">
              Instead of juggling disconnected movers and orchestrators, you get a single philosophy for the full lifecycle: connect, partition, reshape, and route.
            </p>
          </div>
          <div className="mt-10 flex flex-1 justify-center lg:mt-0">
            <PlierMarkSvg />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-8 md:grid-cols-2">
          {PILLARS.map((p, i) => (
            <ScrollReveal key={p.id} delayMs={i * 90}>
              <article className="group relative h-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-8 shadow-sm transition hover:shadow-md">
                <div className={`mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${p.accent} text-xl font-bold text-white shadow-lg`}>
                  {p.title[0]}
                </div>
                <h2 className="text-xl font-semibold text-slate-900">{p.title}</h2>
                <p className="mt-1 text-sm font-medium text-ember">{p.headline}</p>
                <p className="mt-4 text-slate-600">{p.body}</p>
                <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-orange-100 opacity-0 transition group-hover:opacity-100" />
              </article>
            </ScrollReveal>
          ))}
        </div>
      </section>

      <ScrollReveal>
        <section className="border-t border-slate-200 bg-slate-900 py-16 text-center text-white">
          <p className="text-sm uppercase tracking-[0.35em] text-orange-300">Tagline</p>
          <p className="mx-auto mt-4 max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
            Data Plier — Grip. Cut. Twist. Pull. <span className="text-orange-200">Control your data anywhere.</span>
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link to="/product" className="rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100">
              Platform overview
            </Link>
            <Link to="/signup" className="rounded-full border border-white/30 px-6 py-2.5 text-sm font-semibold hover:bg-white/10">
              Get started
            </Link>
          </div>
        </section>
      </ScrollReveal>
    </div>
    </>
  );
}

function PlierMarkSvg() {
  return (
    <svg viewBox="0 0 280 280" className="h-64 w-64 animate-float drop-shadow-lg" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id="plier-g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#c2410c" />
        </linearGradient>
      </defs>
      <circle cx="140" cy="140" r="118" fill="#fff7ed" stroke="#fed7aa" strokeWidth="2" />
      <g transform="translate(140, 140) rotate(-12)">
        <path d="M -8 -70 L 12 70 L -4 78 L -24 -62 Z" fill="url(#plier-g)" opacity="0.95" />
        <path d="M 8 -70 L -12 70 L 4 78 L 24 -62 Z" fill="url(#plier-g)" opacity="0.88" />
        <circle cy="-58" r="16" fill="white" stroke="#f97316" strokeWidth="2.5" />
        <circle cy="-58" r="6" fill="#f97316" className="animate-pulse-glow" />
      </g>
      {["Grip", "Cut", "Twist", "Pull"].map((label, i) => {
        const angle = (i / 4) * Math.PI * 2 - Math.PI / 2;
        const r = 102;
        const x = 140 + Math.cos(angle) * r;
        const y = 140 + Math.sin(angle) * r;
        return (
          <text
            key={label}
            x={x}
            y={y}
            textAnchor="middle"
            className="fill-slate-500 text-[9px] font-bold uppercase tracking-wider"
            style={{ fontFamily: "IBM Plex Sans, sans-serif" }}
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}
