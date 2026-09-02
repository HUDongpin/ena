import assert from "node:assert/strict";
import test from "node:test";
import {
  createOpenEnaSessionTokenV2,
  createOpenEnaSessionTokenV3,
} from "@/lib/open-ena-auth";
import {
  createPluginLabAccessCode,
  createPluginLabProposalId,
  decryptPluginLabText,
  encryptPluginLabText,
  hashPluginLabAccessCode,
  issuePluginLabStatusSession,
  verifyPluginLabStatusSession,
} from "@/lib/plugin-lab/crypto";
import {
  assertPluginProposalTransition,
  parsePluginProposalSubmission,
} from "@/lib/plugin-lab/proposal";
import { verifyPluginLabOperatorToken } from "@/lib/plugin-lab/operator-auth";
import { readPluginLabConfiguration } from "@/lib/plugin-lab/config";

const encryptionKey = Buffer.alloc(32, 7);
const secret = "plugin-lab-test-secret-with-at-least-32-characters";

function validSubmission() {
  return {
    email: "researcher@example.org",
    name: "Researcher Name",
    affiliation: "Example University",
    title: "Explore a new ENA window",
    researchQuestion: "How do relational patterns change under an explicitly defined window?",
    currentGap: "The current workbench does not implement this definition.",
    proposedChange: "Add a specified and independently reviewed window strategy.",
    unchangedBoundary: "Keep analytic units, code meanings, and source provenance unchanged.",
    publicSummary: "A community proposal for an explicitly defined ENA window.",
    privateDetails: "The unpublished derivation will be discussed only after selection.",
    referenceLinks: "https://doi.org/10.1000/example\nhttps://github.com/example/repository",
    visibility: "private",
    track: "academic",
    dataSafetyConfirmed: "yes",
    privacyConsent: "yes",
  };
}

test("proposal parsing is strict, bounded, text-only, and requires the data-safety confirmation", () => {
  const parsed = parsePluginProposalSubmission(validSubmission());
  assert.equal(parsed.email, "researcher@example.org");
  assert.deepEqual(parsed.referenceLinks, ["https://doi.org/10.1000/example", "https://github.com/example/repository"]);
  assert.equal(parsed.visibility, "private");
  assert.ok(Object.isFrozen(parsed));

  assert.throws(
    () => parsePluginProposalSubmission({ ...validSubmission(), attachment: "data.csv" }),
    /unknown field attachment/iu,
  );
  assert.throws(
    () => parsePluginProposalSubmission({ ...validSubmission(), dataSafetyConfirmed: "no" }),
    /data-safety confirmation/iu,
  );
  assert.throws(
    () => parsePluginProposalSubmission({ ...validSubmission(), referenceLinks: "file:///private/data.csv" }),
    /HTTPS/iu,
  );
  assert.throws(
    () => parsePluginProposalSubmission({ ...validSubmission(), privateDetails: "student password=secret123" }),
    /credential-like content/iu,
  );
});

test("proposal encryption is authenticated, versioned, and detects tampering", () => {
  const binding = "proposal-payload:plg_AAAAAAAAAAAAAAAAAAAAAA";
  const encrypted = encryptPluginLabText("private proposal", encryptionKey, "v1", binding);
  assert.deepEqual(Object.keys(encrypted).sort(), ["ciphertext", "iv", "keyVersion", "tag"]);
  assert.equal(decryptPluginLabText(encrypted, { v1: encryptionKey }, binding), "private proposal");
  const tamperedCiphertext = `${encrypted.ciphertext[0] === "A" ? "B" : "A"}${encrypted.ciphertext.slice(1)}`;
  assert.throws(
    () => decryptPluginLabText({ ...encrypted, ciphertext: tamperedCiphertext }, { v1: encryptionKey }, binding),
    /could not be decrypted/iu,
  );
  assert.throws(() => decryptPluginLabText(encrypted, {}, binding), /key version/iu);
  assert.throws(
    () => decryptPluginLabText(encrypted, { v1: encryptionKey }, "proposal-payload:plg_BBBBBBBBBBBBBBBBBBBBBB"),
    /could not be decrypted/iu,
  );
  assert.throws(
    () => decryptPluginLabText(encrypted, { v1: encryptionKey }, "transition-reason:plg_AAAAAAAAAAAAAAAAAAAAAA:received:under-review"),
    /could not be decrypted/iu,
  );
});

