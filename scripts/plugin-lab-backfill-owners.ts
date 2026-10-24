// Dry-run: node --import tsx scripts/plugin-lab-backfill-owners.ts
// Apply:   node --import tsx scripts/plugin-lab-backfill-owners.ts --apply
// The caller supplies the authorized Plugin Lab environment. This script does not load secret files.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { readPluginLabConfiguration, type PluginLabConfiguration } from "../lib/plugin-lab/config";
import { decryptPluginLabText } from "../lib/plugin-lab/crypto";
import { parseStoredPluginProposalSubmission } from "../lib/plugin-lab/proposal";
import { normalizePluginLabEmail, pluginLabEmailRef } from "../lib/plugin-lab/workflow-security";
import { createWorkflowStore } from "../lib/plugin-lab/workflow-store";

export interface PluginLabOwnerBackfillReport {
  mode: "dry-run" | "apply";
  scanned: number;
  eligible: number;
  attached: number;
  unreadable: number;
  conflicts: number;
}

export async function backfillPluginLabOwners(input: { pool: Pool; configuration: PluginLabConfiguration; apply?: boolean; batchSize?: number }): Promise<PluginLabOwnerBackfillReport> {
  const batchSize = input.batchSize ?? 100;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 1_000) throw new TypeError("Invalid owner-backfill batch size.");
  const report: PluginLabOwnerBackfillReport = { mode: input.apply ? "apply" : "dry-run", scanned: 0, eligible: 0, attached: 0, unreadable: 0, conflicts: 0 };
  const store = createWorkflowStore(input.pool);
  let cursor = "";
  while (true) {
    let rows;
    try {
      rows = (await input.pool.query(`SELECT proposal_id,payload_cipher FROM ena_plugin_proposals
        WHERE owner_email_ref IS NULL AND proposal_id > $1 ORDER BY proposal_id LIMIT $2`, [cursor, batchSize])).rows;
    } catch { throw new Error("Plugin Lab owner backfill is unavailable."); }
    if (!rows.length) return report;
    for (const row of rows) {
      const proposalId = String(row.proposal_id);
      cursor = proposalId;
      report.scanned += 1;
      let email: string | null;
      try {
        const text = decryptPluginLabText(row.payload_cipher, { [input.configuration.keyVersion]: input.configuration.encryptionKey }, `proposal-payload:${proposalId}`);
        email = normalizePluginLabEmail(parseStoredPluginProposalSubmission(JSON.parse(text)).email);
      } catch { report.unreadable += 1; continue; }
      if (!email) { report.unreadable += 1; continue; }
      report.eligible += 1;
      if (input.apply) {
        const attached = await store.attachOwner(proposalId, pluginLabEmailRef(email, input.configuration.secret));
        if (attached) report.attached += 1;
        else report.conflicts += 1;
      }
    }
  }
}

export async function runPluginLabOwnerBackfillCli(args: readonly string[] = process.argv.slice(2)) {
  if (args.some((arg) => arg !== "--apply")) throw new TypeError("Use no arguments for dry-run, or --apply to attach owners.");
  const configuration = readPluginLabConfiguration();
  if (!configuration) throw new Error("Plugin Lab owner backfill configuration is unavailable.");
  const pool = new Pool({ connectionString: configuration.databaseUrl, max: 1, connectionTimeoutMillis: 2_000, idleTimeoutMillis: 30_000, statement_timeout: 5_000 });
  pool.on("error", () => console.error("plugin-lab-backfill:idle-connection-error"));
  try {
    const report = await backfillPluginLabOwners({ pool, configuration, apply: args.includes("--apply") });
    console.log(JSON.stringify(report));
    return report;
  } finally { await pool.end(); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  void runPluginLabOwnerBackfillCli().catch(() => {
    console.error("Plugin Lab owner backfill failed. No contact or credential details are logged.");
    process.exitCode = 1;
  });
}
