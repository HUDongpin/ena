import { createHash, randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { readPluginLabConfiguration, type PluginLabConfiguration, type PluginLabEnvironment } from "@/lib/plugin-lab/config";
import { encryptPluginLabText, decryptPluginLabText, type PluginLabCiphertextV1 } from "@/lib/plugin-lab/crypto";
import { validateNovaFiles } from "./sdk";
import type { NovaSession, NovaSessionSummary, NovaRun, NovaModel, NovaEffort, NovaEvent, NovaClaim, NovaCheckpoint, NovaRunUpdate, NovaExpertRequest, NovaArtifactVersion, NovaFile, NovaCheck } from "./types";

export class NovaStoreError extends Error { constructor(public readonly code: string) { super(code); this.name = "NovaStoreError"; } }
export interface NovaMutation { ownerRef: string; idempotencyKey: string; requestHash: string; now?: Date }
interface SessionMutation extends NovaMutation { sessionId: string }
export interface NovaExpertItem { sessionId: string; title: string; locale: string; request: NovaExpertRequest; artifact: NovaArtifactVersion | null; draftFiles: NovaFile[]; draftChecks: NovaCheck[]; draftUpdatedAt: string | null }
export interface NovaExpertQuery { view?: "pending" | "history"; after?: number; limit?: number }
export interface NovaExpertPage { requests: NovaExpertItem[]; nextCursor: number | null; view: "pending" | "history" }
export interface NovaNotification { id: string; sessionId: string; requestId: string; locale: string; claimToken: string; attempts: number }
export interface NovaStore {
  createSession(input: NovaMutation & { locale: string; title?: string }): Promise<NovaSession>;
  listSessions(ownerRef: string): Promise<NovaSessionSummary[]>;
  readSession(sessionId: string, ownerRef: string): Promise<NovaSession | null>;
  appendMessage(input: SessionMutation & { content: string; model: NovaModel; effort: NovaEffort }): Promise<{ session: NovaSession; run: NovaRun }>;
  controlRun(input: SessionMutation & { runId: string; action: "cancel" | "resume" | "retry" }): Promise<NovaSession>;
  restoreArtifact(input: SessionMutation & { artifactId: string }): Promise<NovaSession>;
  requestExpert(input: SessionMutation & { question: string; runId: string; artifactId: string | null }): Promise<NovaSession>;
  readEvents(sessionId: string, ownerRef: string, after: number): Promise<{ events: NovaEvent[]; cursor: number } | null>;
  claimNextRun(now?: Date): Promise<NovaClaim | null>;
  heartbeat(runId: string, claimToken: string, now?: Date): Promise<boolean>;
  readClaim(runId: string, claimToken: string, now?: Date): Promise<NovaClaim | null>;
  applyRunUpdate(runId: string, claimToken: string, update: NovaRunUpdate, now?: Date): Promise<boolean>;
  listExpertRequests(query?: NovaExpertQuery): Promise<NovaExpertPage>;
  respondExpert(input: SessionMutation & { requestId: string; runId: string; artifactId: string | null; response: string; actorRef: string }): Promise<NovaSession>;
  claimNotifications(limit: number, now?: Date): Promise<NovaNotification[]>;
  settleNotification(input: { id: string; claimToken: string; success: boolean; now?: Date }): Promise<boolean>;
}
const working = new Set(["queued", "planning", "building", "testing"]);
const finished = new Set(["ready", "failed", "cancelled"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
function fail(code: string): never { throw new NovaStoreError(code); }
function instant(now = new Date()) { if (!Number.isFinite(+now)) fail("invalid-time"); return now; }
function findRun(session: NovaSession, id: string) { return session.runs.find(run => run.id === id) ?? fail("not-found"); }
function draftFiles(value: NovaFile[]): NovaFile[] {
  try { return validateNovaFiles(value); } catch { return fail("invalid-draft-files"); }
}
function draftChecks(value: unknown): NovaCheck[] {
  if(!Array.isArray(value) || value.length>32) fail("invalid-draft-checks");
  return value.map(item=>{
    if(!item || typeof item!=="object" || Array.isArray(item) || Object.getPrototypeOf(item)!==Object.prototype
      || Object.keys(item).length!==3 || Object.keys(item).some(key=>!["name","passed","detail"].includes(key))
      || typeof item.name!=="string" || !/^[a-z][a-z0-9-]{0,119}$/u.test(item.name) || typeof item.passed!=="boolean"
      || typeof item.detail!=="string" || item.detail.length>4000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(item.detail)) fail("invalid-draft-checks");
    return {name:item.name,passed:item.passed,detail:item.detail};
  });
}

/** Sessions/checkpoints are chunked only to reuse the existing bounded AES-GCM envelope.
 * AAD binds each chunk to its session/run, index and chunk count. No plaintext content enters SQL. */
export function createNovaStore(pool: Pool, configuration: PluginLabConfiguration): NovaStore {
  function seal(value: unknown, binding: string) {
    const text = JSON.stringify(value); if (Buffer.byteLength(text) > 8 * 1024 * 1024) fail("session-limit");
    const chunks = text.match(/[\s\S]{1,16000}/gu)!;
    return chunks.map((chunk, i) => encryptPluginLabText(chunk, configuration.encryptionKey, "v1", `${binding}:${i}:${chunks.length}`));
  }
  function open<T>(value: PluginLabCiphertextV1[], binding: string): T {
    if (!Array.isArray(value) || value.length < 1 || value.length > 600) fail("store-unavailable");
    return JSON.parse(value.map((chunk, i) => decryptPluginLabText(chunk, { v1: configuration.encryptionKey }, `${binding}:${i}:${value.length}`)).join("")) as T;
  }
  async function tx<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    let client: PoolClient | undefined; let discard = false;
    try { client = await pool.connect(); await client.query("BEGIN"); await client.query("SET LOCAL statement_timeout='5s'"); await client.query("SET LOCAL lock_timeout='3s'"); await client.query("SET LOCAL idle_in_transaction_session_timeout='10s'"); const result = await work(client); await client.query("COMMIT"); return result; }
    catch (error) { if (client) { try { await client.query("ROLLBACK"); } catch { discard = true; } } if (error instanceof NovaStoreError) throw error; throw new NovaStoreError("store-unavailable"); }
    finally { client?.release(discard); }
  }
  async function read(client: PoolClient, id: string, ownerRef?: string, lock = false) {
    const result = await client.query(`SELECT * FROM ena_nova_sessions WHERE session_id=$1${ownerRef ? " AND owner_ref=$2" : ""}${lock ? " FOR UPDATE" : ""}`, ownerRef ? [id, ownerRef] : [id]);
    const row = result.rows[0]; return row ? { session: open<NovaSession>(row.document_cipher, `nova-session:${id}`), ownerRef: String(row.owner_ref) } : null;
  }
  async function owned(client: PoolClient, input: SessionMutation) { return (await read(client, input.sessionId, input.ownerRef, true))?.session ?? fail("not-found"); }
  async function save(client: PoolClient, session: NovaSession, now: Date) {
    session.updatedAt = now.toISOString();
    await client.query("UPDATE ena_nova_sessions SET document_cipher=$2::jsonb,updated_at=$3 WHERE session_id=$1", [session.id, JSON.stringify(seal(session, `nova-session:${session.id}`)), now]);
    if(session.expertRequests.length) await client.query(`UPDATE ena_nova_notifications n SET request_status=r.status
      FROM jsonb_to_recordset($2::jsonb) AS r(request_id uuid,status text)
      WHERE n.session_id=$1 AND n.request_id=r.request_id AND n.request_status IS DISTINCT FROM r.status`,
      [session.id,JSON.stringify(session.expertRequests.map(request=>({request_id:request.id,status:request.status})))]);
  }
  async function event(client: PoolClient, session: NovaSession, type: NovaEvent["type"], detail: string, now: Date, runId?: string) {
    await client.query("INSERT INTO ena_nova_events(session_id,run_id,event_type,detail,created_at) VALUES($1,$2,$3,$4,$5)", [session.id, runId ?? null, type, detail, now]);
  }
  async function replay(client: PoolClient, input: NovaMutation, action: string, subject: string) {
    if (!uuid.test(input.idempotencyKey) || !/^[0-9a-f]{64}$/u.test(input.requestHash)) fail("invalid-request");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`nova-receipt:${input.ownerRef}:${input.idempotencyKey}`]);
    const row = (await client.query("SELECT * FROM ena_nova_receipts WHERE owner_ref=$1 AND idempotency_key=$2", [input.ownerRef, input.idempotencyKey])).rows[0];
    if (row && (row.action !== action || row.subject !== subject || row.request_hash !== input.requestHash)) fail("idempotency-conflict");
    return row;
  }
  async function receipt(client: PoolClient, input: NovaMutation, action: string, subject: string, sessionId: string, runId?: string) {
    await client.query("INSERT INTO ena_nova_receipts(owner_ref,idempotency_key,action,subject,request_hash,session_id,run_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [input.ownerRef, input.idempotencyKey, action, subject, input.requestHash, sessionId, runId ?? null, instant(input.now)]);
  }
  async function queueState(client: PoolClient, run: NovaRun, state: "queued" | "running" | "waiting" | "finished", reset = false) {
    await client.query(`UPDATE ena_nova_runs SET queue_state=$2,claim_token=NULL,lease_expires_at=NULL${reset ? ",attempts=0" : ""} WHERE run_id=$1`, [run.id, state]);
  }
  async function expert(client: PoolClient, session: NovaSession, input: { runId: string; artifactId: string | null; question: string; context: string }, now: Date) {
    if (input.artifactId !== session.activeArtifactId) fail("stale-artifact");
    const run = findRun(session, input.runId);
    if (session.expertRequests.some(item => item.status === "requested")) fail("expert-pending");
    const request: NovaExpertRequest = { ...input, id: randomUUID(), createdAt: now.toISOString(), status: "requested", notificationStatus: "pending" };
    session.expertRequests.push(request); run.status = "waiting-expert"; run.updatedAt = now.toISOString();
    await queueState(client, run, "waiting");
    await client.query("INSERT INTO ena_nova_notifications(notification_id,session_id,request_id,next_attempt_at,created_at) VALUES($1,$2,$3,$4,$4)", [randomUUID(), session.id, request.id, now]);
    await event(client, session, "expert", "expert-requested", now, run.id);
  }
  async function claimFrom(client: PoolClient, runId: string, token: string, now: Date, lock = false) {
    if (!uuid.test(runId) || !uuid.test(token)) return null;
    const lookup = (await client.query("SELECT session_id FROM ena_nova_runs WHERE run_id=$1", [runId])).rows[0]; if (!lookup) return null;
    const record = await read(client, lookup.session_id, undefined, lock); if (!record) return null;
    const row = (await client.query("SELECT * FROM ena_nova_runs WHERE run_id=$1 AND claim_token=$2 AND queue_state='running' AND lease_expires_at>$3", [runId, token, now])).rows[0];
    if (!row) return null;
    const run = findRun(record.session, runId); if (!working.has(run.status)) return null;
    return { run, session: record.session, ownerRef: record.ownerRef, claimToken: token, checkpoint: row.checkpoint_cipher ? open<NovaCheckpoint>(row.checkpoint_cipher, `nova-checkpoint:${runId}`) : null } satisfies NovaClaim;
  }
  const store: NovaStore = {
    async createSession(input) { return tx(async client => {
      const previous = await replay(client, input, "create-session", "sessions");
      if (previous) return (await read(client, previous.session_id, input.ownerRef))?.session ?? fail("not-found");
      // Different receipt keys still share the owner's quota. Hold this through insert/commit.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`nova-session-quota:${input.ownerRef}`]);
      const count = (await client.query("SELECT count(*)::int AS n FROM ena_nova_sessions WHERE owner_ref=$1", [input.ownerRef])).rows[0].n;
      if (count >= 100) fail("session-limit");
      const now = instant(input.now), id = randomUUID();
      const session: NovaSession = { id, title: input.title || "New Nova session", locale: input.locale, createdAt: now.toISOString(), updatedAt: now.toISOString(), messages: [], runs: [], artifacts: [], expertRequests: [], activeArtifactId: null };
      await client.query("INSERT INTO ena_nova_sessions(session_id,owner_ref,document_cipher,created_at,updated_at) VALUES($1,$2,$3::jsonb,$4,$4)", [id, input.ownerRef, JSON.stringify(seal(session, `nova-session:${id}`)), now]);
      await receipt(client, input, "create-session", "sessions", id); return session;
    }); },
    async listSessions(ownerRef) { return tx(async client => (await client.query("SELECT session_id,document_cipher FROM ena_nova_sessions WHERE owner_ref=$1 ORDER BY updated_at DESC LIMIT 100", [ownerRef])).rows.map(row => {
      const s = open<NovaSession>(row.document_cipher, `nova-session:${row.session_id}`); return { id: s.id, title: s.title, createdAt: s.createdAt, updatedAt: s.updatedAt, status: s.runs.at(-1)?.status ?? null };
    })); },
    async readSession(id, ownerRef) { return tx(async client => (await read(client, id, ownerRef))?.session ?? null); },
    async appendMessage(input) { return tx(async client => {
      const previous = await replay(client, input, "message", input.sessionId); const session = await owned(client, input);
      if (previous) return { session, run: findRun(session, previous.run_id) };
      if (session.runs.some(run => working.has(run.status))) fail("run-active");
      if (session.messages.length >= 200 || session.runs.length >= 100) fail("session-limit");
      const now = instant(input.now);
      const waitingRun = session.runs.at(-1);
      let carriedCheckpoint: NovaCheckpoint | null = null;
      if (waitingRun?.status.startsWith("waiting-")) {
        const row = (await client.query("SELECT checkpoint_cipher FROM ena_nova_runs WHERE run_id=$1", [waitingRun.id])).rows[0];
        if (row?.checkpoint_cipher) carriedCheckpoint = {...open<NovaCheckpoint>(row.checkpoint_cipher, `nova-checkpoint:${waitingRun.id}`), messages: [], stepCount: 0, repairCount: 0};
      }
      for (const run of session.runs.filter(run => !finished.has(run.status))) { run.status = "cancelled"; run.updatedAt = now.toISOString(); await queueState(client, run, "finished"); }
      for (const request of session.expertRequests) if (request.status === "requested") request.status = "superseded";
      const message = { id: randomUUID(), role: "user" as const, content: input.content, createdAt: now.toISOString() };
      const run: NovaRun = { id: randomUUID(), sessionId: session.id, status: "queued", model: input.model, effort: input.effort, createdAt: now.toISOString(), updatedAt: now.toISOString(), messageId: message.id, baseArtifactId: session.activeArtifactId, stepCount: 0, repairCount: 0 };
      if (carriedCheckpoint) {
        run.stepCount=carriedCheckpoint.stepCount; run.repairCount=carriedCheckpoint.repairCount; run.draftFiles=draftFiles(carriedCheckpoint.files);
        run.draftChecks=JSON.stringify(waitingRun?.draftFiles)===JSON.stringify(run.draftFiles)?draftChecks(waitingRun?.draftChecks??[]):[];
      }
      session.messages.push({ ...message, runId: run.id }); session.runs.push(run);
      await client.query("INSERT INTO ena_nova_runs(run_id,session_id,queue_state,created_at) VALUES($1,$2,'queued',$3)", [run.id, session.id, now]);
      if (carriedCheckpoint) await client.query("UPDATE ena_nova_runs SET checkpoint_cipher=$2::jsonb WHERE run_id=$1", [run.id, JSON.stringify(seal(carriedCheckpoint, `nova-checkpoint:${run.id}`))]);
      await save(client, session, now); await event(client, session, "message", "message-created", now, run.id); await event(client, session, "run", "run-queued", now, run.id);
      await receipt(client, input, "message", input.sessionId, session.id, run.id); return { session, run };
    }); },
    async controlRun(input) { return tx(async client => {
      const action = `run-${input.action}`, subject = `${input.sessionId}:${input.runId}`;
      const previous = await replay(client, input, action, subject); const session = await owned(client, input); if (previous) return session;
      const run = findRun(session, input.runId), now = instant(input.now);
      if (input.action === "cancel") { if (finished.has(run.status)) fail("run-conflict"); run.status = "cancelled"; await queueState(client, run, "finished"); }
      else { if (session.runs.at(-1)?.id !== run.id || !["cancelled", "failed", "waiting-user"].includes(run.status)) fail("run-conflict");
        run.status = "queued"; delete run.errorCode; await queueState(client, run, "queued", true);
        run.stepCount=0; run.repairCount=0;
        const row=(await client.query("SELECT checkpoint_cipher FROM ena_nova_runs WHERE run_id=$1",[run.id])).rows[0];
        if(row?.checkpoint_cipher){
          const checkpoint={...open<NovaCheckpoint>(row.checkpoint_cipher,`nova-checkpoint:${run.id}`),stepCount:0,repairCount:0};
          if(input.action==="retry") checkpoint.messages=[];
          await client.query("UPDATE ena_nova_runs SET checkpoint_cipher=$2::jsonb WHERE run_id=$1",[run.id,JSON.stringify(seal(checkpoint,`nova-checkpoint:${run.id}`))]);
        }
      }
      for (const request of session.expertRequests) if (request.runId === run.id && request.status === "requested") request.status = "superseded";
      run.updatedAt = now.toISOString(); await save(client, session, now); await event(client, session, "run", `run-${input.action === "cancel" ? "cancelled" : "queued"}`, now, run.id);
      await receipt(client, input, action, subject, session.id, run.id); return session;
    }); },
    async restoreArtifact(input) { return tx(async client => {
      const subject = `${input.sessionId}:${input.artifactId}`; const previous = await replay(client, input, "restore-artifact", subject); const session = await owned(client, input); if (previous) return session;
      if (session.runs.some(run => working.has(run.status))) fail("run-active");
      const source = session.artifacts.find(item => item.id === input.artifactId) ?? fail("not-found"), now = instant(input.now);
      const restored = { ...source, id: randomUUID(), version: session.artifacts.length + 1, createdAt: now.toISOString(), restoredFrom: source.id };
      session.artifacts.push(restored); session.activeArtifactId = restored.id;
      for (const run of session.runs.filter(run => run.status.startsWith("waiting-"))) {
        run.status="cancelled"; run.updatedAt=now.toISOString(); await queueState(client,run,"finished");
      }
      for (const request of session.expertRequests) if (request.status === "requested") request.status = "superseded";
      const latestRun=session.runs.at(-1);
      if(latestRun) {
        latestRun.draftFiles=draftFiles(restored.files); latestRun.draftChecks=draftChecks(restored.checks);
        const checkpoint: NovaCheckpoint={messages:[],files:restored.files,stepCount:0,repairCount:0};
        await client.query("UPDATE ena_nova_runs SET checkpoint_cipher=$2::jsonb WHERE run_id=$1",[latestRun.id,JSON.stringify(seal(checkpoint,`nova-checkpoint:${latestRun.id}`))]);
      }
      await save(client, session, now); await event(client, session, "artifact", "artifact-restored", now, restored.runId); await receipt(client, input, "restore-artifact", subject, session.id); return session;
    }); },
    async requestExpert(input) { return tx(async client => {
      const previous = await replay(client, input, "request-expert", input.sessionId); const session = await owned(client, input); if (previous) return session;
      const run = session.runs.at(-1) ?? fail("run-required");
      if(run.id!==input.runId || session.activeArtifactId!==input.artifactId) fail("stale-expert-request");
      if (working.has(run.status)) fail("run-active");
      const now = instant(input.now); await expert(client, session, {runId: input.runId, artifactId: input.artifactId, question: input.question, context: `Run ${input.runId}; draft ${input.artifactId ?? "none"}.`}, now);
      await save(client, session, now); await receipt(client, input, "request-expert", input.sessionId, session.id); return session;
    }); },
    async readEvents(id, ownerRef, after) { return tx(async client => {
      if (!(await read(client, id, ownerRef))) return null;
      const rows = (await client.query("SELECT * FROM ena_nova_events WHERE session_id=$1 AND cursor>$2 ORDER BY cursor LIMIT 100", [id, after])).rows;
      const events = rows.map(row => ({cursor: Number(row.cursor), sessionId: id, ...(row.run_id ? {runId: String(row.run_id)} : {}), type: row.event_type, detail: row.detail, createdAt: new Date(row.created_at).toISOString()} satisfies NovaEvent));
      return {events, cursor: events.at(-1)?.cursor ?? after};
    }); },
    async claimNextRun(now = new Date()) { return tx(async client => {
      instant(now);
      const candidates = (await client.query(`SELECT s.session_id FROM ena_nova_sessions s JOIN ena_nova_runs r USING(session_id)
        WHERE r.queue_state='queued' OR (r.queue_state='running' AND r.lease_expires_at<=$1)
        ORDER BY r.created_at FOR UPDATE OF s SKIP LOCKED LIMIT 1`, [now])).rows;
      if (!candidates[0]) return null;
      const record = (await read(client, candidates[0].session_id))!;
      const row = (await client.query("SELECT * FROM ena_nova_runs WHERE session_id=$1 AND queue_state IN ('queued','running') FOR UPDATE", [record.session.id])).rows[0];
      if (!row || (row.queue_state === "running" && new Date(row.lease_expires_at) > now)) return null;
      const run = findRun(record.session, row.run_id);
      if (row.attempts >= 3) { run.status = "failed"; run.errorCode = "worker-recovery-exhausted"; run.updatedAt = now.toISOString(); await queueState(client, run, "finished"); await save(client, record.session, now); await event(client, record.session, "run", "run-failed", now, run.id); return null; }
      const token = randomUUID(); run.status = "planning"; run.updatedAt = now.toISOString();
      await client.query("UPDATE ena_nova_runs SET queue_state='running',claim_token=$2,lease_expires_at=$3::timestamptz+interval '60 seconds',attempts=attempts+1 WHERE run_id=$1", [run.id, token, now]);
      await save(client, record.session, now); await event(client, record.session, "run", "run-claimed", now, run.id);
      return {run, session: record.session, ownerRef: record.ownerRef, claimToken: token, checkpoint: row.checkpoint_cipher ? open<NovaCheckpoint>(row.checkpoint_cipher, `nova-checkpoint:${run.id}`) : null};
    }); },
    async heartbeat(runId, token, now = new Date()) { return tx(async client => {
      if (!await claimFrom(client, runId, token, now, true)) return false;
      return (await client.query("UPDATE ena_nova_runs SET lease_expires_at=$3::timestamptz+interval '60 seconds' WHERE run_id=$1 AND claim_token=$2 AND lease_expires_at>$3 RETURNING run_id", [runId, token, now])).rows.length === 1;
    }); },
    async readClaim(runId, token, now = new Date()) { return tx(client => claimFrom(client, runId, token, now)); },
    async applyRunUpdate(runId, token, update, now = new Date()) { return tx(async client => {
      const claim = await claimFrom(client, runId, token, now, true); if (!claim) return false;
      const {session, run} = claim;
      const files=update.files===undefined?undefined:draftFiles(update.files);
      const checks=update.checks===undefined?undefined:draftChecks(update.checks);
      if(files!==undefined) {
        if(checks===undefined && JSON.stringify(files)!==JSON.stringify(run.draftFiles)) run.draftChecks=[];
        run.draftFiles=files;
      }
      if(checks!==undefined) run.draftChecks=checks;
      if (update.status) run.status = update.status;
      if (update.stepCount !== undefined) run.stepCount = update.stepCount;
      if (update.repairCount !== undefined) run.repairCount = update.repairCount;
      if (update.errorCode) run.errorCode = update.errorCode;
      run.updatedAt = now.toISOString();
      if (update.checkpoint) await client.query("UPDATE ena_nova_runs SET checkpoint_cipher=$2::jsonb WHERE run_id=$1", [runId, JSON.stringify(seal(update.checkpoint, `nova-checkpoint:${runId}`))]);
      if (update.message) { session.messages.push({id: randomUUID(), role: "assistant", content: update.message, createdAt: now.toISOString(), runId}); await event(client, session, "message", "message-created", now, runId); }
      if (update.artifact) {
        if (update.artifact.runId !== runId || update.artifact.status !== "draft" || session.artifacts.some(a => a.id === update.artifact!.id)) fail("invalid-artifact");
        const artifact = {...update.artifact, version: session.artifacts.length + 1}; session.artifacts.push(artifact); session.activeArtifactId = artifact.id;
        await event(client, session, "artifact", "artifact-created", now, runId);
      }
      if (update.expert) { if (update.expert.runId !== runId) fail("invalid-request"); await expert(client, session, update.expert, now); }
      else if (finished.has(run.status) || run.status.startsWith("waiting-")) await queueState(client, run, finished.has(run.status) ? "finished" : "waiting");
      await save(client, session, now); await event(client, session, "run", `run-${run.status}`, now, runId); return true;
    }); },
    async listExpertRequests(query = {}) { return tx(async client => {
      const view=query.view??"pending", limit=query.limit??25;
      if(!["pending","history"].includes(view) || !Number.isInteger(limit) || limit<1 || limit>50
        || query.after!==undefined && (!Number.isSafeInteger(query.after) || query.after<1)) fail("invalid-request");
      const pending=view==="pending", after=query.after??(pending?0:Number.MAX_SAFE_INTEGER);
      // Select the request page through a partial index before fetching encrypted session content.
      const rows=(await client.query(`WITH page AS MATERIALIZED (
          SELECT request_id,session_id,request_cursor FROM ena_nova_notifications
          WHERE request_status${pending?"='requested'":"<>'requested'"} AND request_cursor${pending?">":"<"}$1
          ORDER BY request_cursor ${pending?"ASC":"DESC"} LIMIT $2)
        SELECT page.request_id,page.request_cursor,s.session_id,s.document_cipher
        FROM page JOIN ena_nova_sessions s USING(session_id) ORDER BY page.request_cursor ${pending?"ASC":"DESC"}`, [after,limit+1])).rows;
      const requests=rows.slice(0,limit).map(row=>{
        const s=open<NovaSession>(row.document_cipher,`nova-session:${row.session_id}`);
        const request=s.expertRequests.find(item=>item.id===row.request_id)??fail("store-unavailable");
        const run=s.runs.find(item=>item.id===request.runId);
        return {sessionId:s.id,title:s.title,locale:s.locale,request,artifact:s.artifacts.find(artifact=>artifact.id===request.artifactId)??null,
          draftFiles:run?.draftFiles??[],draftChecks:run?.draftChecks??[],draftUpdatedAt:run?.updatedAt??null};
      });
      return {requests,view,nextCursor:rows.length>limit?Number(rows[limit-1].request_cursor):null};
    }); },
    async respondExpert(input) { return tx(async client => {
      const scoped = {...input, ownerRef: `operator:${input.actorRef}`}, subject = `${input.sessionId}:${input.requestId}`;
      const previous = await replay(client, scoped, "expert-response", subject); const session = (await read(client, input.sessionId, undefined, true))?.session ?? fail("not-found"); if (previous) return session;
      const request = session.expertRequests.find(item => item.id === input.requestId) ?? fail("not-found"); const run = findRun(session, request.runId);
      if (request.status !== "requested" || request.runId !== input.runId || request.artifactId !== input.artifactId || session.activeArtifactId !== input.artifactId || session.runs.at(-1)?.id !== run.id || run.status !== "waiting-expert") fail("stale-expert-request");
      const now = instant(input.now); request.status = "answered"; request.response = input.response; request.respondedAt = now.toISOString();
      session.messages.push({id: randomUUID(), role: "expert", content: input.response, createdAt: now.toISOString(), runId: run.id});
      run.status = "queued"; run.stepCount=0; run.repairCount=0; run.updatedAt = now.toISOString(); await queueState(client, run, "queued", true);
      // Rebuild provider context with the expert reply while retaining unfinished files and bounded work counts.
      const checkpointRow = (await client.query("SELECT checkpoint_cipher FROM ena_nova_runs WHERE run_id=$1", [run.id])).rows[0];
      if (checkpointRow?.checkpoint_cipher) {
        const checkpoint = {...open<NovaCheckpoint>(checkpointRow.checkpoint_cipher, `nova-checkpoint:${run.id}`), messages: [], stepCount: 0, repairCount: 0};
        await client.query("UPDATE ena_nova_runs SET checkpoint_cipher=$2::jsonb WHERE run_id=$1", [run.id, JSON.stringify(seal(checkpoint, `nova-checkpoint:${run.id}`))]);
      }
      await save(client, session, now); await event(client, session, "expert", "expert-answered", now, run.id); await receipt(client, scoped, "expert-response", subject, session.id, run.id); return session;
    }); },
    async claimNotifications(limit, now = new Date()) { return tx(async client => {
      if (!Number.isInteger(limit) || limit < 1 || limit > 20) fail("invalid-request");
      // Match the session-then-job lock order used by cancellation, replies and settlement.
      const candidates = (await client.query(`SELECT n.notification_id,s.session_id FROM ena_nova_notifications n JOIN ena_nova_sessions s USING(session_id)
        WHERE (n.status='pending' AND n.next_attempt_at<=$1) OR (n.status='sending' AND n.lease_expires_at<=$1)
        ORDER BY n.created_at FOR UPDATE OF s SKIP LOCKED LIMIT $2`, [now, limit])).rows;
      const claims: NovaNotification[] = [];
      for (const candidate of candidates) {
        const row = (await client.query("SELECT * FROM ena_nova_notifications WHERE notification_id=$1 FOR UPDATE", [candidate.notification_id])).rows[0];
        if (!row || !["pending","sending"].includes(row.status) || row.status === "sending" && new Date(row.lease_expires_at) > now) continue;
        const record = await read(client, row.session_id); if (!record) continue;
        const request = record.session.expertRequests.find(r => r.id === row.request_id);
        if (row.attempts >= 5 || request?.status !== "requested") {
          await client.query("UPDATE ena_nova_notifications SET status='failed',claim_token=NULL,lease_expires_at=NULL WHERE notification_id=$1", [row.notification_id]);
          if(request) request.notificationStatus="failed"; await save(client,record.session,now); await event(client,record.session,"expert","expert-notification-failed",now,request?.runId); continue;
        }
        const token = randomUUID(); await client.query("UPDATE ena_nova_notifications SET status='sending',attempts=attempts+1,claim_token=$2,lease_expires_at=$3::timestamptz+interval '120 seconds' WHERE notification_id=$1", [row.notification_id, token, now]);
        claims.push({id: row.notification_id, sessionId: row.session_id, requestId: row.request_id, locale: record.session.locale, claimToken: token, attempts: row.attempts + 1});
      } return claims;
    }); },
    async settleNotification(input) { return tx(async client => {
      const now = instant(input.now), lookup = (await client.query("SELECT session_id FROM ena_nova_notifications WHERE notification_id=$1", [input.id])).rows[0]; if (!lookup) return false;
      const record = await read(client, lookup.session_id, undefined, true); if (!record) return false;
      const result = await client.query(`UPDATE ena_nova_notifications SET status=CASE WHEN $3 THEN 'sent' WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,
        claim_token=NULL,lease_expires_at=NULL,next_attempt_at=$4::timestamptz+make_interval(secs => LEAST(3600,30*power(2,attempts))::integer)
        WHERE notification_id=$1 AND claim_token=$2 AND status='sending' AND lease_expires_at>$4 RETURNING request_id,status`, [input.id, input.claimToken, input.success, now]);
      if (!result.rows[0]) return false;
      const request = record.session.expertRequests.find(r => r.id === result.rows[0].request_id); if (request) request.notificationStatus = result.rows[0].status;
      await save(client, record.session, now); await event(client,record.session,"expert",`expert-notification-${result.rows[0].status}`,now,request?.runId); return true;
    }); },
  }; return store;
}
const stores = new Map<string, NovaStore>();
export async function createProductionNovaStore(environment: PluginLabEnvironment = process.env): Promise<NovaStore | null> {
  const config = readPluginLabConfiguration(environment); if (!config) return null;
  const key = createHash("sha256").update(config.databaseUrl).update(config.encryptionKey).digest("hex");
  const existing = stores.get(key); if (existing) return existing;
  const pool = new Pool({connectionString: config.databaseUrl, max: 3, connectionTimeoutMillis: 2_000, idleTimeoutMillis: 30_000, statement_timeout: 5_000, allowExitOnIdle: true});
  pool.on("error", () => console.error("nova-store:idle-connection-error"));
  const store = createNovaStore(pool, config); stores.set(key, store); return store;
}
