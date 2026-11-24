import {
  DEFAULT_META_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  DEFAULT_PAGE_TITLE,
  SITE_NAME,
  SITE_ORIGIN
} from "../config/site";

const PAGE_JSONLD_ID = "data-plier-page-jsonld";

function metaBy(attr: "name" | "property", key: string): HTMLMetaElement {
  const sel = attr === "name" ? `meta[name="${key}"]` : `meta[property="${key}"]`;
  let el = document.head.querySelector(sel) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  return el;
}

function setMetaContent(attr: "name" | "property", key: string, content: string) {
  metaBy(attr, key).setAttribute("content", content);
}

function setCanonical(href: string) {
  let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }
  link.href = href;
}

function setPageJsonLd(graph: unknown[]) {
  if (graph.length === 0) {
    document.getElementById(PAGE_JSONLD_ID)?.remove();
    return;
  }
  let script = document.getElementById(PAGE_JSONLD_ID) as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement("script");
    script.id = PAGE_JSONLD_ID;
    script.type = "application/ld+json";
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": graph
  });
}

export type ApplyPageSeoInput = {
  title: string;
  description: string;
  /** Path only, e.g. `/overview` */
  canonicalPath: string;
  ogImage?: string;
  ogType?: string;
  /** e.g. `index, follow` or `noindex, nofollow` */
  robots?: string;
  /** Extra @graph nodes (WebPage, BreadcrumbList, etc.) */
  jsonLdGraph?: unknown[];
};

export function applyPageSeo(input: ApplyPageSeoInput) {
  const path = input.canonicalPath.startsWith("/") ? input.canonicalPath : `/${input.canonicalPath}`;
  const canonicalUrl = `${SITE_ORIGIN}${path === "//" ? "/" : path}`;
  const image = input.ogImage ?? DEFAULT_OG_IMAGE;
  const ogType = input.ogType ?? "website";
  const robots = input.robots ?? "index, follow";

  document.title = input.title;

  setMetaContent("name", "description", input.description);
  setMetaContent("name", "robots", robots);

  setMetaContent("property", "og:type", ogType);
  setMetaContent("property", "og:site_name", SITE_NAME);
  setMetaContent("property", "og:title", input.title);
  setMetaContent("property", "og:description", input.description);
  setMetaContent("property", "og:url", canonicalUrl);
  setMetaContent("property", "og:image", image);

  setMetaContent("name", "twitter:card", "summary_large_image");
  setMetaContent("name", "twitter:title", input.title);
  setMetaContent("name", "twitter:description", input.description);
  setMetaContent("name", "twitter:image", image);

  setCanonical(canonicalUrl);
  setPageJsonLd(input.jsonLdGraph ?? []);
}

/** Remove route-injected JSON-LD (global schema in index.html remains). */
export function removePageJsonLd() {
  document.getElementById(PAGE_JSONLD_ID)?.remove();
}

/** Restore defaults after leaving a section that used applyPageSeo (e.g. marketing → app). */
export function applyDefaultPublicSeo() {
  applyPageSeo({
    title: DEFAULT_PAGE_TITLE,
    description: DEFAULT_META_DESCRIPTION,
    canonicalPath: "/",
    robots: "index, follow",
    jsonLdGraph: []
  });
}
