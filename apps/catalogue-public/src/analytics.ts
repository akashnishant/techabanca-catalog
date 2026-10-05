import { analyticsEligible, publicSubscriptionSql, type AnalyticsEvent } from "@techabanca/domain";
import type { PublicBindings, Site } from "./model";

export type AnalyticsPoint = { event: AnalyticsEvent; itemId?: string };
// Each write rechecks the active immutable publication and access policy. All parameters are server-derived.
export function analyticsStatement(env: PublicBindings, site: Site, point: AnalyticsPoint, day: string, createdEnquiry?: string) {
  return env.DB.prepare(`INSERT INTO catalogue_analytics_daily (catalogue_id, day, event, item_public_id, count)
    SELECT c.id, ?, ?, ?, 1 FROM public_catalogue_routes r
    JOIN catalogue_publications p ON p.id = r.publication_id JOIN published_catalogues pc ON pc.publication_id = p.id
    JOIN catalogues c ON c.public_id = pc.catalogue_public_id JOIN organizations o ON o.id = c.organization_id
    WHERE r.slug = ? AND r.status = 'active' AND p.state = 'active' AND p.public_id = ?
      AND pc.catalogue_public_id = r.catalogue_public_id AND p.catalogue_public_id = r.catalogue_public_id AND pc.slug = r.slug
      AND c.deleted_at IS NULL AND o.deleted_at IS NULL AND o.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM reserved_slugs rs WHERE rs.slug = r.slug)
      AND ${publicSubscriptionSql(env.DEPLOYMENT_ENVIRONMENT === "local")}
      AND (? = '' OR EXISTS (SELECT 1 FROM published_items i WHERE i.publication_id = p.id AND i.item_public_id = ?))
      ${createdEnquiry ? "AND changes() = 1 AND EXISTS (SELECT 1 FROM enquiries e WHERE e.public_id = ? AND e.catalogue_id = c.id)" : ""}
    ON CONFLICT(catalogue_id, day, event, item_public_id) DO UPDATE SET count = MIN(count + 1, 9007199254740991)`)
    .bind(day, point.event, point.itemId ?? "", site.slug, site.publication_public_id, point.itemId ?? "", point.itemId ?? "", ...(createdEnquiry ? [createdEnquiry] : []));
}
export function emitAnalytics(env: PublicBindings, site: Site, point: AnalyticsPoint) {
  try { env.CATALOGUE_ANALYTICS?.writeDataPoint({ indexes: [site.catalogue_public_id],
    blobs: ["v1", point.event, site.publication_public_id, point.itemId ?? ""], doubles: [1] }); }
  catch { /* Optional telemetry must never prevent catalogue or enquiry access. */ }
}
export async function recordAnalytics(env: PublicBindings, site: Site, request: Request, preview: boolean, points: AnalyticsPoint[]) {
  if (!analyticsEligible(request, preview)) return;
  try {
    const day = new Date().toISOString().slice(0, 10);
    const results = await env.DB.batch(points.map(point => analyticsStatement(env, site, point, day)));
    points.forEach((point, i) => { if (results[i].meta.changes > 0) emitAnalytics(env, site, point); });
  } catch { /* Page requests remain available if aggregate storage is temporarily unavailable. */ }
}
