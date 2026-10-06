/**
 * Element lowering registry — how a LIBRARY's JSX elements reach native code
 * without the compiler core knowing the library.
 *
 * A lowering claims `tags` imported from `module` and either RETAGS the
 * element to another (usually canonical) element that the emitter then lowers
 * as usual, or EMITS target code itself through the `EmitContext` facade.
 * Both built-in lowerings (`plugins/coolgrid.ts`, `plugins/elements.ts`) and any
 * third-party one register through `registerElementLowering` — there is no
 * private back door.
 *
 * Import guard: a tag is claimed only when the emitter's guard accepts
 * `(tag, module)`. The emitters implement it as `canAliasIntercept` — the tag
 * is not shadowed by a same-named user / styled / rocketstyle / attrs component
 * AND, when its import is tracked, it was imported from `module` under its own
 * name (sub-path imports are normalised to the package root at parse time).
 * An untracked name keeps the claim.
 */

import type { EmitContext } from './emit-context'
import type { JsxElementIR } from './types'
import { coolgridLowering } from './plugins/coolgrid'
import { elementsLowering } from './plugins/elements'

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
    swift?(el: JsxElementIR, ctx: EmitContext): string
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

const registry: ElementLowering[] = []

/**
 * Register an element lowering. Throws when a `(module, tag)` pair is already
 * claimed — two lowerings for one pair would make the winner depend on load
 * order. Returns an unregister function (tests, hot reload).
 */
export function registerElementLowering(lowering: ElementLowering): () => void {
  for (const tag of lowering.tags) {
    if (registry.some((l) => l.module === lowering.module && l.tags.includes(tag))) {
      throw new Error(
        `[Pyreon] element lowering for <${tag}> from ${lowering.module} is already registered — ` +
          `a (module, tag) pair may be claimed once.`,
      )
    }
  }
  registry.push(lowering)
  return () => {
    const i = registry.indexOf(lowering)
    if (i >= 0) registry.splice(i, 1)
  }
}

/** The lowering that claims `tag`, or `undefined`. Called at the emitters' JSX dispatch. */
export function findElementLowering(tag: string, guard: ElementClaimGuard): ElementLowering | undefined {
  for (const l of registry) {
    if (l.tags.includes(tag) && guard(tag, l.module)) return l
  }
  return undefined
}

/** True when some registered lowering claims `name` (the parser then records where it was imported from). */
export function isElementLoweringTag(name: string): boolean {
  return registry.some((l) => l.tags.includes(name))
}

/** True when `name` is a tag a registered lowering marks usable as a style base. */
export function isStyleBasePrimitive(name: string): boolean {
  return registry.some((l) => l.styleBase === true && l.tags.includes(name))
}

registerElementLowering(elementsLowering)
registerElementLowering(coolgridLowering)
