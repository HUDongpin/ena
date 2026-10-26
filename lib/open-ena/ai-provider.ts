export type OpenEnaAiProvider = "deepseek" | "qwen";
export type OpenEnaAiProviderDescriptor = { provider: OpenEnaAiProvider; displayName: string; model: string; processingRegion: "cn-beijing" | "provider-managed" };
export const OPEN_ENA_AI_PROVIDER_CONSENT_HEADER = "x-open-ena-ai-provider-consent";
export function openEnaAiProviderConsentKey(descriptor: { provider: string; model: string; processingRegion: string }): string {
  return `provider-v1:${descriptor.provider}:${descriptor.model}:${descriptor.processingRegion}`;
}
export function getOpenEnaAiProviderDescriptor(environment: Readonly<Record<string, string | undefined>> = {}): OpenEnaAiProviderDescriptor {
  const provider = environment.OPEN_ENA_AI_PROVIDER?.trim() || "deepseek";
  if (provider !== "deepseek" && provider !== "qwen") throw new Error("Invalid Open ENA AI provider configuration.");
  const model = provider === "qwen" ? "qwen3.7-plus-2026-05-26" : "deepseek-flash";
  if (environment.OPEN_ENA_AI_MODEL?.trim() && environment.OPEN_ENA_AI_MODEL.trim() !== model) throw new Error("Invalid Open ENA AI provider configuration.");
  return { provider, displayName: provider === "qwen" ? "Alibaba Cloud Model Studio · Qwen" : "DeepSeek", model, processingRegion: provider === "qwen" ? "cn-beijing" : "provider-managed" };
}
