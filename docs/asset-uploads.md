# Asset upload HTTP flow (M5.2, local development)

The Catalogue App owns this flow. The Public Worker remains snapshot-only.
Every endpoint requires an authenticated session and X-Techabanca-Organization.
Owner/admin can mutate; editor can read metadata and download ready assets.
Unsafe requests use the existing same-origin guard.

1. POST /api/v1/catalogue/assets/upload-intents with originalFilename,
   mimeType, and expectedByteSize. The server returns a pending asset,
   an expiring signed PUT URL, and required content type.
2. PUT binary bytes to that URL using the same session and tenant selection.
   The server enforces the declared byte count, stores a server-generated
   SHA-256 checksum, and conditionally creates the immutable R2 object.
3. POST /api/v1/catalogue/assets/:id/complete with a numeric version.
   Completion reads R2 metadata and the binary signature. Client-provided
   checksums, sizes, and object keys do not determine readiness.
4. GET /api/v1/catalogue/assets/:id reads lifecycle metadata.
   GET /api/v1/catalogue/assets/:id/content downloads verified ready content.

Local uploads use the worker transport and the local ASSETS R2 binding.
The PUT authorization uses HMAC-SHA256 and binds the session, organization,
asset ID, optimistic version, MIME type, byte count, and stored expiry.
It supplements session authorization and does not replace it.
Repeated PUTs cannot overwrite an existing object.

Set ASSET_UPLOAD_SIGNING_SECRET to a cryptographically random 32-byte value
encoded as 64 hexadecimal characters in the App's ignored .dev.vars.
The test configuration supplies an explicit test-only key.
Missing/invalid configuration rejects new intents and PUTs with 503.
Never commit this secret. Production provisioning is a later milestone.

This local Worker URL is distinct from an S3 presigned URL. Direct R2 S3
uploads require separate bucket credentials and transport configuration.
Those resources are outside this local slice.
