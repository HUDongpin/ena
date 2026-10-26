# Qwen production integration

The configured Qwen provider is Alibaba Cloud Model Studio, with the fixed model `qwen3.7-plus-2026-05-26` and Beijing access region `cn-beijing`. The production configuration is explicit:

```dotenv
OPEN_ENA_AI_PROVIDER=qwen
OPEN_ENA_AI_MODEL=qwen3.7-plus-2026-05-26
OPEN_ENA_QWEN_API_KEY=
```

`OPEN_ENA_QWEN_API_KEY` must be supplied privately from the approved Open ENA account. It is a server-only, dedicated credential. Production must not inherit a general `DASHSCOPE_API_KEY`, use an unrelated account, or fall back to another provider. The separate fixed-nine candidate used its own private launcher; its generic variable is not a production configuration alias.

The pinned OpenAI-compatible endpoint is `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`. The provider selector defaults to `deepseek` only for historical configurations that omit `OPEN_ENA_AI_PROVIDER`. For explicit DeepSeek selection, both provider and model must be changed together to `deepseek` and `deepseek-flash`; a cross-provider model configuration fails closed. `.env.example` keeps AI disabled until the required server configuration is supplied.

## Disclosure evidence checked on 2026-10-26

- **Training and retention.** The [Alibaba Cloud privacy notice](https://help.aliyun.com/zh/model-studio/privacy-notice) says Model Studio stores model/application call data under applicable regulations. Section 6.2.5 of the [service agreement, effective 2026-09-02](https://terms.alicdn.com/legal-agreement/terms/common_platform_service/20230728213935489/20230728213935489.html) says conversation data is retained for the minimum period needed for the service, subject to law, and is not used to train its models without authorization. Neither source specifies a fixed API retention duration. The application therefore gives no zero-retention guarantee and does not copy DeepSeek's response-storage claim into Qwen disclosure.
- **Access, storage and inference location.** The [Beijing regional documentation](https://help.aliyun.com/zh/model-studio/beijing-access-information) maps `dashscope.aliyuncs.com` to North China 2 (`cn-beijing`) access and storage. It distinguishes that region from model-specific inference deployment scope. Its current policy distinguishes mainland-China inference for older models and a China elastic scope for models introduced from 2026-10-13. An endpoint alone does not prove city-exclusive execution, so the user-facing copy identifies Beijing access/storage and links the current deployment-scope policy rather than promising that all inference runs in Beijing.
- **Endpoint continuity.** The same regional documentation continues to list the DashScope endpoint for existing integrations and recommends workspace-specific domains for new deployments. This integration retains the exact endpoint used for the fixed candidate validation; it does not silently migrate hosts.

## User-facing behavior

English, Simplified Chinese and Traditional Chinese show the configured provider and exact model. The consent checkbox identifies the Beijing access point, the reviewed aggregate-only JSON, the exclusion of raw source rows, source text and participant-level records, and possible provider retention. Expandable disclosures link the privacy notice, service terms and regional documentation.

The existing explicit consent and Generate flow remains. Provider, model, region and disclosure-policy identity participate in consent invalidation and accompany the actual POST as `x-open-ena-ai-provider-consent`. A provider switch requires a newly reviewed consent; a saved interpretation grants no consent or dispatch authority. Earlier records display their own stored provider/model, even when the deployment now uses Qwen.

The consent receipt and production ledger remain separate from the optional saved interpretation. This change does not authorize retention of provider request/response prose in the minimal consent receipt.

## Verification and release evidence

The dedicated UI/config contract suite covers the fixed Qwen descriptor, legacy DeepSeek selection, rejection of unknown or mismatched configuration, three-language disclosure, retained historical provider identity, and the explicit environment pair. Existing consent/retry and completed-record suites remain regression gates.

The deployment owner must bind the final integration commit, current CI, pricing configuration and actual ECS release/readback evidence before marking the production switch complete. A passing fixed-nine candidate and this disclosure implementation alone are not a production deployment receipt.

## Accounting and local verification

The application estimates cost in micro-USD using the [official undiscounted Beijing Qwen-Plus rates](https://www.alibabacloud.com/help/en/model-studio/model-pricing), checked on 2026-10-26: $0.276 input / $1.101 output per million tokens through 256,000 input tokens, then $0.826 / $3.301 through 1,000,000. Decimal tier boundaries and upward integer rounding are conservative. These estimates are not account balances or invoices. Missing or unsafe usage retains the existing conservative reservation behavior.

The production request bodies match the three frozen candidate request hashes. Independent review found no blocking issue across cancellation, strict parsing, stale consent, historical cloud results and provider ownership. Focused production tests and a real isolated PostgreSQL check passed, including settlement/release after provider changes and idempotent replay prevention. Three-language synthetic Chromium checks confirmed consent revocation on a provider change, the exact outgoing consent header, and no automatic or real provider request.

The prompt verifier's route-test source registration was refreshed after a provider-neutral payment-message assertion changed. The named aggregate-consent test and approved prompt artifacts remain unchanged; all 13 source registrations verify. The original DeepSeek 5/9 and independent Qwen 9/9 receipts remain immutable. Full CI and production receipts are separate release gates.

Full local `npm run verify` completed with exit 0: application tests 3,615 passed, zero failed, two existing conditional skips; jENA tests 230/230 and release-receipt tests 20/20 passed. Prompt verification, dependency custody, type checking and production build passed. Existing synthetic-provider replay fixtures now use the supported DeepSeek descriptor so their unchanged assertions exercise reservation and replay protection.
