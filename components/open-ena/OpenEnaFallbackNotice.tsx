import type { Locale } from "@/lib/i18n";
import { getOpenEnaFallbackNotice } from "@/lib/open-ena-i18n";

export default function OpenEnaFallbackNotice({ locale }: { locale: Locale }) {
  const notice = getOpenEnaFallbackNotice(locale);
  if (!notice) return null;

  return (
    <p className="open-ena-fallback-notice" role="note" lang="en" dir="ltr">
      {notice}
    </p>
  );
}
