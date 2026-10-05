import { useCallback, useEffect, useRef, useState } from "react";
import { ANALYTICS_EVENTS, type AnalyticsEvent, type AnalyticsSummary } from "@techabanca/domain";
import { analyticsApi } from "./analytics-api";

const labels: Record<AnalyticsEvent, string> = { catalogue_view: "Page views", item_view: "Item views", search: "Searches",
  whatsapp_click: "WhatsApp opens", enquiry_started: "Enquiry form opens", enquiry_submitted: "Enquiries sent" };
const number = (value: number) => new Intl.NumberFormat().format(value);
const date = (value: string) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(value + "T00:00:00Z"));
const button = "min-h-11 rounded-xl border border-[#d8e1dd] bg-white px-4 py-2 text-sm font-bold text-[#344047] hover:bg-[#f8faf9] disabled:cursor-not-allowed disabled:opacity-50";
function comparison(current: number, previous: number) {
  if (!previous) return current ? "New activity this period" : "No activity in either period";
  const delta = (current - previous) / previous * 100;
  return (delta > 0 ? "+" : "") + delta.toFixed(0) + "% vs previous period";
}
export function AnalyticsWorkspace({ organizationId }: { organizationId: string }) {
  const [days, setDays] = useState<7 | 30 | 90>(30), [metric, setMetric] = useState<AnalyticsEvent>("catalogue_view");
  const [data, setData] = useState<AnalyticsSummary | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const alive = useRef(false), generation = useRef(0);
  const load = useCallback(async (signal?: AbortSignal) => {
    const current = ++generation.current; setLoading(true); setError("");
    try { const value = await analyticsApi.summary(organizationId, days, signal); if (alive.current && current === generation.current) setData(value); }
    catch (e) { if (alive.current && !signal?.aborted && current === generation.current) setError(e instanceof Error ? e.message : "Analytics could not be loaded."); }
    finally { if (alive.current && current === generation.current) setLoading(false); }
  }, [organizationId, days]);
  useEffect(() => { alive.current = true; const controller = new AbortController(); void load(controller.signal);
    return () => { alive.current = false; generation.current++; controller.abort(); }; }, [load]);
  const current = data?.range.days === days ? data : null;
  const max = Math.max(1, ...(current?.daily.map(row => row.counts[metric]) ?? []));
  return <section className="space-y-5" aria-labelledby="analytics-heading" aria-busy={loading}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-black uppercase tracking-[0.14em] text-[#789c45]">Analytics</p>
        <h1 id="analytics-heading" className="mt-2 text-2xl font-semibold tracking-tight">Catalogue performance</h1>
        <p className="mt-2 text-sm leading-6 text-[#6f7c77]">See how people explore your catalogue and reach out.</p></div>
      <button className={button} disabled={loading} onClick={() => void load()}>Refresh analytics</button>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div role="group" aria-label="Analytics date range" className="flex gap-1 rounded-xl border border-[#dfe5e2] bg-white p-1">
        {([7, 30, 90] as const).map(value => <button key={value} aria-pressed={days === value} onClick={() => setDays(value)}
          className={"min-h-11 rounded-lg px-3 text-sm font-bold " + (days === value ? "bg-[#14221e] text-white" : "text-[#6f7c77] hover:bg-[#f1f5f2]")}>{value} days</button>)}
      </div>
      {current && <p className="text-xs text-[#6f7c77]">{date(current.range.start)} – {date(current.range.end)} · UTC · includes today</p>}
    </div>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error} Use Refresh analytics to try again.</div>}
    {loading && <p role="status" className="text-sm text-[#6f7c77]">Loading catalogue activity…</p>}
    {current && <>
      {!current.hasPublication && <div className="rounded-xl border border-[#dce7c9] bg-[#f4f8ec] p-5 text-sm leading-6 text-[#3d5225]">
        <strong>Your catalogue is ready for its first visitors.</strong><p>Publish it, then share the public link to start seeing activity here.</p>
        <a href="#workspace/website" className="mt-2 inline-block font-bold underline">Open website and publishing</a></div>}
      {current.hasPublication && !Object.values(current.totals).some(Boolean) && <p role="status" className="rounded-xl border border-[#dfe5e2] bg-white p-5 text-sm text-[#6f7c77]">No recorded activity in this range yet. Share your published catalogue to start receiving visitors and enquiries.</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ANALYTICS_EVENTS.map(event => <div key={event} className="rounded-2xl border border-[#dfe5e2] bg-white p-5">
          <p className="text-sm font-semibold text-[#6f7c77]">{labels[event]}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-[#14221e]">{number(current.totals[event])}</p>
          <p className="mt-3 text-xs leading-5 text-[#6f7c77]">{comparison(current.totals[event], current.previous[event])}</p>
        </div>)}
      </div>
      <div className="rounded-2xl bg-[#14221e] p-5 text-white sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">Daily activity</h2>
          <p className="mt-1 text-sm text-[#b3c5bb]">{number(current.totals[metric])} {labels[metric].toLowerCase()} over {days} days</p></div>
          <div><label htmlFor="analytics-metric" className="sr-only">Trend metric</label><select id="analytics-metric" value={metric} onChange={e => setMetric(e.target.value as AnalyticsEvent)}
            className="min-h-11 max-w-full rounded-xl border border-[#4b6056] bg-[#20372b] px-3 text-sm text-white">
            {ANALYTICS_EVENTS.map(event => <option key={event} value={event}>{labels[event]}</option>)}
          </select></div></div>
        <svg viewBox="0 0 900 240" className="mt-5 w-full" role="img" aria-label={labels[metric] + " by UTC day. Exact values are available in the daily counts table."}>
          {[0, 1, 2].map(index => <line key={index} x1="5" x2="895" y1={30 + index * 80} y2={30 + index * 80} stroke="#385044" strokeDasharray="4 6" />)}
          {current.daily.map((row, index) => { const height = row.counts[metric] / max * 170, width = 880 / current.daily.length;
            return <rect key={row.day} x={10 + index * width} y={205 - Math.max(height, 2)} width={Math.max(1, width - 3)} height={Math.max(height, 2)} rx="2"
              fill={row.counts[metric] ? "#b7d878" : "#385044"}><title>{date(row.day)}: {number(row.counts[metric])}</title></rect>; })}
          <text x="10" y="235" fill="#b3c5bb" fontSize="13">{date(current.range.start)}</text>
          <text x="890" y="235" textAnchor="end" fill="#b3c5bb" fontSize="13">{date(current.range.end)}</text>
        </svg>
      </div>
      <div className="rounded-2xl border border-[#dfe5e2] bg-white p-5 sm:p-7"><h2 className="text-lg font-semibold">Top items</h2>
        <p className="mt-1 text-sm text-[#6f7c77]">Published products and services, ranked by item views.</p>
        {current.topItems.length ? <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm"><caption className="sr-only">Item views and enquiry actions in the selected range</caption>
          <thead className="border-b border-[#e5eae7] text-xs text-[#6f7c77]"><tr><th scope="col" className="pb-3 pr-4">Item</th><th scope="col" className="pb-3 pr-4">Views</th><th scope="col" className="pb-3 pr-4">WhatsApp opens</th><th scope="col" className="pb-3">Enquiries sent</th></tr></thead>
          <tbody>{current.topItems.map(item => <tr key={item.id} className="border-b border-[#f1f4f2]"><th scope="row" className="py-4 pr-4 font-semibold">{item.name}</th><td className="pr-4">{number(item.views)}</td><td className="pr-4">{number(item.whatsappClicks)}</td><td>{number(item.enquiries)}</td></tr>)}</tbody>
        </table></div> : <p className="mt-5 text-sm text-[#6f7c77]">No item activity in this range yet.</p>}
      </div>
      <details className="rounded-2xl border border-[#dfe5e2] bg-white p-5"><summary className="cursor-pointer text-sm font-semibold">View daily counts</summary>
        <div className="mt-4 max-h-80 overflow-auto"><table className="w-full min-w-[680px] text-left text-xs"><caption className="sr-only">Daily analytics counts in UTC</caption>
          <thead><tr><th scope="col" className="p-2">UTC day</th>{ANALYTICS_EVENTS.map(event => <th key={event} scope="col" className="p-2">{labels[event]}</th>)}</tr></thead>
          <tbody>{current.daily.map(row => <tr key={row.day} className="border-t border-[#f1f4f2]"><th scope="row" className="p-2 font-normal">{row.day}</th>{ANALYTICS_EVENTS.map(event => <td key={event} className="p-2">{number(row.counts[event])}</td>)}</tr>)}</tbody>
        </table></div></details>
      <p className="text-xs leading-6 text-[#6f7c77]">Counts represent eligible page requests and actions, including repeat visits. They are not unique visitor counts.
        Known bots, prefetches, private previews and requests with privacy opt-outs are excluded. Enquiry form opens count a displayed form; WhatsApp opens count a link click, not a conversation.
        No visitor identifiers, search text or contact details are collected. Daily counts are retained for {current.retentionDays} days. Today is still in progress.</p>
    </>}
  </section>;
}
