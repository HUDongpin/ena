import { getLocaleMeta, type Locale } from "@/lib/i18n";
import type { OpenEnaAiLocale } from "@/lib/open-ena/ai-interpretation";
import { workspaceMessage } from "@/lib/open-ena/workspace-messages";

/** Disclose the AI output language when it differs from the workspace language. */
export default function OpenEnaFallbackNotice({ locale, outputLocale }: {
  locale: Locale;
  outputLocale: OpenEnaAiLocale;
}) {
  if (locale === outputLocale || outputLocale !== "en") return null;
  const { htmlLang, dir } = getLocaleMeta(locale);
  return <p lang={htmlLang} dir={dir}>{workspaceMessage(locale, "The generated interpretation will be in English.")}</p>;
}
