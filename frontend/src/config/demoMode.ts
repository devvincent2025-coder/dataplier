/**
 * End-to-end UI testing without a live API gateway.
 *
 * Set in `.env.local`:
 *   VITE_USE_DEMO_DATA=true
 *
 * Then sign in with:
 *   Email: demo@dataplier.com
 *   Password: demo1234
 *
 * Tenant, routing, and governance calls use in-memory fixtures (see `lib/demoBackend.ts`).
 * Set to false or remove the env var to use the real backend again.
 */
export const USE_DEMO_DATA =
  import.meta.env.VITE_USE_DEMO_DATA === "true" || import.meta.env.VITE_USE_DEMO_DATA === "1";

export const DEMO_AUTH_EMAIL = "demo@dataplier.com";
export const DEMO_AUTH_PASSWORD = "demo1234";
/** Bearer token issued only in demo mode — never used by production APIs. */
export const DEMO_BEARER_TOKEN = "dp-demo-local-e2e-token";

/** True for the primary demo session or invite-accept demo sessions (`dp_demo_i_*`). */
export function isDemoBearerToken(token: string | null | undefined): boolean {
  return Boolean(
    USE_DEMO_DATA && token && (token === DEMO_BEARER_TOKEN || token.startsWith("dp_demo_i_"))
  );
}
