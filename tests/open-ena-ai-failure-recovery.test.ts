import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { getOpenEnaCopy, openEnaLocalizedLocales } from "../lib/open-ena-i18n";
import { createOpenEnaAiInterpretationPostHandler } from "../lib/server/open-ena-ai-interpretation-route";

const projectRoot = process.cwd();
const aiComponentPath = join(projectRoot, "components/open-ena/OpenEnaAiInterpretation.tsx");
const workspacePath = join(projectRoot, "components/open-ena/OpenEnaWorkspace.tsx");
const aiComponent = readFileSync(aiComponentPath, "utf8");
const workspace = readFileSync(workspacePath, "utf8");

const FAILURE_COPY = {
  en: {
    sessionRecovery: "Your Open ENA session is missing or no longer valid. Sign in again, then return to generate an interpretation.",
    signInAgain: "Sign in again",
    signInNewTab: "Opens in a new tab",
    failureUnavailable: "AI interpretation is temporarily unavailable or rate limited. Wait a moment, then retry this request.",
    failureNetwork: "The AI interpretation request did not finish because the network failed or the request timed out. Check your connection, then retry this request.",
    failureInvalidOutput: "The model returned output that could not be used as an interpretation. Retry this request to ask for a new interpretation.",
    evidenceBoundary: "The computed ENA model results are still valid. Only the AI interpretation is missing.",
    evidenceBoundaryRetained: "The ENA model results remain valid. This new AI interpretation attempt failed; the interpretation shown below is from an earlier request for the same evidence.",
    previousInterpretation: "Previous interpretation",
  },
  "zh-hant": {
    sessionRecovery: "您的開放 ENA 工作階段不存在或已失效。請重新登入，再回到此處生成解讀。",
    signInAgain: "重新登入",
    signInNewTab: "在新分頁開啟",
    failureUnavailable: "AI 解讀暫時無法使用，或已達到請求次數限制。請稍候，再重試此請求。",
    failureNetwork: "AI 解讀請求因網絡問題或逾時而未完成。請檢查連線，再重試此請求。",
    failureInvalidOutput: "模型傳回的內容無法用作解讀。請重試此請求，以重新生成解讀。",
    evidenceBoundary: "已計算的 ENA 模型結果仍然有效。缺少的只是 AI 解讀。",
    evidenceBoundaryRetained: "ENA 模型結果仍然有效。這次新的 AI 解讀嘗試失敗；下方顯示的解讀來自較早對同一證據的請求。",
    previousInterpretation: "先前的解讀",
  },
  "zh-hans": {
    sessionRecovery: "您的开放 ENA 会话不存在或已失效。请重新登录，再回到此处生成解读。",
    signInAgain: "重新登录",
    signInNewTab: "在新标签页打开",
    failureUnavailable: "AI 解读暂时无法使用，或已达到请求次数限制。请稍候，再重试此请求。",
    failureNetwork: "AI 解读请求因网络问题或超时而未完成。请检查连接，再重试此请求。",
    failureInvalidOutput: "模型返回的内容无法用作解读。请重试此请求，以重新生成解读。",
    evidenceBoundary: "已计算的 ENA 模型结果仍然有效。缺少的只是 AI 解读。",
    evidenceBoundaryRetained: "ENA 模型结果仍然有效。这次新的 AI 解读尝试失败；下方显示的解读来自较早对同一证据的请求。",
    previousInterpretation: "先前的解读",
  },
} as const;

type FailureLocale = keyof typeof FAILURE_COPY;
type FailureCopyKey = keyof (typeof FAILURE_COPY)["en"];

function copyText(locale: FailureLocale) {
  return getOpenEnaCopy(locale).aiInterpretation as unknown as Record<FailureCopyKey, string>;
}

function sourceBlock(source: string, marker: RegExp, label: string) {
  const match = marker.exec(source);
  assert.ok(match, `${label} must be declared`);
  const openingBrace = source.indexOf("{", match.index + match[0].length);
  assert.notEqual(openingBrace, -1, `${label} must have a function body`);
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(openingBrace, index + 1);
    }
  }
  assert.fail(`${label} must have a complete function body`);
}

