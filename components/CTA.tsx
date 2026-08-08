import Link from "next/link";
import type { ReactNode } from "react";

interface CTAProps {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  external?: boolean;
}

export default function CTA({
  href,
  children,
  variant = "primary",
  external = false,
}: CTAProps) {
  const className = `button button-${variant} focus-ring`;

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {children}
        <span aria-hidden="true">↗</span>
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
