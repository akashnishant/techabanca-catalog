import { useEffect, useRef } from "react";
type Turnstile = {
  render(element: HTMLElement, options: { sitekey: string; action: string; theme: string; size: string; callback: (token: string) => void; "expired-callback": () => void; "error-callback": () => void }): string;
  reset(id: string): void;
  remove(id: string): void;
};
declare global { interface Window { turnstile?: Turnstile; } }
let loading: Promise<Turnstile> | undefined;
function loadChallenge(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;
  loading = new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    const fail = () => { clearTimeout(timer); script.remove(); loading = undefined; reject(new Error("challenge_unavailable")); };
    const timer = setTimeout(fail, 15000);
    script.onerror = fail;
    script.onload = () => { clearTimeout(timer); if (window.turnstile) resolve(window.turnstile); else fail(); };
    document.head.append(script);
  });
  return loading;
}
export function AuthChallenge({ siteKey, action, generation, onToken, onError }: {
  siteKey: string; action: "login" | "register"; generation: number;
  onToken: (token: string | null) => void; onError: (message: string) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const currentWidget = useRef<{ api: Turnstile; id: string } | null>(null);
  const lastGeneration = useRef(generation);
  useEffect(() => {
    let active = true, widget: string | undefined, provider: Turnstile | undefined;
    let observer: ResizeObserver | undefined, size: string | undefined, renderEpoch = 0;
    onToken(null);
    void loadChallenge().then(api => {
      if (!active || !holder.current) return;
      provider = api;
      const renderWidget = () => {
        if (!active || !holder.current) return;
        const nextSize = holder.current.clientWidth < 300 ? "compact" : "flexible";
        if (widget !== undefined && size === nextSize) return;
        const epoch = ++renderEpoch;
        onToken(null);
        currentWidget.current = null;
        const oldWidget = widget;
        widget = undefined;
        if (oldWidget !== undefined) api.remove(oldWidget);
        const current = () => active && epoch === renderEpoch;
        widget = api.render(holder.current, {
          sitekey: siteKey, action: "auth_" + action, theme: "light", size: nextSize,
          callback: token => { if (current()) onToken(token); },
          "expired-callback": () => { if (current()) { onToken(null); onError("The security check expired. Complete a new check."); } },
          "error-callback": () => { if (current()) { onToken(null); onError("The security check could not load. Please retry."); } },
        });
        size = nextSize;
        currentWidget.current = { api, id: widget };
      };
      renderWidget();
      observer = new ResizeObserver(() => {
        try { renderWidget(); }
        catch { onToken(null); onError("The security check could not load. Please retry."); }
      });
      observer.observe(holder.current);
    }).catch(() => { if (active) onError("The security check could not load. Please retry."); });
    return () => {
      active = false;
      observer?.disconnect();
      currentWidget.current = null;
      if (widget !== undefined && provider) provider.remove(widget);
    };
  }, [siteKey, action, onToken, onError]);
  useEffect(() => {
    if (lastGeneration.current === generation) return;
    lastGeneration.current = generation;
    onToken(null);
    const widget = currentWidget.current;
    if (!widget) return;
    try { widget.api.reset(widget.id); }
    catch { onError("The security check could not load. Please retry."); }
  }, [generation, onToken, onError]);
  return <div><p className="mb-2 text-sm text-[#68757b]">Complete the security check to continue.</p><div ref={holder} /></div>;
}
