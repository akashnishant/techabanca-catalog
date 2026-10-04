# Item and website media (M5.3–M5.6, local development)

## Scope

Authenticated item image/PDF authoring and business logo/hero selections use the
M5.2 verified upload flow. No public catalogue renderer or publishing action is
added here. No remote Cloudflare resources are created.

Images: JPEG/PNG/WebP, maximum 8 MiB each. Documents: PDF, maximum 20 MiB.
The current collection bounds are 12 images and 8 PDFs per item, shared in domain
constants. These bounds are separate from future subscription entitlements.

## HTTP contracts

All operations require an authenticated session and
`X-Techabanca-Organization`. Owners/admins mutate; editors read only.
The existing same-origin middleware protects unsafe requests.

- `GET /api/v1/catalogue/assets?kind=image|document&after=<asset-id>`:
  ready same-tenant files only, 24 per page, public-ID cursor, no storage keys.
- `GET /api/v1/catalogue/items/:itemId/media`: complete media collection and revision.
- `PUT /api/v1/catalogue/items/:itemId/media`: replace the collection using
  `{ version, images: [{assetId, altText, isPrimary}], documents: [{assetId, label, isVisible}] }`.
  Array order determines display order. Nonempty image collections have exactly
  one primary image; duplicates, non-ready/foreign/wrong-kind assets are rejected.
- `GET /api/v1/catalogue/website/media`: current logo/hero and website-settings revision.
- `PUT /api/v1/catalogue/website/media`:
  `{version, logoAssetId: string|null, heroAssetId: string|null}`.
  Other website settings are preserved.
- `DELETE /api/v1/catalogue/assets/:assetId`: `{version}` soft-removes unused
  metadata. Draft/archived item and website references prevent removal (409).

Request JSON is bounded. Media labels are plain text; no arbitrary HTML is rendered.
API payloads contain public asset IDs and safe metadata, never R2 keys or signed
upload authorizations except the existing short-lived intent response.

## Consistency

Migration 0018 is additive. Item media has an independent optimistic revision;
changing media does not invalidate an item's content version or specification
versions. Replacement uses one atomic D1 batch. A unique write token gates
deletes/inserts after the compare-and-swap, so a losing request cannot alter the
winner's links. A failing attachment constraint rolls back the entire batch.

Website image mutations use the existing website-settings version, including
conflicts with theme/settings edits.

An item editor saves content, specifications, and media through separate guarded
operations. If a later operation fails, earlier saved content is retained and the
editor stays open with an error. Media conflicts offer reload with a discard
confirmation. This is not an atomic transaction across all editor sections.

Uploads verify before attachment. Cancellation discards the pending attachment;
Cancel on the item editor leaves saved links unchanged. Removing a primary image
promotes the first remaining image. Uploaded bytes are not public-live.

## Private previews and retention

Previews/downloads fetch the authenticated content endpoint with tenant headers.
Image object URLs are revoked when unmounted. Uploaded images are decoded in the
browser before intent creation; server verification remains authoritative.
Upload progress, abort/cancel, actionable errors and retry are supported.

The reusable-file picker lists verified uploads. Its filename search filters
loaded pages; Load more retrieves additional pages. Delete rejects files in use
and soft-removes unused metadata.

Detach and soft-delete never delete R2 bytes. Immutable published snapshots may
still reference object keys. Physical garbage collection and scheduled expiry
sweeps require the future publication/retention policy and are intentionally not
implemented. Pending uploads still expire on use through the existing lifecycle.

## Local verification

Run `npm.cmd run verify` from the repository root. The media HTTP suite covers
tenant/role/origin boundaries, typed inputs and limits, non-ready/wrong-kind assets,
optimistic conflicts, concurrent whole-collection replacement, rollback,
website selections, reusable-file pagination, in-use deletion guards, and
R2 byte retention.

Browser QA additionally covers PNG/JPEG/WebP/PDF uploads, preview decoding,
file downloads, staged create/edit/save/cancel, primary selection and ordering,
PDF label/visibility, upload errors/retry/cancel, media-conflict recovery, website
logo/hero upload/select/replace/remove, editor read-only access, and 375px layout.
