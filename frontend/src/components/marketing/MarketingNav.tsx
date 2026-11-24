import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  DollarSign,
  FileText,
  LayoutGrid,
  LineChart,
  Menu,
  Network,
  Shield,
  Sparkles,
  Workflow,
  X,
  type LucideIcon
} from "lucide-react";
import { useState } from "react";
import { Link, NavLink } from "react-router-dom";

import { DataSystemLogo } from "../data-system-logo";

type NavRow = { id: string; label: string; to: string; description: string };

const platformPrimary: NavRow[] = [
  { id: "p-ov", label: "Overview", to: "/overview", description: "What Data Plier is and when to use it" },
  { id: "p-cap", label: "Product", to: "/product", description: "Capabilities, architecture, depth" },
  { id: "p-how", label: "How it works", to: "/#how-it-works", description: "Live motion: routing & chunks" },
  { id: "p-phi", label: "Philosophy", to: "/philosophy", description: "Grip · Cut · Twist · Pull" },
  { id: "p-price", label: "Pricing", to: "/pricing", description: "Teams through enterprise" }
];

const platformSecondary: NavRow[] = [
  { id: "p-mc", label: "Multi-cloud fabric", to: "/product#multi-cloud", description: "AWS, GCP, Azure without rewrites" },
  { id: "p-sec", label: "Security & trust", to: "/overview#security", description: "Threat model, encryption, access, audit" },
  { id: "p-ai", label: "AI-ready paths", to: "/product#ai-workloads", description: "Models and agents stay fed" },
  { id: "p-gov", label: "Governance & lineage", to: "/product#governance", description: "Replay, audit, policy" }
];

const solutionsUseCases: NavRow[] = [
  { id: "s-mc", label: "Multi-cloud routing", to: "/product#multi-cloud", description: "Unify fragmented estates" },
  { id: "s-ai", label: "AI & analytics throughput", to: "/product#ai-workloads", description: "Low-latency, governed feeds" },
  { id: "s-gov", label: "Compliance posture", to: "/product#governance", description: "Visibility end to end" },
  { id: "s-why", label: "Why Data Plier", to: "/#why-dataplier", description: "Control-plane advantage" }
];

const destinationSlugs = ["snowflake", "databricks", "bigquery", "iceberg", "clickhouse", "postgresql"] as const;

const resourcesLinks: NavRow[] = [
  { id: "r-phi", label: "Philosophy", to: "/philosophy", description: "Principles behind the product" },
  { id: "r-price", label: "Pricing", to: "/pricing", description: "Plans and deployment models" },
  { id: "r-inv", label: "For investors", to: "/#investors", description: "Briefings and materials" },
  { id: "r-up", label: "Get started", to: "/signup", description: "Create a workspace" }
];

const platformIconMap: Record<string, LucideIcon> = {
  Overview: FileText,
  Product: LayoutGrid,
  "How it works": Workflow,
  Philosophy: Sparkles,
  Pricing: DollarSign
};

function navLinkClass({ isActive }: { isActive: boolean }) {
  return `rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? "text-ember" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`;
}