test("failure-class copy explains what happened and what to do in every AI locale", () => {
  assert.deepEqual([...openEnaLocalizedLocales], ["en", "zh-hant", "zh-hans"]);
  const seen = new Set<string>();
  for (const locale of openEnaLocalizedLocales) {
    const copy = copyText(locale);
    const expected = FAILURE_COPY[locale];
    for (const key of Object.keys(expected) as FailureCopyKey[]) {
      assert.equal(copy[key], expected[key], `${locale} aiInterpretation.${key}`);
      seen.add(copy[key]);
    }
    assert.equal(copy.sessionRecovery.includes("Retry") || copy.sessionRecovery.includes("重試") || copy.sessionRecovery.includes("重试"), false);
    assert.notEqual(copy.signInAgain, getOpenEnaCopy(locale).aiInterpretation.retry);
    assert.doesNotMatch(copy.evidenceBoundary, /invalid|不再有效|已经失效|已經失效/u);
    assert.doesNotMatch(copy.evidenceBoundaryRetained, /invalid|missing|缺少|不再有效|已经失效|已經失效/u);
    assert.match(copy.evidenceBoundaryRetained, /remain valid|仍然有效/u);
    assert.doesNotMatch(copy.previousInterpretation, /missing|缺少/u);
  }
  assert.equal(seen.size, openEnaLocalizedLocales.length * Object.keys(FAILURE_COPY.en).length);
});

test("panel failure classes choose retry or sign-in without collapsing 502 causes", async () => {
  const module = await import("../components/open-ena/OpenEnaAiInterpretation") as Record<string, unknown>;
  const classify = module.classifyOpenEnaAiPanelFailure as ((input: {
    status?: number;
    failureClass?: unknown;
    cause?: "network" | "invalid-output" | "http";
  }) => { failureClass: string | null; recovery: string }) | undefined;
  const messageFor = module.openEnaAiFailureClassMessage as ((
    copy: Record<string, string>,
    failureClass: string | null,
    fallback: string,
  ) => string) | undefined;
  assert.equal(typeof classify, "function");
  assert.equal(typeof messageFor, "function");

  const cases: Array<[
    { status?: number; failureClass?: unknown; cause?: "network" | "invalid-output" | "http" },
    { failureClass: string | null; recovery: string },
  ]> = [
    [{ status: 401 }, { failureClass: "session", recovery: "sign-in" }],
    [{ status: 401, failureClass: "unavailable" }, { failureClass: "session", recovery: "sign-in" }],
    [{ status: 503 }, { failureClass: "unavailable", recovery: "retry" }],
    [{ status: 429 }, { failureClass: "unavailable", recovery: "retry" }],
    [{ status: 503, failureClass: "session" }, { failureClass: "unavailable", recovery: "retry" }],
    [{ status: 504 }, { failureClass: "network", recovery: "retry" }],
    [{ cause: "network" }, { failureClass: "network", recovery: "retry" }],
    [{ status: 502, failureClass: "network" }, { failureClass: "network", recovery: "retry" }],
    [{ status: 502, failureClass: "invalid-output" }, { failureClass: "invalid-output", recovery: "retry" }],
    [{ status: 200, cause: "invalid-output" }, { failureClass: "invalid-output", recovery: "retry" }],
    [{ status: 502 }, { failureClass: null, recovery: "retry" }],
    [{ status: 402 }, { failureClass: null, recovery: "retry" }],
    [{ status: 400 }, { failureClass: null, recovery: "retry" }],
    [{ status: 403 }, { failureClass: null, recovery: "retry" }],
    [{ status: 409 }, { failureClass: null, recovery: "retry" }],
    [{ status: 499 }, { failureClass: null, recovery: "retry" }],
  ];
  for (const [input, expected] of cases) {
    assert.deepEqual(classify!(input), expected, JSON.stringify(input));
  }

  const copy = copyText("en");
  assert.equal(messageFor!(copy, "session", "fallback"), copy.sessionRecovery);
  assert.equal(messageFor!(copy, "unavailable", "fallback"), copy.failureUnavailable);
  assert.equal(messageFor!(copy, "network", "fallback"), copy.failureNetwork);
  assert.equal(messageFor!(copy, "invalid-output", "fallback"), copy.failureInvalidOutput);
  assert.equal(messageFor!(copy, null, "Server message"), "Server message");
  assert.equal(messageFor!(copy, "not-a-class", "Server message"), "Server message");
});

