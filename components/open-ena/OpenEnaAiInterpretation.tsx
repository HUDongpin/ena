"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  OPEN_ENA_AI_CONSENT_HEADER,
  OPEN_ENA_AI_CONSENT_VALUE,
  OPEN_ENA_AI_OPERATION_HEADER,
  OPEN_ENA_AI_OPERATION_ID,
  OPEN_ENA_AI_RETRY_HEADER,
  parseOpenEnaAiInterpretationResponse,
  type OpenEnaAiInterpretationRequest,
  type OpenEnaAiInterpretationResponse,
} from "@/lib/open-ena/ai-interpretation";
import { openEnaAiReviewedRequestIdentityV3 } from "@/lib/open-ena/workspace-consumer-authority-v3";
import type { OpenEnaAiInterpretationCopy } from "@/lib/open-ena-i18n";

interface OpenEnaAiInterpretationProps {
  /** Full native binding/context remains local and participates in consent,
   * cancellation and response adoption. It is never sent to the provider. */
  localScientificIdentity?: string | null;
  request: OpenEnaAiInterpretationRequest | null;
  copy: OpenEnaAiInterpretationCopy;
  disabled: boolean;
  disabledReason: string;
  providerDescriptor?: { provider: string; model: string };
  showHeading?: boolean;
}

type AiAuditReceiptView = {
  id: string;
  durable: string;
  status: string;
  recordedAt: string;
  operationId: string;
  requestSha256: string;
  consentPolicyVersion: string;
  provider: string;
  model: string;
};

type GenerationStatus = "idle" | "loading";

export type OpenEnaAiFailureRecovery = "retry" | "sign-in";

export const OPEN_ENA_AI_FAILURE_CLASSES = ["session", "unavailable", "network", "invalid-output"] as const;

export type OpenEnaAiFailureClass = (typeof OPEN_ENA_AI_FAILURE_CLASSES)[number];

export function openEnaAiFailureRecovery(status: number): OpenEnaAiFailureRecovery {
  return status === 401 ? "sign-in" : "retry";
}

export function classifyOpenEnaAiPanelFailure(input: {
  status?: number;
  failureClass?: unknown;
  cause?: "network" | "invalid-output" | "http";
}): { failureClass: OpenEnaAiFailureClass | null; recovery: OpenEnaAiFailureRecovery } {
  if (input.status === 401) return { failureClass: "session", recovery: "sign-in" };
  if (input.cause === "invalid-output") return { failureClass: "invalid-output", recovery: "retry" };
  if (input.cause === "network") return { failureClass: "network", recovery: "retry" };
  const declared = typeof input.failureClass === "string"
    && (OPEN_ENA_AI_FAILURE_CLASSES as readonly string[]).includes(input.failureClass)
    ? input.failureClass as OpenEnaAiFailureClass
    : null;
  if (declared && declared !== "session") return { failureClass: declared, recovery: "retry" };
  if (input.status === 429 || input.status === 503) return { failureClass: "unavailable", recovery: "retry" };
  if (input.status === 504) return { failureClass: "network", recovery: "retry" };
  return {
    failureClass: null,
    recovery: input.status === undefined ? "retry" : openEnaAiFailureRecovery(input.status),
  };
}

export function openEnaAiFailureClassMessage(
  copy: OpenEnaAiInterpretationCopy,
  failureClass: OpenEnaAiFailureClass | null | string,
  fallback: string,
) {
  if (failureClass === "session") return copy.sessionRecovery;
  if (failureClass === "unavailable") return copy.failureUnavailable;
  if (failureClass === "network") return copy.failureNetwork;
  if (failureClass === "invalid-output") return copy.failureInvalidOutput;
  return fallback;
}

export function claimOpenEnaAiGeneration(gate: { inFlight: boolean }) {
  if (gate.inFlight) return false;
  gate.inFlight = true;
  return true;
}

export function releaseOpenEnaAiGeneration(gate: { inFlight: boolean }) {
  gate.inFlight = false;
}

function focusIsRestorable(panel: HTMLElement | null) {
  const active = document.activeElement;
  if (!active || active === document.body || active === document.documentElement) return true;
  return Boolean(panel?.contains(active));
}

