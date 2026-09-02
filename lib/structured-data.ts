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

export function learningResourceJsonLd(input: {
  name: string;
  description: string;
  datePublished: string;
  educationalLevel: string;
  teaches: string[];
  keywords: string[];
  durationMinutes: number;
  url: string;
  sourceUrls: string[];
  steps: Array<{ name: string; text: string }>;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "LearningResource",
    name: input.name,
    description: input.description,
    learningResourceType: "Tutorial",
    educationalLevel: input.educationalLevel,
    teaches: input.teaches,
    keywords: input.keywords,
    timeRequired: `PT${input.durationMinutes}M`,
    datePublished: input.datePublished,
    dateModified: input.datePublished,
    inLanguage: "en",
    isAccessibleForFree: true,
    author: { "@type": "Organization", name: "ENA.HK Academy", url: "https://www.ena.hk" },
    publisher: { "@type": "Organization", name: "ENA.HK", url: "https://www.ena.hk" },
    citation: input.sourceUrls,
    hasPart: input.steps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.name,
      text: step.text,
    })),
    mainEntityOfPage: { "@type": "WebPage", "@id": input.url },
    url: input.url,
  };
}

export function pluginSoftwareApplicationJsonLd(input: {
  plugin: OpenEnaPluginManifestV1;
  locale: string;
  name: string;
  description: string;
}) {
  const { plugin } = input;
  const contentLocale = input.locale === "zh-hant" || input.locale === "zh-hans" ? input.locale : "en";
  const url = `https://www.ena.hk/${encodeURIComponent(input.locale)}/plugins/${plugin.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: input.name,
    description: input.description,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    applicationCategory: "ResearchApplication",
    applicationSubCategory: plugin.contributionKinds,
    operatingSystem: "Web",
    softwareVersion: plugin.version,
    releaseNotes: plugin.changelog[0]?.summary[contentLocale],
    dateModified: plugin.engineeringAssurance.lastReviewed,
    inLanguage: input.locale,
    isAccessibleForFree: true,
    codeRepository: plugin.source.repository,
    license: plugin.licenses.code === "GPL-3.0-only"
      ? "https://spdx.org/licenses/GPL-3.0-only.html"
      : plugin.licenses.code,
    author: plugin.authors.map((author) => ({ "@type": "Person", name: author.name })),
    maintainer: { "@type": "Person", name: plugin.maintainer.name },
    featureList: plugin.scientificBoundary.claims,
    softwareRequirements: [
      `Open ENA Core API ${plugin.compatibility.coreApi}`,
      `jENA ${plugin.compatibility.jenaVersions.join(", ")}`,
      `${plugin.compatibility.minimumDimensions} fitted dimensions minimum`,
    ],
    citation: plugin.citation,
  };
}
import type { OpenEnaPluginManifestV1 } from "@/lib/open-ena/plugins/types";
