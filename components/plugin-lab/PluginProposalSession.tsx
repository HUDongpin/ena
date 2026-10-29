"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { emptyProposalDraft, type VerifiedEmailSession, type WorkflowAttempt } from "./workflow-client";

function useProposalSessionState() {
  const [draft, setDraft] = useState(emptyProposalDraft);
  const [session, setSession] = useState<VerifiedEmailSession | null>(null);
  const [receipt, setReceipt] = useState<{ proposalId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const attempt = useRef<WorkflowAttempt | null>(null);
  const busyRef = useRef(false);
  return { draft, setDraft, session, setSession, receipt, setReceipt, busy, setBusy, pending, setPending, attempt, busyRef };
}

const ProposalSessionContext = createContext<ReturnType<typeof useProposalSessionState> | null>(null);

/** Lives above [locale], so changing language retains only this tab's in-memory work.
 * Keep the submission lock and idempotency key with the draft: restoring just the
 * fields would allow an uncertain write to be submitted again as a new proposal.
 * No proposal or authentication data is copied into browser storage or URLs.
 */
export function PluginProposalSessionProvider({ children }: { children: ReactNode }) {
  const value = useProposalSessionState();
  const pathname = usePathname();
  const { receipt, setReceipt, setDraft, setSession, setPending, attempt } = value;

  useEffect(() => {
    if (!receipt || pathname?.replace(/\/$/u, "").endsWith("/plugins/propose")) return;
    // Keep a completed receipt through language changes, then retire its private
    // draft when leaving the form so the next visit can start a new proposal.
    setDraft(emptyProposalDraft());
    setReceipt(null);
    setSession(null);
    setPending(false);
    attempt.current = null;
  }, [pathname, receipt, setDraft, setReceipt, setSession, setPending, attempt]);

  return <ProposalSessionContext.Provider value={value}>{children}</ProposalSessionContext.Provider>;
}

export function usePluginProposalSession() {
  const value = useContext(ProposalSessionContext);
  if (!value) throw new Error("PluginProposalForm requires PluginProposalSessionProvider");
  return value;
}
