import Link from "next/link";

export default function HomeHeader({ homeHref, aboutHref }: { homeHref: string; aboutHref: string }) {
  return (
    <header className="site-header">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <div className="site-header-inner">
        <Link className="site-brand" href={homeHref} prefetch={false} aria-label="Open ENA home">
          <picture className="brand-logo">
            <source media="(max-width: 480px)" srcSet="/unified-home/logo-open-ena-compact.svg" />
            <img src="/unified-home/logo-open-ena.svg" alt="Open ENA — Epistemic Network Analysis" width="250" height="80" fetchPriority="high" />
          </picture>
        </Link>
        <nav className="site-nav" aria-label="Primary navigation">
          <Link href={homeHref} prefetch={false} aria-current="page">Open ENA</Link>
          <Link href={aboutHref} prefetch={false}>About</Link>
        </nav>
      </div>
    </header>
  );
}
