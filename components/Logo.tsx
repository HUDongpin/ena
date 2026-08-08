import Image from "next/image";
import Link from "next/link";
import type { Locale } from "@/lib/i18n";

interface LogoProps {
  locale: Locale;
  compact?: boolean;
}

export default function Logo({ locale, compact = false }: LogoProps) {
  return (
    <Link href={`/${locale}`} className="brand-lockup focus-ring" aria-label="ENA home">
      <span className="brand-mark">
        <Image src="/ena-mark.svg" width={48} height={48} alt="" priority />
      </span>
      {!compact && (
        <span className="brand-type" dir="ltr">
          <span className="brand-name">ENA</span>
          <span className="brand-description">Epistemic Network Analysis</span>
        </span>
      )}
    </Link>
  );
}
