import { catalogueShareTarget, publicSubscriptionSql, readCatalogueDeployment, type SharingView, type TenantContext } from "@techabanca/domain";

export class SharingError extends Error {
  constructor(public readonly status: 400 | 404, public readonly code: string, message: string) { super(message); }
}
type Header = { publicationId: string | null; revision: number; publishedAt: string; businessName: string; slug: string; total: number };
export class SharingService {
  constructor(private readonly db: D1Database, private readonly environment?: string, private readonly localPreview?: string) {}
  async view(tenant: TenantContext, query: URLSearchParams): Promise<SharingView> {
    const search = (query.get("q") ?? "").trim(), type = query.get("type") ?? "all", pageText = query.get("page") ?? "1";
    if ([...query.keys()].some(key => !["q", "type", "page"].includes(key)) ||
      ["q", "type", "page"].some(key => query.getAll(key).length > 1) || search.length > 100 ||
      !["all", "product", "service"].includes(type) || !/^[1-9]\d{0,3}$/.test(pageText))
      throw new SharingError(400, "invalid_sharing_filters", "Check your item search and filters, then try again.");
    const deployment = readCatalogueDeployment(this.environment);
    if (!deployment) throw new Error("deployment_unavailable");
    const page = Number(pageText), pageSize = 24;
    // Same policy and immutable read model as the public renderer. Both reads share one D1 batch snapshot.
    const live = `WITH live AS (
      SELECT p.id, p.public_id AS publicationId, p.revision_number AS revision, p.activated_at AS publishedAt,
        pc.business_name AS businessName, pc.slug
      FROM catalogues c JOIN organizations o ON o.id = c.organization_id
      JOIN public_catalogue_routes r ON r.catalogue_public_id = c.public_id
      JOIN catalogue_publications p ON p.id = r.publication_id AND p.catalogue_id = c.id
      JOIN published_catalogues pc ON pc.publication_id = p.id
      WHERE c.organization_id = ? AND c.deleted_at IS NULL AND c.status = 'published'
        AND o.status = 'active' AND o.deleted_at IS NULL
        AND r.status = 'active' AND p.state = 'active' AND p.activated_at IS NOT NULL
        AND pc.catalogue_public_id = c.public_id AND p.catalogue_public_id = c.public_id AND pc.slug = r.slug
        AND NOT EXISTS (SELECT 1 FROM reserved_slugs rs WHERE rs.slug = r.slug)
        AND ${publicSubscriptionSql(deployment === "local" && this.localPreview === "true")}
      LIMIT 1
    )`;
    const filter = "(? = '' OR instr(lower(i.name), lower(?)) > 0) AND (? = 'all' OR i.item_type = ?)";
    const results = await this.db.batch([
      this.db.prepare(live + ` SELECT l.*,
        (SELECT count(*) FROM published_items i WHERE i.publication_id = l.id AND ${filter}) AS total
        FROM catalogues c LEFT JOIN live l ON 1 = 1 WHERE c.organization_id = ? AND c.deleted_at IS NULL ORDER BY c.id LIMIT 1`)
        .bind(tenant.organizationId, search, search, type, type, tenant.organizationId),
      this.db.prepare(live + ` SELECT i.item_public_id AS id, i.name, i.slug, i.item_type AS type
        FROM published_items i JOIN live l ON l.id = i.publication_id WHERE ${filter}
        ORDER BY i.sort_order, i.name, i.item_public_id LIMIT ? OFFSET ?`)
        .bind(tenant.organizationId, search, search, type, type, pageSize, (page - 1) * pageSize),
    ]);
    const header = results[0].results[0] as Header | undefined;
    if (!header) throw new SharingError(404, "catalogue_not_found", "Create your catalogue before sharing it.");
    if (!header.publicationId) return { deployment, publication: null, items: [], total: 0, page, pageSize };
    return { deployment, publication: { id: header.publicationId, revision: header.revision, publishedAt: header.publishedAt,
      businessName: header.businessName, target: catalogueShareTarget(header.slug, header.businessName) },
      items: (results[1].results as Array<{ id: string; name: string; slug: string; type: "product" | "service" }>).map(item => ({
        id: item.id, name: item.name, type: item.type, target: catalogueShareTarget(header.slug, header.businessName, item),
      })), total: header.total, page, pageSize };
  }
}
