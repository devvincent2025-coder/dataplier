import { BarChart3, Blocks, Cloud, Server, type LucideIcon } from "lucide-react";

import { DataSystemLogo } from "../data-system-logo";

const ORBIT_NODES: { slug: string; className: string; delay: string }[] = [
  { slug: "aws-s3", className: "left-[5%] top-[10%]", delay: "0s" },
  { slug: "snowflake", className: "right-[4%] top-[12%]", delay: "0.15s" },
  { slug: "databricks", className: "left-[8%] bottom-[14%]", delay: "0.3s" },
  { slug: "bigquery", className: "right-[6%] bottom-[16%]", delay: "0.45s" },
  { slug: "postgresql", className: "left-[20%] top-[38%]", delay: "0.2s" },
  { slug: "kafka", className: "right-[16%] top-[36%]", delay: "0.35s" }
];

const GLYPHS: { Icon: LucideIcon; label: string; delay: string }[] = [
  { Icon: Blocks, label: "Building blocks", delay: "0s" },
  { Icon: BarChart3, label: "Analytics", delay: "0.4s" },
  { Icon: Cloud, label: "Multi-cloud", delay: "0.8s" },
  { Icon: Server, label: "Fabric", delay: "1.2s" }
];

/**
 * Premium hero visual: hub orchestration, orbital integrations, mesh of flows, and data-building-block motifs.
 */
