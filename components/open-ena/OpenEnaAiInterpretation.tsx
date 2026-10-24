"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  OPEN_ENA_AI_CONSENT_HEADER,
  OPEN_ENA_AI_CONSENT_VALUE,
  OPEN_ENA_AI_OPERATION_ALREADY_PROCESSED_ERROR,
  OPEN_ENA_AI_OPERATION_HEADER,
  OPEN_ENA_AI_OPERATION_ID,
  OPEN_ENA_AI_RETRY_HEADER,
  OPEN_ENA_AI_SETTLED_RETRY_HEADER,
  parseOpenEnaAiInterpretationResponse,
  type OpenEnaAiInterpretationRequest,
} from "@/lib/open-ena/ai-interpretation";
import { openEnaAiOperationScope, openEnaAiOperationStore } from "@/lib/open-ena/ai-operation-storage";
import { OPEN_ENA_AI_OWNER_HEADER, OPEN_ENA_AI_OWNER_KEY } from "@/lib/open-ena/ai-operation-owner";
import { openEnaAiReviewedRequestIdentityV3 } from "@/lib/open-ena/workspace-consumer-authority-v3";
import type { OpenEnaAiInterpretationCopy } from "@/lib/open-ena-i18n";
import type { SavedOpenEnaAiInterpretation } from "@/lib/open-ena/cloud-workspace-extras";
import { getLocaleMeta, type Locale } from "@/lib/i18n";
import { canonicalJsonV3 } from "@/lib/open-ena/model-v3/canonical-json";

interface OpenEnaAiInterpretationProps {
  locale?: Locale;
  /** Full native binding/context remains local and participates in consent,
   * cancellation and response adoption. It is never sent to the provider. */
  localScientificIdentity?: string | null;
  /** An edit since restoration is known even when that edit removes the current review. */
  historicalEvidenceInvalidated?: boolean;
  operationOwnerKey?: string | null;
  request: OpenEnaAiInterpretationRequest | null;
  copy: OpenEnaAiInterpretationCopy;
  disabled: boolean;
  disabledReason: string;
  providerDescriptor?: { provider: string; model: string };
  showHeading?: boolean;
  onLocalWorkChange?: (hasWork: boolean) => void;
  onInterpretationChange?: (value: SavedOpenEnaAiInterpretation | null) => void;
  savedInterpretation?: SavedOpenEnaAiInterpretation | null;
  savedInterpretationNote?: string;
}

type GenerationStatus = "idle" | "loading";

export type OpenEnaAiFailureRecovery = "retry" | "sign-in" | "new-generation" | "local-only";

export const OPEN_ENA_AI_FAILURE_CLASSES = ["session", "unavailable", "network", "invalid-output"] as const;

export type OpenEnaAiFailureClass = (typeof OPEN_ENA_AI_FAILURE_CLASSES)[number];

export function openEnaAiFailureRecovery(
  status: number,
  disposition?: "released" | "settled",
): OpenEnaAiFailureRecovery {
  if (status === 401) return "sign-in";
  if (disposition === "settled") return "new-generation";
  if (status === 409 && disposition !== "released") return "local-only";
  return "retry";
}

