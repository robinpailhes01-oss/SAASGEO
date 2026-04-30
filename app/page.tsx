// Landing temporaire — Bloc 1
// Sera remplacee par la vraie landing en Bloc 5+
export default function HomePage() {
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center text-center">
      <div className="max-w-3xl space-y-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-ankora-border bg-secondary px-4 py-1.5 text-sm font-medium text-ankora-text-soft">
          <span className="h-2 w-2 rounded-full bg-ankora-gradient" />
          Bloc 1 — Setup initial
        </div>

        <h1 className="text-6xl md:text-7xl font-bold leading-[1.05]">
          <span className="text-ankora-ink">Ancrez votre marque</span>
          <br />
          <span className="text-ankora-gradient">dans les IA</span>
        </h1>

        <p className="text-lg md:text-xl text-ankora-text-soft max-w-2xl mx-auto">
          Audit GEO complet et tracking de visibilite dans les IA
          conversationnelles. Specialise tourisme et hotellerie.
        </p>

        <div className="flex flex-col items-center gap-4 pt-4">
          <p className="text-sm text-ankora-text-muted">
            Stack en place. Bloc 2 (scraping + audit technique) a venir.
          </p>
        </div>
      </div>
    </main>
  );
}
