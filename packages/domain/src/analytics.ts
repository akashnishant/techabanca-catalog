export const ANALYTICS_EVENTS = ["catalogue_view", "item_view", "search", "whatsapp_click", "enquiry_started", "enquiry_submitted"] as const;
export type AnalyticsEvent = typeof ANALYTICS_EVENTS[number];
export type AnalyticsCounts = Record<AnalyticsEvent, number>;
export const ANALYTICS_RETENTION_DAYS = 400;
export function emptyAnalyticsCounts(): AnalyticsCounts {
  return Object.fromEntries(ANALYTICS_EVENTS.map(event => [event, 0])) as AnalyticsCounts;
}
export function analyticsWindow(days: number, now = new Date()) {
  if (![7, 30, 90].includes(days) || !Number.isFinite(now.getTime())) throw new Error("invalid_analytics_range");
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const day = (offset: number) => new Date(end + offset * 86400000).toISOString().slice(0, 10);
  return { days: days as 7 | 30 | 90, start: day(1 - days), end: day(0), previousStart: day(1 - days * 2), previousEnd: day(-days) };
}
export function analyticsEligible(request: Request, preview = false, submission = false): boolean {
  if (preview || request.method !== (submission ? "POST" : "GET") || request.headers.get("DNT") === "1" || request.headers.get("Sec-GPC") === "1") return false;
  if (/prefetch|prerender/i.test([request.headers.get("Purpose"), request.headers.get("Sec-Purpose"), request.headers.get("X-Purpose")].join(" "))) return false;
  const mode = request.headers.get("Sec-Fetch-Mode"), dest = request.headers.get("Sec-Fetch-Dest");
  if ((mode && mode !== "navigate") || (dest && dest !== "document")) return false;
  const agent = request.headers.get("User-Agent") ?? "";
  return !!agent && !/bot|crawler|spider|slurp|headless|preview|facebookexternalhit|curl|wget|python|lighthouse|monitor|uptime|whatsapp|telegram/i.test(agent);
}
export type AnalyticsSummary = {
  range: ReturnType<typeof analyticsWindow>; generatedAt: string;
  totals: AnalyticsCounts; previous: AnalyticsCounts;
  daily: Array<{ day: string; counts: AnalyticsCounts }>;
  topItems: Array<{ id: string; name: string; slug: string | null; views: number; whatsappClicks: number; enquiries: number }>;
  hasPublication: boolean; retentionDays: number;
};
