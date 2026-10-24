"use client";

import { useState, type ComponentProps } from "react";
import type { Locale } from "@/lib/i18n";
import { isOpenEnaLocalizedLocale } from "@/lib/open-ena-i18n";
import OpenEnaWorkspace from "./OpenEnaWorkspace";
import OpenEnaCloudProjects from "./OpenEnaCloudProjects";

type Props = Omit<ComponentProps<typeof OpenEnaWorkspace>, "locale" | "onLocaleChange"> & {
  initialLocale: Locale;
  accountId?: string;
  accountEmail?: string;
};

/** Locale belongs to this mounted session, above cloud project replacement. */
export default function OpenEnaWorkspaceSession({ initialLocale, accountId, accountEmail, ...props }: Props) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const onLocaleChange = (next: Locale) => { if (isOpenEnaLocalizedLocale(next)) setLocale(next); };
  return accountId
    ? <OpenEnaCloudProjects {...props} accountId={accountId} accountEmail={accountEmail} locale={locale} onLocaleChange={onLocaleChange} />
    : <OpenEnaWorkspace {...props} locale={locale} onLocaleChange={onLocaleChange} />;
}