test("provider failures keep their HTTP status and name the ambiguous 502 cause", async () => {
  const route = await import("../lib/server/open-ena-ai-interpretation-route") as Record<string, unknown>;
  const present = route.openEnaAiProviderFailurePresentation as ((error: unknown) => {
    status: number;
    error: string;
    failureClass: string | null;
  }) | undefined;
  assert.equal(typeof present, "function");

  assert.deepEqual(present!({ code: "upstream-rate-limited" }), {
    status: 429,
    error: "The AI interpretation provider is rate limited. Please try again later.",
    failureClass: "unavailable",
  });
  assert.deepEqual(present!({ status: 503, code: "upstream-unavailable" }), {
    status: 503,
    error: "AI interpretation is temporarily unavailable.",
    failureClass: "unavailable",
  });
  assert.deepEqual(present!({ code: "upstream-timeout" }), {
    status: 504,
    error: "The AI interpretation provider timed out.",
    failureClass: "network",
  });
  assert.deepEqual(present!({ code: "upstream-network" }), {
    status: 502,
    error: "The AI interpretation provider request failed.",
    failureClass: "network",
  });
  assert.deepEqual(present!({ code: "upstream-malformed" }), {
    status: 502,
    error: "The AI interpretation provider request failed.",
    failureClass: "invalid-output",
  });
  const generic = present!(new Error("secret upstream response"));
  assert.equal(generic.status, 502);
  assert.equal(generic.failureClass, null);
  assert.equal(generic.error, "The AI interpretation provider request failed.");
  assert.equal(present!({ code: "upstream-payment-required" }).failureClass, null);
  assert.equal(present!({ code: "upstream-payment-required" }).status, 402);
  assert.equal(present!({ code: "upstream-cancelled" }).status, 499);
  assert.equal(present!({ code: "upstream-cancelled" }).failureClass, null);
  assert.equal(present!({ code: "upstream-unauthorized" }).status, 502);
  assert.equal(present!({ code: "upstream-unauthorized" }).failureClass, null);
});

test("a missing session is sign-in recovery and does not use the unavailable class", async () => {
  const handler = createOpenEnaAiInterpretationPostHandler({
    verifyPrincipal: () => null,
    authConfigurationReady: () => true,
    parseRequest: () => { throw new Error("must not parse"); },
    generate: async () => { throw new Error("must not generate"); },
  });
  const response = await handler(new Request("http://localhost:3000/api/open-ena/ai-interpretation", {
    method: "POST",
  }));
  const body = await response.json() as { error?: string; failureClass?: string };
  assert.equal(response.status, 401);
  assert.equal(body.error, "Authentication required.");
  assert.equal(body.failureClass, "session");
});

