"use client";

import { useEffect, useRef, useState } from "react";
import {
  OPEN_ENA_AI_CONSENT_HEADER,
  OPEN_ENA_AI_CONSENT_VALUE,
  OPEN_ENA_AI_OPERATION_HEADER,
  OPEN_ENA_AI_OPERATION_ID,
  parseOpenEnaAiInterpretationResponse,
  type OpenEnaAiInterpretationRequest,
  type OpenEnaAiInterpretationResponse,
} from "@/lib/open-ena/ai-interpretation";
import type { OpenEnaAiInterpretationCopy } from "@/lib/open-ena-i18n";

interface OpenEnaAiInterpretationProps {
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
  request,
  copy,
  disabled,
  disabledReason,
  providerDescriptor = { provider: "OpenRouter", model: "server-configured model" },
  showHeading = true,
}: OpenEnaAiInterpretationProps) {
  const [consentedRequestIdentity, setConsentedRequestIdentity] = useState<string | null>(null);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>("idle");
  const [aiResponse, setAiResponse] = useState<OpenEnaAiInterpretationResponse | null>(null);
  const [aiResponseRequestIdentity, setAiResponseRequestIdentity] = useState<string | null>(null);
  const [aiError, setAiError] = useState("");
  const [auditReceipt, setAuditReceipt] = useState<AiAuditReceiptView | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const operationIdRef = useRef<string | null>(null);
  const operationStorageKeyRef = useRef<string | null>(null);
  const requestIdentity = request
    ? JSON.stringify({
        schemaVersion: request.schemaVersion,
        promptVersion: request.promptVersion,
        locale: request.locale,
        binding: request.binding,
        evidence: request.evidence,
      })
    : null;
  const currentRequestIdentityRef = useRef(requestIdentity);
  currentRequestIdentityRef.current = requestIdentity;
  const operationStorageKey = request
    ? `open-ena-ai-operation-v1:${request.binding.evidenceKey}`
    : null;
  const consentGranted = requestIdentity !== null && consentedRequestIdentity === requestIdentity;
  const currentResponse = aiResponse && aiResponseRequestIdentity === requestIdentity ? aiResponse : null;

  useEffect(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
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
    setAuditReceipt(null);
    setGenerationStatus("idle");
    setConsentedRequestIdentity(null);
  }, [operationStorageKey, requestIdentity]);

  useEffect(() => () => abortControllerRef.current?.abort(), []);

  async function handleGenerateInterpretation() {
    if (!request || disabled || !consentGranted || generationStatus === "loading") return;
    const requestedIdentity = requestIdentity;
    const requestedOperationStorageKey = operationStorageKey;
    if (!requestedIdentity || consentedRequestIdentity !== requestedIdentity) return;
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
        if (requestedOperationStorageKey) sessionStorage.removeItem(requestedOperationStorageKey);
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
    await executeOpenEnaAiGeneration({
      task: async () => {
        const response = await fetch("/api/open-ena/ai-interpretation", {
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
        const payload = await response.json().catch(() => null) as unknown;
        if (!response.ok) {
          if (response.status === 409) clearOperation();
          const safeMessage = payload && typeof payload === "object" && "error" in payload
            && typeof (payload as { error?: unknown }).error === "string"
            ? (payload as { error: string }).error
            : copy.errorTitle;
          throw new Error(safeMessage);
        }
        const parsed = parseOpenEnaAiInterpretationResponse(payload, request);
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
        clearOperation();
        setAiResponse(parsed);
        setAiResponseRequestIdentity(requestedIdentity);
        setAuditReceipt(receipt);
      },
      onError: setAiError,
      onSettled: () => {
        abortControllerRef.current = null;
        setGenerationStatus("idle");
      },
      fallbackError: copy.errorTitle,
    });
  }

  function handleCancelInterpretation() {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setGenerationStatus("idle");
  }

  return (
    <section
      className="ena-ai-interpretation"
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

      <div className="ena-ai-privacy">
        <p>{copy.privacyLocal}</p>
        <p>{copy.privacyExternal}</p>
      </div>

      <aside className="ena-ai-provider-disclosure" data-ena-ai-provider-disclosure="pre-consent">
        <strong>{copy.disclosureSummary}</strong>
        <p>{copy.providerDisclosure}</p>
        <dl>
          <div><dt>{copy.provider}</dt><dd>{providerDescriptor.provider}</dd></div>
          <div><dt>{copy.model}</dt><dd>{providerDescriptor.model}</dd></div>
        </dl>
        <p>{copy.dataScopeDisclosure}</p>
        <p>{copy.retentionDisclosure}</p>
        <p>{copy.regionDisclosure}</p>
        <p>{copy.auditReceiptDisclosure}</p>
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
          type="button"
          className="ena-action-button ena-action-primary"
          disabled={disabled || !request || !consentGranted || generationStatus === "loading"}
          onClick={handleGenerateInterpretation}
        >
          {generationStatus === "loading" ? copy.generating : copy.generate}
        </button>
        {generationStatus === "loading" ? (
          <button
            type="button"
            className="ena-action-button ena-action-secondary"
            onClick={handleCancelInterpretation}
          >
            {copy.cancel}
          </button>
        ) : null}
      </div>

      {aiError ? (
        <div className="ena-ai-error" role="alert">
          <strong>{copy.errorTitle}</strong>
          <p>{aiError}</p>
          <button type="button" className="ena-inline-link" onClick={handleGenerateInterpretation}>
            {copy.retry}
          </button>
        </div>
      ) : null}

      {currentResponse ? (
        <article className="ena-ai-result" aria-live="polite">
          <section>
            <h4>{copy.observedPatterns}</h4>
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
