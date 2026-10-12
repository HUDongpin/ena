import { createElement, type ReactNode } from "react";

export default function Link({
  href,
  children,
  prefetch: _prefetch,
  ...rest
}: {
  href: string;
  children?: ReactNode;
  prefetch?: boolean;
  [key: string]: unknown;
}) {
  return createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children);
}
