# M14 Security hardening

M14 continues the verified M13 administration/moderation baseline on `feature/security-hardening`. All implementation, migrations and runtime checks use the local Windows repository and the shared local D1 owner. This milestone does not deploy or provision remote services.

## Changes

- Durable authentication limits: login permits 20 attempts per client and 10 per client/account pair in a 15-minute window; registration permits 5 per client in a separate window. Rejected attempts saturate bounded counters, return 429 with Retry-After, and never bypass the limiter during storage failures.
- HMAC identifiers separate the authentication purpose, action, identifier kind and day. Neither raw addresses nor account emails, passwords or challenge tokens are persisted in abuse windows. Hosted requests use CF-Connecting-IP, never forwarded-address headers.
- Hosted login and registration require server-verified Turnstile tokens. Validation checks success, exact hostname, separate auth_login/auth_register actions, challenge age, response size and a five-second timeout. It verifies every attempt and lets the provider reject replayed tokens. Missing configuration, provider outages and invalid tokens fail closed. The client renews consumed tokens and supports explicit retries after script/configuration failures.
- Local development explicitly permits the challenge-free workflow when both Turnstile bindings are absent. Partial challenge configuration fails closed. The local abuse limiter remains enabled.
- Auth JSON is bounded to 16 KiB, asset JSON to 8 KiB, subscription JSON to 16 KiB and other management JSON to 64 KiB before authentication is resolved. Existing admin parsing retains its tighter 16 KiB limit. JSON must have a valid UTF-8 media type where parsed, valid UTF-8 bytes, unique decoded member names and at most 32 nested containers. Declared lengths cannot bypass streamed limits. Routes that legitimately use an empty body remain supported.
- Credential inputs reject extra fields. Origin headers must be canonical and match exactly; unexpected Fetch Metadata values are rejected. Cookie parsing rejects duplicate session-cookie names. Session creation checks the user's current active state in the insert statement after password work finishes.
- HTTP file lifecycle callers carry an explicit authenticated actor. File metadata writes check current session, membership, role, organization and user state in the same SQL statement. Downloads recheck permission after R2 reads; completion rechecks after verification reads; binary uploads recheck after their body arrives. Private file downloads are sandboxed attachments.
- Management HTML has a CSP allowing bundled scripts and the challenge provider, frame protection, restrictive permissions and no-store caching. Hosted HTTPS adds HSTS. Local Vite keeps the allowances needed for refresh and its WebSocket. Existing stricter file/public policies are preserved.
- Daily cleanup removes expired authentication windows in bounded batches and signals a backlog rather than silently leaving an incomplete purge.
- Hosted deployment now requires Catalogue-only authentication bindings before remote mutations. Signing-key mismatch messages no longer compare or print secret values.

## Migration and configuration

`0024_auth_security.sql` creates the authentication-window table and expiry index. It grants no permissions and changes no users, subscriptions or publication snapshots.

Hosted worker bindings:

| Binding | Purpose |
| --- | --- |
| AUTH_RATE_LIMIT_SECRET | Independent 32-byte random key encoded as 64 hexadecimal characters |
| TURNSTILE_SITE_KEY | Public site key for the intended environment and management hostname |
| TURNSTILE_SECRET_KEY | Private server verification key |

The existing staging deploy command receives these through `TECHABANCA_CATALOGUE_AUTH_RATE_LIMIT_SECRET`, `TECHABANCA_CATALOGUE_TURNSTILE_SITE_KEY` and `TECHABANCA_CATALOGUE_TURNSTILE_SECRET_KEY`. It refuses missing/invalid configuration and dummy test site keys. Do not place private keys in plain configuration, screenshots, logs, source control or browser storage.

Cloudflare's server-side requirements are documented at [Turnstile token validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/). Local verification uses controlled synthetic responses; it does not provision widgets or claim a live hosted-provider check.

## Security regression coverage

| Boundary | Evidence |
| --- | --- |
| Auth/session/CSRF | security-hardening, auth-boundary-hardening, auth-http, auth-foundation, auth-runtime-recovery |
| Tenant isolation and roles | tenant-authz-http, tenant-repositories, authoring-integrity, security-storage |
| XSS and response policies | request-security, security-hardening; existing public rendering tests; actual browser markup-injection check |
| Uploads/private R2 | asset-upload-http, asset-lifecycle, media-http, security-storage |
| Abuse limits and bot validation | security-hardening; browser expiry, consumed-token renewal, action separation and outage recovery |
| Slug takeover and reservations | catalogue-slug-lifecycle, administration, staging-boundary |
| Webhook replay and subscription bypass | subscription-lifecycle, subscriptions, publication-workflow, staging-boundary |
| Draft/preview leakage | publication-workflow, private-preview, publishing-read-model, sharing, administration |
| Platform administration | administration, client-admin-api; actual ordinary-session denial |
| Deployment configuration | test-staging, including missing/invalid security binding checks |

The browser report and screenshots remain in the local M14 QA directory. Browser widget tests use an offline synthetic script; validator tests use controlled provider responses. Actual local login, session, workspace, public search/report and response-header checks run against the running application. The complete repository verification and staging build/dry-run results are recorded in the final checkpoint.

## Operational limits carried forward

D1 and R2 do not share a transaction. A revocation that occurs during an already-started R2 PUT can leave private, unverified bytes; it cannot mark the asset ready, return successful authorization or publish those bytes. Existing retention/garbage collection remains responsible for orphaned private objects.

M8 remote staging provisioning remains blocked by its previous automatic approval review. No retry or bypass is part of M14. Remote resources and real hosted Turnstile setup remain unprovisioned. Live commercial offers remain inactive, legal/trust work remains parked, Billing resources/credentials remain untouched, and this feature branch is not a main merge or production promotion.
