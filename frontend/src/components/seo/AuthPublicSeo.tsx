import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { SITE_NAME } from "../../config/site";
import { applyPageSeo, removePageJsonLd } from "../../lib/seoDocument";

const AUTH_SEO: Record<string, { title: string; description: string }> = {
  "/login": {
    title: `Sign in | ${SITE_NAME}`,
    description: `Sign in to your ${SITE_NAME} workspace to manage connections, pipelines, jobs, and governed data movement.`
  },
  "/signup": {
    title: `Create account | ${SITE_NAME}`,
    description: `Create a ${SITE_NAME} account to start building autonomous pipelines, parallel chunk transfers, and multi-cloud data movement.`
  },
  "/forgot-password": {
    title: `Reset password | ${SITE_NAME}`,
    description: `Reset your ${SITE_NAME} account password securely.`
  }
};

export function AuthPublicSeo() {
  const { pathname } = useLocation();

  useEffect(() => {
    const entry = AUTH_SEO[pathname];
    if (!entry) {
      removePageJsonLd();
      return;
    }

    applyPageSeo({
      title: entry.title,
      description: entry.description,
      canonicalPath: pathname,
      robots: "noindex, nofollow",
      jsonLdGraph: []
    });

    return () => {
      removePageJsonLd();
    };
  }, [pathname]);

  return null;
}
