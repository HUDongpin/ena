# Security policy

## Reporting

Do not disclose a suspected vulnerability, credential, private proposal, or
research dataset in a public issue. Contact the project owner through the
private contact route published on ENA.HK. Include only the minimum information
needed to reproduce the issue and wait for a secure exchange channel before
sending sensitive evidence.

## Supported plugin boundary

ENA Plugin Lab v1 runs only source-reviewed modules statically linked into the
ENA.HK build. It does not install remote packages, execute submitted code,
evaluate manifests supplied by a browser, or load third-party scripts or
iframes. Unknown plugin IDs, versions, permissions, result types, and revoked
entries fail closed.

Plugins receive the minimum versioned data tier they require. They never receive
database credentials, provider secrets, authentication cookies, unrestricted
storage, or a general network handle. External processing must use a reviewed
host broker and explicit consent.

## Proposal data

Proposal forms must not contain personal or participant data, raw research
records, credentials, or restricted material. Sensitive proposal fields use
application-layer authenticated encryption with a key separated from the
database. Ciphertext authentication is bound to its immutable purpose and
proposal ID so a valid database envelope cannot be moved between records or
fields. Private proposal content and the eligible public projection use
separate ciphertext columns. Access codes are stored only as domain-separated
HMACs. Proposal content and contact details must not enter analytics or logs.
A non-loopback Production PostgreSQL URL must explicitly require or verify TLS,
and the deployment proxy must overwrite forwarded-client address headers before
their HMACs are used for rate limiting.

The status cookie is short-lived, HttpOnly, Secure, and scoped to the localized
proposal-status path. Researcher publication consent is submitted under that
same path so the cookie does not need broader API access. Public projection
requires selected state, a manually verified reply from the submitted email,
operator moderation, and renewed proposer consent. Retention preview is
read-only and returns no encrypted payload; production deletion remains a
separate, audited operational procedure.

Publication-state mutations atomically append an audit event containing the
prior and resulting moderation/consent states, actor kind, HMAC actor reference,
and exact public-projection SHA-256. Application database grants must permit
only `SELECT` and `INSERT` on audit tables; migration 005 revokes `UPDATE` and
`DELETE` from `PUBLIC`, and the table foreign keys restrict parent deletion.

Security reports do not constitute acceptance of liability, a bounty promise,
or authorization to access other people's accounts or data.