function focusInsidePanel(panel: HTMLElement | null) {
  const active = document.activeElement;
  return Boolean(active && panel?.contains(active));
}

function firstEnabledFocusTarget(candidates: Array<HTMLElement | null>) {
  for (const candidate of candidates) {
    if (!candidate || candidate.matches(":disabled")) continue;
    return candidate;
  }
  return null;
}

export function mayRenewOpenEnaAiOperation(response: Response, operationId: string) {
  return !response.ok
    && response.status >= 400
    && response.headers.get(OPEN_ENA_AI_RETRY_HEADER) === "new-operation"
    && response.headers.get(OPEN_ENA_AI_OPERATION_HEADER) === operationId;
}

/**
 * These classes are emitted only after the route reserved the operation and
 * then settled or released it. reserveDetailed rejects that id afterwards.
 * A status the panel infers on its own, such as a bare 503 before reserve, is
 * not consumed and must keep its operation id. A fetch that throws is also
 * excluded: the server may still be in flight, and a fresh id could bill twice.
 */
export function openEnaAiDeclaredFailureConsumedOperation(failureClass: unknown) {
  return failureClass === "unavailable"
    || failureClass === "network"
    || failureClass === "invalid-output";
}

interface ExecuteOpenEnaAiGenerationInput<T> {
  task: () => Promise<T>;
  isStaleGeneration: () => boolean;
  onSuccess: (value: T) => void;
  onError: (message: string) => void;
  onSettled: () => void;
  fallbackError: string;
}

export async function executeOpenEnaAiGeneration<T>({
  task,
  isStaleGeneration,
  onSuccess,
  onError,
  onSettled,
  fallbackError,
}: ExecuteOpenEnaAiGenerationInput<T>) {
  try {
    const value = await task();
    if (isStaleGeneration()) return;
    onSuccess(value);
  } catch (caught) {
    if (isStaleGeneration()) return;
    if (caught instanceof DOMException && caught.name === "AbortError") return;
    onError(caught instanceof Error ? caught.message : fallbackError);
  } finally {
    if (!isStaleGeneration()) onSettled();
  }
}

