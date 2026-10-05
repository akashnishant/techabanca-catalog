# Sharing tools (M12)

The Share workspace offers canonical catalogue and item links, clipboard copy,
prepared WhatsApp messages, and downloadable PNG/SVG QR codes. Owner, admin and
editor members can read the tools for their selected organization.

## Public targets and availability

`GET /api/v1/catalogue/sharing?q=&type=all&page=1` is an authenticated,
tenant-scoped, read-only endpoint with `Cache-Control: no-store` and
`Referrer-Policy: no-referrer`. It accepts a literal published-name search
(maximum 100 trimmed characters), all/product/service type, and integer pages
1–9999 with 24 items per page. Unknown or duplicate parameters return 400.

Every target has a fixed HTTPS origin:
`https://<business>.techabanca.com/` for a catalogue and
`https://<business>.techabanca.com/items/<published-item-slug>` for an item.
The request host, localhost, staging hosts, filters, visitor IDs and signed
private-preview tokens never enter a target. Slugs are validated before URL and
safe download-filename construction.

The API uses the active, activated immutable publication, its published business
name and its published item names/slugs. A sealed private preview, authoring edit,
draft or hidden source item cannot appear. The catalogue and item page are read
in one D1 batch snapshot. Pagination orders by published sort order, name and
public ID, with a count from that same snapshot.

The route, publication, catalogue and organization must be active and consistent.
The same public subscription policy used by the public renderer applies:
enabled publishing entitlement and a current trial/paid period, including
verified paid access through its existing cancellation/past-due period end.
Legacy unsubscribed access is restricted to local development with
`LOCAL_PREVIEW=true`; any subscription, trial marker or checkout history disables
that exception. An unavailable catalogue returns no share targets or items.
No endpoint can activate a publication or renew access. Existing distributed
links and QR codes remain public addresses, and normal public request rules
still decide whether a customer can access them.

Local/staging tools intentionally generate permanent production addresses and
display an environment notice. They do not claim that production routing or
deployment exists. The management UI offers Open public link only in production.
Production resources/routing and remote staging remain pending separate work.

## QR generation and downloads

The browser lazily loads the pinned `qrcode` dependency and generates both
formats locally. No third-party QR endpoint receives a link. QR images encode
only the canonical URL, use black modules on white, a four-module quiet zone,
medium error correction, and a 1024px PNG. SVG preserves vector quality for
printing. They contain no preview credentials, embedded business contact data,
logo overlay, redirect shortener or tracking parameters.

Selecting a new item replaces all three targets together. QR generation and
API requests have cancellation/generation guards; stale results cannot replace
a newer selection or a different tenant. Refresh/search errors clear prior
share targets. A QR failure leaves the link available and offers Retry QR code.
A blocked clipboard operation selects the read-only URL and explains manual copy.

PNG and SVG downloads use the validated catalogue/item slug in their filenames.
Keep the white border and independently test the final printed layout before
distribution; resizing/cropping by a print tool is outside the application.

The prepared `https://wa.me/?text=...` message uses only published item/business
names and the canonical URL. There is no preselected recipient, automatic send,
or delivery claim. The user reviews and sends the message in WhatsApp.
The link opens with no opener/referrer. Generating/copying/sharing tools do not
increment public visitor or contact analytics; visiting public content continues
to follow M11 analytics eligibility.

## Local verification

Run `npm.cmd run dev:local` from the Windows repository root to share one local
D1 runtime between management/public workers. Use the Share navigation entry or
`http://127.0.0.1:5173/#workspace/share`. Workspace hash navigation supports these
links and the publishing/subscription guidance.

Automated tests exercise tenant/auth/role boundaries, immutable publication
selection, unavailable access states, literal filtering, pagination, parameter
rejection, canonical URL/message construction and safe failures. Browser QA
covers real local responses, clipboard behavior, item selection, downloads
decoded by an independent QR reader, desktop/mobile layouts, retry/unpublished
states and stale-response handling.

No database migration, remote resource, DNS change, paid offer activation,
provider request or legal-policy implementation is part of M12.