export function HeroDataOrchestra() {
  return (
    <div
      className="relative mx-auto aspect-[5/4] w-full max-w-[520px] overflow-hidden rounded-[28px] border border-slate-200/90 bg-gradient-to-br from-white via-slate-50/80 to-orange-50/35 shadow-[0_28px_72px_-20px_rgba(15,23,42,0.18)]"
      aria-hidden
    >
      {/* Perspective field */}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 340" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="hero-flow-a" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.08" />
            <stop offset="50%" stopColor="#f97316" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#f97316" stopOpacity="0.08" />
          </linearGradient>
          <radialGradient id="hero-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g opacity="0.14" stroke="#64748b" strokeWidth="0.4">
          {Array.from({ length: 10 }).map((_, i) => (
            <line key={`h${i}`} x1="20" y1={40 + i * 28} x2="380" y2={40 + i * 28 * 0.92 + 8} />
          ))}
          {Array.from({ length: 14 }).map((_, i) => (
            <line key={`v${i}`} x1={24 + i * 26} y1="36" x2={16 + i * 28} y2="312" />
          ))}
        </g>

        <ellipse cx="200" cy="168" rx="118" ry="72" fill="none" stroke="#f97316" strokeOpacity="0.12" strokeWidth="1" />

        <path
          d="M 200 168 C 120 100, 60 120, 52 168 S 100 248, 200 268 S 340 248, 348 168 S 280 88, 200 168"
          fill="none"
          stroke="url(#hero-flow-a)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeDasharray="10 14"
          className="animate-dash-flow"
        />
        <path
          d="M 200 168 C 280 130, 330 150, 352 200 S 300 290, 200 300 S 88 270, 48 200 S 120 120, 200 168"
          fill="none"
          stroke="#f97316"
          strokeOpacity="0.22"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray="6 18"
          className="animate-dash-flow"
          style={{ animationDelay: "0.7s", animationDuration: "3.2s" }}
        />
        <path
          d="M 200 168 L 72 88 M 200 168 L 328 82 M 200 168 L 64 258 M 200 168 L 336 252 M 200 168 L 48 168 M 200 168 L 352 172"
          fill="none"
          stroke="#f97316"
          strokeOpacity="0.18"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeDasharray="4 10"
          className="animate-dash-flow"
          style={{ animationDelay: "0.35s", animationDuration: "2.8s" }}
        />

        <circle cx="200" cy="168" r="56" fill="url(#hero-glow)" />
      </svg>

      {/* Orbiting dashed ring (HTML for crisp rotation) */}
      <div className="pointer-events-none absolute left-1/2 top-[49%] z-10 h-[min(58%,220px)] w-[min(88%,340px)] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-dashed border-ember/20 animate-hero-orbit" />
      <div className="pointer-events-none absolute left-1/2 top-[49%] z-10 h-[min(48%,190px)] w-[min(72%,280px)] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-ember/10 animate-hero-orbit [animation-direction:reverse] [animation-duration:38s]" />

      {/* Floating capability glyphs — flex row so pills never overlap (absolute left/right converged on small widths). */}
      <div className="absolute left-2 right-2 top-2 z-20 flex flex-wrap items-center justify-center gap-2 sm:left-3 sm:right-3 sm:top-3 sm:flex-nowrap sm:justify-between sm:gap-3 md:gap-4">
        {GLYPHS.map(({ Icon, label, delay }) => (
          <div
            key={label}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200/90 bg-white/95 px-2.5 py-1.5 shadow-sm backdrop-blur-sm animate-hero-drift"
            style={{ animationDelay: delay }}
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-ember" strokeWidth={2.25} />
            <span className="min-w-0 text-[10px] font-semibold uppercase tracking-wide text-slate-600 sm:whitespace-nowrap">
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Beacon particles */}
      {[
        { l: "28%", t: "22%", d: "0s" },
        { l: "62%", t: "18%", d: "0.6s" },
        { l: "44%", t: "68%", d: "1.1s" },
        { l: "72%", t: "58%", d: "0.3s" }
      ].map((p, i) => (
        <span
          key={i}
          className="absolute z-10 h-2 w-2 rounded-full bg-ember/70 shadow-[0_0_12px_rgba(249,115,22,0.5)] animate-hero-beacon"
          style={{ left: p.l, top: p.t, animationDelay: p.d }}
        />
      ))}

      {/* Integration chips */}
      {ORBIT_NODES.map((n) => (
        <div
          key={n.slug}
          className={`absolute z-20 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200/95 bg-white shadow-md shadow-slate-900/[0.06] animate-hero-drift ${n.className}`}
          style={{ animationDelay: n.delay }}
        >
          <span className="text-slate-700 [&_svg]:h-6 [&_svg]:w-6">
            <DataSystemLogo slug={n.slug} />
          </span>
        </div>
      ))}

      {/* Central hub */}
      <div className="absolute left-1/2 top-[49%] z-30 flex h-[5.5rem] w-[5.5rem] -translate-x-1/2 -translate-y-1/2 items-center justify-center">
        <div className="relative flex h-[4.5rem] w-[4.5rem] flex-col items-center justify-center rounded-2xl border border-slate-200/95 bg-white/95 shadow-lg shadow-orange-500/10 backdrop-blur-md">
          <svg viewBox="0 0 48 48" className="h-11 w-11" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            {/*
              Source path ~0–440×0–500 user units. Center (~256, ~220), scale to fit 48×48.
              Order: shift pivot to origin → scale → move to viewBox center (24,24).
            */}
            <g transform="translate(24 24) scale(0.086) translate(-256 -228)">
              <path
                d="M407.16,283.638c-13.55-32.176-31.445-58.877-53.19-79.36c-5.233-4.93-10.711-9.501-16.37-13.667c0.974-5.345,1.414-10.778,1.316-16.233c12.892-13.801,22.233-30.933,27.197-50.015c13.358-51.345-9.244-103.94-52.573-122.34c-6.862-2.915-14.573-2.641-21.135,0.581c-6.637,3.264-11.51,9.239-13.37,16.394l-19.162,73.655c-1.462-0.071-7.548-0.042-8.46,0.006L232.25,18.996c-1.862-7.158-6.739-13.133-13.372-16.393c-6.48-3.186-14.192-3.528-21.134-0.581c-43.329,18.399-65.93,70.994-52.573,122.34c4.971,19.109,14.324,36.255,27.235,50.06c-0.09,5.639,0.404,11.199,1.429,16.611c-5.459,4.053-10.747,8.48-15.802,13.243c-21.744,20.482-39.64,47.183-53.19,79.36c-24.296,57.698-32.758,129.776-23.828,202.958c0.94,7.691,5.013,14.796,11.181,19.494c5.007,3.813,11.228,5.913,17.516,5.913c2.945,0,0.809,0.199,42.735-6.056c15.572-2.323,26.3-16.391,24.426-32.025c-6.752-56.321-0.686-110.571,17.078-152.759c14.531-34.508,34.932-56.537,57.637-62.336c0.021,0.001,3.014-0.611,4.412-0.611c1.437,0,3.158,0.279,4.293,0.58c22.753,5.753,43.196,27.792,57.756,62.369c17.764,42.188,23.83,96.438,17.079,152.758c-1.876,15.636,8.854,29.704,24.426,32.026c41.795,6.234,39.788,6.056,42.734,6.056h0.001c6.29,0,12.511-2.1,17.516-5.913c6.166-4.695,10.241-11.801,11.181-19.494C439.918,413.413,431.455,341.334,407.16,283.638z M308.848,37.354c22.52,14.932,33.115,46.884,24.869,78.582c-1.581,6.077-3.767,11.862-6.508,17.271c-8.309-13.968-20.496-25.136-34.919-32.205L308.848,37.354z M163.102,308.171c-19.509,46.331-26.561,104.878-19.969,165.319l-29.431,4.391c-7.333-65.858,0.434-130.052,21.993-181.251c11.727-27.849,26.965-50.723,45.292-67.984c2.052-1.934,4.149-3.796,6.283-5.586c5.684,8.2,12.829,15.386,21.135,21.137C190.321,258.63,174.816,280.353,163.102,308.171z M302.626,192.216c-7.059,20.008-25.916,33.236-46.972,33.236v-0.004c-0.372,0-1.09-0.025-1.511-0.037v0.009c-22.02-0.68-41.011-16.015-46.515-37.173c-1.557-5.982-1.983-12.126-1.266-18.258l0.993-8.507v-0.002c-7.853-7.185-22.93-19.183-29.789-45.547c-8.245-31.696,2.348-63.648,24.87-78.578l20.365,78.28l4.163,16.229l0.055-0.015v0.001c17.339-4.511,20.849-5.822,29.005-5.822v-0.004c23.234,0.115,45.813,16.807,49.18,44.928c0.71,7.186-0.152,14.383-2.539,21.173C302.654,192.155,302.638,192.185,302.626,192.216z M398.302,477.88l-29.43-4.391c6.591-60.44-0.46-118.988-19.969-165.319c-11.774-27.963-27.37-49.76-45.567-64.191c8.499-5.922,15.599-13.31,21.026-21.235c2.263,1.885,4.485,3.853,6.658,5.901c18.326,17.263,33.564,40.135,45.292,67.985C397.867,347.828,405.636,412.024,398.302,477.88z"
                fill="#f97316"
              />
              <circle cx="256.075" cy="176.013" r="20.642" fill="#ea580c" />
            </g>
          </svg>
        </div>
      </div>

      <p className="absolute bottom-3 left-0 right-0 z-20 text-center text-[10px] font-semibold uppercase tracking-[0.26em] text-ember/70">
        Grip · Cut · Twist · Pull
      </p>
    </div>
  );
}
