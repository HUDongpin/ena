/** Safe, finite provider failure details shared by the worker and persistence layer. */
export const NOVA_PROVIDER_FAILURE_MESSAGES = {
  'server-only': 'Nova providers can only run on the server',
  'cancelled': 'Run was cancelled or its lease ended',
  'provider-unconfigured': 'The selected provider is not configured correctly',
  'context-limit': 'Draft context limit exceeded',
  'http-error': 'Provider request failed',
  'missing-response-body': 'Provider response body was missing',
  'invalid-json': 'Provider returned invalid event JSON',
  'invalid-envelope': 'Provider returned an invalid event envelope',
  'invalid-choice': 'Provider returned an invalid response choice',
  'invalid-delta': 'Provider returned an invalid response delta',
  'invalid-content': 'Provider returned invalid content data',
  'invalid-reasoning': 'Provider returned invalid reasoning data',
  'invalid-tool-calls': 'Provider returned invalid tool call data',
  'invalid-tool-index': 'Provider returned an invalid tool call index',
  'invalid-tool-id': 'Provider returned an invalid tool call ID',
  'conflicting-tool-id': 'Provider returned conflicting tool call IDs',
  'invalid-tool-type': 'Provider returned an invalid tool call type',
  'invalid-tool-function': 'Provider returned invalid tool function data',
  'invalid-tool-name': 'Provider returned an invalid tool function name',
  'invalid-tool-arguments': 'Provider returned invalid tool arguments',
  'missing-tool-id': 'Provider completed a tool call without an ID',
  'duplicate-tool-id': 'Provider completed tool calls with duplicate IDs',
  'oversized-tool-id': 'Provider completed a tool call with an oversized ID',
  'unknown-tool': 'Provider requested an unknown tool',
  'empty-response': 'Provider completed an empty response',
  'stream-incomplete': 'Provider response was truncated or incomplete',
  'output-token-limit': 'Provider response was truncated by the output token limit',
  'unsupported-finish-reason': 'Provider returned an unsupported completion reason',
  'refusal': 'Provider declined to complete the response',
  'response-limit': 'Provider response size limit exceeded',
  'tool-arguments-limit': 'Provider tool arguments size limit exceeded',
  'timeout': 'Provider request timed out',
  'network': 'Provider request could not be completed',
} as const;

export type NovaProviderFailureReason = keyof typeof NOVA_PROVIDER_FAILURE_MESSAGES;
export interface NovaProviderDiagnostic {
  readonly reason: NovaProviderFailureReason;
  readonly stage: 'request' | 'stream' | 'completion';
  readonly responseBytes: number;
  readonly eventCount: number;
  readonly toolIndex?: number;
  readonly httpStatus?: number;
}

/** Project onto the allowlist; never retain provider payloads or unbounded metadata. */
export function sanitizeNovaProviderDiagnostic(value:unknown):NovaProviderDiagnostic|undefined {
  if(typeof value!=='object'||value===null||Array.isArray(value))return undefined;
  const input=value as Record<string,unknown>;
  if(typeof input.reason!=='string'||!Object.hasOwn(NOVA_PROVIDER_FAILURE_MESSAGES,input.reason))return undefined;
  if(input.stage!=='request'&&input.stage!=='stream'&&input.stage!=='completion')return undefined;
  if(typeof input.responseBytes!=='number'||!Number.isSafeInteger(input.responseBytes)||input.responseBytes<0||typeof input.eventCount!=='number'||!Number.isSafeInteger(input.eventCount)||input.eventCount<0)return undefined;
  return Object.freeze({
    reason:input.reason as NovaProviderFailureReason,
    stage:input.stage,
    responseBytes:Math.min(input.responseBytes,2_000_001),
    eventCount:Math.min(input.eventCount,2_000_001),
    ...(typeof input.toolIndex==='number'&&Number.isInteger(input.toolIndex)&&input.toolIndex>=0&&input.toolIndex<=7?{toolIndex:input.toolIndex}:{}),
    ...(typeof input.httpStatus==='number'&&Number.isInteger(input.httpStatus)&&input.httpStatus>=100&&input.httpStatus<=599?{httpStatus:input.httpStatus}:{}),
  });
}
