/**
 * Public site URL for canonicals, Open Graph, and JSON-LD.
 * Set `VITE_SITE_URL` in `.env` (e.g. https://dataplier.com) for production builds.
 */
const raw = typeof import.meta.env.VITE_SITE_URL === "string" ? import.meta.env.VITE_SITE_URL.trim() : "";

export const SITE_ORIGIN = raw ? raw.replace(/\/$/, "") : "https://dataplier.com";

export const SITE_NAME = "Data Plier";

export const DEFAULT_PAGE_TITLE = `${SITE_NAME} | Intelligent data control plane`;

/** Default meta description when no route-specific SEO is active (~155–160 chars). */
export const DEFAULT_META_DESCRIPTION =
  "Data Plier is an enterprise data control plane: autonomous pipelines, parallel chunking, secure multi-cloud movement, lineage, governance, and observability for warehouses, lakes, and AI workloads.";

export const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/favicon.png`;
