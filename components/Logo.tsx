import Image from "next/image";
import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import { siteConfig } from "@/lib/site";

interface LogoProps {
  locale: Locale;
  compact?: boolean;
  priority?: boolean;
}

export default function Logo({ locale, compact = false, priority = false }: LogoProps) {
  return (
    <Link
      href={`/${locale}`}
      className="brand-lockup focus-ring"
      aria-label={`${siteConfig.brandName} home`}
      dir="ltr"
    >
      <span className="brand-mark">
        <Image src="/ena-mark.svg" width={48} height={48} alt="" priority={priority} />
      </span>
      {!compact && (
        <span className="brand-type">
          <span className="brand-name">ENA</span>
          <span className="brand-description">{siteConfig.tagline}</span>
        </span>
      )}
    </Link>
  );
}
