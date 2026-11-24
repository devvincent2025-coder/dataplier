import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { SITE_NAME, SITE_ORIGIN } from "../../config/site";
import { applyDefaultPublicSeo, applyPageSeo, removePageJsonLd } from "../../lib/seoDocument";

type Crumb = { name: string; path: string };

type Entry = {
  title: string;
  description: string;
  breadcrumbs: Crumb[];
};

const MARKETING_SEO: Record<string, Entry> = {
  "/": {
    title: `${SITE_NAME} | Intelligent data control plane for multi-cloud data`,
    description:
      "Data Plier orchestrates autonomous pipelines, parallel data chunking, and governed movement across Snowflake, Databricks, lakes, and streams—with security, lineage, and observability built in.",
    breadcrumbs: [{ name: "Home", path: "/" }]
  },
  "/overview": {
    title: `What is ${SITE_NAME}? | Overview & control plane concepts`,
    description:
      "Learn what Data Plier is: a data movement and orchestration control plane for engineers and leaders—when to use it, security posture, capabilities, and how it fits your stack.",
    breadcrumbs: [
      { name: "Home", path: "/" },
      { name: "Overview", path: "/overview" }
    ]
  },
  "/product": {
    title: `${SITE_NAME} Product | Universal router, chunking, AI-ready paths`,
    description:
      "Product capabilities: intelligent multi-cloud routing, smart chunk teleportation, autonomous pipelines, schema translation, lineage, snapshots, and enterprise observability.",
    breadcrumbs: [
      { name: "Home", path: "/" },
      { name: "Product", path: "/product" }
    ]
  },
  "/philosophy": {
    title: `Grip · Cut · Twist · Pull | ${SITE_NAME} philosophy`,
    description:
      "How Data Plier thinks about data operations: secure the problem, remove waste, reorient fast, and extract value—outcomes over tool sprawl.",
    breadcrumbs: [
      { name: "Home", path: "/" },
      { name: "Philosophy", path: "/philosophy" }
    ]
  },
  "/pricing": {
    title: `Pricing | ${SITE_NAME} plans & access`,
    description:
      "Data Plier pricing and access options for teams through enterprise—start a trial, compare plans, and scale governed data movement.",
    breadcrumbs: [
      { name: "Home", path: "/" },
      { name: "Pricing", path: "/pricing" }
    ]
  }
};

function buildJsonLd(pathname: string, title: string, description: string, breadcrumbs: Crumb[]) {
  const url = `${SITE_ORIGIN}${pathname}`;
  const webpage: Record<string, unknown> = {
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: title,
    description,
    isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
    about: { "@id": `${SITE_ORIGIN}/#software` }
  };

  const graph: unknown[] = [webpage];

  if (breadcrumbs.length > 1) {
    webpage.breadcrumb = { "@id": `${url}#breadcrumb` };
    graph.push({
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: breadcrumbs.map((b, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: b.name,
        item: `${SITE_ORIGIN}${b.path.startsWith("/") ? b.path : `/${b.path}`}`
      }))
    });
  }

  return graph;
}

export function MarketingPageSeo() {
  const { pathname } = useLocation();

  useEffect(() => {
    const entry = MARKETING_SEO[pathname];
    if (!entry) {
      removePageJsonLd();
      return;
    }

    applyPageSeo({
      title: entry.title,
      description: entry.description,
      canonicalPath: pathname,
      jsonLdGraph: buildJsonLd(pathname, entry.title, entry.description, entry.breadcrumbs)
    });

    return () => {
      removePageJsonLd();
      applyDefaultPublicSeo();
    };
  }, [pathname]);

  return null;
}