test("proposal IDs and access codes are high-entropy opaque values and access hashes are domain-separated", () => {
  const proposalId = createPluginLabProposalId();
  const accessCode = createPluginLabAccessCode();
  assert.match(proposalId, /^plg_[A-Za-z0-9_-]{22}$/u);
  assert.match(accessCode, /^[A-Za-z0-9_-]{43}$/u);
  const hash = hashPluginLabAccessCode(proposalId, accessCode, secret);
  assert.match(hash, /^[0-9a-f]{64}$/u);
  assert.notEqual(hash, hashPluginLabAccessCode(createPluginLabProposalId(), accessCode, secret));
});

test("status sessions bind proposal, expiry, and signature without putting an access code in the token", () => {
  const proposalId = "plg_AAAAAAAAAAAAAAAAAAAAAA";
  const token = issuePluginLabStatusSession(proposalId, 1_800_000_000_000, secret);
  assert.doesNotMatch(token, /researcher|access|secret/iu);
  assert.deepEqual(verifyPluginLabStatusSession(token, 1_800_000_100_000, secret), { proposalId });
  assert.equal(verifyPluginLabStatusSession(`${token}x`, 1_800_000_100_000, secret), null);
  assert.equal(verifyPluginLabStatusSession(token, 1_800_001_801_000, secret), null);
});

test("proposal states use a closed forward-only transition graph", () => {
  assert.doesNotThrow(() => assertPluginProposalTransition("received", "under-review"));
  assert.doesNotThrow(() => assertPluginProposalTransition("under-review", "needs-information"));
  assert.doesNotThrow(() => assertPluginProposalTransition("needs-information", "selected"));
  assert.doesNotThrow(() => assertPluginProposalTransition("selected", "withdrawn"));
  assert.throws(() => assertPluginProposalTransition("received", "selected"), /transition/iu);
  assert.throws(() => assertPluginProposalTransition("not-selected", "under-review"), /transition/iu);
});

test("Plugin Lab operator authorization accepts a valid static v2 session and rejects disposable v3", () => {
  const environment = {
    OPEN_ENA_USERNAME: "operator",
    OPEN_ENA_PASSWORD: "a sufficiently long password",
    OPEN_ENA_SESSION_SECRET: "open-ena-session-secret-with-at-least-32-characters",
    OPEN_ENA_ACCOUNT_ID: "operator-account",
  };
  const now = 1_800_000_000_000;
  const v2 = createOpenEnaSessionTokenV2(now, environment);
  const v3 = createOpenEnaSessionTokenV3(now, environment, `d_${"A".repeat(43)}`);
  assert.ok(verifyPluginLabOperatorToken(v2, now + 1_000, environment));
  assert.equal(verifyPluginLabOperatorToken(v3, now + 1_000, environment), null);
  assert.equal(verifyPluginLabOperatorToken(`v2.${v2.split(".").slice(1).join(".")}x`, now + 1_000, environment), null);
});

test("production proposal storage requires a TLS-verified PostgreSQL connection outside loopback", () => {
  const base = {
    NODE_ENV: "production",
    ENA_PLUGIN_LAB_ENCRYPTION_KEY_V1: Buffer.alloc(32, 3).toString("base64url"),
    ENA_PLUGIN_LAB_SECRET: secret,
  };
  assert.equal(readPluginLabConfiguration({ ...base, ENA_PLUGIN_LAB_DATABASE_URL: "postgresql://plugin:secret@db.example/ena" }), null);
  assert.ok(readPluginLabConfiguration({ ...base, ENA_PLUGIN_LAB_DATABASE_URL: "postgresql://plugin:secret@db.example/ena?sslmode=verify-full" }));
  assert.ok(readPluginLabConfiguration({ ...base, ENA_PLUGIN_LAB_DATABASE_URL: "postgresql://plugin:secret@127.0.0.1:5432/ena" }));
});
