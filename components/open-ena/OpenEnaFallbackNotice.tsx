import { getLocaleMeta, type Locale } from "@/lib/i18n";
import { getOpenEnaFallbackNotice } from "@/lib/open-ena-i18n";

export default function OpenEnaFallbackNotice({ locale }: { locale: Locale }) {
  const notice = getOpenEnaFallbackNotice(locale);
  if (!notice) return null;
  const meta = getLocaleMeta(locale);

  return (
    <p
      className="open-ena-fallback-notice"
      data-testid="open-ena-fallback-notice"
      role="note"
      lang={meta.htmlLang}
      dir={meta.dir}
    >
      {notice}
    </p>
  );
}
