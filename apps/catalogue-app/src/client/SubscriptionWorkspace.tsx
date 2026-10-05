import { useCallback, useEffect, useRef, useState } from "react";
import type { SubscriptionView } from "@techabanca/domain";
import { subscriptionApi } from "./subscription-api";

const button = "min-h-11 rounded-xl border border-[#d8e1dd] bg-white px-4 py-2 text-sm font-bold text-[#344047] hover:bg-[#f8faf9] disabled:cursor-not-allowed disabled:opacity-50";
const primary = "min-h-11 rounded-xl bg-[#14221e] px-5 py-2 text-sm font-bold text-white hover:bg-[#263c33] disabled:cursor-not-allowed disabled:opacity-50";
function dateLabel(value: string | null) { return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—"; }
function money(amount: number | null, currency: string | null) { return amount === null || !currency ? "" : new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount / 100); }
const labels = { trialing: "Trial active", active: "Active", past_due: "Payment needs attention", canceled: "Canceled", expired: "Expired" };

export function SubscriptionWorkspace({ organizationId }: { organizationId: string }) {
  const [data, setData] = useState<SubscriptionView | null>(null), [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState(""), [confirm, setConfirm] = useState(false), [pendingConfirm, setPendingConfirm] = useState(false);
  const alive = useRef(false), generation = useRef(0), requestKey = useRef<{ offer: string; id: string } | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    const current = ++generation.current; setLoading(true); setError("");
    try { const value = await subscriptionApi.summary(organizationId, signal); if (alive.current && current === generation.current) setData(value); }
    catch (e) { if (alive.current && !signal?.aborted && current === generation.current) setError(e instanceof Error ? e.message : "Your subscription could not be loaded."); }
    finally { if (alive.current && current === generation.current) setLoading(false); }
  }, [organizationId]);
  useEffect(() => { alive.current = true; const controller = new AbortController(); void load(controller.signal);
    return () => { alive.current = false; generation.current++; controller.abort(); }; }, [load]);
  async function change(action: "trial" | "cancel" | "checkout", offer?: string, pending = false) {
    if (!data || busy) return; ++generation.current; setBusy(true); setError(""); setNotice("");
    try {
      if (action === "checkout" && offer && requestKey.current?.offer !== offer)
        requestKey.current = { offer, id: "chk_" + crypto.randomUUID().replace(/-/g, "") };
      const canceledSubscription = pending && data.checkout ? { id: data.checkout.subscriptionId, version: data.checkout.version! } : data.subscription;
      const value = action === "trial" ? await subscriptionApi.trial(organizationId)
        : action === "cancel" && canceledSubscription ? await subscriptionApi.cancel(organizationId, canceledSubscription.id, canceledSubscription.version)
        : await subscriptionApi.checkout(organizationId, offer!, requestKey.current!.id);
      if (!alive.current) return;
      setData(value); setConfirm(false); setPendingConfirm(false);
      setNotice(action === "trial" ? "Your 14-day trial has started. No payment method is required."
        : action === "cancel" ? "Cancellation confirmed. Any verified paid access continues until the displayed period ends."
        : "Checkout is ready. Your plan will update after the payment is verified.");
    } catch (e) {
      if (!alive.current) return; setError(e instanceof Error ? e.message : "The change could not be completed.");
      try { const fresh = await subscriptionApi.summary(organizationId); if (alive.current) setData(fresh); } catch { /* Keep the last known state; offer Refresh. */ }
    } finally { if (alive.current) setBusy(false); }
  }
  const sub = data?.subscription, paidAccess = !!sub?.provider && data?.canPublish;
  return <section className="space-y-5" aria-labelledby="subscription-heading">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-black uppercase tracking-[0.14em] text-[#789c45]">Subscription</p>
        <h1 id="subscription-heading" className="mt-2 text-2xl font-semibold tracking-tight">Plan and usage</h1>
        <p className="mt-2 text-sm leading-6 text-[#6f7c77]">Manage your Catalogue access and see your workspace usage.</p></div>
      <button className={button} disabled={busy || loading} onClick={() => void load()}>Refresh status</button>
    </div>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-[#dce7c9] bg-[#f4f8ec] p-4 text-sm text-[#3d5225]">{notice}</div>}
    {loading && !data && <p role="status" className="p-6 text-sm text-[#6f7c77]">Loading your subscription…</p>}
    {data && <>
      <div className="rounded-2xl border border-[#dfe5e2] bg-white p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-3"><h2 className="text-xl font-semibold">{sub?.planName ?? "Choose your next step"}</h2>
          <span className="rounded-full bg-[#f1f5f2] px-3 py-1 text-xs font-bold text-[#526158]">{sub ? labels[sub.effectiveStatus] : "No active plan"}</span></div>
        {sub && <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-[#6f7c77]">{sub.provider ? "Paid period ends" : "Trial ends"}</dt><dd className="mt-1 font-semibold">{dateLabel(sub.provider ? sub.periodEndsAt : sub.trialEndsAt)}</dd></div>
          {sub.provider && <div><dt className="text-[#6f7c77]">Plan price</dt><dd className="mt-1 font-semibold">{money(sub.amount, sub.currency)} / {sub.interval === "annual" ? "year" : "month"}</dd></div>}
        </dl>}
        <p className="mt-5 text-sm leading-6 text-[#6f7c77]">{data.canPublish ? "Your plan includes publishing."
          : data.limits["catalogue.publish"] === true ? "Your usage exceeds a configured plan limit. Review your usage before publishing. Your saved content remains editable." : "Publishing needs an active trial or a verified paid plan. Your saved content remains editable."}</p>
        {sub?.cancelAtPeriodEnd && <p className="mt-3 text-sm font-semibold text-[#526158]">Renewal is stopped.{paidAccess ? " Paid access remains available until the period ends." : ""}</p>}
        {data.trialAvailable && <div className="mt-5"><p className="mb-3 text-sm text-[#6f7c77]">Try publishing for 14 days. No card required and no automatic paid renewal.</p>
          <button className={primary} disabled={busy || !data.canManage} onClick={() => void change("trial")}>{busy ? "Starting…" : "Start 14-day trial"}</button></div>}
        {!data.canManage && <p className="mt-4 text-sm text-[#6f7c77]">An owner or admin can manage this subscription.</p>}
        {sub && data.canManage && !sub.cancelAtPeriodEnd && sub.effectiveStatus !== "canceled" && sub.effectiveStatus !== "expired" && <div className="mt-5">
          {!confirm ? <button className={button} disabled={busy} onClick={() => setConfirm(true)}>{sub.provider ? "Stop renewal" : "End trial"}</button>
            : <div className="rounded-xl border border-[#e5eae7] p-4"><p className="text-sm leading-6">{sub.provider ? "Stop renewal? Verified paid access will continue until the period ends." : "End your trial now? Publishing access will end, and this workspace cannot start another trial."}</p>
              <div className="mt-3 flex flex-wrap gap-2"><button className={primary} disabled={busy} onClick={() => void change("cancel")}>{busy ? "Confirming…" : "Confirm cancellation"}</button>
                <button className={button} disabled={busy} onClick={() => setConfirm(false)}>Keep current plan</button></div></div>}
        </div>}
      </div>
      <div className="rounded-2xl border border-[#dfe5e2] bg-white p-6"><h2 className="text-lg font-semibold">Workspace usage</h2>
        <dl className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-4">{[["Items", data.usage.items], ["Categories", data.usage.categories], ["Storage", (data.usage.storageBytes / 1048576).toFixed(1) + " MB"], ["Enquiries", data.usage.enquiries]].map(([name, value]) => <div key={name}><dt className="text-sm text-[#6f7c77]">{name}</dt><dd className="mt-2 text-xl font-semibold">{value}</dd></div>)}</dl>
        {Object.keys(data.limits).some(key => typeof data.limits[key] === "number") && <p className="mt-4 text-sm text-[#6f7c77]">{Object.entries(data.limits).filter(([, value]) => typeof value === "number").map(([key, value]) => `${key === "items.max" ? "Item limit" : key === "storage.bytes.max" ? "Storage limit (bytes)" : key}: ${value}`).join(" · ")}</p>}
      </div>
      <div className="rounded-2xl border border-[#dfe5e2] bg-white p-6"><h2 className="text-lg font-semibold">Paid plans</h2>
        {data.paymentMode === "disabled" ? <p className="mt-3 text-sm leading-6 text-[#6f7c77]">Paid plans are not available yet. Your trial does not convert to a paid subscription automatically.</p>
          : <><p className="mt-3 text-sm leading-6 text-amber-800">Test payments only. Use provider test details. These plans do not charge real money.</p>
            {data.checkout ? <div className="mt-4"><p className="text-sm leading-6">{data.checkout.status === "ready" ? "Payment is awaiting verification. Complete checkout, then refresh the status." : "Checkout setup needs review. Do not start another payment."}</p>
              {data.checkout.url && data.canManage && <a className={primary + " mt-3 inline-flex items-center"} href={data.checkout.url} target="_blank" rel="noopener noreferrer">Continue test checkout</a>}
              {data.checkout.status === "ready" && data.canManage && data.checkout.version !== null && <div className="mt-4">{!pendingConfirm ? <button className={button} disabled={busy} onClick={() => setPendingConfirm(true)}>Cancel pending checkout</button> : <div className="rounded-xl border border-[#e5eae7] p-4"><p className="text-sm leading-6">Cancel this unfinished test checkout? Your current trial or paid access will keep its existing end date.</p><div className="mt-3 flex flex-wrap gap-2"><button className={primary} disabled={busy} onClick={() => void change("cancel", undefined, true)}>{busy ? "Confirming…" : "Confirm checkout cancellation"}</button><button className={button} disabled={busy} onClick={() => setPendingConfirm(false)}>Keep checkout</button></div></div>}</div>}
            </div> : <div className="mt-4 grid gap-3 sm:grid-cols-2">{data.offers.map(offer => <div key={offer.id} className="rounded-xl border border-[#e5eae7] p-4"><h3 className="font-semibold">{offer.name}</h3><p className="mt-2 text-sm">{money(offer.amount, offer.currency)} / {offer.interval === "annual" ? "year" : "month"}</p>
              <p className="mt-2 text-xs leading-5 text-[#6f7c77]">{offer.cycles} billing cycles. Cancel renewal from this page.</p><button className={button + " mt-4"} disabled={busy || !data.canManage || paidAccess} onClick={() => void change("checkout", offer.id)}>Set up test plan</button></div>)}</div>}
            {!data.offers.length && !data.checkout && <p className="mt-3 text-sm text-[#6f7c77]">No test plans are configured yet.</p>}
          </>}
      </div>
    </>}
  </section>;
}
