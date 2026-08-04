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
  /**
   * Source directory, appended to the key ONLY when set.
   *
   * Set by the graph when a name genuinely collides, so identity stays short
   * for the common case and becomes unambiguous exactly where it must.
   */
  pathQualifier?: string
}

/**
 * `project/Name`, or bare `Name` outside a monorepo.
 *
 * The separator is `/` to match the group path the sidebar already renders, so
 * a key read in a log or a catalog file points at a place a reader recognises.
 */
export function componentKey(component: ComponentIdentity): string {
  const base = component.project ? `${component.project}/${component.name}` : component.name
  // A same-named component in a DIFFERENT directory is ordinary — a per-page
  // `MainFilter`, a per-section `ChartsRow`, an icon file exporting `Glyph`.
  // Without the path they collide and all but one vanish; measured on a real
  // monorepo that was 1042 components.
  //
  // The qualifier is the source DIRECTORY, and it is appended only when the
  // caller supplies one — so a single-file-per-name project (the common case)
  // keeps byte-identical keys.
  return component.pathQualifier ? `${base}@${component.pathQualifier}` : base
}

/**
 * The directory a component was declared in, relative to its scan root.
 *
 * Used to keep same-named components apart. Only the DIRECTORY, never the
 * filename: `Button/index.tsx` and `Button.tsx` are the same component to a
 * reader, and letting the filename into identity would split them.
 */
export function pathQualifierFor(source: string | undefined): string | undefined {
  if (!source) return undefined
  const parts = source.split(/[/\\]/).filter(Boolean)
  parts.pop()
  return parts.length > 0 ? parts.join('/') : undefined
}

/**
 * The filename, without extension — the qualifier of last resort.
 *
 * Needed when the directory does NOT tell two components apart. The case that
 * forced it: a generated icon package where 995 files under one `generated/`
 * directory each export `default function Glyph`. The directory is identical
 * for all of them, so directory-qualification still collapsed them to one and
 * 994 icons stayed invisible.
 *
 * Tried second rather than first because `Button/index.tsx` and `Button.tsx`
 * are the same component to a reader, and leading with the filename would split
 * a component from itself.
 */
export function fileQualifierFor(source: string | undefined): string | undefined {
  if (!source) return undefined
  const base = source.split(/[/\\]/).filter(Boolean).pop()
  if (!base) return undefined
  const stem = base.replace(/\.[jt]sx?$/, '')
  // `index` names the directory, not the component — useless as a qualifier.
  return stem && stem !== 'index' ? stem : undefined
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
