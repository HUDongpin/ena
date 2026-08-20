import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import { getDictionary, getLocaleMeta, isLocale, locales, type Locale } from "@/lib/i18n";
import { siteConfig } from "@/lib/site";
import { organizationJsonLd, personJsonLd } from "@/lib/structured-data";

interface AboutPageProps {
  params: Promise<{ locale: string }>;
}

const productLinks = {
  MAIS: { href: "https://mais.ac", label: "mais.ac" },
  CAIS: { href: "https://www.cais.hk", label: "cais.hk" },
  UAIS: { href: "https://uais.top", label: "uais.top" },
} as const;

const profileLinks = [
  { name: "Hu Dongpin", label: "hudongpin.com", href: "https://www.hudongpin.com", logo: "hudongpin" },
  { name: "PedaNova", label: "pedanova.tech", href: "https://www.pedanova.tech", logo: "pedanova" },
  { name: "MAIS", label: "mais.ac", href: "https://mais.ac", logo: "mais" },
  { name: "CAIS", label: "cais.hk", href: "https://www.cais.hk", logo: "cais" },
  { name: "UAIS", label: "uais.top", href: "https://uais.top", logo: "uais" },
] as const;

type ProfileLogo = (typeof profileLinks)[number]["logo"];

export async function generateMetadata({ params }: AboutPageProps): Promise<Metadata> {
  const { locale } = await params;
  const typedLocale = isLocale(locale) ? locale : "en";
  const dictionary = getDictionary(typedLocale);
  const url = `/${typedLocale}/about`;

  return {
    title: { absolute: `${dictionary.nav.about} | ${siteConfig.brandName}` },
    description: dictionary.about.personText,
    alternates: {
      canonical: url,
      languages: Object.fromEntries(
        locales.map((item) => [getLocaleMeta(item).htmlLang, `/${item}/about`])
      ),
    },
    openGraph: {
      type: "profile",
      title: `${dictionary.about.title} | ${siteConfig.brandName}`,
      description: dictionary.about.personText,
      url,
      siteName: siteConfig.brandName,
      locale: getLocaleMeta(typedLocale).htmlLang,
      images: [{ url: "/images/about/dr-peter-hu-dongpin.png", width: 640, height: 640, alt: "Dr. Peter Hu Dongpin" }],
    },
  };
}

function ProfileLogoMark({ logo }: { logo: ProfileLogo }) {
  if (logo === "pedanova") {
    return <img src="/logos/pedanova-mark-transparent.png" alt="" aria-hidden="true" />;
  }

  if (logo === "cais") {
    return <img src="/logos/cais-logo-wave-hd.svg" alt="" aria-hidden="true" />;
  }

  if (logo === "uais") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <rect width="48" height="48" rx="15" fill="#4e8bf5" />
        <path d="M19 13 22.6 23.4 33 27l-10.4 3.6L19 41l-3.6-10.4L5 27l10.4-3.6L19 13Z" fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.6" />
        <path d="M32.5 10.5v7M29 14h7M39 18v4M37 20h4" stroke="#fff" strokeLinecap="round" strokeWidth="2.3" />
      </svg>
    );
  }

  if (logo === "mais") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="21" fill="#fff" stroke="#1f293d" strokeWidth="2" />
        <path d="M9.5 32.2 18.6 12.6 24 25.4 29.4 12.6 38.5 32.2" fill="none" stroke="#89cff0" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4.2" />
        <path d="M13.6 31.3c7-3.5 13.8-3.5 20.8 0" fill="none" stroke="#f07c4c" strokeLinecap="round" strokeWidth="2.8" />
      </svg>
    );
  }

  return (
    <span className="ph-link-mark" aria-hidden="true">
      <svg viewBox="0 0 44 44">
        <path d="M10 29c6-10 13 0 22-15" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" />
        <circle cx="32" cy="14" r="2.5" fill="#89cff0" />
      </svg>
      <span>PH</span>
    </span>
  );
}

export default async function AboutPage({ params }: AboutPageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const typedLocale = locale as Locale;
  const dictionary = getDictionary(typedLocale);
  const structuredData = [
    personJsonLd({
      name: "Dr. Peter Hu Dongpin",
      url: "https://www.hudongpin.com",
      jobTitle: dictionary.about.principalLabel,
      description: dictionary.about.personText,
      image: `${siteConfig.url}/images/about/dr-peter-hu-dongpin.png`,
    }),
    organizationJsonLd({
      name: "PedaNova Ed-Tech",
      url: "https://www.pedanova.tech",
      description: dictionary.about.companyText,
    }),
    ...dictionary.about.products.map((product) =>
      organizationJsonLd({
        name: product.name,
        url: productLinks[product.name].href,
        description: product.text,
      })
    ),
  ];

  return (
    <div className="about-profile-page">
      <JsonLd data={structuredData} />

      <section className="container about-profile-hero">
        <p className="eyebrow">{dictionary.about.eyebrow}</p>
        <h1>{dictionary.about.title}</h1>
        <p>{dictionary.about.intro}</p>
      </section>

      <section className="container about-profile-grid">
        <article className="about-card person-card">
          <div className="person-heading">
            <div className="person-photo-wrap">
              <Image
                src="/images/about/dr-peter-hu-dongpin.png"
                alt="Dr. Peter Hu Dongpin"
                width={80}
                height={80}
                priority
                className="person-photo"
              />
              <span className="person-badge" aria-hidden="true">PH</span>
            </div>
            <div>
              <p className="about-label">{dictionary.about.principalLabel}</p>
              <h2>{dictionary.about.personTitle}</h2>
            </div>
          </div>
          <p className="person-copy">{dictionary.about.personText}</p>
          <div className="focus-panel">
            <h3>{dictionary.about.focusTitle}</h3>
            <div className="focus-grid">
              {dictionary.about.focusItems.map((item, index) => (
                <div key={item} className="focus-item">
                  <span className="focus-number" aria-hidden="true">0{index + 1}</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="about-card company-card">
          <p className="about-label">{dictionary.about.companyTitle}</p>
          <div className="company-heading">
            <span className="company-mark" aria-hidden="true">
              <img src="/logos/pedanova-mark-transparent.png" alt="" />
            </span>
            <h2>PedaNova</h2>
          </div>
          <p className="company-copy">{dictionary.about.companyText}</p>
          <p className="about-label products-label">{dictionary.about.productsTitle}</p>
          <div className="product-grid" aria-label={dictionary.about.productsTitle}>
            {dictionary.about.products.map((product) => {
              const link = productLinks[product.name];
              return (
                <a
                  key={product.name}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="product-card focus-ring"
                >
                  <h3>{product.name}</h3>
                  <p>{product.text}</p>
                  <span>{link.label}<span aria-hidden="true"> ↗</span></span>
                  <span className="sr-only">{dictionary.common.externalLink}</span>
                </a>
              );
            })}
          </div>
        </article>
      </section>

      <section className="container about-links-section">
        <h2>{dictionary.about.linksTitle}</h2>
        <div className="profile-links-grid">
          {profileLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="profile-link focus-ring"
            >
              <span className="profile-link-logo"><ProfileLogoMark logo={link.logo} /></span>
              <span className="profile-link-copy">
                <strong>{link.name}</strong>
                <span>{link.label}</span>
              </span>
              <span className="profile-link-arrow" aria-hidden="true">↗</span>
              <span className="sr-only">{dictionary.common.externalLink}</span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
