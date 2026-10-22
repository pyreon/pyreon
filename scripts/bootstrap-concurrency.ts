/**
 * How many package builds the bootstrap runs at once, and in what order.
 *
 * `bun run --filter=a --filter=b … build` starts EVERY matched package at once (dependency order is respected, nothing
 * else is bounded). Each build runs rolldown plus a TypeScript declaration pass, so a near-full rebuild is ~80
 * concurrent processes — measured locally at a peak of ~23 GB resident. That fits a developer machine and not a 16 GB
 * CI runner: from 2026-10-22 every main CI run hung in Install's bootstrap until the job was killed, with even a
 * GNU-timeout-bounded step and a step `timeout-minutes` failing to fire, because the runner's own agent stopped
 * responding. The trigger was a dependency edge that made one package's change dirty most of the repo; the cause was
 * that the bootstrap had no bound at all, so ANY large rebuild could do it. The Build Docs hang on the Ubuntu 26.04
 * runners was the same failure through its own full uncached bootstrap.
 *
 * So the dirty packages are built in BATCHES no larger than the machine can hold: at most one build per core, and at
 * most one per ~1.5 GB of memory. Batches go in dependency order, so a package's workspace dependencies are built
 * before it whenever they are dirty too. (Each lib is self-contained — workspace deps are externalized — so the order
 * is belt and braces rather than a correctness requirement; the bootstrap already builds arbitrary subsets.)
 */

/** Memory budgeted per concurrent build: the measured average is ~0.3 GB, the TypeScript pass of a large package peaks far higher. */
const BYTES_PER_BUILD = 1.5 * 1024 ** 3

/**
 * The number of builds to run at once. `PYREON_BOOTSTRAP_CONCURRENCY` overrides it (a positive integer); otherwise
 * the smaller of the core count and what memory allows, and never less than one.
 */
export function buildConcurrency(env: Record<string, string | undefined>, cores: number, memBytes: number): number {
  const raw = env.PYREON_BOOTSTRAP_CONCURRENCY
  if (raw !== undefined && raw !== '') {
    const n = Number(raw)
    if (Number.isInteger(n) && n > 0) return n
  }
  const byMemory = Math.floor(memBytes / BYTES_PER_BUILD)
  return Math.max(1, Math.min(cores, byMemory))
}

/**
 * `names` reordered so each comes after the workspace packages it depends on (`deps`), where those are in `names`
 * too. Stable: independent packages keep their input order. A dependency cycle cannot be ordered, so the package that
 * closes it simply keeps its place — never dropped, never duplicated.
 */
export function dependencyOrder(names: readonly string[], deps: ReadonlyMap<string, ReadonlySet<string>>): string[] {
  const inSet = new Set(names)
  const out: string[] = []
  const done = new Set<string>()
  const visiting = new Set<string>()
  const visit = (n: string): void => {
    if (done.has(n) || visiting.has(n)) return
    visiting.add(n)
    for (const d of deps.get(n) ?? []) if (inSet.has(d)) visit(d)
    visiting.delete(n)
    done.add(n)
    out.push(n)
  }
  for (const n of names) visit(n)
  return out
}

/** `items` split into consecutive batches of at most `size`. */
export function batches<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
