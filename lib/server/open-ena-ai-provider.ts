import type { OpenEnaAiInterpretationRequest } from "../open-ena/ai-interpretation";
import { getOpenEnaAiProviderDescriptor } from "../open-ena/ai-provider";
import { generateLunaInterpretation, LunaClientError, type DeepSeekClientOptions, type OpenEnaAiGenerationResult } from "./deepseek-client";
import { generateQwenInterpretation } from "./qwen-client";

/** One configured provider per request. Failure never falls through to another. */
export async function generateOpenEnaAiInterpretation(request: OpenEnaAiInterpretationRequest, options: DeepSeekClientOptions = {}): Promise<OpenEnaAiGenerationResult> {
  const environment = options.environment ?? process.env;
  let descriptor: ReturnType<typeof getOpenEnaAiProviderDescriptor>;
  try { descriptor = getOpenEnaAiProviderDescriptor(environment); }
  catch { throw new LunaClientError("invalid-configuration", "AI interpretation provider configuration is invalid."); }
  return descriptor.provider === "qwen"
    ? generateQwenInterpretation(request, { ...options, environment })
    : generateLunaInterpretation(request, { ...options, environment });
}
