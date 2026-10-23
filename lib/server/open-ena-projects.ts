import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { OPEN_ENA_CLOUD_LIMITS, OPEN_ENA_CLOUD_PROJECT_ID, openEnaCloudProjectTitle,
  type OpenEnaCloudProject, type OpenEnaCloudProjectList, type OpenEnaCloudProjectSummary } from "../open-ena/cloud-project-contract";
import { inOpenEnaCloudTransaction, OpenEnaCloudError } from "./open-ena-cloud-db";

type Owner = { userId: string; sessionVersion: number };
type Limits = { projects: number; bytes: number; snapshotBytes: number };
type StoredProject = { id: string; owner_id: string; title: string; revision: number; size_bytes: number;
  content_ciphertext: Buffer; content_sha256: string; created_at: Date; updated_at: Date; archived_at: Date | null };
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const aad = (owner: string, id: string, revision: number) => Buffer.from(`open-ena-project-v1:${owner}:${id}:${revision}`);

function summary(row: StoredProject): OpenEnaCloudProjectSummary {
  return { id: row.id, title: row.title, revision: row.revision, bytes: row.size_bytes,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(), archived: row.archived_at !== null };
}

export function createOpenEnaProjectsStore(pool: Pool, suppliedKey: Buffer, limits: Limits = OPEN_ENA_CLOUD_LIMITS) {
  if (!Buffer.isBuffer(suppliedKey) || suppliedKey.length !== 32) throw new OpenEnaCloudError("unavailable");
  const key = Buffer.from(suppliedKey);
  const encrypt = (text: string, owner: string, id: string, revision: number) => {
    const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(aad(owner, id, revision));
    return Buffer.concat([iv, cipher.update(text, "utf8"), cipher.final(), cipher.getAuthTag()]);
  };
  const decrypt = (row: StoredProject) => {
    try {
      const bytes = row.content_ciphertext, decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
      decipher.setAAD(aad(row.owner_id, row.id, row.revision)); decipher.setAuthTag(bytes.subarray(-16));
      const text = Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString("utf8");
      if (digest(text) !== row.content_sha256 || Buffer.byteLength(text) !== row.size_bytes) throw new Error("Invalid project content.");
      return text;
    } catch { throw new OpenEnaCloudError("unavailable"); }
  };
  const transact = <T>(owner: Owner, action: (client: PoolClient) => Promise<T>, write = false) => {
    if (!OPEN_ENA_CLOUD_PROJECT_ID.test(owner.userId) || !Number.isSafeInteger(owner.sessionVersion) || owner.sessionVersion < 1) throw new OpenEnaCloudError("unauthenticated");
    return inOpenEnaCloudTransaction(pool, async (client) => {
      await client.query("SELECT set_config('open_ena.user_id',$1,true)", [owner.userId]);
      const account = await client.query(`SELECT id FROM open_ena_users WHERE id=$1 AND session_version=$2 AND disabled_at IS NULL FOR ${write ? "UPDATE" : "SHARE"}`, [owner.userId, owner.sessionVersion]);
      if (!account.rowCount) throw new OpenEnaCloudError("unauthenticated");
      return action(client);
    });
  };
  const readRow = async (client: PoolClient, owner: Owner, id: string): Promise<StoredProject> => {
    if (!OPEN_ENA_CLOUD_PROJECT_ID.test(id)) throw new OpenEnaCloudError("not-found");
    const result = await client.query("SELECT * FROM open_ena_projects WHERE id=$1 AND owner_id=$2", [id, owner.userId]);
    if (!result.rowCount) throw new OpenEnaCloudError("not-found");
    return result.rows[0] as StoredProject;
  };
  const usage = async (client: PoolClient, owner: Owner) => (await client.query(
    "SELECT count(*)::int AS count,COALESCE(sum(size_bytes),0)::bigint AS bytes FROM open_ena_projects WHERE owner_id=$1", [owner.userId])).rows[0] as { count: number; bytes: string };
  const validated = (titleValue: string, snapshot: string) => {
    const title = openEnaCloudProjectTitle(titleValue);
    if (!title || typeof snapshot !== "string" || snapshot.length === 0) throw new OpenEnaCloudError("invalid-input");
    const bytes = Buffer.byteLength(snapshot);
    if (bytes > limits.snapshotBytes) throw new OpenEnaCloudError("too-large");
    return { title, bytes, hash: digest(snapshot) };
  };
  const revisionMatches = (row: StoredProject, expected: number) => {
    if (!Number.isSafeInteger(expected) || expected < 1) throw new OpenEnaCloudError("invalid-input");
    if (row.revision !== expected) throw new OpenEnaCloudError("conflict");
  };
  return {
    async list(owner: Owner, archived = false): Promise<OpenEnaCloudProjectList> {
      return transact(owner, async (client) => {
        const result = await client.query("SELECT id,owner_id,title,revision,size_bytes,created_at,updated_at,archived_at FROM open_ena_projects WHERE owner_id=$1 AND (archived_at IS NOT NULL)=$2 ORDER BY updated_at DESC,id LIMIT $3", [owner.userId, archived, limits.projects]);
        const used = await usage(client, owner);
        return { projects: (result.rows as StoredProject[]).map(summary), usedBytes: Number(used.bytes), projectCount: used.count, limits };
      });
    },
    async read(owner: Owner, id: string): Promise<OpenEnaCloudProject> {
      return transact(owner, async (client) => { const row = await readRow(client, owner, id); return { ...summary(row), snapshot: decrypt(row) }; });
    },
    async create(owner: Owner, input: { id: string; title: string; snapshot: string }): Promise<OpenEnaCloudProjectSummary> {
      if (!OPEN_ENA_CLOUD_PROJECT_ID.test(input.id)) throw new OpenEnaCloudError("invalid-input");
      const value = validated(input.title, input.snapshot);
      try {
        return await transact(owner, async (client) => {
          const found = await client.query("SELECT * FROM open_ena_projects WHERE id=$1 AND owner_id=$2", [input.id, owner.userId]);
          if (found.rowCount) {
            const row = found.rows[0] as StoredProject;
            if (row.content_sha256 !== value.hash || row.title !== value.title || row.archived_at !== null) throw new OpenEnaCloudError("conflict");
            return summary(row);
          }
          const used = await usage(client, owner);
          if (used.count >= limits.projects || Number(used.bytes) + value.bytes > limits.bytes) throw new OpenEnaCloudError("quota");
          const result = await client.query(`INSERT INTO open_ena_projects(id,owner_id,title,content_ciphertext,content_sha256,size_bytes)
            VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [input.id, owner.userId, value.title,
            encrypt(input.snapshot, owner.userId, input.id, 1), value.hash, value.bytes]);
          return summary(result.rows[0] as StoredProject);
        }, true);
      } catch (error) {
        if ((error as { code?: string })?.code === "23505") throw new OpenEnaCloudError("not-found");
        throw error;
      }
    },
    async save(owner: Owner, id: string, input: { title: string; revision: number; snapshot: string }): Promise<OpenEnaCloudProjectSummary> {
      const value = validated(input.title, input.snapshot);
      return transact(owner, async (client) => {
        const row = await readRow(client, owner, id); revisionMatches(row, input.revision);
        if (row.archived_at !== null) throw new OpenEnaCloudError("conflict");
        const used = await usage(client, owner);
        if (Number(used.bytes) - row.size_bytes + value.bytes > limits.bytes) throw new OpenEnaCloudError("quota");
        const next = row.revision + 1;
        const result = await client.query(`UPDATE open_ena_projects SET title=$1,revision=$2,content_ciphertext=$3,
          content_sha256=$4,size_bytes=$5,updated_at=clock_timestamp() WHERE id=$6 AND owner_id=$7 AND revision=$8 RETURNING *`,
        [value.title, next, encrypt(input.snapshot, owner.userId, id, next), value.hash, value.bytes, id, owner.userId, row.revision]);
        if (!result.rowCount) throw new OpenEnaCloudError("conflict");
        return summary(result.rows[0] as StoredProject);
      }, true);
    },
    async setArchived(owner: Owner, id: string, expectedRevision: number, archived: boolean): Promise<OpenEnaCloudProjectSummary> {
      if (typeof archived !== "boolean") throw new OpenEnaCloudError("invalid-input");
      return transact(owner, async (client) => {
        const row = await readRow(client, owner, id); revisionMatches(row, expectedRevision);
        const next = row.revision + 1, ciphertext = encrypt(decrypt(row), owner.userId, id, next);
        const result = await client.query(`UPDATE open_ena_projects SET revision=$1,content_ciphertext=$2,
          archived_at=CASE WHEN $3 THEN clock_timestamp() ELSE NULL END,updated_at=clock_timestamp()
          WHERE id=$4 AND owner_id=$5 AND revision=$6 RETURNING *`, [next, ciphertext, archived, id, owner.userId, row.revision]);
        if (!result.rowCount) throw new OpenEnaCloudError("conflict");
        return summary(result.rows[0] as StoredProject);
      }, true);
    },
    async removeArchived(owner: Owner, id: string, expectedRevision: number): Promise<void> {
      return transact(owner, async (client) => {
        const row = await readRow(client, owner, id); revisionMatches(row, expectedRevision);
        if (row.archived_at === null) throw new OpenEnaCloudError("conflict");
        const result = await client.query("DELETE FROM open_ena_projects WHERE id=$1 AND owner_id=$2 AND revision=$3 AND archived_at IS NOT NULL RETURNING id", [id, owner.userId, expectedRevision]);
        if (!result.rowCount) throw new OpenEnaCloudError("conflict");
      }, true);
    },
  };
}
