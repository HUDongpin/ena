"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { NovaExpertItem, NovaExpertPage } from "@/lib/nova/store";

export default function NovaExpertInbox({page,csrf,locale}: {page: NovaExpertPage; csrf: string; locale: string}) {
  const requests=page.requests;
  const pageLink=(view: "pending"|"history",after?:number)=>`/${locale}/plugins/operator?novaView=${view}${after?`&novaAfter=${after}`:""}#nova-expert-inbox`;
  const router = useRouter();
  const [busy,setBusy] = useState(false), busyRef = useRef(false);
  const [error,setError] = useState(""), [notice,setNotice] = useState("");
  const keys = useRef(new Map<string,{body:string;key:string}>());
  async function respond(event: FormEvent<HTMLFormElement>, item: NovaExpertItem) {
    event.preventDefault(); if (busyRef.current) return;
    const form = event.currentTarget, response = String(new FormData(form).get("response") ?? "").trim(); if (!response) return;
    busyRef.current = true; setBusy(true);setError("");setNotice("");
    const body=JSON.stringify({runId:item.request.runId,artifactId:item.request.artifactId,response});
    let receipt=keys.current.get(item.request.id); if(!receipt||receipt.body!==body){receipt={body,key:crypto.randomUUID()};keys.current.set(item.request.id,receipt);}
    try {
      const result=await fetch(`/api/nova/operator/sessions/${encodeURIComponent(item.sessionId)}/expert/${encodeURIComponent(item.request.id)}`,{method:"POST",headers:{"content-type":"application/json","x-plugin-lab-csrf":csrf,"idempotency-key":receipt.key},body});
      if(!result.ok){setError(result.status===409?"This draft or request changed. Refresh before responding.":"The response could not be saved. Retry or refresh your operator sign-in.");return;}
      form.reset();keys.current.delete(item.request.id);setNotice("Expert response saved. Nova continuation is queued; the draft remains unpublished.");router.refresh();
    } catch {setError("The response could not be confirmed. Retry to safely check the same request.");}
    finally {busyRef.current=false;setBusy(false);}
  }
  return <section id="nova-expert-inbox" className="plugin-operator-inbox" lang="en" dir="ltr" aria-labelledby="nova-expert-heading">
    <h2 id="nova-expert-heading">Nova expert inbox</h2>
    <nav aria-label="Nova expert request views"><Link href={pageLink("pending")} aria-current={page.view==="pending"?"page":undefined}>Pending requests</Link>{" · "}<Link href={pageLink("history")} aria-current={page.view==="history"?"page":undefined}>Response history</Link></nav>
    <p>{page.view==="pending"?"Pending requests are shown oldest first, independently of recent conversation activity.":"Answered and superseded requests are shown newest first."}</p>
    <p>Review the question for the exact run and draft below. Your response is visible to the researcher and can guide a new Nova continuation. It does not publish or scientifically approve the draft.</p>
    <p>Notification “sent” records SMTP acceptance. It does not confirm that a person received or read the email.</p>
    {error?<p role="alert" className="plugin-form-error">{error}</p>:null}{notice?<p role="status">{notice}</p>:null}
    {requests.length===0?<p>No Nova expert requests.</p>:requests.map(item=><article key={item.request.id} className="plugin-proposal-card">
      <h3>{item.title}</h3><p>{item.request.status} · Notification: {item.request.notificationStatus}</p>
      <dl><dt>Session</dt><dd>{item.sessionId}</dd><dt>Run</dt><dd>{item.request.runId}</dd><dt>Request-bound draft</dt><dd>{item.request.artifactId??"No draft yet"}</dd><dt>Current run status</dt><dd>{item.runStatus??"Unavailable"}</dd><dt>Latest saved version for this run</dt><dd>{item.latestArtifact?<>v{item.latestArtifact.version} · {item.latestArtifact.id} · {item.latestArtifact.createdAt}</>:"None available"}</dd></dl>
      <p style={{whiteSpace:"pre-wrap"}}>{item.request.question}</p><details><summary>Request context</summary><p style={{whiteSpace:"pre-wrap"}}>{item.request.context}</p></details>
      {item.artifact?<details><summary>Draft v{item.artifact.version}: code and checks</summary>
        <p>Source SHA-256: <code>{item.artifact.sourceHash}</code></p><p>Fixture SHA-256: <code>{item.artifact.fixtureHash}</code></p>
        <ul>{item.artifact.checks.map((check,index)=><li key={`${check.name}-${index}`}>{check.passed?"Passed":"Failed"}: {check.name} — {check.detail}</li>)}</ul>
        {item.artifact.files.map(file=><details key={file.path}><summary>{file.path}</summary><pre style={{overflowX:"auto",maxHeight:360}}><code>{file.content}</code></pre></details>)}
      </details>:<p>No executable draft was attached to this request.</p>}
      {(item.draftFiles.length||item.draftChecks.length) && (!item.artifact || JSON.stringify(item.draftFiles)!==JSON.stringify(item.artifact.files) || item.draftChecks.some(check=>!check.passed))?<details><summary>Saved working files and checks</summary>
        <p>Latest saved working material for the referenced run{item.draftUpdatedAt?` (${item.draftUpdatedAt})`:""}. These files may differ from the request-bound draft. The run status and latest saved version are shown above; check results describe these working files.</p>
        {item.draftChecks.length?<ul>{item.draftChecks.map((check,index)=><li key={`${check.name}-${index}`}>{check.passed?"Passed":"Failed"}: {check.name} — {check.detail}</li>)}</ul>:<p>No checks recorded for these working files.</p>}
        {item.draftFiles.map(file=><details key={file.path}><summary>{file.path}</summary><pre style={{overflowX:"auto",maxHeight:360}}><code>{file.content}</code></pre></details>)}
      </details>:null}
      {item.request.response?<p style={{whiteSpace:"pre-wrap"}}><strong>Expert response: </strong>{item.request.response}</p>:null}
      {item.request.status==="requested"?<form onSubmit={event=>void respond(event,item)} className="plugin-operator-transition"><label>Response visible to the researcher<textarea name="response" required maxLength={6000} rows={4} disabled={busy}/></label><button className="button button-primary" disabled={busy} type="submit">Save response and continue Nova</button></form>:null}
    </article>)}
    {page.nextCursor!==null?<Link className="button button-secondary" href={pageLink(page.view,page.nextCursor)}>Next {page.view==="pending"?"pending requests":"history page"}</Link>:null}
  </section>;
}
