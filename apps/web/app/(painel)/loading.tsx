export default function Loading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando…</span>
      <div className="h-6 w-40 animate-pulse rounded bg-accent" />
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-accent" />
        ))}
      </div>
    </div>
  );
}