function MegaPlatformPanel() {
  return (
    <div
      className="invisible absolute left-1/2 top-full z-50 mt-3 w-[min(94vw,56rem)] -translate-x-1/2 opacity-0 transition-all duration-200 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      role="menu"
    >
      <div className="grid gap-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_-12px_rgba(15,23,42,0.18)] md:grid-cols-3">
        <div className="border-b border-slate-100 p-5 md:border-b-0 md:border-r">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Platform</p>
          <ul className="mt-3 space-y-0.5">
            {platformPrimary.map((item) => {
              const Icon = platformIconMap[item.label] ?? LayoutGrid;
              return (
                <li key={item.id}>
                  <Link
                    to={item.to}
                    role="menuitem"
                    className="flex gap-3 rounded-xl px-2 py-2.5 transition hover:bg-orange-50"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-ember">
                      <Icon className="h-4 w-4" strokeWidth={2.2} />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-slate-900">{item.label}</span>
                      <span className="block text-xs text-slate-500">{item.description}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="border-b border-slate-100 p-5 md:border-b-0 md:border-r">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Product depth</p>
          <ul className="mt-3 space-y-0.5">
            {platformSecondary.map((item) => (
              <li key={item.id}>
                <Link to={item.to} role="menuitem" className="block rounded-xl px-2 py-2.5 transition hover:bg-slate-50">
                  <span className="block text-sm font-semibold text-slate-900">{item.label}</span>
                  <span className="block text-xs text-slate-500">{item.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-5 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-orange-300/90">Featured</p>
          <Link
            to="/#how-it-works"
            className="mt-3 flex flex-col rounded-xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
          >
            <span className="text-sm font-semibold">Orchestration in motion</span>
            <span className="mt-1 text-xs text-slate-300">Control plane, chunk parallelism, and schema intelligence—animated.</span>
            <div className="mt-4 space-y-2">
              <div className="h-2 w-full rounded-full bg-white/10" />
              <div className="h-2 w-4/5 rounded-full bg-ember/60" />
              <div className="h-2 w-3/5 rounded-full bg-white/10" />
            </div>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-orange-200">
              Open simulations <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}

function MegaSolutionsPanel() {
  return (
    <div
      className="invisible absolute left-1/2 top-full z-50 mt-3 w-[min(94vw,56rem)] -translate-x-1/2 opacity-0 transition-all duration-200 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      role="menu"
    >
      <div className="grid gap-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_-12px_rgba(15,23,42,0.18)] md:grid-cols-3">
        <div className="border-b border-slate-100 p-5 md:border-b-0 md:border-r">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Use cases</p>
          <ul className="mt-3 space-y-0.5">
            {solutionsUseCases.map((item) => (
              <li key={item.id}>
                <Link to={item.to} role="menuitem" className="flex gap-3 rounded-xl px-2 py-2.5 transition hover:bg-orange-50">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-ember">
                    {item.id === "s-mc" ? (
                      <Network className="h-4 w-4" strokeWidth={2.2} />
                    ) : item.id === "s-ai" ? (
                      <LineChart className="h-4 w-4" strokeWidth={2.2} />
                    ) : item.id === "s-gov" ? (
                      <Shield className="h-4 w-4" strokeWidth={2.2} />
                    ) : (
                      <Sparkles className="h-4 w-4" strokeWidth={2.2} />
                    )}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">{item.label}</span>
                    <span className="block text-xs text-slate-500">{item.description}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="border-b border-slate-100 p-5 md:border-b-0 md:border-r">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Destinations</p>
          <p className="mt-1 text-xs text-slate-500">Connectors your teams already run in production.</p>
          <ul className="mt-4 grid grid-cols-2 gap-2">
            {destinationSlugs.map((slug) => (
              <li key={slug}>
                <Link
                  to="/product"
                  className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm font-medium text-slate-800 transition hover:border-orange-200 hover:bg-orange-50/50"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-700 shadow-sm [&_svg]:h-4 [&_svg]:w-4">
                    <DataSystemLogo slug={slug} />
                  </span>
                  <span className="capitalize">{slug.replace(/-/g, " ")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Resources</p>
          <ul className="mt-3 space-y-0.5">
            {resourcesLinks.map((item) => (
              <li key={item.id}>
                <Link to={item.to} role="menuitem" className="flex gap-3 rounded-xl px-2 py-2.5 transition hover:bg-slate-50">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-600">
                    <BookOpen className="h-4 w-4" strokeWidth={2.2} />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">{item.label}</span>
                    <span className="block text-xs text-slate-500">{item.description}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function MarketingDesktopNav() {
  return (
    <nav className="flex items-center gap-1" aria-label="Primary">
      <div className="group relative">
        <button
          type="button"
          className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
        >
          Platform <ChevronDown className="h-4 w-4 opacity-70" />
        </button>
        <MegaPlatformPanel />
      </div>
      <div className="group relative">
        <button
          type="button"
          className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
        >
          Solutions <ChevronDown className="h-4 w-4 opacity-70" />
        </button>
        <MegaSolutionsPanel />
      </div>
      <NavLink to="/philosophy" className={navLinkClass}>
        Philosophy
      </NavLink>
      <div className="mx-1.5 h-5 w-px bg-slate-200" />
      <NavLink to="/pricing" className={navLinkClass}>
        Pricing
      </NavLink>
      <Link
        to="/#investors"
        className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      >
        Investors
      </Link>
    </nav>
  );
}

export function MarketingMobileNav() {
  const [open, setOpen] = useState(false);
  const sections: { title: string; items: NavRow[] }[] = [
    { title: "Platform", items: platformPrimary },
    { title: "Product depth", items: platformSecondary },
    { title: "Solutions", items: solutionsUseCases },
    { title: "Resources", items: resourcesLinks }
  ];

  return (
    <>
      <button
        type="button"
        className="inline-flex rounded-lg border border-slate-200 p-2 text-slate-700"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-full z-40 max-h-[min(80vh,520px)] overflow-y-auto border-b border-slate-200 bg-white px-6 py-5 shadow-lg">
          {sections.map((section) => (
            <div key={section.title} className="border-b border-slate-100 py-4 last:border-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{section.title}</p>
              <ul className="mt-2 space-y-1">
                {section.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      to={item.to}
                      className="block rounded-lg py-2 text-sm text-slate-800"
                      onClick={() => setOpen(false)}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="border-t border-slate-100 pt-3">
            <Link to="/philosophy" className="block py-2 text-sm" onClick={() => setOpen(false)}>
              Philosophy
            </Link>
            <Link to="/pricing" className="block py-2 text-sm" onClick={() => setOpen(false)}>
              Pricing
            </Link>
            <Link to="/#investors" className="block py-2 text-sm" onClick={() => setOpen(false)}>
              Investors
            </Link>
          </div>
        </div>
      ) : null}
    </>
  );
}
