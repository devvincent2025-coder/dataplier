import { Instagram, Linkedin, Mail } from "lucide-react";
import { Link, Outlet } from "react-router-dom";
import brandLogo from "../assets/logo.svg";
import { MarketingMeshBackground } from "../components/marketing/MarketingMeshBackground";
import { MarketingDesktopNav, MarketingMobileNav } from "../components/marketing/MarketingNav";
import { MarketingPageSeo } from "../components/seo/MarketingPageSeo";
import { MARKETING_CONTACT_EMAIL, MARKETING_SOCIAL } from "../config/marketing";
import { useSessionStore } from "../store/session";

export function MarketingLayout() {
  const token = useSessionStore((s) => s.token);
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <MarketingPageSeo />
      <a
        href={`mailto:${MARKETING_CONTACT_EMAIL}?subject=${encodeURIComponent("Beta waitlist — Data Plier")}`}
        className="relative block bg-indigo-600 px-6 py-2.5 text-center text-[11px] font-medium leading-snug text-white transition hover:bg-indigo-500 sm:py-2"
      >
        <span className="relative z-10 mx-auto inline-block max-w-3xl">
          <span className="mr-1.5 rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-100">
            Beta
          </span>
          We&apos;re testing with a small group first — join the waitlist and we&apos;ll reach out when we open the next wave of access.{" "}
          <span className="whitespace-nowrap underline decoration-white/50 underline-offset-2">Email us to get on the list ↗</span>
        </span>
        <span className="pointer-events-none absolute inset-0 opacity-30">
          <MarketingMeshBackground />
        </span>
      </a>
      <header className="sticky top-0 z-50 border-b border-slate-200/90 bg-white/90 backdrop-blur-md">
        <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-40">
          <MarketingMeshBackground />
        </div>
        <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-4 lg:grid lg:grid-cols-[1fr_auto_1fr]">
          <Link to="/" className="flex items-center gap-2.5"><img src={brandLogo} alt="" className="h-9 w-9 rounded-md" /><span className="text-lg font-semibold">Data Plier</span></Link>
          <div className="hidden lg:block"><MarketingDesktopNav /></div>
          <div className="flex items-center gap-2 sm:gap-3 lg:justify-self-end">{token ? <Link to="/dashboard" className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white">Open dashboard</Link> : <><Link to="/login" className="rounded-full px-4 py-2 text-sm font-medium text-slate-600">Sign in</Link><Link to="/signup" className="rounded-full bg-ember px-4 py-2 text-sm font-medium text-white">Get started</Link></>}<div className="lg:hidden"><MarketingMobileNav /></div></div>
        </div>
      </header>
      <Outlet />
      <footer className="border-t border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100/80">
        <div className="border-b border-slate-200/80 bg-slate-900 px-6 py-12 text-white">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-300/90">Stay close to the roadmap</p>
              <h2 className="mt-2 max-w-xl text-2xl font-semibold tracking-tight">Quarterly product &amp; investor briefings</h2>
              <p className="mt-2 max-w-lg text-sm text-slate-300">
                We share release themes, design previews, and category thesis—ideal for data leaders and partners evaluating the control-plane
                layer.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href={`mailto:${MARKETING_CONTACT_EMAIL}?subject=${encodeURIComponent("Subscribe / briefing — Data Plier")}`}
                className="inline-flex justify-center rounded-full bg-ember px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-950/40 transition hover:bg-orange-500"
              >
                Request a briefing
              </a>
              <Link
                to="/signup"
                className="inline-flex justify-center rounded-full border border-white/25 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Open a workspace
              </Link>
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-12 lg:grid-cols-[1.15fr_repeat(4,minmax(0,1fr))]">
            <div><div className="flex items-center gap-2"><img src={brandLogo} alt="" className="h-9 w-9 rounded-lg" /><span className="text-lg font-semibold">Data Plier</span></div><p className="mt-4 max-w-sm text-sm text-slate-600">The intelligent control plane for enterprise data movement.</p><div className="mt-6 flex items-center gap-3"><a href={MARKETING_SOCIAL.linkedin} target="_blank" rel="noreferrer" className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600"><Linkedin className="h-5 w-5" /></a><a href={MARKETING_SOCIAL.instagram} target="_blank" rel="noreferrer" className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600"><Instagram className="h-5 w-5" /></a><a href={`mailto:${MARKETING_CONTACT_EMAIL}`} className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600"><Mail className="h-5 w-5" /></a></div></div>
            <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Platform</p><ul className="mt-4 space-y-2.5 text-sm text-slate-600"><li><Link to="/overview">Overview</Link></li><li><Link to="/product">Product</Link></li><li><Link to="/overview#security">Security &amp; trust</Link></li><li><Link to="/#how-it-works">How it works</Link></li><li><Link to="/philosophy">Philosophy</Link></li><li><Link to="/pricing">Pricing</Link></li></ul></div>
            <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Solutions</p><ul className="mt-4 space-y-2.5 text-sm text-slate-600"><li><Link to="/product#multi-cloud">Multi-cloud routing</Link></li><li><Link to="/product#ai-workloads">AI-ready pipelines</Link></li><li><Link to="/product#governance">Governance & lineage</Link></li><li><Link to="/#why-dataplier">Why Data Plier</Link></li></ul></div>
            <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Company</p><ul className="mt-4 space-y-2.5 text-sm text-slate-600"><li><Link to="/#investors">For investors</Link></li><li><a href={`mailto:${MARKETING_CONTACT_EMAIL}`}>Contact</a></li></ul></div>
            <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Account</p><ul className="mt-4 space-y-2.5 text-sm text-slate-600"><li><Link to="/login">Sign in</Link></li><li><Link to="/signup">Create account</Link></li></ul></div>
          </div>
        </div>
      </footer>
    </div>
  );
}
