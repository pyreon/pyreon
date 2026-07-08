/**
 * Topological publish ordering — leaf-first (a package publishes only AFTER
 * every intra-workspace `@pyreon/*` package it depends on).
 *
 * WHY: `publish.ts` collected packages in directory/alphabetical order and
 * published them in that order. That is NOT dependency-safe — a dependent can
 * sort before its dependency (e.g. `@pyreon/feature` < `@pyreon/form` in
 * `fundamentals/`, yet feature depends on form). With the fixed-group version
 * trajectory every package carries `^X.Y.Z` ranges on its siblings, so a
 * dependent published before its dependency leaves a DANGLING constraint:
 * `bun install`/`npm install` of the dependent fails to resolve the sibling
 * until it publishes moments (or, on a partial/interrupted run, a DAY) later.
 * A consumer who installs in that window gets an unresolvable graph.
 *
 * Sorting leaf-first closes the window structurally: a dependent is NEVER on
 * npm before the sibling versions its manifest requires.
 *
 * Pure + deterministic: independent packages keep their original relative
 * order (stable). Cycle-safe (a `visiting` guard breaks any dependency cycle
 * rather than recursing forever — real `dependencies` shouldn't cycle, but
 * `peerDependencies` occasionally do).
 */
export interface OrderNode {
  /** Package name, e.g. `@pyreon/form`. */
  name: string
  /** Names of intra-workspace deps this package REQUIRES to resolve at install
   *  time (dependencies + peerDependencies). Only names that are themselves in
   *  the input set matter; foreign names are ignored by the caller. */
  deps: string[]
}

/**
 * Return `nodes` reordered leaf-first. Every node appears AFTER all of its
 * `deps` that are present in the input. Input order is the stable tiebreak.
 */
export function topoSortByWorkspaceDeps<T extends OrderNode>(nodes: readonly T[]): T[] {
  const byName = new Map<string, T>()
  for (const n of nodes) byName.set(n.name, n)

  const sorted: T[] = []
  const state = new Map<string, 'visiting' | 'done'>()

  const visit = (node: T): void => {
    const s = state.get(node.name)
    if (s === 'done') return
    if (s === 'visiting') return // cycle — bail; don't recurse forever
    state.set(node.name, 'visiting')
    for (const depName of node.deps) {
      const dep = byName.get(depName)
      if (dep) visit(dep) // ignore foreign / already-published deps
    }
    state.set(node.name, 'done')
    sorted.push(node)
  }

  for (const node of nodes) visit(node) // original order = stable tiebreak
  return sorted
}
