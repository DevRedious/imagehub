/** Placeholder gris affiché derrière la modale de scan, avant la révélation. */
export function ProjectSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="flex items-center gap-2">
        <div className="h-6 w-40 rounded-lg bg-zinc-800" />
        <div className="h-5 w-16 rounded-md bg-zinc-800" />
        <div className="h-4 w-28 rounded bg-zinc-800/70" />
      </div>

      <div className="flex gap-1.5">
        <div className="h-6 w-24 rounded-lg bg-zinc-800/70" />
        <div className="h-6 w-28 rounded-lg bg-zinc-800/70" />
        <div className="h-6 w-20 rounded-lg bg-zinc-800/70" />
      </div>

      <div className="space-y-2">
        <div className="h-4 w-48 rounded bg-zinc-800/70" />
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl bg-zinc-800/40 p-3"
          >
            <div className="h-4 w-4 rounded bg-zinc-800" />
            <div className="h-11 w-11 rounded-lg bg-zinc-800" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-1/3 rounded bg-zinc-800" />
              <div className="h-3 w-2/3 rounded bg-zinc-800/70" />
            </div>
            <div className="h-5 w-16 rounded bg-zinc-800/70" />
          </div>
        ))}
      </div>
    </div>
  );
}
