import type { Locale } from "@/lib/i18n";
import { workspaceMessage } from "@/lib/open-ena/workspace-messages";
import { getPluginLabCopy } from "@/lib/plugin-lab/i18n";

export default function PluginCollaborationNotice({ locale, className }: { locale: Locale; className?: string }) {
  const copy = getPluginLabCopy(locale);
  const message = (text: string) => copy.contentFallback ? workspaceMessage(locale, text) : text;
  return <p className={className}>
    {message(copy.loginInvitation)}{" "}{message(copy.loginCollaborationPrefix)}{" "}
    <a href="mailto:hudongpin@126.com">Dr. Peter Hu</a>{" "}{message(copy.loginCollaborationJoiner)}{" "}
    <a href="mailto:sandy0692@gmail.com">Dr. Sandy Tu</a>.
  </p>;
}
