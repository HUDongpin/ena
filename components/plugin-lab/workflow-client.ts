import type { Locale } from "@/lib/i18n";
import { getPluginWorkflowCopy } from "@/lib/plugin-lab/workflow-i18n";

export const proposalTextLimits = {
  title: 160, researchQuestion: 2000, proposedChange: 3000, name: 120, affiliation: 160,
  currentGap: 2000, unchangedBoundary: 1600, publicSummary: 1200, privateDetails: 5000, referenceLinks: 1600,
} as const;
export type ProposalTextField = keyof typeof proposalTextLimits;
export type ProposalDraft = Record<ProposalTextField, string> & {
  email: string; visibility: "private" | "public-after-review"; track: "unsure" | "academic" | "commissioned";
  dataSafetyConfirmed: boolean; privacyConsent: boolean;
};
export type DraftErrors = Partial<Record<keyof ProposalDraft, string>>;
export type VerifiedEmailSession = { email: string; expiresAt: string };

export function emptyProposalDraft(): ProposalDraft {
  return { title: "", researchQuestion: "", proposedChange: "", name: "", affiliation: "", currentGap: "", unchangedBoundary: "", publicSummary: "", privateDetails: "", referenceLinks: "", email: "", visibility: "private", track: "unsure", dataSafetyConfirmed: false, privacyConsent: false };
}
export function validWorkflowEmail(email: string) { return email.trim().length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email.trim()); }
export function sameWorkflowEmail(a: string, b: string) { return a.trim().toLowerCase() === b.trim().toLowerCase(); }
export function containsWorkflowCredential(text: string) {
  return /\b(?:password|passwd|api[_ -]?key|secret|bearer|access[_ -]?token)\s*[:=]\s*\S+/iu.test(text);
}
export function verifiedForEmail(session: VerifiedEmailSession | null, email: string, now = Date.now()) {
  return !!session && sameWorkflowEmail(session.email, email) && Date.parse(session.expiresAt) > now;
}

export function validateProposalDraft(draft: ProposalDraft, locale: Locale): DraftErrors {
  const copy = getPluginWorkflowCopy(locale);
  const errors: DraftErrors = {};
  for (const field of ["title", "researchQuestion", "proposedChange"] as const) if (!draft[field].trim()) errors[field] = copy.requiredError;
  if (!validWorkflowEmail(draft.email)) errors.email = copy.emailInvalid;
  for (const field of Object.keys(proposalTextLimits) as ProposalTextField[]) {
    if (draft[field].trim().length > proposalTextLimits[field] || /[\u0000-\u001f\u007f]/u.test(draft[field].replace(/\r?\n/gu, ""))) errors[field] = copy.invalidField;
    if (field !== "name" && field !== "affiliation" && containsWorkflowCredential(draft[field])) errors[field] = copy.invalidField;
  }
  if (draft.visibility === "public-after-review" && !draft.publicSummary.trim()) errors.publicSummary = copy.requiredError;
  if (draft.referenceLinks.trim()) {
    const links = draft.referenceLinks.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
    try {
      const parsed = links.map((link) => new URL(link));
      if (links.length > 8 || parsed.some((link) => link.protocol !== "https:" || link.username || link.password) || new Set(parsed.map(String)).size !== links.length) errors.referenceLinks = copy.linksError;
    } catch { errors.referenceLinks = copy.linksError; }
  }
  if (!draft.dataSafetyConfirmed) errors.dataSafetyConfirmed = copy.consentRequired;
  if (!draft.privacyConsent) errors.privacyConsent = copy.consentRequired;
  return errors;
}

export function proposalPayload(draft: ProposalDraft) {
  return { ...draft, schemaVersion: 2 as const, email: draft.email.trim().toLowerCase(), dataSafetyConfirmed: draft.dataSafetyConfirmed ? "yes" : "", privacyConsent: draft.privacyConsent ? "yes" : "" };
}

/** Kept only in React memory. Never replace the identity of an uncertain write. */
export type WorkflowAttempt = { key: string; body: string; ambiguous: boolean };
export function workflowAttempt(previous: WorkflowAttempt | null, body: string, makeKey: () => string): WorkflowAttempt {
  if (previous?.body === body) return previous;
  if (previous?.ambiguous) throw new Error("ambiguous-submission");
  return { key: makeKey(), body, ambiguous: false };
}
export function workflowWriteIsAmbiguous(status: number, code?: unknown) {
  return status >= 500 || code === "submission-conflict" || code === "reply-conflict";
}

export async function workflowJson(response: Response): Promise<Record<string, unknown>> {
  try { const body: unknown = await response.json(); return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {}; }
  catch { return {}; }
}

export function focusFirstWorkflowError(root: HTMLElement | null) {
  if (!root) return;
  const invalid = root.querySelector<HTMLElement>("[aria-invalid='true']");
  const details = invalid?.closest("details");
  if (details) details.open = true;
  invalid?.focus();
}
