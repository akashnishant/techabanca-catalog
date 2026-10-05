import { ANALYTICS_EVENTS, ANALYTICS_RETENTION_DAYS, analyticsWindow, emptyAnalyticsCounts,
  type AnalyticsEvent, type AnalyticsSummary, type TenantContext } from "@techabanca/domain";

export class AnalyticsError extends Error {
  constructor(public readonly status: 400 | 404, public readonly code: string, message: string) { super(message); }
}
export class AnalyticsService {
  constructor(private readonly db: D1Database) {}
  async summary(tenant: TenantContext, query: URLSearchParams, date = new Date()): Promise<AnalyticsSummary> {
    if ([...query.keys()].some(key => key !== "days") || query.getAll("days").length > 1 || !["7", "30", "90"].includes(query.get("days") ?? "30"))
      throw new AnalyticsError(400, "invalid_analytics_range", "Choose a 7, 30 or 90 day range.");
    const range = analyticsWindow(Number(query.get("days") ?? 30), date);
    const catalogue = await this.db.prepare("SELECT c.id, EXISTS (SELECT 1 FROM catalogue_publications p WHERE p.catalogue_id = c.id AND p.activated_at IS NOT NULL) AS published FROM catalogues c WHERE c.organization_id = ? AND c.deleted_at IS NULL LIMIT 1")
      .bind(tenant.organizationId).first<{ id: number; published: number }>();
    if (!catalogue) throw new AnalyticsError(404, "catalogue_not_found", "Create your catalogue before viewing analytics.");
    const results = await this.db.batch([
      this.db.prepare("SELECT day, event, SUM(count) AS n FROM catalogue_analytics_daily WHERE catalogue_id = ? AND day BETWEEN ? AND ? GROUP BY day, event ORDER BY day")
        .bind(catalogue.id, range.previousStart, range.end),
      this.db.prepare(`WITH totals AS (
        SELECT item_public_id, SUM(CASE WHEN event = 'item_view' THEN count ELSE 0 END) AS views,
          SUM(CASE WHEN event = 'whatsapp_click' THEN count ELSE 0 END) AS whatsappClicks,
          SUM(CASE WHEN event = 'enquiry_submitted' THEN count ELSE 0 END) AS enquiries
        FROM catalogue_analytics_daily WHERE catalogue_id = ? AND day BETWEEN ? AND ? AND item_public_id <> ''
        GROUP BY item_public_id HAVING views + whatsappClicks + enquiries > 0
      ), metadata AS (
        SELECT i.item_public_id, i.name, i.slug, ROW_NUMBER() OVER (PARTITION BY i.item_public_id ORDER BY p.revision_number DESC) AS rank
        FROM published_items i JOIN catalogue_publications p ON p.id = i.publication_id
        WHERE p.catalogue_id = ? AND p.activated_at IS NOT NULL
      ) SELECT t.item_public_id AS id, COALESCE(m.name, 'Previously published item') AS name, m.slug,
        t.views, t.whatsappClicks, t.enquiries FROM totals t LEFT JOIN metadata m ON m.item_public_id = t.item_public_id AND m.rank = 1
        ORDER BY t.views DESC, t.enquiries DESC, t.whatsappClicks DESC, t.item_public_id LIMIT 10`)
        .bind(catalogue.id, range.start, range.end, catalogue.id),
    ]);
    const totals = emptyAnalyticsCounts(), previous = emptyAnalyticsCounts();
    const daily: AnalyticsSummary["daily"] = Array.from({ length: range.days }, (_, index) => ({
      day: new Date(Date.parse(range.start + "T00:00:00Z") + index * 86400000).toISOString().slice(0, 10), counts: emptyAnalyticsCounts(),
    }));
    for (const row of results[0].results as Array<{ day: string; event: AnalyticsEvent; n: number }>) {
      if (!ANALYTICS_EVENTS.includes(row.event)) continue;
      const current = row.day >= range.start, target = current ? totals : previous;
      target[row.event] = Math.min(Number.MAX_SAFE_INTEGER, target[row.event] + row.n);
      if (current) daily.find(value => value.day === row.day)!.counts[row.event] = row.n;
    }
    return { range, generatedAt: date.toISOString(), totals, previous, daily,
      topItems: results[1].results as AnalyticsSummary["topItems"], hasPublication: catalogue.published === 1, retentionDays: ANALYTICS_RETENTION_DAYS };
  }
}
export async function purgeExpiredAnalytics(db: D1Database, date = new Date()) {
  const cutoff = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - (ANALYTICS_RETENTION_DAYS - 1) * 86400000).toISOString().slice(0, 10);
  let batches = 0;
  for (; batches < 20; batches++) {
    const result = await db.prepare("DELETE FROM catalogue_analytics_daily WHERE (catalogue_id, day, event, item_public_id) IN (SELECT catalogue_id, day, event, item_public_id FROM catalogue_analytics_daily WHERE day < ? ORDER BY day LIMIT 500)").bind(cutoff).run();
    if (!result.meta.changes) break;
  }
  return { batches, hasMore: !!await db.prepare("SELECT 1 FROM catalogue_analytics_daily WHERE day < ? LIMIT 1").bind(cutoff).first() };
}
