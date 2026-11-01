export type NovaEffort = "low" | "medium" | "high" | "xhigh";
export type NovaModelKey = "qwen-flash" | "qwen-max" | "deepseek-flash" | "deepseek-pro";
export type NovaProvider = "qwen" | "deepseek";
export interface NovaModel {
  key: NovaModelKey; provider: NovaProvider; label: string; apiModel: string; version: string;
  available: boolean; unavailableReason?: string;
}
export type NovaRunStatus = "queued" | "planning" | "building" | "testing" | "waiting-user" | "waiting-expert" | "ready" | "failed" | "cancelled";
export interface NovaMessage { id: string; role: "user" | "assistant" | "expert" | "system"; content: string; createdAt: string; runId?: string }
export interface NovaFile { path: string; content: string }
export interface NovaCheck { name: string; passed: boolean; detail: string }
export interface NovaNode { id: string; label: string; x: number; y: number; color: string }
export interface NovaEdge { source: string; target: string; weight: number; color: string; group?: string }
/** Validated data, never HTML or executable JavaScript. A trusted renderer owns the preview. */
export interface NovaPluginOutput {
  title: string;
  description?: string;
  network?: { nodes: NovaNode[]; edges: NovaEdge[]; legend?: { label: string; color: string }[] };
  table?: { columns: string[]; rows: (string | number | null)[][] };
  exports: ("svg" | "csv" | "json")[];
}
export interface NovaDraftManifest {
  schemaVersion: "open-ena.nova-draft/v1";
  name: string; version: string; kind: "presenter" | "exporter";
  entry: "src/plugin.ts"; changesAnalysis: false; networkAccess: false;
}
export interface NovaArtifactVersion {
  id: string; runId: string; version: number; createdAt: string;
  files: NovaFile[]; manifest: NovaDraftManifest; checks: NovaCheck[];
  output: NovaPluginOutput; sourceHash: string; fixtureHash: string;
  status: "draft"; restoredFrom?: string;
}
export interface NovaRun {
  id: string; sessionId: string; status: NovaRunStatus; model: NovaModel; effort: NovaEffort;
  createdAt: string; updatedAt: string; messageId: string; baseArtifactId: string | null;
  stepCount: number; repairCount: number; errorCode?: string;
  /** User-owned source/check results only. Provider messages/reasoning stay in the private checkpoint. */
  draftFiles?: NovaFile[]; draftChecks?: NovaCheck[];
}
export interface NovaExpertRequest {
  id: string; runId: string; artifactId: string | null; question: string; context: string;
  status: "requested" | "answered" | "superseded";
  notificationStatus: "pending" | "sent" | "failed";
  createdAt: string; response?: string; respondedAt?: string;
}
export interface NovaSession {
  id: string; title: string; locale: string; createdAt: string; updatedAt: string;
  messages: NovaMessage[]; runs: NovaRun[]; artifacts: NovaArtifactVersion[];
  expertRequests: NovaExpertRequest[]; activeArtifactId: string | null;
}
export interface NovaSessionSummary { id: string; title: string; createdAt: string; updatedAt: string; status: NovaRunStatus | null }
export interface NovaEvent { cursor: number; sessionId: string; runId?: string; type: "message" | "run" | "artifact" | "expert"; createdAt: string; detail: string }
export interface NovaToolCall { id: string; name: string; arguments: string }
export interface NovaProviderMessage { role: "system" | "user" | "assistant" | "tool"; content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[]; tool_call_id?: string; reasoning_content?: string }
export interface NovaCheckpoint { messages: NovaProviderMessage[]; files: NovaFile[]; stepCount: number; repairCount: number }
export interface NovaClaim { run: NovaRun; session: NovaSession; ownerRef: string; claimToken: string; checkpoint: NovaCheckpoint | null }
export interface NovaRunUpdate {
  status?: NovaRunStatus; message?: string; files?: NovaFile[]; checkpoint?: NovaCheckpoint;
  checks?: NovaCheck[];
  artifact?: NovaArtifactVersion; expert?: Omit<NovaExpertRequest, "id" | "createdAt" | "notificationStatus" | "status">;
  stepCount?: number; repairCount?: number; errorCode?: string;
}
