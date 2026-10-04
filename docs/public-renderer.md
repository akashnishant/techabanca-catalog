# Public catalogue renderer (M6)

The Public Worker renders immutable, activated catalogue snapshots. It never
reads management organizations, profiles, source items or editable assets.
Setting a source item to `published` does not publish it on the public website.

## Routes and display

| Route | Behavior |
| --- | --- |
| `/` | Business hero, featured items, categories, About and contact sections |
| `/catalogue` | Search, product/service and category filters, 24-item pagination |
| `/categories/:slug` | Category listing, including direct child categories |
| `/items/:slug` | Images, descriptions, visible prices, public specifications, PDF downloads and contact actions |
| `/about`, `/contact` | Published business content and enabled contact channels |
| `/media/:publicationPublicId/:assetPublicId` | Referenced media from the active snapshot only |
| `/robots.txt` | Production crawl policy; staging/local previews disallow crawling |
| `/theme.css`, `/favicon.svg`, `/health` | Controlled styles, master brand favicon and service health |

Search uses name, SKU and short description. Percent, underscore and backslash
are literal search characters. Pagination preserves search and selected filters.
Prices use stored minor units and are rendered only when `show_price` is enabled.

Professional and Modern renderer styles are controlled by the snapshotted theme
code; unknown codes fall back to Professional. The management theme selector
currently offers Professional. Master Techabanca brand geometry is preserved in
both themes, including the required branded footer.

Pages render on the server and visitor interactions work without JavaScript.
Native links and GET forms provide navigation and search. Quote links open the
Contact page with the selected item. Email, WhatsApp and phone links carry the
published contact settings; stored enquiry submissions belong to a later milestone.

## Tenant and revision boundaries

Production hosts are exactly `<slug>.techabanca.com`; staging hosts are
`<slug>.catalogue-preview.techabanca.com`. Reserved, nested and malformed hosts
are rejected. Forwarded host and organization headers cannot select a tenant.
Production HTTP redirects to HTTPS. Staging pages use `noindex` and production
canonical URLs.

A request resolves an active public route and publication, then pins every
snapshot query to that publication. Building revisions are accessible only through an unexpired signed M7 preview
path after the snapshot is sealed; see [publishing](publishing.md).
Unknown and suspended routes return the same branded 404, including media.
Responses use `no-store`, so route suspension and revision activation are checked
on the next request. A request already in progress can finish its pinned revision.

Media URLs contain public IDs; HTML never exposes R2 object keys. The media
endpoint accepts only images (PNG/JPEG/WebP) and PDF documents referenced by the
current snapshot. It supports GET, HEAD, ETags and single byte ranges. PDFs
download with a sanitized snapshot label. Unsupported and unreferenced objects,
other catalogues' media and retired revision URLs return 404.

## Local PowerShell workflow

App and Public Vite configurations share the root `.wrangler/state` D1/R2 state.
Run migrations from the repository root:

~~~powershell
npm.cmd run db:migrate:local
npm.cmd run verify
npm.cmd run dev --workspace @techabanca/catalogue-public -- --host 127.0.0.1 --port 5174 --strictPort
~~~

The Public Worker's ignored `apps/catalogue-public/.dev.vars` can contain
`LOCAL_PREVIEW=true` to enable `http://<slug>.localhost:5174/` for local fixtures.
The committed default is false. Automated tests explicitly disable this local
switch, then test opt-in behavior separately. Do not enable it in production.

An activated snapshot fixture is required; ordinary management drafts do not
appear at the public URL. Browser QA used synthetic local demo snapshots and
local R2 files only. The fixture factory in
`apps/catalogue-public/test/fixtures.ts` populates isolated automated-test D1/R2
state; it is not a publisher or production migration.

The D1 ID in the Public Wrangler configuration is a local placeholder. No remote
resource provisioning, deployment, wildcard DNS, publisher API, signed preview
tokens or stored enquiry workflow is included in M6. M7 implements publication
building and atomic activation; M8 supplies deployment and hostname routing.

Signed M7 previews also work on local hosts without activating a public route.
Their pages and media use no-referrer and noindex/nofollow; navigation and forms
preserve the signed path. Public search uses literal substring matching to avoid
D1's 50-byte LIKE/GLOB pattern bound.

## Verification

`npm.cmd run verify` runs typechecks, tests and production builds for the project.
Public tests cover host resolution, snapshot isolation, contact visibility,
escaping, themes, pagination, revision changes, suspension and media boundaries.
Local browser checks complement these tests with native navigation, images,
PDF downloads, keyboard access and desktop/mobile layouts.
