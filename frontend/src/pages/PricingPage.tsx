import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";

import { authApi } from "../lib/api";
import { useSessionStore } from "../store/session";
import { SEO, structuredDataSchemas } from "../components/SEO";

export function PricingPage() {
  const navigate = useNavigate();
  const { user } = useSessionStore();
  
  // Mock pricing plans for static deployment
  const mockPlans = [
    {
      id: "starter",
      name: "Starter",
      description: "Perfect for small teams getting started with data control plane",
      price: "$0",
      period: "free forever",
      features: [
        "Up to 5 data connections",
        "Basic pipeline orchestration",
        "Community support",
        "1GB data transfer/month"
      ],
      recommended: false
    },
    {
      id: "professional",
      name: "Professional", 
      description: "For growing teams that need advanced data orchestration",
      price: "$299",
      period: "per month",
      features: [
        "Unlimited data connections",
        "Advanced pipeline orchestration",
        "Parallel chunking & optimization",
        "Priority support",
        "100GB data transfer/month",
        "Advanced lineage & governance"
      ],
      recommended: true
    },
    {
      id: "enterprise",
      name: "Enterprise",
      description: "Custom solutions for large-scale data operations",
      price: "Custom",
      period: "contact us",
      features: [
        "Unlimited everything",
        "Custom integrations",
        "Dedicated support team",
        "SLA guarantees",
        "On-premise deployment options",
        "Advanced security features"
      ],
      recommended: false
    }
  ];

  async function handleStartTrial(planId: string) {
    // For static deployment, redirect to signup
    navigate("/signup");
  }

  return (
    <>
      <SEO
        title="Pricing Plans | Data Control Plane Pricing | Data Plier"
        description="Choose the control plane that fits your data estate. Start with a free trial, then scale into governed routing, lineage, and autonomous data movement across clouds and AI systems."
        keywords="data control plane pricing, enterprise data platform pricing, data pipeline pricing, multi-cloud data costs, data governance pricing, Data Plier pricing plans"
        structuredData={[
          {
            "@context": "https://schema.org",
            "@type": "WebPage",
            "@id": "https://dataplier.com/pricing#webpage",
            "url": "https://dataplier.com/pricing",
            "name": "Pricing Plans - Data Control Plane Pricing",
            "description": "View Data Plier's pricing plans for enterprise data control plane features.",
            "isPartOf": { "@id": "https://dataplier.com/#website" },
            "about": [
              { "@type": "Thing", "name": "Data Control Plane Pricing" },
              { "@type": "Thing", "name": "Enterprise Data Platform" },
              { "@type": "Thing", "name": "Data Pipeline Pricing" }
            ]
          },
          structuredDataSchemas.service
        ]}
        breadcrumb={[
          { name: "Home", url: "/" },
          { name: "Pricing", url: "/pricing" }
        ]}
      />
      <div className="min-h-screen px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <p className="text-sm uppercase tracking-[0.3em] text-teal">Pricing And Access</p>
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-4xl font-semibold">Choose the control plane that fits your data estate.</h1>
            <p className="mt-3 max-w-3xl text-slate-600">Start with a free trial, then scale into governed routing, lineage, and autonomous data movement across clouds and AI systems.</p>
          </div>
          <div className="rounded border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            {user ? `Current plan: ${user.plan} (${user.subscription_state})` : "No active session. Sign up to start a trial."}
          </div>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {mockPlans.map((plan: any) => (
            <article key={plan.id} className={`rounded border p-6 ${plan.recommended ? "border-ember bg-orange-50" : "border-slate-200 bg-white"}`}>
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">{plan.name}</h2>
                {plan.recommended ? <span className="rounded-full bg-ember px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white">Recommended</span> : null}
              </div>
              <p className="mt-4 text-sm text-slate-600">{plan.description}</p>
              <p className="mt-6 text-4xl font-semibold">{plan.price}<span className="text-sm text-slate-500">/{plan.period}</span></p>
              <p className="mt-2 text-sm text-teal">14-day free trial</p>
              <ul className="mt-6 space-y-3 text-sm text-slate-700">
                {plan.features.map((feature: any) => (
                  <li key={feature} className="flex items-start gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ember" />
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handleStartTrial(plan.id)}
                className="mt-8 w-full rounded bg-ember px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600"
              >
                Get Started
              </button>
            </article>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap gap-4 text-sm text-slate-600">
          <Link className="text-teal hover:text-ember" to="/signup">
            Create account
          </Link>
          <Link className="text-teal hover:text-ember" to="/login">
            Sign in
          </Link>
        </div>
      </div>
    </div>
    </>
  );
}
