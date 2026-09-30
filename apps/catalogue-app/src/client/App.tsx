export function App() {
  return (
    <main className="min-h-screen bg-[#eef4f1] text-[#081014]">
      <div className="mx-auto flex min-h-screen max-w-5xl items-center px-6 py-16">
        <section className="w-full rounded-3xl border border-black/10 bg-white p-8 shadow-sm md:p-12">
          <div className="mb-6 inline-flex rounded-full bg-[#081014] px-3 py-1 text-xs font-semibold tracking-wide text-[#baf16d]">
            TECHABANCA CATALOGUE
          </div>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
            Catalogue foundation is running.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-black/65 md:text-lg">
            Milestone 0 contains the application shell and Worker API only. Product functionality starts in later milestones.
          </p>
          <div className="mt-8 rounded-2xl bg-[#101b20] p-5 text-sm text-white">
            Health endpoint: <code className="text-[#baf16d]">/api/health</code>
          </div>
        </section>
      </div>
    </main>
  );
}