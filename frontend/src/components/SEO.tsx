import React from 'react';
import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string;
  canonical?: string;
  ogImage?: string;
  ogType?: string;
  noindex?: boolean;
  structuredData?: Record<string, any> | Record<string, any>[];
  breadcrumb?: Array<{ name: string; url: string }>;
}

const baseUrl = 'https://dataplier.com';

export const SEO: React.FC<SEOProps> = ({
  title = 'Data Plier | Intelligent data control plane',
  description = 'Data Plier is an enterprise data control plane: autonomous pipelines, parallel chunking, secure multi-cloud movement, lineage, governance, and observability for warehouses, lakes, and AI workloads.',
  keywords = 'data control plane, data pipeline, data movement, chunking, data orchestration, data lineage, data governance, Snowflake, Databricks, multi-cloud data, ETL, ELT, Data Plier',
  canonical,
  ogImage = '/favicon.png',
  ogType = 'website',
  noindex = false,
  structuredData,
  breadcrumb
}) => {
  const fullTitle = title.includes('Data Plier') ? title : `${title} | Data Plier`;
  const canonicalUrl = canonical ? `${baseUrl}${canonical}` : baseUrl;

  // Generate structured data
  const generateStructuredData = () => {
    const baseStructuredData: Record<string, any>[] = [
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        "@id": `${baseUrl}/#organization`,
        "name": "Data Plier",
        "url": baseUrl,
        "logo": `${baseUrl}/favicon.png`,
        "email": "hello@dataplier.com",
        "sameAs": [
          "https://www.linkedin.com/company/dataplier",
          "https://www.instagram.com/dataplier"
        ],
        "description": "Enterprise data control plane for autonomous pipelines, parallel chunking, multi-cloud routing, lineage, governance, and observability."
      },
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "@id": `${baseUrl}/#website`,
        "url": baseUrl,
        "name": "Data Plier",
        "inLanguage": "en-US",
        "publisher": { "@id": `${baseUrl}/#organization` }
      }
    ];

    // Add breadcrumb structured data if provided
    if (breadcrumb && breadcrumb.length > 0) {
      baseStructuredData.push({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": breadcrumb.map((item, index) => ({
          "@type": "ListItem",
          "position": index + 1,
          "name": item.name,
          "item": `${baseUrl}${item.url}`
        }))
      });
    }

    // Add custom structured data
    if (structuredData) {
      if (Array.isArray(structuredData)) {
        baseStructuredData.push(...structuredData);
      } else {
        baseStructuredData.push(structuredData);
      }
    }

    return baseStructuredData;
  };

  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      <meta name="author" content="Data Plier" />
      <meta name="robots" content={noindex ? 'noindex, nofollow' : 'index, follow'} />
      <meta name="theme-color" content="#f97316" />
      
      {/* Canonical URL */}
      <link rel="canonical" href={canonicalUrl} />
      
      {/* Favicon */}
      <link rel="icon" type="image/png" href="/favicon.png" />
      <link rel="apple-touch-icon" href="/favicon.png" />
      
      {/* Open Graph */}
      <meta property="og:type" content={ogType} />
      <meta property="og:site_name" content="Data Plier" />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:locale" content="en_US" />
      <meta property="og:image" content={`${baseUrl}${ogImage}`} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      
      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={`${baseUrl}${ogImage}`} />
      
      {/* Additional SEO Meta Tags */}
      <meta name="language" content="English" />
      <meta name="distribution" content="global" />
      <meta name="rating" content="general" />
      <meta name="revisit-after" content="7 days" />
      
      {/* Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify(generateStructuredData(), null, 2)}
      </script>
    </Helmet>
  );
};

// Predefined structured data schemas
export const structuredDataSchemas = {
  softwareApplication: {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web",
    "description": "Enterprise data control plane for autonomous pipelines, parallel chunking, multi-cloud routing, lineage, governance, and observability.",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD",
      "description": "Free trial and paid plans available"
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.8",
      "reviewCount": "127"
    }
  },
  
  service: {
    "@context": "https://schema.org",
    "@type": "Service",
    "name": "Data Control Plane Service",
    "description": "Autonomous data pipelines and governance for enterprise workloads",
    "provider": {
      "@type": "Organization",
      "name": "Data Plier"
    },
    "serviceType": "Data Management",
    "areaServed": "Worldwide"
  },
  
  article: (title: string, description: string, datePublished: string) => ({
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": title,
    "description": description,
    "datePublished": datePublished,
    "author": {
      "@type": "Organization",
      "name": "Data Plier"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Data Plier"
    }
  }),
  
  faqPage: (faqs: Array<{ question: string; answer: string }>) => ({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(faq => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer
      }
    }))
  })
};
