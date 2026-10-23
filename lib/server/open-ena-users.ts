import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { inOpenEnaCloudTransaction, OpenEnaCloudError } from "./open-ena-cloud-db";
import { hashOpenEnaUserPassword, normalizeOpenEnaEmail } from "./open-ena-user-credentials";

export type OpenEnaAccountPurpose = "verify" | "reset";
export type OpenEnaRegisteredUser = { id: string; email: string; sessionVersion: number };
export type OpenEnaAccountMailAction = { kind: OpenEnaAccountPurpose | "existing" | "missing"; email: string; actionId: string };
const TOKEN_HASH = /^[a-f0-9]{64}$/u;
const digest = (text: string) => createHash("sha256").update(text).digest("hex");

async function consumeAccountRequest(client: PoolClient, email: string, purpose: OpenEnaAccountPurpose, sourceRef: string) {
  const scopes = [
    { key: digest(`account-source:${sourceRef}`), limit: 10 },
    { key: digest(`account-email:${purpose}:${email}`), limit: 3 },
  ].sort((a, b) => a.key.localeCompare(b.key));
  for (const scope of scopes) {
    const result = await client.query(`INSERT INTO open_ena_account_request_limits(rate_key,hits,expires_at)
      VALUES($1,1,clock_timestamp()+interval '1 hour')
      ON CONFLICT(rate_key) DO UPDATE SET
        hits=CASE WHEN open_ena_account_request_limits.expires_at <= clock_timestamp() THEN 1
          ELSE LEAST(open_ena_account_request_limits.hits+1,1000000) END,
        expires_at=CASE WHEN open_ena_account_request_limits.expires_at <= clock_timestamp()
          THEN clock_timestamp()+interval '1 hour' ELSE open_ena_account_request_limits.expires_at END
      RETURNING hits`, [scope.key]);
    if (result.rows[0].hits > scope.limit) throw new OpenEnaCloudError("rate-limited");
  }
  await client.query(`DELETE FROM open_ena_account_actions WHERE id IN
    (SELECT id FROM open_ena_account_actions WHERE expires_at < clock_timestamp()-interval '1 day' ORDER BY expires_at LIMIT 32)`);
  await client.query(`DELETE FROM open_ena_account_request_limits WHERE rate_key IN
    (SELECT rate_key FROM open_ena_account_request_limits WHERE expires_at < clock_timestamp() ORDER BY expires_at LIMIT 32)`);
}

export function createOpenEnaUsersStore(pool: Pool) {
  return {
    async profile(owner: { userId: string; sessionVersion: number }): Promise<OpenEnaRegisteredUser | null> {
      const result = await pool.query("SELECT id,email,session_version FROM open_ena_users WHERE id=$1 AND session_version=$2 AND disabled_at IS NULL", [owner.userId, owner.sessionVersion]);
      const row = result.rows[0];
      return row ? { id: row.id, email: row.email, sessionVersion: row.session_version } : null;
    },
    async issueAction(input: { email: string; purpose: OpenEnaAccountPurpose; tokenHash: string; sourceRef: string }): Promise<OpenEnaAccountMailAction> {
      const email = normalizeOpenEnaEmail(input.email);
      if (!email || !["verify", "reset"].includes(input.purpose) || !TOKEN_HASH.test(input.tokenHash)
        || !/^[A-Za-z0-9_-]{1,128}$/u.test(input.sourceRef)) throw new OpenEnaCloudError("invalid-input");
      return inOpenEnaCloudTransaction(pool, async (client) => {
        await consumeAccountRequest(client, email, input.purpose, input.sourceRef);
        const found = await client.query("SELECT id,session_version,disabled_at FROM open_ena_users WHERE email=$1", [email]);
        const user = found.rows[0], actionId = randomUUID();
        if (input.purpose === "verify" && user) return { kind: "existing", email, actionId };
        if (input.purpose === "reset" && (!user || user.disabled_at !== null)) return { kind: "missing", email, actionId };
        await client.query(`INSERT INTO open_ena_account_actions(id,token_hash,purpose,email,user_id,session_version,expires_at)
          VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()+make_interval(secs=>$7))`,
        [actionId, input.tokenHash, input.purpose, email, user?.id ?? null, user?.session_version ?? null,
          input.purpose === "verify" ? 86_400 : 1_800]);
        return { kind: input.purpose, email, actionId };
      });
    },
    async completeAction(input: { purpose: OpenEnaAccountPurpose; tokenHash: string; password: string }): Promise<OpenEnaRegisteredUser> {
      if (!TOKEN_HASH.test(input.tokenHash) || !["verify", "reset"].includes(input.purpose)) throw new OpenEnaCloudError("invalid-token");
      const candidate = await pool.query(`SELECT id FROM open_ena_account_actions
        WHERE token_hash=$1 AND purpose=$2 AND consumed_at IS NULL AND expires_at>clock_timestamp()`, [input.tokenHash, input.purpose]);
      if (!candidate.rowCount) throw new OpenEnaCloudError("invalid-token");
      const material = await hashOpenEnaUserPassword(input.password);
      return inOpenEnaCloudTransaction(pool, async (client) => {
        // Lock first, then read server time. A link expiring during a lock wait cannot activate/reset an account.
        const locked = await client.query("SELECT * FROM open_ena_account_actions WHERE token_hash=$1 AND purpose=$2 FOR UPDATE", [input.tokenHash, input.purpose]);
        const action = locked.rows[0];
        if (!action) throw new OpenEnaCloudError("invalid-token");
        const consumed = await client.query(`UPDATE open_ena_account_actions SET consumed_at=clock_timestamp()
          WHERE id=$1 AND consumed_at IS NULL AND expires_at>clock_timestamp() RETURNING id`, [action.id]);
        if (!consumed.rowCount) throw new OpenEnaCloudError("invalid-token");
        const result = input.purpose === "verify"
          ? await client.query(`INSERT INTO open_ena_users(id,email,password_salt,password_hash)
              VALUES($1,$2,$3,$4) ON CONFLICT(email) DO NOTHING RETURNING id,email,session_version`,
            [randomUUID(), action.email, material.salt, material.hash])
          : await client.query(`UPDATE open_ena_users SET password_salt=$1,password_hash=$2,
              session_version=session_version+1,password_changed_at=clock_timestamp()
              WHERE id=$3 AND session_version=$4 AND disabled_at IS NULL
              RETURNING id,email,session_version`, [material.salt, material.hash, action.user_id, action.session_version]);
        if (!result.rowCount) throw new OpenEnaCloudError("invalid-token");
        const row = result.rows[0];
        return { id: row.id as string, email: row.email as string, sessionVersion: row.session_version as number };
      });
    },
  };
}