export default function OpenEnaAiInterpretation({
  localScientificIdentity = null,
  request,
  copy,
  disabled,
  disabledReason,
  providerDescriptor = { provider: "DeepSeek", model: "server-configured model" },
  showHeading = true,
}: OpenEnaAiInterpretationProps) {
  const [consentedRequestIdentity, setConsentedRequestIdentity] = useState<string | null>(null);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>("idle");
  const [aiResponse, setAiResponse] = useState<OpenEnaAiInterpretationResponse | null>(null);
  const [aiResponseRequestIdentity, setAiResponseRequestIdentity] = useState<string | null>(null);
  const [aiError, setAiError] = useState("");
  const [aiRecovery, setAiRecovery] = useState<OpenEnaAiFailureRecovery>("retry");
  const [aiFailureClass, setAiFailureClass] = useState<OpenEnaAiFailureClass | null>(null);
  const [auditReceipt, setAuditReceipt] = useState<AiAuditReceiptView | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const generationGateRef = useRef({ inFlight: false });
  const generationTokenRef = useRef(0);
  const operationIdRef = useRef<string | null>(null);
  const operationStorageKeyRef = useRef<string | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const generateButtonRef = useRef<HTMLButtonElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const retryControlRef = useRef<HTMLButtonElement | null>(null);
  const signInControlRef = useRef<HTMLAnchorElement | null>(null);
  const consentControlRef = useRef<HTMLInputElement | null>(null);
  const interpretationHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const restoreFocusRef = useRef(false);
  const focusRestoreTargetRef = useRef<"result" | "action" | "stable">("result");
  const focusInsideBeforeCommitRef = useRef(false);
  const detachedPanelFocusHandledRef = useRef(false);
  const activationKeyHeldRef = useRef(false);
  const [signInHref, setSignInHref] = useState("");
  const requestIdentity = openEnaAiReviewedRequestIdentityV3({
    localScientificIdentity,
    request,
  });
  const currentRequestIdentityRef = useRef(requestIdentity);
  currentRequestIdentityRef.current = requestIdentity;
  const operationStorageKey = request
    ? `open-ena-ai-operation-v2:${request.binding.evidenceKey}`
    : null;
  const consentGranted = requestIdentity !== null && consentedRequestIdentity === requestIdentity;
  const currentResponse = aiResponse && aiResponseRequestIdentity === requestIdentity ? aiResponse : null;
  const showsRetainedInterpretation = currentResponse !== null;
  // Sample while the previous result is still mounted. currentResponse drops
  // during render, so the focused heading is gone before an effect can see it.
  if (typeof document !== "undefined" && panelRef.current) {
    focusInsideBeforeCommitRef.current = focusInsidePanel(panelRef.current);
  }

  useEffect(() => {
    setSignInHref(`${window.location.pathname}${window.location.search}`);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") activationKeyHeldRef.current = true;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") activationKeyHeldRef.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useLayoutEffect(() => {
    const wasInside = focusInsideBeforeCommitRef.current;
    if (!wasInside || restoreFocusRef.current || focusInsidePanel(panelRef.current)) return;
    if (!focusIsRestorable(panelRef.current)) return;
    const target = firstEnabledFocusTarget([
      generateButtonRef.current,
      consentControlRef.current,
      panelRef.current,
    ]);
    if (!target) return;
    target.focus();
    detachedPanelFocusHandledRef.current = true;
  });

  useEffect(() => {
    if (detachedPanelFocusHandledRef.current) {
      // Idle invalidation does not change generationStatus, aiError, or
      // aiRecovery, so the restoration effect will not clear this flag.
      detachedPanelFocusHandledRef.current = false;
      restoreFocusRef.current = false;
    } else if (restoreFocusRef.current || focusInsidePanel(panelRef.current)) {
      restoreFocusRef.current = true;
      focusRestoreTargetRef.current = "stable";
    } else {
      restoreFocusRef.current = false;
    }
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    generationTokenRef.current += 1;
    releaseOpenEnaAiGeneration(generationGateRef.current);
    try {
      const previousKey = operationStorageKeyRef.current;
      if (previousKey && previousKey !== operationStorageKey) sessionStorage.removeItem(previousKey);
      operationStorageKeyRef.current = operationStorageKey;
      const stored = operationStorageKey ? sessionStorage.getItem(operationStorageKey) : null;
      operationIdRef.current = stored && OPEN_ENA_AI_OPERATION_ID.test(stored) ? stored : null;
      if (stored && !operationIdRef.current && operationStorageKey) {
        sessionStorage.removeItem(operationStorageKey);
      }
    } catch {
      operationStorageKeyRef.current = operationStorageKey;
      operationIdRef.current = null;
    }
    setAiResponse(null);
    setAiResponseRequestIdentity(null);
    setAiError("");
    setAiRecovery("retry");
    setAiFailureClass(null);
    setAuditReceipt(null);
    setGenerationStatus("idle");
    setConsentedRequestIdentity(null);
  }, [operationStorageKey, requestIdentity]);

  useEffect(() => () => abortControllerRef.current?.abort(), []);

  useEffect(() => {
    if (!restoreFocusRef.current) return;
    let cancelled = false;
    const apply = () => {
      if (cancelled || !restoreFocusRef.current) return;
      if (!focusIsRestorable(panelRef.current)) {
        restoreFocusRef.current = false;
        return;
      }
      if (generationStatus === "loading") {
        cancelButtonRef.current?.focus();
        return;
      }
      const recovery = signInControlRef.current ?? retryControlRef.current;
      if (aiError) {
        recovery?.focus();
        restoreFocusRef.current = false;
        return;
      }
      const target = focusRestoreTargetRef.current;
      const candidates: Array<HTMLElement | null> = target === "action"
        ? [recovery, generateButtonRef.current, consentControlRef.current, panelRef.current]
        : target === "stable"
          ? [generateButtonRef.current, consentControlRef.current, panelRef.current]
          : [interpretationHeadingRef.current, generateButtonRef.current, consentControlRef.current, panelRef.current];
      firstEnabledFocusTarget(candidates)?.focus();
      restoreFocusRef.current = false;
    };
    if (!activationKeyHeldRef.current) {
      apply();
      return;
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      window.removeEventListener("keyup", onKeyUp, true);
      apply();
    };
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      cancelled = true;
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [generationStatus, aiError, aiRecovery]);

  async function handleGenerateInterpretation() {
    if (!request || disabled || !consentGranted || generationStatus === "loading") return;
    const requestedIdentity = requestIdentity;
    const requestedOperationStorageKey = operationStorageKey;
    if (!requestedIdentity || consentedRequestIdentity !== requestedIdentity) return;
    if (!claimOpenEnaAiGeneration(generationGateRef.current)) return;
    if (focusIsRestorable(panelRef.current)) {
      restoreFocusRef.current = true;
      focusRestoreTargetRef.current = "result";
    }
    const generationToken = generationTokenRef.current + 1;
    generationTokenRef.current = generationToken;
    const releaseThisGeneration = () => {
      if (generationTokenRef.current !== generationToken) return;
      releaseOpenEnaAiGeneration(generationGateRef.current);
      abortControllerRef.current = null;
      setGenerationStatus("idle");
    };
    let operationId = operationIdRef.current;
    if (!operationId || !OPEN_ENA_AI_OPERATION_ID.test(operationId)) {
      operationId = `aiop-${crypto.randomUUID()}`;
      operationIdRef.current = operationId;
      try {
        if (requestedOperationStorageKey) sessionStorage.setItem(requestedOperationStorageKey, operationId);
      } catch {
        // The in-memory operation ID still protects retries in this page lifecycle.
      }
    }
    const clearOperation = () => {
      if (operationIdRef.current === operationId) operationIdRef.current = null;
      try {
        if (
          requestedOperationStorageKey
          && sessionStorage.getItem(requestedOperationStorageKey) === operationId
        ) {
          sessionStorage.removeItem(requestedOperationStorageKey);
        }
      } catch {
        // Storage can be unavailable in restricted browsing modes.
      }
    };
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const isStaleGeneration = () => (
      abortControllerRef.current !== controller
      || controller.signal.aborted
      || currentRequestIdentityRef.current !== requestedIdentity
    );
    setGenerationStatus("loading");
    setAiError("");
    setAiFailureClass(null);
    try {
      await executeOpenEnaAiGeneration({
        task: async () => {
          let response: Response;
          try {
            response = await fetch("/api/open-ena/ai-interpretation", {
              method: "POST",
              credentials: "same-origin",
              headers: {
                "Content-Type": "application/json",
                [OPEN_ENA_AI_CONSENT_HEADER]: OPEN_ENA_AI_CONSENT_VALUE,
                [OPEN_ENA_AI_OPERATION_HEADER]: operationId,
              },
              body: JSON.stringify(request),
              signal: controller.signal,
            });
          } catch (caught) {
            if (caught instanceof DOMException && caught.name === "AbortError") throw caught;
            const failureClass = classifyOpenEnaAiPanelFailure({ cause: "network" }).failureClass;
            if (!isStaleGeneration()) {
              setAiRecovery("retry");
              setAiFailureClass(failureClass);
            }
            throw new Error(copy.failureNetwork);
          }
          const payload = await response.json().catch(() => null) as unknown;
          if (!response.ok) {
            const declaredFailureClass = payload && typeof payload === "object" && "failureClass" in payload
              ? (payload as { failureClass?: unknown }).failureClass
              : undefined;
            if (response.status === 409) clearOperation();
            else if (mayRenewOpenEnaAiOperation(response, operationId)) clearOperation();
            else if (openEnaAiDeclaredFailureConsumedOperation(declaredFailureClass)) clearOperation();
            const recovery = openEnaAiFailureRecovery(response.status);
            const failureClass = classifyOpenEnaAiPanelFailure({
              status: response.status,
              failureClass: declaredFailureClass,
              cause: "http",
            }).failureClass;
            const payloadMessage = payload && typeof payload === "object" && "error" in payload
              && typeof (payload as { error?: unknown }).error === "string"
              ? (payload as { error: string }).error
              : copy.errorTitle;
            const safeMessage = recovery === "sign-in" ? copy.sessionRecovery : openEnaAiFailureClassMessage(copy, failureClass, payloadMessage);
            if (!isStaleGeneration()) {
              setAiRecovery(recovery);
              setAiFailureClass(failureClass);
            }
            throw new Error(safeMessage);
          }
          let parsed: ReturnType<typeof parseOpenEnaAiInterpretationResponse>;
          try {
            parsed = parseOpenEnaAiInterpretationResponse(payload, request);
          } catch {
            clearOperation();
            const failureClass = classifyOpenEnaAiPanelFailure({
              status: response.status,
              cause: "invalid-output",
            }).failureClass;
            if (!isStaleGeneration()) {
              setAiRecovery("retry");
              setAiFailureClass(failureClass);
            }
            throw new Error(copy.failureInvalidOutput);
          }
          const readHeader = (name: string) => response.headers.get(name) ?? "";
          const receiptId = readHeader("x-open-ena-ai-receipt-id");
          return {
            parsed,
            receipt: receiptId ? {
              id: receiptId,
              durable: readHeader("x-open-ena-ai-receipt-durable"),
              status: readHeader("x-open-ena-ai-receipt-status"),
              recordedAt: readHeader("x-open-ena-ai-receipt-recorded-at"),
              operationId: readHeader("x-open-ena-ai-operation-id"),
              requestSha256: readHeader("x-open-ena-ai-request-sha256"),
              consentPolicyVersion: readHeader("x-open-ena-ai-consent-policy"),
              provider: readHeader("x-open-ena-ai-receipt-provider"),
              model: readHeader("x-open-ena-ai-receipt-model"),
            } : null,
          };
        },
        isStaleGeneration,
        onSuccess: ({ parsed, receipt }) => {
          if (restoreFocusRef.current) focusRestoreTargetRef.current = "result";
          clearOperation();
          setAiResponse(parsed);
          setAiResponseRequestIdentity(requestedIdentity);
          setAuditReceipt(receipt);
        },
        onError: setAiError,
        onSettled: releaseThisGeneration,
        fallbackError: copy.errorTitle,
      });
    } catch {
      releaseThisGeneration();
    }
  }

  function handleCancelInterpretation() {
    if (restoreFocusRef.current || focusInsidePanel(panelRef.current)) {
      restoreFocusRef.current = true;
      focusRestoreTargetRef.current = "action";
    }
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    generationTokenRef.current += 1;
    releaseOpenEnaAiGeneration(generationGateRef.current);
    setGenerationStatus("idle");
  }

  return (
    <section
      ref={panelRef}
      tabIndex={-1}
      className="ena-ai-interpretation"
      aria-busy={generationStatus === "loading"}
      aria-label={showHeading ? undefined : copy.title}
      aria-labelledby={showHeading ? "ena-ai-interpretation-title" : undefined}
    >
      {showHeading ? (
        <header className="ena-ai-heading">
          <p className="ena-panel-kicker">AI</p>
          <h3 id="ena-ai-interpretation-title">{copy.title}</h3>
          <p>{copy.description}</p>
        </header>
      ) : null}

      <aside className="ena-ai-disclosure" data-ena-ai-disclosure="permanent">
        <strong>{copy.aiGenerated}</strong>
        <span>{copy.descriptiveOnly}</span>
        <span>{copy.notStatisticalInference}</span>
      </aside>

      {request ? (
        <details className="ena-ai-payload-preview" data-ena-ai-payload-preview="reviewed-aggregate">
          <summary>{copy.previewTitle}</summary>
          <p>{copy.previewHint}</p>
          <pre>{JSON.stringify(request, null, 2)}</pre>
        </details>
      ) : (
        <p className="ena-ai-disabled-reason">{disabledReason || copy.noCurrentResult}</p>
      )}

      <label className="ena-ai-consent" data-ena-ai-consent="explicit">
        <input
          ref={consentControlRef}
          type="checkbox"
          checked={consentGranted}
          disabled={disabled || !request || generationStatus === "loading"}
          onChange={(event) => setConsentedRequestIdentity(
            event.currentTarget.checked ? requestIdentity : null,
          )}
        />
        <span>{copy.consentLabel}</span>
      </label>

      <div className="ena-ai-actions">
        <button
          ref={generateButtonRef}
          type="button"
          className="ena-action-button ena-action-primary"
          disabled={disabled || !request || !consentGranted || generationStatus === "loading"}
          onClick={handleGenerateInterpretation}
        >
          {generationStatus === "loading" ? copy.generating : copy.generate}
        </button>
        {generationStatus === "loading" ? (
          <button
            ref={cancelButtonRef}
            type="button"
            className="ena-action-button ena-action-secondary"
            onClick={handleCancelInterpretation}
          >
            {copy.cancel}
          </button>
        ) : null}
      </div>

      {aiError ? (
        <div
          className="ena-ai-error"
          role="alert"
          data-ena-ai-recovery={aiRecovery}
          data-ena-ai-failure-class={aiFailureClass ?? "unclassified"}
        >
          <strong>{copy.errorTitle}</strong>
          <p>{aiError}</p>
          {showsRetainedInterpretation ? (
            <p data-ena-ai-evidence-boundary="previous-interpretation-retained">{copy.evidenceBoundaryRetained}</p>
          ) : (
            <p data-ena-ai-evidence-boundary="results-remain-valid">{copy.evidenceBoundary}</p>
          )}
          {aiRecovery === "sign-in" ? (
            // The current Open ENA URL renders the login page when the session
            // is missing. Opening it in a new tab leaves this analysis in place.
            <a
              ref={signInControlRef}
              className="ena-inline-link"
              data-ena-ai-recovery="sign-in"
              href={signInHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              {copy.signInAgain}
              <span className="sr-only"> {copy.signInNewTab}</span>
            </a>
          ) : (
            <button
              ref={retryControlRef}
              type="button"
              className="ena-inline-link"
              data-ena-ai-recovery="retry"
              disabled={generationStatus === "loading"}
              onClick={handleGenerateInterpretation}
            >
              {copy.retry}
            </button>
          )}
        </div>
      ) : null}

      {currentResponse ? (
        <article className="ena-ai-result" aria-live="polite">
          {aiError ? (
            <p data-ena-ai-retained-interpretation="previous">{copy.previousInterpretation}</p>
          ) : null}
          <section>
            <h4 ref={interpretationHeadingRef} tabIndex={-1}>{copy.observedPatterns}</h4>
            <ol>
              {currentResponse.interpretation.observedPatterns.map((observation) => (
                <li key={`${observation.statement}-${observation.evidenceRefs.join("-")}`}>
                  <p>{observation.statement}</p>
                  <small>{observation.evidenceRefs.join(" · ")}</small>
                </li>
              ))}
            </ol>
          </section>
          <section>
            <h4>{copy.contextualQuestions}</h4>
            <ul>
              {currentResponse.interpretation.contextualQuestions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          </section>
          <section>
            <h4>{copy.limitations}</h4>
            <ul>
              {currentResponse.interpretation.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </section>
          <dl className="ena-ai-provenance" data-ena-ai-provenance="true">
            <div><dt>{copy.provider}</dt><dd>{currentResponse.provider}</dd></div>
            <div><dt>{copy.model}</dt><dd>{currentResponse.model}</dd></div>
            <div><dt>{copy.generatedAt}</dt><dd>{currentResponse.generatedAt}</dd></div>
            <div><dt>{copy.promptVersion}</dt><dd>{currentResponse.promptVersion}</dd></div>
            <div><dt>{copy.evidenceKey}</dt><dd>{currentResponse.binding.evidenceKey}</dd></div>
            {auditReceipt ? (
              <div className="ena-ai-audit-receipt" data-ena-ai-audit-receipt="durable-consent">
                <dt>{copy.auditReceipt}</dt>
                <dd>
                  <span>{auditReceipt.id}</span>
                  <span>{copy.requestSha256}: {auditReceipt.requestSha256}</span>
                  <span>{copy.consentPolicyVersion}: {auditReceipt.consentPolicyVersion}</span>
                  <span>{copy.recordedAt}: {auditReceipt.recordedAt}</span>
                  <span>{copy.durable}: {auditReceipt.durable}</span>
                  <span>{copy.provider}: {auditReceipt.provider || providerDescriptor.provider}; {copy.model}: {auditReceipt.model || providerDescriptor.model}</span>
                </dd>
              </div>
            ) : null}
          </dl>
        </article>
      ) : null}
    </section>
  );
}
