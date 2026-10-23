import Image from "next/image";
import Link from "next/link";

interface LogoProps {
  href: string;
  priority?: boolean;
}

export default function Logo({ href, priority = false }: LogoProps) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="brand-lockup focus-ring"
      aria-label="Open ENA home"
      dir="ltr"
    >
      <Image
        className="brand-wordmark"
        src="/unified-home/logo-open-ena.svg"
        width={250}
        height={80}
        alt="Open ENA — Epistemic Network Analysis"
        priority={priority}
      />
    </Link>
  );
}
