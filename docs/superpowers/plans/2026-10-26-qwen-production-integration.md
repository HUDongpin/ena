# Qwen production integration and release plan

**Goal:** Integrate the validated non-Sufeiya Qwen provider into Open ENA, switch the existing ECS production service, and verify the deployed application on both public domains.

**Authorization:** The owner explicitly requested continuation through production switching. The prior independent Qwen 9/9 record and DeepSeek 5/9 record remain immutable evidence.

**Current baseline:** integration branch `codex/open-ena-qwen-production` continues local candidate/evidence commit `03cb5ab` on main `52ef99c`. Fresh public readback shows both domains currently serve Plugin Lab release `9b304d2`. Deployment ownership has returned from the completed Plugin Lab release; no active switch was reported.

## Implementation

- [x] Select Qwen explicitly with `OPEN_ENA_AI_PROVIDER=qwen`, pinned `OPEN_ENA_AI_MODEL=qwen3.7-plus-2026-05-26`, Beijing endpoint, and dedicated `OPEN_ENA_QWEN_API_KEY`. Do not fall back to general DashScope credentials or another provider.
- [x] Promote the bounded validated adapter into the production provider path while preserving approved V2 prompt bytes, strict content/evidence rules, the 1,800-token cap, 20-second deadline, cancellation and one-dispatch rule.
- [x] Preserve historical DeepSeek/OpenRouter records. New response/consent metadata and provider budget ownership must say Qwen.
- [x] Bind each reservation to its original provider; configuration changes cannot move historical usage during settlement/release. Persisted PostgreSQL provider_ref already supports new identifiers; do not add a schema migration without a demonstrated need.
- [x] Bind consent to provider/model/region/policy. Stale DeepSeek pages may not send to newly configured Qwen. Namespace Qwen operation ownership without deleting old operation IDs or bypassing replay protection.
- [x] Render accurate en/zh-hans/zh-hant provider, endpoint/processing scope and retention statements; maintain saved-record provenance and require fresh consent after a provider change.

## Price basis

Official Alibaba USD list prices for the pinned snapshot in China (Beijing), verified on 2026-10-26:

| Per-request input range | Input USD per 1M | Output USD per 1M |
| --- | ---: | ---: |
| Up to 256K | 0.276 | 1.101 |
| Above 256K through 1M | 0.826 | 3.301 |

Use conservative decimal cutoffs 256,000 and 1,000,000 and integer micro-USD rounded upward for the application's budget estimate. This is not an invoice, currency conversion, remaining balance or promise of promotional/cache discounts. Apply the selected tier to both input and output; reject unsafe usage rather than clipping it. Pre-dispatch reservation bounds include the serialized schema, prompts, evidence and existing overhead.

Source: https://www.alibabacloud.com/help/en/model-studio/model-pricing (Qwen-Plus / China (Beijing)).

## Verification and release

- [x] Failure-first provider/route/budget/consent tests, historic record/cloud restore compatibility, and three-language disclosure checks.
- [ ] Full repository verification and all three exact-commit CI jobs; independent code/release review; merge the reviewed integration PR.
- [ ] Admit only the exact Linux standalone artifact with matching workflow SHA, digest, archive checksums, runtime identity and extracted smoke evidence.
- [ ] Fresh ECS read-only preflight, backup and isolated restore verification, preserving current release, session/encryption/database keys and notification configuration.
- [ ] Transfer only the selected Qwen secret using a protected mechanism. Plaintext credentials never enter commands, logs, screenshots, Git or public receipts.
- [ ] Start candidate on a private local port and verify login, locale workspaces, project isolation and provider configuration without additional live generation.
- [ ] Perform a reversible single-service switch with rollback of release pointer, environment and proxy header; do not claim zero downtime for a service restart.
- [ ] Run one explicit real generation per locale on each public domain (six), and use an existing generated Chinese result for cross-domain save/restore with no extra generation. Verify exact release, provider/model/consent, reservation settlement and actual usage.
- [ ] Verify service, database, notification worker and dual-domain health after the switch, then complete the goal only when production evidence proves the intended state.

## Access status

The existing release route uses Alibaba Cloud Assistant. The Browser Use interface reports `Local browser use is disabled in Work settings` despite the owner confirming it is enabled. The separately authorized native Chrome Computer Use interface works and opened the existing authenticated ECS console on 2026-10-26. The release can continue through this supported interface; no permission, firewall or access policy was changed.
