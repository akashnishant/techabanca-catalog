# Catalogue subscriptions (M10)

Catalogue uses its own D1 subscription, offer, trial, payment, webhook, and activity records. Billing credentials, records, and resources are not shared.

## Trial and access

Owners/admins start a single 14-day trial explicitly. No card or automatic paid conversion is involved. `organization_trials` permanently consumes the workspace's eligibility, including after subscription deletion. Existing trial history is backfilled by migration 0021. The technical trial includes publishing; commercial quota/feature decisions are not inferred or seeded.

Entitlements require an active plan and valid bounded dates. Trial access ends exactly at its end time. Paid access is never extended by a provider creation/cancellation response or browser callback. A verified paid term remains available through its original end when renewal becomes pending, halted, paused, completed or canceled; there is no unpaid grace period. These are conservative technical test defaults, not approved refund/dunning/cancellation policies.

Expiry is enforced in authoring entitlement checks, both publication transaction boundaries, public page/media resolution, and the atomic enquiry insert. Snapshots remain immutable. Editing saved content remains possible. Configured `items.max` and `storage.bytes.max` limits block publishing above the limit, using current source usage; quota values are not seeded. Other feature keys remain configuration data for their respective milestones.

The pre-existing local no-subscription route compatibility applies only to local workspaces with no subscription, persistent trial or checkout history. Staging/production require bounded entitlements; a lapsed subscription never falls back to local compatibility.

## Provider test adapter

Paid flows are disabled by default. No provisional Starter/Growth/Business prices are migrated. The Razorpay adapter is an isolated test implementation, not a final provider decision. It requires all of these **Catalogue-owned** bindings:

- `CATALOGUE_PAYMENT_MODE=razorpay-test`
- `CATALOGUE_RAZORPAY_KEY_ID` with the `rzp_test_` prefix
- `CATALOGUE_RAZORPAY_KEY_SECRET` (32 or more characters)
- `CATALOGUE_RAZORPAY_ACCOUNT_ID`
- `CATALOGUE_RAZORPAY_WEBHOOK_SECRET` (32 or more characters)
- Optional `CATALOGUE_RAZORPAY_PREVIOUS_WEBHOOK_SECRET` for one secret rotation window.

Only local/staging deployments can enable this adapter. Live keys and production are rejected. These variables/secrets are not added to the checked-in staging deployment; the M8 manifest and remote resource guard remain unchanged. Do not enable payments by copying Billing configuration. Final provider, approved offers, policies and live activation need a separate release decision.

Offers are explicitly managed test data in `subscription_offers`: local plan, immutable checkout price/currency snapshot, provider plan/account, interval, and total cycles. Offer IDs are `off_` plus 32 lowercase hexadecimal characters. No runtime offer-edit endpoint is exposed. Each workspace can have one open checkout; active paid workspaces cannot create overlapping new subscriptions. Upgrade/downgrade/proration is deferred until its commercial policy is approved.

The owner submits a `chk_` plus 32 hex characters request ID. The application persists a claim before a single fixed-origin provider POST. Duplicate requests resume that claim. The returned hosted URL must use HTTPS on `rzp.io`. A provider timeout/error or untrusted response puts the attempt in `unknown`; retries do not blindly create another subscription. Unknown attempts require operator/provider reconciliation before clearing the open claim. This prevents duplicate charges but is intentionally conservative. No test simulator or entitlement-grant endpoint is shipped.

The UI offers an explicit test checkout link, then Refresh status. It does not treat returning from checkout as proof of payment. Renewal cancellation requires an acknowledged provider response. Successful cancellation records the flag without adding paid time. The owner can also cancel an unfinished checkout from the UI without ending the existing trial. Browser callbacks have no mutation endpoint.

## API and webhook contract

`GET /api/v1/catalogue/subscription` returns status, effective expiry, trial eligibility, checkout progress, configured test offers, typed entitlements and source usage. Authentication and `X-Techabanca-Organization` membership are required. Mutations require owner/admin and same-origin JSON:

- `POST .../subscription/trial`: `{}`
- `POST .../subscription/checkout`: `{ "offerId": "off_...", "requestId": "chk_..." }`
- `POST .../subscription/cancel`: `{ "id": "sub_...", "version": 1 }`

`POST /api/v1/payments/webhooks/razorpay` uses signature authentication instead of session/origin authentication. Raw request bodies are bounded at 128 KiB. HMAC SHA-256 is verified over the exact raw bytes before JSON parsing. The event ID, expected account, mapped subscription/provider plan, quantity, captured payment, full amount, INR currency and sensible paid period must match. `authenticated`/`activated` events never grant access. Unmapped charge/lifecycle events return 503 for retry. Payment-card details, raw payloads and provider errors are not stored or returned.

Event hashes detect altered redeliveries. A D1 batch atomically persists the event, unique payment, subscription transition, superseded trial and activity. A unique payment ID prevents double application even with different event IDs. Timestamps prevent stale status regression; paid end times never regress. Terminal-before-charge delivery preserves a previously earned bounded term. Failure rolls the transaction back so the provider can retry. A single previous secret is supported for delayed deliveries during rotation.

Refunds, disputes, proration, provider reconciliation tooling, production enablement, live end-to-end payment validation, final pricing and customer policy text remain release work. No live payments or remote infrastructure were created during M10.

Official contracts consulted: [webhook validation](https://razorpay.com/docs/webhooks/validate-test/), [delivery practices](https://razorpay.com/docs/webhooks/best-practices/), [subscription events](https://razorpay.com/docs/webhooks/subscriptions/), [creation](https://razorpay.com/docs/api/payments/subscriptions/create-subscription/), [cancellation](https://razorpay.com/docs/api/payments/subscriptions/cancel-subscription/).
