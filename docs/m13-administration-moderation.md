# M13 — Platform administration and moderation

M13 adds a separate platform-admin console at `#admin`. Business owners, business admins and editors do not inherit platform access. Migration 0023 creates no administrator grants, and there is no signup field or API for granting platform access.

## Review workflow

The console provides an overview of users, businesses, catalogues, subscriptions, ready-file storage and open cases, plus recent audit activity. Catalogue, user, case and reserved-slug lists support literal search and deterministic pagination. Catalogue review includes draft/hidden source items, paginated business-file metadata and the latest ten recorded subscriptions. Subscription dates and stored status are informational; public access continues to follow the existing entitlement and term checks.

Moderation cases support a reason, review summary, notes and the existing open/reviewing/resolved/dismissed transitions. Notes and decisions use optimistic case versions. Notes added after a terminal decision preserve the original resolution. The case view shows the latest 100 immutable events; the database retains earlier events. Overview activity shows the latest 30 actions and catalogue detail shows the latest 30 cases. The searchable review queue includes older cases.

Public-access decisions require a note, an explicit review acknowledgement in the UI, the current catalogue version and the current moderation-state version. The backend rechecks the current platform grant, user and session inside the write transaction. It also rechecks the case's eligibility when suspending.

Suspension atomically records the previous source status, suspends the source catalogue and existing public route, revokes/fails all building previews, and appends the case event and audit action. Visitors receive the existing neutral unavailable page. Public pages, media, enquiries, reports, sharing and private previews cannot bypass suspension.

Restoration is available through the case that suspended the catalogue. It restores the saved draft/published source status and the existing active-publication route. It never creates or activates a new publication, revives a revoked preview, changes a subscription or overrides an expired term. Resolving or dismissing a case does not automatically restore access.

## Abuse reports and files

Published catalogues offer a server-rendered report form. It uses a separately scoped HMAC purpose with the existing preview-signing secret; enquiry and preview tokens are rejected. Reports are bound to the active catalogue, slug, publication and a unique nonce. The form has a two-second minimum age and a fifteen-minute lifetime.

Submissions require the exact catalogue origin, a supported form content type, valid UTF-8, unique known fields, a reason and a summary of at most 1,000 characters. The parser bounds both declared and streamed bodies at 12 KiB (enough for the full 1,000-character limit with percent-encoded UTF-8). A honeypot discourages bots. Accepted reports create an open case, immutable creation event and audit action, without automatic suspension or analytics collection. The public receipt exposes no case ID, summary or internal decision.

The rate limit is five reports per client/catalogue/hour and thirty reports per catalogue/hour. Retries of an accepted nonce do not create another case or consume another rate slot. Client addresses are HMAC-hashed; raw addresses are not stored. Temporary report windows expire one day after the hourly window ends. The daily cleanup removes expired report/admin windows in bounded batches and signals a backlog. Case/audit deletion and legal retention policy remain outside this milestone.

Admin file review accepts only ready, verified PNG, JPEG, WebP and PDF assets. Responses recheck the current grant and verify object size, MIME metadata, ETag and SHA-256 before returning bytes. Storage keys and credentials are not returned in JSON. PDFs are attachments; file responses are private/no-store with nosniff and a sandbox policy. Existing upload size, content-validation and tenant controls remain in force.

Admin-created slug reservations are audited and can be released. Claimed slugs and core platform addresses are protected. Platform writes are limited to sixty attempts per current user/minute.

## Client recovery and authorization

API mutations use exact-origin checks, strict JSON field sets and a 16 KiB streamed-body limit. Reads and writes use freshly resolved user/session/grant checks. SQL write predicates use only server-resolved positive integer actor IDs and validated public IDs/generated write tokens; request text is bound as data.

Listing results are bound to their tab, query, status, page and refresh generation. Late results cannot render under another tab or filter. Requests are aborted when navigating or replacing detail requests. A stale version returns a conflict, preserves the draft note, refreshes detail versions and requires review acknowledgement again. Permission failures clear privileged data.

Platform grants require a separately controlled database-operator process. No production grant, remote database mutation, resource provisioning, DNS update, deployment or payment action is performed by this milestone. No main-branch promotion is included.

## Local validation

Use the existing Windows PowerShell workflow from `C:\Users\Akash\Techabanca\techabanca-catalogue`:

```powershell
npm.cmd run db:migrate:local
npm.cmd run dev:local
npm.cmd run staging:verify
```

The combined local launcher owns the shared D1 state and exposes management on port 5173 and public catalogues on port 5174. Do not start separate persistent D1 owners.

Validation includes 796 automated tests: management 475, public worker 163, domain 121 and deployment 37. The final verification also runs type checks, normal/staging builds and both deployment dry-runs. Browser QA uses the synthetic local account and a temporary local grant, including all tab transitions, conflict recovery, report review, suspension/restoration, reserved slugs, users, mobile layouts and grant revocation. The temporary grant is removed after QA. Exact evidence, commit and source seal are recorded in the M13 checkpoint.

Known boundaries carried forward: remote staging resources remain unprovisioned following the M8 approval block; live commercial offers remain inactive; Billing resources and credentials are not used; legal/trust implementation is parked; existing moderation-history physical deletion requires a separately reviewed retention design. Next milestone: M14 security hardening.