test("the failure alert states the evidence boundary and retries only retryable classes", () => {
  assert.match(aiComponent, /recovery === ["']sign-in["'] \? copy\.sessionRecovery : openEnaAiFailureClassMessage\(/);
  assert.match(aiComponent, /openEnaAiFailureRecovery\(response\.status\)/);
  assert.match(
    aiComponent,
    /role=["']alert["'][\s\S]*?data-ena-ai-evidence-boundary=["']results-remain-valid["'][\s\S]*?\{copy\.evidenceBoundary\}/,
  );
  assert.match(aiComponent, /data-ena-ai-failure-class=\{aiFailureClass \?\? ["']unclassified["']\}/);
  const alertStart = aiComponent.indexOf('role="alert"');
  const alert = aiComponent.slice(alertStart, aiComponent.indexOf("currentResponse", alertStart));
  const signIn = alert.slice(alert.indexOf('data-ena-ai-recovery="sign-in"'), alert.indexOf('data-ena-ai-recovery="retry"'));
  assert.match(signIn, /target="_blank"/);
  assert.match(signIn, /rel="noopener noreferrer"/);
  assert.match(signIn, /copy\.signInAgain/);
  assert.match(signIn, /copy\.signInNewTab/);
  assert.doesNotMatch(signIn, /handleGenerateInterpretation/);
  assert.doesNotMatch(signIn, /location\.assign/);
  assert.doesNotMatch(aiComponent, /location\.assign\s*\(/);
  assert.match(aiComponent, /aria-busy=\{generationStatus === "loading"\}/);
  assert.match(alert, /data-ena-ai-recovery=["']retry["'][\s\S]*?onClick=\{handleGenerateInterpretation\}/);
  assert.match(alert, /copy\.retry/);
  assert.match(aiComponent, /copy\.failureNetwork/);
  assert.match(aiComponent, /copy\.failureInvalidOutput/);
  assert.match(aiComponent, /cause:\s*["']network["']/);
  assert.match(aiComponent, /cause:\s*["']invalid-output["']/);
  assert.match(
    aiComponent,
    /showsRetainedInterpretation \? \([\s\S]*?data-ena-ai-evidence-boundary=["']previous-interpretation-retained["'][\s\S]*?\{copy\.evidenceBoundaryRetained\}/,
  );
  assert.match(aiComponent, /data-ena-ai-retained-interpretation=["']previous["'][\s\S]*?\{copy\.previousInterpretation\}/);
});

test("a settled failure class renews the operation without a server new-operation header", async () => {
  const module = await import("../components/open-ena/OpenEnaAiInterpretation") as Record<string, unknown>;
  const consumed = module.openEnaAiDeclaredFailureConsumedOperation as ((failureClass: unknown) => boolean) | undefined;
  assert.equal(typeof consumed, "function");
  assert.equal(consumed!("invalid-output"), true);
  assert.equal(consumed!("network"), true);
  assert.equal(consumed!("unavailable"), true);
  assert.equal(consumed!("session"), false);
  assert.equal(consumed!(null), false);
  assert.equal(consumed!(undefined), false);
  assert.equal(consumed!("not-a-class"), false);

  const handler = sourceBlock(
    aiComponent,
    /async function\s+handleGenerateInterpretation\s*\([^)]*\)/,
    "handleGenerateInterpretation",
  );
  assert.match(
    handler,
    /if\s*\(response\.status\s*===\s*409\)\s*clearOperation\(\);\s*else if\s*\(mayRenewOpenEnaAiOperation\(response,\s*operationId\)\)\s*clearOperation\(\);\s*else if\s*\(openEnaAiDeclaredFailureConsumedOperation\(declaredFailureClass\)\)\s*clearOperation\(\)/,
  );
  assert.match(
    handler,
    /clearOperation\(\);\s*const failureClass = classifyOpenEnaAiPanelFailure\(\{\s*status: response\.status,\s*cause: ["']invalid-output["']/,
  );
  const networkAt = handler.indexOf('cause: "network"');
  const payloadAt = handler.indexOf("const payload", networkAt);
  assert.ok(networkAt !== -1 && payloadAt > networkAt);
  assert.doesNotMatch(handler.slice(networkAt, payloadAt), /clearOperation\(/);
  assert.doesNotMatch(handler, /openEnaAiDeclaredFailureConsumedOperation\(failureClass\)/);
});

test("a second retry cannot claim the generation while one is in flight", async () => {
  const module = await import("../components/open-ena/OpenEnaAiInterpretation") as Record<string, unknown>;
  const claim = module.claimOpenEnaAiGeneration as ((gate: { inFlight: boolean }) => boolean) | undefined;
  const release = module.releaseOpenEnaAiGeneration as ((gate: { inFlight: boolean }) => void) | undefined;
  assert.equal(typeof claim, "function");
  assert.equal(typeof release, "function");
  const gate = { inFlight: false };
  assert.equal(claim!(gate), true);
  assert.equal(gate.inFlight, true);
  assert.equal(claim!(gate), false, "an in-flight retry must reject a duplicate submit");
  assert.equal(gate.inFlight, true);
  release!(gate);
  assert.equal(gate.inFlight, false);
  assert.equal(claim!(gate), true);

  const handler = sourceBlock(
    aiComponent,
    /async function\s+handleGenerateInterpretation\s*\([^)]*\)/,
    "handleGenerateInterpretation",
  );
  const claimAt = handler.indexOf("claimOpenEnaAiGeneration(generationGateRef.current)");
  const fetchAt = handler.indexOf("fetch(");
  assert.ok(claimAt !== -1 && fetchAt !== -1 && claimAt < fetchAt, "the in-flight gate must be claimed before the request is sent");
  assert.match(handler, /if\s*\(\s*!claimOpenEnaAiGeneration\(generationGateRef\.current\)\s*\)\s*return/);
});

test("a retry started for older evidence is not applied after the current request changes", async () => {
  assert.match(workspace, /request=\{activeAiReview\?\.request \?\? null\}/);
  assert.match(workspace, /disabled=\{!activeAiReview \|\| !current\}/);
  assert.match(
    aiComponent,
    /currentRequestIdentityRef\.current\s*!==\s*requestedIdentity/,
    "late settlement must keep using the current request identity, which tracks consumerKey via the reviewed request",
  );
  const invalidation = aiComponent.match(/useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[[^\]]*requestIdentity[^\]]*\]\);/);
  assert.ok(invalidation, "request identity changes must invalidate an in-flight retry");
  assert.match(invalidation[1], /\.abort\(\)/);
  assert.match(invalidation[1], /setAiFailureClass\(null\)/);
  assert.match(invalidation[1], /releaseOpenEnaAiGeneration\(generationGateRef\.current\)/);
  assert.match(invalidation[1], /generationTokenRef\.current\s*\+=\s*1/);

  const module = await import("../components/open-ena/OpenEnaAiInterpretation") as Record<string, unknown>;
  const execute = module.executeOpenEnaAiGeneration as (<T>(input: {
    task: () => Promise<T>;
    isStaleGeneration: () => boolean;
    onSuccess: (value: T) => void;
    onError: (message: string) => void;
    onSettled: () => void;
    fallbackError: string;
  }) => Promise<void>) | undefined;
  assert.equal(typeof execute, "function");

  let currentIdentity = "evidence-a";
  let activeController: AbortController | null = null;
  let response = "";
  let error = "";
  const oldController = new AbortController();
  activeController = oldController;
  const oldResult = new Promise<string>((resolve) => {
    setTimeout(() => resolve("OLD_EVIDENCE_INTERPRETATION"), 0);
  });
  const staleAttempt = execute!({
    task: () => oldResult,
    isStaleGeneration: () => activeController !== oldController || oldController.signal.aborted || currentIdentity !== "evidence-a",
    onSuccess: (value) => { response = value; },
    onError: (message) => { error = message; },
    onSettled: () => { activeController = null; },
    fallbackError: "fallback",
  });
  currentIdentity = "evidence-b";
  oldController.abort();
  await staleAttempt;
  assert.equal(response, "", "an older retry must not publish its interpretation onto newer evidence");
  assert.equal(error, "");

  const currentController = new AbortController();
  activeController = currentController;
  await execute!({
    task: async () => "CURRENT_EVIDENCE_INTERPRETATION",
    isStaleGeneration: () => activeController !== currentController || currentController.signal.aborted || currentIdentity !== "evidence-b",
    onSuccess: (value) => { response = value; },
    onError: (message) => { error = message; },
    onSettled: () => { activeController = null; },
    fallbackError: "fallback",
  });
  assert.equal(response, "CURRENT_EVIDENCE_INTERPRETATION");
  assert.equal(error, "");
});
