/**
 * Render EXTENSIONS — what a scenario needs in order to render like your app.
 *
 * ── The gap this fills ────────────────────────────────────────────────────
 *
 * `AtlasPlugin`'s stages (discover → decorate → verify → graph) all shape the
 * CATALOG. None of them can affect what happens in the browser, and the browser
 * had exactly one seam: a single `wrapper` function, replaced rather than
 * composed. That is enough for one provider and wrong for everything after it:
 *
 *   - two packages cannot both contribute — the second `wrapper` wins and the
 *     first silently does nothing;
 *   - a package cannot ship its own setup, so every project rewrites the same
 *     `<PyreonUI>` + router + i18n + query stack by hand;
 *   - document-level concerns (fonts, a stylesheet, a `<head>` tag) have no
 *     home at all, because a wrapper renders INSIDE the preview.
 *
 * An extension answers all three. It contributes a layer around every scenario
 * AND a one-time setup, and several compose.
 *
 * ── Ordering ──────────────────────────────────────────────────────────────
 *
 * Extensions wrap OUTSIDE-IN in declaration order: the first listed is the
 * outermost element. That reads the way the JSX would be written by hand, which
 * is the only ordering someone can predict without consulting the docs —
 * a theme provider is written before the router it contains, so it is listed
 * first.
 *
 * ── Where these run ───────────────────────────────────────────────────────
 *
 * In the BROWSER. The config is imported by the generated catalog module and
 * compiled through the project's own plugin chain, so an extension may use JSX
 * and the project's own components — but it must not reach for `node:*`, and a
 * factory that needs build-time data has to be handed that data as a plain
 * serializable option rather than reading it from disk.
 */
import type { ComponentRef } from './types'

export interface AtlasExtension {
  /**
   * Identifies the extension in diagnostics and in the workbench's own listing.
   *
   * Required, because the failure it prevents is otherwise unattributable: when
   * one of five anonymous wrappers throws during mount, every scenario fails
   * and nothing says which layer did it.
   */
  name: string
  /**
   * Wraps every rendered scenario. Receives the scenario as `children`.
   *
   * Composed with the other extensions, never replacing them.
   */
  wrap?: ComponentRef
  /**
   * Runs ONCE when the workbench boots, before anything renders.
   *
   * For document-level work a wrapper cannot do — injecting a font `<link>`,
   * a global stylesheet, a `<html lang>`. Return a function to undo it.
   */
  setup?: () => void | (() => void)
}

/**
 * Identity, for the types.
 *
 * Exists so a package shipping an extension gets checking at the definition
 * site rather than at the config that consumes it — the error is far more
 * useful next to the code that is wrong.
 */
export function defineExtension(extension: AtlasExtension): AtlasExtension {
  return extension
}

/**
 * Shape-check one extension. Returns a reason, or undefined when it is fine.
 *
 * Validated rather than trusted because a malformed entry mounts as a component
 * and takes EVERY scenario down with it — the most expensive possible failure
 * from the cheapest possible typo.
 */
export function validateExtension(value: unknown, index: number): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return `\`extensions[${index}]\` must be an object`
  }
  const extension = value as Record<string, unknown>
  if (typeof extension.name !== 'string' || extension.name.length === 0) {
    return `\`extensions[${index}]\` needs a non-empty string \`name\``
  }
  if (extension.wrap !== undefined && typeof extension.wrap !== 'function') {
    return `\`extensions[${index}]\` (${extension.name}): \`wrap\` must be a component function`
  }
  if (extension.setup !== undefined && typeof extension.setup !== 'function') {
    return `\`extensions[${index}]\` (${extension.name}): \`setup\` must be a function`
  }
  // An extension with neither does nothing. That is almost always a factory
  // whose options were wrong, and saying so beats a silent no-op.
  if (extension.wrap === undefined && extension.setup === undefined) {
    return `\`extensions[${index}]\` (${extension.name}) has neither \`wrap\` nor \`setup\` — it would do nothing`
  }
  return undefined
}

/** Shape-check the whole list. */
export function validateExtensions(value: unknown): string | undefined {
  if (!Array.isArray(value)) return '`extensions` must be an array'
  const names = new Set<string>()
  for (const [index, entry] of value.entries()) {
    const problem = validateExtension(entry, index)
    if (problem) return problem
    const { name } = entry as { name: string }
    // Duplicates are almost always the same preset added twice — by a copy
    // paste, or by two packages both pulling it in. Mounting two theme
    // providers is a real bug with confusing symptoms, so it is named.
    if (names.has(name)) return `duplicate \`extensions\` entry "${name}"`
    names.add(name)
  }
  return undefined
}

/**
 * The extension list a config resolves to, including the `wrapper` shorthand.
 *
 * `wrapper` is kept: one provider is the common case, and making everyone write
 * a named object for it would be ceremony. It composes as the INNERMOST layer,
 * so an explicit extension list can put a theme outside a project's existing
 * wrapper without that wrapper having to change.
 */
export function resolveExtensions(config: {
  extensions?: readonly AtlasExtension[]
  wrapper?: ComponentRef
}): AtlasExtension[] {
  const list = [...(config.extensions ?? [])]
  if (config.wrapper) list.push({ name: 'wrapper', wrap: config.wrapper })
  return list
}
