# Enquiries (M9)

The published contact page accepts enquiries into the business's private inbox.
WhatsApp, email and phone links remain available. No messages or notifications
are sent automatically.

## Public form

`GET /contact` renders a standard HTML form; `?item=<published-slug>` adds
immutable published item context. No JavaScript is required. Private previews
show contact actions but do not contain a working enquiry form.

`POST /contact` requires the exact request origin, same-origin fetch metadata
when present, URL-encoded form data and a signed form token. The token binds the
host slug, catalogue, publication and optional published item ID. It expires
after 30 minutes and requires a minimum age of two seconds. The shared
`PUBLICATION_PREVIEW_SECRET` must match in both Workers; signing and address
hashing use enquiry-specific HMAC domains distinct from publication previews.

Fields: name (120 characters), optional company (160), email (254), optional
phone (40 characters, 7–15 digits), message (5,000), consent checkbox. Either
email or phone is required. A body is bounded at 64 KiB; unknown or duplicate
fields, invalid UTF-8 and malformed encoding are rejected. Values are trimmed
and HTML-escaped when redisplayed. Submission errors preserve entered fields.

A honeypot discards automated-looking submissions without storing their
details. Rate windows cap one address at five accepted submissions and an
entire catalogue at 100 per ten minutes. Only keyed address hashes are stored,
never the raw address. These controls are a baseline, not a substitute for
operational abuse monitoring. Cloudflare supplies `CF-Connecting-IP` on live
requests; local development shares a synthetic address when it is absent.
There is no tracking fingerprint or third-party captcha.

The capture transaction rechecks the live route, active publication, tenant
and visible contact settings. Retries with the same signed nonce create one
enquiry and one activity event, without consuming additional quota. A changed
publication or suspended route refuses the write.

Successful submissions redirect with HTTP 303 to a short confirmation URL.
A host-only, HttpOnly, SameSite=Lax receipt cookie lasts five minutes and is
Secure on HTTPS. Customer details and enquiry IDs never enter confirmation
URLs. Receipt tokens cannot be used as form tokens. All enquiry pages and API
responses use `Cache-Control: no-store`.

## Private inbox

Every API call requires an authenticated active member and
`X-Techabanca-Organization`. Tenant scope comes from that membership.
Editors can read. Only owners and admins can change status, add notes or
permanently delete an enquiry.

| Method | Route | Behavior |
| --- | --- | --- |
| GET | `/api/v1/catalogue/enquiries` | Newest-first inbox, counts and cursor |
| GET | `/api/v1/catalogue/enquiries/:id` | Message, context, consent and latest 100 activity events |
| POST | `.../:id/status` | JSON `{version,status}` |
| POST | `.../:id/notes` | JSON `{version,note}` |
| DELETE | `.../:id` | JSON `{version}`; permanent deletion, HTTP 204 |

List filters are `q` (200 characters), `status` (new/contacted/closed),
`limit` (1–50, default 25) and `after`. Search treats percent/underscore
characters literally. Pagination uses submission timestamp plus public ID
and rejects reuse with different search/status filters. Status totals cover
the current tenant's available inbox, independently of the search filter.

Statuses move New → Contacted → Closed, or New → Closed. Closed records do
not reopen; repeating the current status is a no-op. Each genuine transition
records its actor and timestamp. Notes allow 2,000 characters and up to 200
per enquiry. Notes are private and are never published.

All writes require the current positive integer version. Concurrent or stale
writes return HTTP 409. Status/note updates and their activity entry commit
atomically; a rejected update cannot create a phantom event. Deletion removes
the enquiry and cascades its activity; the inbox asks for explicit confirmation.
Storage errors return safe generic failures. The UI cancels obsolete list
requests and preserves an unsaved note when refreshing or resolving a conflict.

## Retention

Default availability is **365 days from the original submission**. Editing,
contacting or closing an enquiry does not extend that date. Message, customer
contact fields, consent record, snapshot context and private notes share this
lifecycle. Consent records include the acceptance timestamp and disclosure
version `enquiry-v1`. Older records receive an expiry from their original
timestamp; migration does not invent consent.

Expired and previously soft-deleted enquiries are excluded from every inbox,
detail and mutation query immediately. The App Worker has a daily **03:00 UTC**
cron (`0 3 * * *`) to physically delete those rows and expired rate windows.
Activity cascades with deletion. Normal physical cleanup can lag expiry by up
to one daily run. Each run is bounded to 20 batches of 500 enquiries and 10,000
rate windows; a remaining backlog causes the scheduled handler to report a
failure, requiring investigation and additional cleanup runs. Do not treat an
unmonitored failed cleanup as compliance with the retention default.

The scheduled handler accepts only its configured cron and recognized
local/staging/production environments. Public Workers have no scheduled
deletion task. No backup retention promises are made by this milestone.

Local migration: `npm.cmd run db:migrate:local`. The dev server does not run
crons automatically. Use Wrangler's documented local scheduled-event
simulation for an operational check; automated tests invoke the handler and
purge against an isolated D1 database. Live cleanup only starts after the
separate authorized environment deployment. M8 staging remains pending.

The form disclosure is an implementation default. Legal policies, privacy
documents and business-specific retention decisions remain parked as directed
in the project handoff.
