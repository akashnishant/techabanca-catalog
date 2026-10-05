import { Component, Suspense, type ReactNode } from "react";

class SectionBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <section role="alert" className="rounded-2xl border border-[#dfe5e2] bg-white p-6">
      <h1 className="text-xl font-semibold">This section could not load.</h1>
      <p className="mt-2 text-sm text-[#68756f]">Check your connection and reload the page to try again.</p>
      <button type="button" onClick={() => window.location.reload()} className="mt-4 cursor-pointer rounded-lg bg-[#0b1519] px-4 py-2 font-semibold text-white">Reload page</button>
    </section>;
    return this.props.children;
  }
}

export function DeferredSection({ label, children }: { label: string; children: ReactNode }) {
  return <SectionBoundary key={label}><Suspense fallback={
    <section role="status" aria-live="polite" aria-label={"Loading " + label} className="flex min-h-48 items-center justify-center gap-3 p-6 text-sm text-[#68756f]">
      <span aria-hidden="true" className="size-5 animate-spin rounded-full border-2 border-[#dfe5e2] border-t-[#46622b]" />
      Loading {label}...
    </section>
  }>{children}</Suspense></SectionBoundary>;
}
