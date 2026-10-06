/**
 * Element lowering registry — how a LIBRARY's JSX elements reach native code
 * without the compiler core knowing the library.
 *
 * A lowering claims `tags` imported from `module` and either RETAGS the
 * element to another (usually canonical) element that the emitter then lowers
 * as usual, or EMITS target code itself through the `EmitContext` facade.
 * Lowerings are declared on a plugin (`CompilerPlugin.elements`). The built-in
 * ones (`plugins/coolgrid.ts`, `plugins/elements.ts`) are built-in PLUGINS that
 * travel the same path as any third-party one — there is no private back door,
 * and no process-global registry: each `createCompiler` instance owns its
 * {@link ElementRegistry}.
 *
 * Import guard: a tag is claimed only when the emitter's guard accepts
 * `(tag, module)`. The emitters implement it as `canAliasIntercept` — the tag
 * is not shadowed by a same-named user / styled / rocketstyle / attrs component
 * AND, when its import is tracked, it was imported from `module` under its own
 * name (sub-path imports are normalised to the package root at parse time).
 * An untracked name keeps the claim.
 */

import type { EmitContext, SwiftEmitContext } from './emit-context'
import type { JsxElementIR } from './types'

/** What a retag may do besides returning the new element: report a warning against the tag the author wrote. */
export interface RetagContext {
  warn(message: string): void
}

export interface ElementLowering {
  /** Package root the tags must be imported from, e.g. `@pyreon/coolgrid`. */
  readonly module: string
  /** Tag names (the imported symbol, which must equal the local JSX tag) this lowering claims. */
  readonly tags: readonly string[]
  /**
   * Rewrite the element to another element, which re-enters the emitter's
   * dispatcher. Return `undefined` to decline (the element then goes to
   * `emit`). The result must not claim itself again (no `tag` loop).
   */
  retag?(el: JsxElementIR, ctx: RetagContext): JsxElementIR | undefined
  /** Emit target code. A target with no function here falls through to the generic path. */
  readonly emit?: {
    swift?(el: JsxElementIR, ctx: SwiftEmitContext): string
    kotlin?(el: JsxElementIR, ctx: EmitContext): string
  }
  /**
   * The tags may be the base of `styled()` / `rocketstyle()` / `attrs()` (they
   * lower to a canonical primitive, so the style connector applies unchanged).
   */
  readonly styleBase?: boolean
}

/** The guard the emitters pass: is `tag` eligible to be claimed for `module`? */
export type ElementClaimGuard = (tag: string, module: string) => boolean

export interface RegisteredElementLowering {
  readonly lowering: ElementLowering
  /** The plugin that declared it. */
  readonly owner: string
}

/** One compiler instance's element lowerings, with the lookups the emitters need. */
export interface ElementRegistry {
  readonly entries: readonly RegisteredElementLowering[]
  /** The lowering that claims `tag` when `guard` accepts `(tag, module)`, or `undefined`. */
  find(tag: string, guard: ElementClaimGuard): ElementLowering | undefined
  /** True when some lowering claims `name` (the parser then records where it was imported from). */
  hasTag(name: string): boolean
  /** True when `name` is a tag a lowering marks usable as a style base. */
  isStyleBase(name: string): boolean
}

/**
 * Build a registry from every plugin's `elements`, in plugin order. Throws when
 * a `(module, tag)` pair is claimed twice — two lowerings for one pair would
 * make the winner depend on plugin order, which the app cannot see — and names
 * both owners.
 *
 * @example
 * createElementRegistry([{ name: '@acme/grid', elements: [{ module: '@acme/grid', tags: ['Row'] }] }])
 */
export function createElementRegistry(
  plugins: readonly { readonly name: string; readonly elements?: readonly ElementLowering[] | undefined }[],
): ElementRegistry {
  const entries: RegisteredElementLowering[] = []
  const claimed = new Map<string, string>()
  for (const plugin of plugins) {
    for (const lowering of plugin.elements ?? []) {
      for (const tag of lowering.tags) {
        const key = `${lowering.module}\0${tag}`
        const existing = claimed.get(key)
        if (existing !== undefined) {
          throw new Error(
            `[Pyreon] element lowering for <${tag}> from ${lowering.module} is claimed by both "${existing}" and "${plugin.name}". ` +
              `A (module, tag) pair has exactly one lowering — remove one of the two plugins from this app.`,
          )
        }
        claimed.set(key, plugin.name)
      }
      entries.push({ lowering, owner: plugin.name })
    }
  }
  const tags = new Set<string>()
  const styleBases = new Set<string>()
  for (const { lowering } of entries) {
    for (const tag of lowering.tags) {
      tags.add(tag)
      if (lowering.styleBase === true) styleBases.add(tag)
    }
  }
  return Object.freeze<ElementRegistry>({
    entries,
    find(tag, guard) {
      for (const { lowering } of entries) {
        if (lowering.tags.includes(tag) && guard(tag, lowering.module)) return lowering
      }
      return undefined
    },
    hasTag: (name) => tags.has(name),
    isStyleBase: (name) => styleBases.has(name),
  })
}
