import type { UserSession } from "../lib/api";

type DashboardData = {
  metrics: { name: string; value: string }[];
  autonomousGoals: string[];
  transferSeries: { name: string; value: number }[];
  routingInsights: string[];
  health: string[];
  highlights: string[];
};

export function buildDashboardData(user: UserSession | null): DashboardData {
  const company = user?.company || "your company";
  const workspace = user?.workspace_name || "your workspace";
  const plan = user?.plan || "starter";
  const role = user?.role || "viewer";
  const trialLabel = user?.trial_status === "active" ? "Trial active" : "Subscription inactive";

  const baseVolume = company.toLowerCase().includes("coca") ? 24.6 : 18.4;
  const runningJobs = role === "admin" ? 11 : 7;
  const activePipelines = plan === "enterprise" ? 58 : plan === "growth" ? 26 : 6;

  return {
    metrics: [
      { name: `${company} Pipelines`, value: `${activePipelines}` },
      { name: "Transferred Today", value: `${baseVolume.toFixed(1)} TB` },
      { name: "Running Jobs", value: `${runningJobs}` },
      { name: "Access State", value: trialLabel }
    ],
    autonomousGoals: [
      `Make governed customer data available for ${company}'s fraud and risk workflows.`,
      `Route high-volume operational events from ${workspace} into AI-ready analytics layers.`,
      `Publish company-approved reporting datasets into downstream warehouse and model pipelines.`
    ],
    transferSeries: [
      { name: "00:00", value: Math.round(baseVolume * 6) },
      { name: "06:00", value: Math.round(baseVolume * 11) },
      { name: "12:00", value: Math.round(baseVolume * 14) },
      { name: "18:00", value: Math.round(baseVolume * 18) },
      { name: "24:00", value: Math.round(baseVolume * 15) }
    ],
    routingInsights: [
      `Best route for ${company}: source warehouse -> adaptive chunk engine -> governed destination`,
      `Recommended chunk target for ${workspace}: ${plan === "enterprise" ? 512 : 256} MB compressed`,
      `Session role ${role} can monitor company-scoped data flows and routed jobs`
    ],
    health: [
      `Worker utilization for ${company}: ${plan === "enterprise" ? 82 : 74}%`,
      `Queue backlog in ${workspace}: ${plan === "enterprise" ? 212 : 128} chunks`,
      `Average pipeline latency: ${plan === "enterprise" ? 72 : 96}s`,
      `Transfer success rate for current tenant: ${plan === "enterprise" ? 99.6 : 99.2}%`
    ],
    highlights: [
      `${company} workspace: ${workspace}`,
      `Current plan: ${plan}`,
      `Signed in as ${user?.full_name || "Workspace User"}`,
      `Role-scoped views active for ${role}`
    ]
  };
}
