/**
 * Component IDENTITY — the one answer to "are these two components the same?".
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * The catalog was keyed by component NAME alone. For a single package that is
 * exactly right: names are unique because a directory cannot hold two exports
 * with the same identifier, and the name is what an agent imports.
 *
 * Across a monorepo it is wrong, and wrong in the worst available way. The
 * graph's map did `byName.set(ci.name, ci)`, so a workspace where `@acme/core`
 * and `@acme/admin` each export a `Button` kept ONE of them and dropped the
 * other with no error, no warning, and no way to notice from the output — the
 * silent-drop this tool exists to prevent, committed by the tool itself. The
 * same name also fed `scenarioId`, so the two components' scenarios collided in
 * `atlas-catalog.json`, in their verify verdicts, and in their snapshot
 * filenames.
 *
 * ── The rule ──────────────────────────────────────────────────────────────
 *
 * A component's KEY is `project/Name` when it came from a named project root,
 * and its bare `Name` otherwise. Single-root scans therefore produce byte-
 * identical keys to before — this is not a migration, it is a widening.
 *
 * The key is identity; `name` stays the real, importable identifier. Both are
 * carried because they answer different questions: the key answers "which
 * component is this", the name answers "what do I type in my import". Collapsing
 * them would either break imports or reintroduce the collision.
 */

/** The minimum shape identity needs — so callers can pass a whole component or a stub. */
export interface ComponentIdentity {
  name: string
  /** Owning project root, for a multi-root (monorepo) scan. */
  project?: string
}

/**
 * `project/Name`, or bare `Name` outside a monorepo.
 *
 * The separator is `/` to match the group path the sidebar already renders, so
 * a key read in a log or a catalog file points at a place a reader recognises.
 */
export function componentKey(component: ComponentIdentity): string {
  return component.project ? `${component.project}/${component.name}` : component.name
}

/**
 * Resolve a lookup that may be either a KEY or a bare NAME.
 *
 * Bare-name lookups have to keep working: they are what `graph.get('Button')`,
 * the MCP `get_atlas_component` tool, and every existing caller pass. But in a
 * monorepo a bare name can match more than one component, and picking the first
 * silently would be the original bug wearing a different hat.
 *
 * So: an exact key match wins outright; otherwise a bare name resolves ONLY
 * when it is unambiguous. An ambiguous name resolves to `undefined` with the
 * candidates reported, which lets the caller say "`Button` is in Core and
 * Admin — ask for one of these" instead of guessing.
 */
export function resolveComponent<T extends ComponentIdentity>(
  components: readonly T[],
  lookup: string,
): { found: T } | { found: undefined; ambiguous: readonly string[] } {
  const exact = components.find((c) => componentKey(c) === lookup)
  if (exact) return { found: exact }

  const byName = components.filter((c) => c.name === lookup)
  if (byName.length === 1) return { found: byName[0]! }
  if (byName.length === 0) return { found: undefined, ambiguous: [] }
  return { found: undefined, ambiguous: byName.map(componentKey) }
}

/**
 * The message for an ambiguous lookup.
 *
 * Written once so every surface (RPC, CLI, MCP) says the same thing, and says
 * the thing that resolves it — the candidate keys, which are exactly what the
 * caller should retry with.
 */
export function ambiguousComponentMessage(lookup: string, candidates: readonly string[]): string {
  return (
    `[Pyreon] atlas: "${lookup}" matches ${candidates.length} components across projects ` +
    `(${candidates.join(', ')}). Ask for one of those keys.`
  )
}
