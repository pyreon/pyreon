/**
 * White-box helpers for tests that count graph edges. The ONLY place a test
 * reads the link-list fields (`_subs`, `_deps`, `nextSub`, `nextDep`), so a
 * storage change touches one file.
 */
interface LinkLike {
  dep: unknown
  sub: unknown
  nextDep: LinkLike | null
  nextSub: LinkLike | null
}

/** Tracked subscribers of a source (signal / computed / selector bucket): its graph edges. */
export function edgeCount(source: unknown): number {
  let n = 0
  for (let l = (source as { _subs: LinkLike | null })._subs; l !== null; l = l.nextSub) n++
  return n
}

/** Entries in a signal's or computed's direct tier (`.direct()` updaters, `subscribe()` listeners). */
export function directCount(source: unknown): number {
  const s = source as { _d1: unknown; _d: Set<unknown> | null }
  return (s._d1 != null ? 1 : 0) + (s._d?.size ?? 0)
}

/** Everything that would be notified by a write: edges plus direct entries. */
export function subscriberTotal(source: unknown): number {
  return edgeCount(source) + directCount(source)
}

/** Dependency edges a subscriber (computed / effect / binding node) holds. */
export function depCount(node: unknown): number {
  let n = 0
  for (let l = (node as { _deps: LinkLike | null })._deps; l !== null; l = l.nextDep) n++
  return n
}
