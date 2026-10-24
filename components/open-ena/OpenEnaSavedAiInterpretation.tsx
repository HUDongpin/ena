import type { SavedOpenEnaAiInterpretation } from "@/lib/open-ena/cloud-workspace-extras";
import type { OpenEnaAiInterpretationCopy } from "@/lib/open-ena-i18n";

/** Readable saved evidence; deliberately has no consent, retry or dispatch controls. */
export default function OpenEnaSavedAiInterpretation({ value, copy, note }: {
  value: SavedOpenEnaAiInterpretation; copy: OpenEnaAiInterpretationCopy; note: string;
}) {
  const response = value.response, receipt = value.auditReceipt;
  return <article className="ena-ai-result" data-testid="open-ena-saved-ai-interpretation">
    <p>{note}</p>
    <section><h4>{copy.observedPatterns}</h4><ol>
      {response.interpretation.observedPatterns.map((observation) => <li key={`${observation.statement}-${observation.evidenceRefs.join("-")}`}>
        <p>{observation.statement}</p><small>{observation.evidenceRefs.join(" · ")}</small></li>)}
    </ol></section>
    <section><h4>{copy.contextualQuestions}</h4><ul>{response.interpretation.contextualQuestions.map((question) => <li key={question}>{question}</li>)}</ul></section>
    <section><h4>{copy.limitations}</h4><ul>{response.interpretation.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul></section>
    <dl className="ena-ai-provenance" data-ena-ai-provenance="saved">
      <div><dt>{copy.provider}</dt><dd>{response.provider}</dd></div>
      <div><dt>{copy.model}</dt><dd>{response.model}</dd></div>
      <div><dt>{copy.generatedAt}</dt><dd>{response.generatedAt}</dd></div>
      <div><dt>{copy.promptVersion}</dt><dd>{response.promptVersion}</dd></div>
      <div><dt>{copy.evidenceKey}</dt><dd>{response.binding.evidenceKey}</dd></div>
      {receipt && <div className="ena-ai-audit-receipt"><dt>{copy.auditReceipt}</dt><dd>
        <div>{receipt.id}</div><div>{copy.requestSha256}: {receipt.requestSha256}</div>
        <div>{copy.consentPolicyVersion}: {receipt.consentPolicyVersion}</div>
        <div>{copy.recordedAt}: {receipt.recordedAt}</div><div>{copy.durable}: {receipt.durable}</div>
        <div>{copy.provider}: {receipt.provider || response.provider}; {copy.model}: {receipt.model || response.model}</div>
      </dd></div>}
    </dl>
    <details className="ena-ai-payload-preview" data-ena-ai-payload-preview="saved-aggregate">
      <summary>{copy.previewTitle}</summary><pre>{JSON.stringify(value.request, null, 2)}</pre>
    </details>
  </article>;
}