export function classifyOpenEnaAiPanelFailure(input: {
  status?: number;
  failureClass?: unknown;
  cause?: "network" | "invalid-output" | "http";
}): { failureClass: OpenEnaAiFailureClass | null; recovery: OpenEnaAiFailureRecovery } {
  if (input.status === 401) return { failureClass: "session", recovery: "sign-in" };
  if (input.status === 409) return { failureClass: null, recovery: "local-only" };
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

/** This proof permits offering a separate, explicit new-generation action for this operation. */
export function mayReplaceSettledOpenEnaAiOperation(response: Response, operationId: string) {
  return !response.ok
    && [409, 429, 502, 503, 504].includes(response.status)
    && response.headers.get(OPEN_ENA_AI_RETRY_HEADER) !== "new-operation"
    && response.headers.get(OPEN_ENA_AI_SETTLED_RETRY_HEADER) === "new-operation"
    && response.headers.get(OPEN_ENA_AI_OPERATION_HEADER) === operationId;
}

export function openEnaAiVisibleServerMessage(status: number, serverMessage: string, localizedAlreadyProcessed: string) {
  if (status === 409 && serverMessage === OPEN_ENA_AI_OPERATION_ALREADY_PROCESSED_ERROR) return localizedAlreadyProcessed;
  return serverMessage;
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

/** Compare readable native provenance only; this never reconstructs inference,
 * consent or retry authority from a saved record. Opaque legacy identities remain unknown. */
export function openEnaAiSavedWorkspaceEvidenceChanged({ record, result, comparisonContext }: {
  record: SavedOpenEnaAiInterpretation | null;
  result: { binding: unknown; configuration: unknown; createdAt: string } | null;
  comparisonContext: unknown;
}): boolean {
  if (!record) return false;
  const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
  const selection = (value: unknown) => {
    if (!object(value) || !Array.isArray(value.axes)) return null;
    if (Object.hasOwn(value, "request")) return { axes: value.axes, request: value.request };
    if (Object.hasOwn(value, "primaryGroup") && Object.hasOwn(value, "secondaryGroup")) {
      return { axes: value.axes, primaryGroup: value.primaryGroup, secondaryGroup: value.secondaryGroup };
    }
    return null;
  };
  try {
    const original: unknown = JSON.parse(record.localScientificIdentity);
    if (!object(original) || !object(original.binding) || !object(original.configuration)) return false;
    const originalSelection = selection(original.context);
    if (!originalSelection) return false;
    const originalBindingKey = canonicalJsonV3(original.binding);
    const originalConfigurationKey = canonicalJsonV3(original.configuration);
    const originalSelectionKey = canonicalJsonV3(originalSelection);
    if (!result || originalBindingKey !== canonicalJsonV3(result.binding)
      || originalConfigurationKey !== canonicalJsonV3(result.configuration)
      || record.request.binding.analyzedAt !== result.createdAt) return true;
    // Identity confirmation is intentionally not restored. Typed groups, periods,
    // design and axes still describe the saved comparison without granting authority.
    return originalSelectionKey !== canonicalJsonV3(selection(comparisonContext));
  } catch {
    // The historical reader also admits opaque/noncanonical source identities.
    // They remain readable history and cannot establish either mismatch or authority.
    return false;
  }
}

/** Readability is independent from the authority to send a new request. */
export function openEnaAiCompletedRecordStatus({ record, historical, request, localScientificIdentity, locale, historicalEvidenceInvalidated = false }: {
  record: SavedOpenEnaAiInterpretation;
  historical: boolean;
  historicalEvidenceInvalidated?: boolean;
  request: OpenEnaAiInterpretationRequest | null;
  localScientificIdentity: string | null;
  locale: Locale;
}) {
  const originalIdentity = openEnaAiReviewedRequestIdentityV3({ localScientificIdentity: record.localScientificIdentity || null, request: record.request });
  const currentIdentity = openEnaAiReviewedRequestIdentityV3({ localScientificIdentity,
    request: request ? { ...request, locale: record.request.locale } : null });
  // A cloud restore may not have a fresh review yet; missing evidence cannot prove a change.
  const scienceChanged = (historical && historicalEvidenceInvalidated)
    || (request === null ? !historical : originalIdentity !== currentIdentity);
  return { state: historical ? "historical" as const : scienceChanged ? "stale" as const : "current" as const,
    scienceChanged, languageMismatch: record.request.locale !== locale };
}

export function openEnaAiRetryAfter(value: string | null, now = Date.now()): number {
  if (!value || /^-/.test(value.trim())) return 0;
  const seconds = /^\d+$/.test(value.trim()) ? Number(value) : null;
  const deadline = seconds === null ? Date.parse(value) : now + seconds * 1000;
  return Number.isFinite(deadline) && deadline > now ? deadline : 0;
}

export default function OpenEnaAiInterpretation({
  locale: selectedLocale,
  localScientificIdentity = null,
  historicalEvidenceInvalidated = false,
  operationOwnerKey = null,
  request,
  copy,
  disabled,
  disabledReason,
  showHeading = true,
  onLocalWorkChange,
  onInterpretationChange,
  savedInterpretation = null,
  savedInterpretationNote = "",
}: OpenEnaAiInterpretationProps) {
  const [consentedRequestIdentity, setConsentedRequestIdentity] = useState<string | null>(null);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>("idle");
  // A restored record is readable history; it carries no consent or operation authority.
  const [completedRecord, setCompletedRecord] = useState<{ value: SavedOpenEnaAiInterpretation; historical: boolean } | null>(
    () => savedInterpretation ? { value: savedInterpretation, historical: true } : null,
  );
  const [retryAfter, setRetryAfter] = useState(0);
  const [retrySeconds, setRetrySeconds] = useState(0);
  const locale = selectedLocale ?? request?.locale ?? "en";
  const [aiError, setAiError] = useState("");
  const [aiRecovery, setAiRecovery] = useState<OpenEnaAiFailureRecovery>("retry");
  const [aiFailureClass, setAiFailureClass] = useState<OpenEnaAiFailureClass | null>(null);
  const newGenerationNoticeId = useId();
  const abortControllerRef = useRef<AbortController | null>(null);
  const generationGateRef = useRef({ inFlight: false });
  const generationTokenRef = useRef(0);
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
  const reviewedIdentity = openEnaAiReviewedRequestIdentityV3({
    localScientificIdentity,
    request,
  });
  const owner = operationOwnerKey && OPEN_ENA_AI_OWNER_KEY.test(operationOwnerKey) ? operationOwnerKey : null;
  const requestIdentity = owner && reviewedIdentity ? `${owner}:${locale}:${reviewedIdentity}` : null;
  const currentRequestIdentityRef = useRef(requestIdentity);
  currentRequestIdentityRef.current = requestIdentity;
  const operationScope = useMemo(() => request && owner ? openEnaAiOperationScope(request, owner) : null, [request, owner, requestIdentity]);
  const operationStorageKey = operationScope?.key ?? null;
  const consentGranted = requestIdentity !== null && consentedRequestIdentity === requestIdentity;
  const currentResponse = completedRecord?.value.response ?? null;
  const auditReceipt = completedRecord?.value.auditReceipt ?? null;
  const completedStatus = useMemo(() => completedRecord ? openEnaAiCompletedRecordStatus({ record: completedRecord.value,
    historical: completedRecord.historical, request, localScientificIdentity, locale, historicalEvidenceInvalidated }) : null,
  [completedRecord, request, localScientificIdentity, locale, historicalEvidenceInvalidated]);
  const requestLanguageReady = Boolean(request && request.locale === locale);
  useLayoutEffect(() => { onLocalWorkChange?.(generationStatus === "loading"); }, [generationStatus, onLocalWorkChange]);
  const showsRetainedInterpretation = currentResponse !== null;
  // Sample panel focus before controls change so restoration stays local.
  if (typeof document !== "undefined" && panelRef.current) {
    focusInsideBeforeCommitRef.current = focusInsidePanel(panelRef.current);
  }

  useEffect(() => {
    const pathname = window.location.pathname.replace(/^\/(en|zh-hans|zh-hant)(?=\/open-ena(?:\/|$))/, `/${locale}`);
    setSignInHref(`${pathname}${window.location.search}`);
  }, [locale]);

  useEffect(() => {
    let timer: number | undefined;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((retryAfter - Date.now()) / 1000));
      setRetrySeconds(remaining);
      if (remaining === 0 && timer !== undefined) window.clearInterval(timer);
    };
    update();
    if (retryAfter <= Date.now()) return;
    timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [retryAfter]);

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
    const restoredOperation = operationScope ? openEnaAiOperationStore.read(operationScope) : null;
    const restoredSettlement = Boolean(operationScope && restoredOperation
      && openEnaAiOperationStore.hasSettledRetry(operationScope, restoredOperation));
    setAiError(restoredSettlement ? copy.operationAlreadyProcessed : "");
    setAiRecovery(restoredSettlement ? "new-generation" : "retry");
    setAiFailureClass(null);
    setGenerationStatus("idle");
    setConsentedRequestIdentity(null);
  }, [operationStorageKey, requestIdentity, copy.operationAlreadyProcessed]);

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
        firstEnabledFocusTarget([recovery, generateButtonRef.current, consentControlRef.current, panelRef.current])?.focus();
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

  async function handleGenerateInterpretation(mode: "current" | "new-generation" = "current") {
    if (!request || !owner || !operationScope || !requestLanguageReady || disabled || !consentGranted || generationStatus === "loading" || Date.now() < retryAfter) return;
    if (mode === "current" && aiError && aiRecovery !== "retry") return;
    const requestedIdentity = requestIdentity;
    const requestedOperationScope = operationScope;
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
    let operationId = openEnaAiOperationStore.read(requestedOperationScope);
    if (mode === "new-generation") {
      if (!operationId || !openEnaAiOperationStore.consumeSettledRetry(requestedOperationScope, operationId)) {
        releaseThisGeneration();
        return;
      }
      openEnaAiOperationStore.close(requestedOperationScope, operationId);
      operationId = null;
    }
    if (!operationId || !OPEN_ENA_AI_OPERATION_ID.test(operationId)) {
      operationId = `aiop-${crypto.randomUUID()}`;
      openEnaAiOperationStore.set(requestedOperationScope, operationId);
    }
    const clearOperation = () => openEnaAiOperationStore.close(requestedOperationScope, operationId);
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
    setAiRecovery("retry");
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
                [OPEN_ENA_AI_OWNER_HEADER]: owner,
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
            // Error classifications describe the message, not whether another
            // billable dispatch is safe. Only a current, operation-bound release
            // proof closes this identity. A settled proof only offers a new generation.
            const released = mayRenewOpenEnaAiOperation(response, operationId);
            const settled = mayReplaceSettledOpenEnaAiOperation(response, operationId);
            if (!isStaleGeneration() && released) clearOperation();
            else if (!isStaleGeneration() && settled) {
              openEnaAiOperationStore.markSettledRetry(requestedOperationScope, operationId);
            }
            const recovery = openEnaAiFailureRecovery(response.status, released ? "released" : settled ? "settled" : undefined);
            const failureClass = classifyOpenEnaAiPanelFailure({
              status: response.status,
              failureClass: declaredFailureClass,
              cause: "http",
            }).failureClass;
            const payloadMessage = payload && typeof payload === "object" && "error" in payload
              && typeof (payload as { error?: unknown }).error === "string"
              ? (payload as { error: string }).error
              : copy.errorTitle;
            const visibleMessage = openEnaAiVisibleServerMessage(response.status, payloadMessage, copy.operationAlreadyProcessed);
            const safeMessage = recovery === "sign-in" ? copy.sessionRecovery : openEnaAiFailureClassMessage(copy, failureClass, visibleMessage);
            if (!isStaleGeneration()) {
              if (response.status === 429) setRetryAfter(openEnaAiRetryAfter(response.headers.get("Retry-After")));
              setAiRecovery(recovery);
              setAiFailureClass(failureClass);
            }
            throw new Error(safeMessage);
          }
          let parsed: ReturnType<typeof parseOpenEnaAiInterpretationResponse>;
          try {
            parsed = parseOpenEnaAiInterpretationResponse(payload, request);
          } catch {
            // An unparseable 200 does not prove that the original dispatch is
            // complete or safely released. Keep its identity on explicit retry.
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
          const value = { request, response: parsed, localScientificIdentity: localScientificIdentity ?? "", auditReceipt: receipt };
          setCompletedRecord({ value, historical: false });
          if (localScientificIdentity) onInterpretationChange?.(value);
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

      {requestLanguageReady ? (
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
          disabled={disabled || !requestLanguageReady || !owner || generationStatus === "loading"}
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
          disabled={disabled || !requestLanguageReady || !consentGranted || generationStatus === "loading" || retrySeconds > 0
            || Boolean(aiError && aiRecovery !== "retry")}
          onClick={() => { void handleGenerateInterpretation(); }}
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

      {retrySeconds > 0 && <p role="status" data-ena-ai-retry-after>{copy.retryAfter.replace("{seconds}", String(retrySeconds))}</p>}

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
            <p data-ena-ai-evidence-boundary="previous-interpretation-retained">{completedStatus?.scienceChanged ? copy.recordScienceChanged : completedRecord?.historical ? copy.recordHistorical : copy.evidenceBoundaryRetained}</p>
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
          ) : aiRecovery === "new-generation" ? (
            <>
              <p id={newGenerationNoticeId} data-ena-ai-new-generation-warning>{copy.newGenerationWarning}</p>
              <button
                ref={retryControlRef}
                type="button"
                className="ena-inline-link"
                data-ena-ai-recovery="new-generation"
                aria-describedby={newGenerationNoticeId}
                disabled={disabled || !requestLanguageReady || !consentGranted || generationStatus === "loading" || retrySeconds > 0}
                onClick={() => { void handleGenerateInterpretation("new-generation"); }}
              >
                {copy.generateNew}
              </button>
            </>
          ) : aiRecovery === "local-only" ? (
            <p data-ena-ai-local-recovery>{copy.operationUnconfirmed}</p>
          ) : (
            <button
              ref={retryControlRef}
              type="button"
              className="ena-inline-link"
              data-ena-ai-recovery="retry"
              disabled={disabled || !requestLanguageReady || !consentGranted || generationStatus === "loading" || retrySeconds > 0}
              onClick={() => { void handleGenerateInterpretation(); }}
            >
              {copy.retry}
            </button>
          )}
        </div>
      ) : null}

      {currentResponse && completedRecord && completedStatus ? (
        <article className="ena-ai-result" aria-live="polite" data-ena-ai-record-state={completedStatus.state}
          data-testid={completedRecord.historical ? "open-ena-saved-ai-interpretation" : undefined}>
          <div className="ena-ai-record-status">
            <p>{completedRecord.historical ? savedInterpretationNote || copy.recordHistorical : completedStatus.scienceChanged ? copy.recordScienceChanged : copy.recordCurrent}</p>
            {completedRecord.historical && completedStatus.scienceChanged && <p>{copy.recordScienceChanged}</p>}
            {completedStatus.languageMismatch && <p data-ena-ai-language-mismatch>{copy.recordLanguageMismatch}</p>}
            <button type="button" className="ena-inline-link" data-ena-ai-clear disabled={generationStatus === "loading"}
              onClick={() => { setCompletedRecord(null); onInterpretationChange?.(null); }}>{copy.clear}</button>
          </div>
          {aiError ? (
            <p data-ena-ai-retained-interpretation="previous">{copy.previousInterpretation}</p>
          ) : null}
          <section>
            <h4 ref={interpretationHeadingRef} tabIndex={-1}>{copy.observedPatterns}</h4>
            <ol lang={getLocaleMeta(completedRecord.value.request.locale).htmlLang}>
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
            <ul lang={getLocaleMeta(completedRecord.value.request.locale).htmlLang}>
              {currentResponse.interpretation.contextualQuestions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          </section>
          <section>
            <h4>{copy.limitations}</h4>
            <ul lang={getLocaleMeta(completedRecord.value.request.locale).htmlLang}>
              {currentResponse.interpretation.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </section>
          <dl className="ena-ai-provenance" data-ena-ai-provenance="true">
            <div><dt>{copy.originalLanguage}</dt><dd>{getLocaleMeta(completedRecord.value.request.locale).label}</dd></div>
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
                  <span>{copy.provider}: {auditReceipt.provider || currentResponse.provider}; {copy.model}: {auditReceipt.model || currentResponse.model}</span>
                </dd>
              </div>
            ) : null}
          </dl>
          <details className="ena-ai-payload-preview" data-ena-ai-payload-preview="saved-aggregate">
            <summary>{copy.previewTitle}</summary><pre>{JSON.stringify(completedRecord.value.request, null, 2)}</pre>
          </details>
        </article>
      ) : null}
    </section>
  );
}
