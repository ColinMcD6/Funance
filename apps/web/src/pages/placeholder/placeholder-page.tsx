/** A page whose milestone has not been built yet. */
export function PlaceholderPage({ title, milestone }: { title: string; milestone: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">This page arrives in {milestone}.</p>
    </section>
  );
}
