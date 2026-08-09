export function personJsonLd(input: {
  name: string;
  url: string;
  jobTitle?: string;
  description?: string;
  image?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: input.name,
    url: input.url,
    ...(input.jobTitle ? { jobTitle: input.jobTitle } : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(input.image ? { image: input.image } : {}),
  };
}

export function organizationJsonLd(input: {
  name: string;
  url: string;
  description?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: input.name,
    url: input.url,
    ...(input.description ? { description: input.description } : {}),
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; url: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function reviewArticleJsonLd(input: {
  headline: string;
  description: string;
  sourceAuthors: string[];
  datePublished: string;
  image: string;
  keywords: string[];
  url: string;
  doi: string;
  sourceUrl: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: input.headline,
    description: input.description,
    author: {
      "@type": "Organization",
      name: "ENA.HK Editorial Team",
      url: "https://www.ena.hk",
    },
    datePublished: input.datePublished,
    dateModified: input.datePublished,
    image: input.image,
    keywords: input.keywords,
    inLanguage: "en",
    isAccessibleForFree: true,
    publisher: { "@type": "Organization", name: "ENA.HK", url: "https://www.ena.hk" },
    citation: input.sourceUrl,
    isBasedOn: {
      "@type": "ScholarlyArticle",
      author: input.sourceAuthors.map((name) => ({ "@type": "Person", name })),
      identifier: {
        "@type": "PropertyValue",
        propertyID: "DOI",
        value: input.doi,
      },
      url: input.sourceUrl,
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": input.url },
    url: input.url,
  };
}
