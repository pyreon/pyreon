import { instanceMeta } from './registry'

/**
 * Lazy acceleration cache for `resolveIdentifier`'s tree DFS.
 *
 * `reference()` resolution is O(N) in the tree size on EVERY read — a full
 * depth-first walk from the root looking for the node whose identifier equals
 * the stored id. A list of R reference-reading rows over an N-node tree is thus
 * O(R·N) per render. This index makes the repeated case O(depth): populated on
 * a DFS hit, consulted (and re-validated) on every subsequent resolve.
 *
 * **It is PURE ACCELERATION — never a correctness authority.** Every hit is
 * re-validated against the LIVE tree (node still alive, of the right
 * definition, its id still equals the queried id, and it still resolves up to
 * the query root). Any validation miss returns `undefined`, so the caller falls
 * back to the authoritative DFS. A stale or wrong entry can therefore only ever
 * cost one extra DFS — it can never produce a wrong resolution. This is what
 * lets the index carry NO lifecycle hooks (no attach/detach/destroy plumbing):
 * id-change, detach, destroy, re-parent and GC are all handled by validation +
 * fallback rather than by eager invalidation.
 *
 * **Leak-free by construction.** Nodes are held via `WeakRef`, so an
 * un-destroyed but dereferenced node (removed from the tree and dropped by the
 * user without `destroy()`) stays GC-eligible — no Class-C unbounded-growth
 * leak. A dead ref is pruned on the next lookup for its id; an id-changed entry
 * is pruned when a lookup observes the mismatch. Keyed by the definition object
 * in a `WeakMap`, so a discarded model definition is collectable too.
 *
 * Duplicate identifiers (a violation of the normalized-store invariant — two
 * live nodes of the same type sharing one id in one tree) resolve to *a* valid
 * matching node; WHICH one is unspecified, exactly as the DFS traversal order
 * was already an unspecified implementation detail.
 */
const index = new WeakMap<object, Map<unknown, WeakRef<object>>>()

/**
 * True iff `node` is still attached under `root` through the owned-children
 * graph. This deliberately does NOT use `getRoot`: `getRoot` follows the
 * `parent` pointer, which state-tree does NOT clear when a node is spliced out
 * of a container (an array `filter`/reassign) — so a detached node keeps a
 * stale `parent` and `getRoot` still returns the old root. `meta.children`, by
 * contrast, IS reconciled on detach (the container reconciler deletes removed
 * kids), so verifying `child ∈ parent.children` at every hop matches exactly
 * what the DFS would find: a removed node is no longer in its old parent's
 * children set → returns false → the caller falls back to the DFS.
 */
function isAttachedUnder(node: object, root: object): boolean {
  let cur: object = node
  // Bounded to defend against a pathological cycle (parent is always an
  // ancestor in a well-formed tree, so this never approaches the cap).
  for (let depth = 0; depth < 100_000; depth++) {
    if (cur === root) return true
    const parent = instanceMeta.get(cur)?.parent
    if (parent === undefined) return false // reached a root that isn't `root`
    const pmeta = instanceMeta.get(parent)
    if (pmeta === undefined || !pmeta.children.has(cur)) return false // detached
    cur = parent
  }
  /* v8 ignore next 4 -- the loop cap is a runaway guard, not a code path. Every
     iteration walks strictly up a parent chain that `instanceMeta` maintains as
     acyclic, so reaching 100,000 hops means the tree is already corrupt in a way
     no test can construct through the public API. Covered by construction, not
     by a spec. */
  return false
}

/** Read a node's identifier value without subscribing. */
function readIdOf(node: object, idKey: string): unknown {
  const sig = (node as Record<string, { peek?: () => unknown }>)[idKey]
  /* v8 ignore next -- defensive: an identifier field is always a peek-able signal */
  return typeof sig?.peek === 'function' ? sig.peek() : undefined
}

/**
 * Record a DFS-resolved node so future resolves for its id skip the walk.
 * Called only after the DFS has already proven `node` is the correct answer.
 */
export function indexRegister(def: object, id: unknown, node: object): void {
  let perDef = index.get(def)
  if (perDef === undefined) {
    perDef = new Map()
    index.set(def, perDef)
  }
  perDef.set(id, new WeakRef(node))
}

/**
 * Validated O(depth) lookup. Returns the node ONLY when it is still the correct
 * answer for `(root, def, id)`. Returns `undefined` on any miss so the caller
 * falls back to the authoritative DFS; a GC'd or id-changed entry is pruned in
 * passing. A merely detached-but-alive node (valid for its own root, just not
 * this one) is left in place — it is still the right answer for a query from
 * its own root.
 */
/**
 * @internal Test-only probe: how many entries the index holds for `def`.
 *
 * Exists because the dead-ref prune in `indexLookup` has no other observer. Its
 * RETURN value is unchanged by pruning — a dead `WeakRef` falls through to the
 * `meta === undefined` exit and yields `undefined` either way — so a spec that
 * only checks the return value passes with the prune deleted. The prune is
 * purely leak prevention (class C: a module-level map whose eviction trigger is
 * a collection that has already happened), and leak prevention that nothing
 * observes is leak prevention that silently rots. Not re-exported from the
 * package barrel.
 */
export function _indexEntryCount(def: object): number {
  return index.get(def)?.size ?? 0
}

export function indexLookup(
  def: object,
  id: unknown,
  idKey: string,
  root: object,
): object | undefined {
  const perDef = index.get(def)
  if (perDef === undefined) return undefined
  const ref = perDef.get(id)
  if (ref === undefined) return undefined
  const node = ref.deref()
  if (node === undefined) {
    perDef.delete(id) // GC'd — prune the dead ref
    return undefined
  }
  const meta = instanceMeta.get(node)
  // Destroyed, or somehow registered under the wrong definition → defer to DFS.
  // Do NOT prune here: a destroyed node keeps its entry until GC or an
  // id-change prunes it, and pruning on "not alive" would fight a legitimate
  // re-resolution race; the WeakRef bounds the memory either way.
  if (meta === undefined || !meta.alive || meta.definition !== def) return undefined
  if (!Object.is(readIdOf(node, idKey), id)) {
    perDef.delete(id) // the node's id moved on — this entry is stale for `id`
    return undefined
  }
  // Detached from `root` (spliced out of a container, or attached under a
  // different tree now): the DFS from THIS root is the correct source of truth.
  if (!isAttachedUnder(node, root)) return undefined
  return node
}
