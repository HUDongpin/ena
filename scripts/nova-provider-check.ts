#!/usr/bin/env -S node --import tsx
/** Operator-invoked live protocol smoke. Synthetic prompts only; never executes tools or sends mail. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { callNovaProvider, NovaProviderError } from "../lib/nova/provider";
import { getNovaModels, isNovaModelKey } from "../lib/nova/models";
import type { NovaProviderMessage } from "../lib/nova/types";

if (!process.argv.includes("--live")) {
  process.stderr.write("Live model checks require --live and incur provider usage. Select one with --model=qwen-max (or another configured model key).\n");
  process.exit(2);
}
const selected = process.argv.find(value => value.startsWith("--model="))?.slice(8);
if (selected && !isNovaModelKey(selected)) { process.stderr.write("Unknown Nova model key.\n"); process.exit(2); }
const models = getNovaModels({ ...process.env, ENA_NOVA_ENABLED: "true" }).filter(model => !selected || model.key === selected);
const report: { checkedAt: string; syntheticPromptsOnly: true; limits: string[]; checks: Record<string, unknown>[] } = {
  checkedAt: new Date().toISOString(), syntheticPromptsOnly: true,
  limits: ["Live tool-protocol check only; no plugin code was built or executed.", "Configured version labels are recorded; an upstream alias is not an immutable version guarantee."], checks: [],
};
for (const model of models) {
  const start = Date.now();
  if (!model.available) { report.checks.push({ model: model.key, apiModel: model.apiModel, status: "BLOCKED", reason: model.unavailableReason }); continue; }
  try {
    const signal = AbortSignal.timeout(30_000);
    const messages: NovaProviderMessage[] = [
      { role: "system", content: "This is an operator-controlled synthetic API compatibility test. Do not create files, run code, request an expert or use other tools. First call ask_user with exactly the question 'Use the synthetic fixture?'." },
      { role: "user", content: "Please make the one requested ask_user tool call." },
    ];
    const first = await callNovaProvider({ model, effort: "low", messages, signal });
    const calls = first.tool_calls;
    if (calls?.length !== 1 || calls[0].function.name !== "ask_user" || typeof JSON.parse(calls[0].function.arguments).question !== "string") throw new Error("Unexpected tool response");
    const second = await callNovaProvider({ model, effort: "low", signal, messages: [...messages, first,
      { role: "tool", tool_call_id: calls[0].id, content: "Synthetic fixture confirmed. This test is complete." },
      { role: "user", content: "Now reply with the text OK and no further tool calls." },
    ] });
    if (!second.content?.trim() || second.tool_calls?.length) throw new Error("Tool continuation failed");
    report.checks.push({ model: model.key, apiModel: model.apiModel, configuredVersion: model.version, status: "PASS", tool: "ask_user", continuation: true, elapsedMs: Date.now() - start });
  } catch (error) {
    report.checks.push({ model: model.key, apiModel: model.apiModel, status: "FAIL", reason: error instanceof NovaProviderError ? error.code : "protocol-check-failed", elapsedMs: Date.now() - start });
  }
  process.stdout.write(JSON.stringify(report.checks.at(-1)) + "\n");
}
const directory = resolve("output/nova-code"); await mkdir(directory, { recursive: true });
const filename = `provider-check-${selected ?? "all"}.json`;
await writeFile(resolve(directory, filename), JSON.stringify(report, null, 2));
process.stdout.write(`Saved redacted provider evidence to output/nova-code/${filename}\n`);
if (report.checks.some(check => check.status !== "PASS")) process.exitCode = 1;
