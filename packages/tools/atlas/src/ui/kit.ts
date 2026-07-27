/**
 * Shared building blocks for the workbench chrome — the `el`/`txt` rocketstyle
 * bases plus the tiny `cx` helper that wraps raw CSS into unistyle's `extendCss`
 * key. Every `chrome/*` module imports from here so the styled-component
 * definitions stay uniform.
 */
import type { ComponentFn } from '@pyreon/core'
import type { ThemeDefault } from '@pyreon/rocketstyle'
import type { ThemeTokens } from './theme'

export { el, txt } from './bases'

/** The Atlas theme token shape — the argument every `.theme((t) => …)` receives. */
export type T = ThemeTokens

/**
 * Adapt a token-typed DIMENSION callback (`.states()` / `.variants()` / `.sizes()`)
 * to the callback type rocketstyle declares.
 *
 * Why this exists: rocketstyle types a dimension callback's `theme` param as
 * `Theme<T>`, and `Theme<T> = T extends unknown ? ThemeDefault : …` — `T extends
 * unknown` is true for every `T`, so the conditional is DEGENERATE and `Theme<T>`
 * always collapses to the empty `ThemeDefault`, discarding the generic. There is
 * therefore no parameterized seam to pass Atlas's token shape through, and under
 * `strictFunctionTypes` a `(t: ThemeTokens) => …` callback is not assignable to
 * `(t: ThemeDefault) => …` (params are contravariant).
 *
 * The previous cut solved that by augmenting the GLOBAL `ThemeDefault` — which
 * silently merges with `@pyreon/ui-theme`'s augmentation of the same interface and
 * makes every consumer's `t` claim both shapes (see ./theme). This keeps the cast
 * at the ONE genuine boundary instead: rocketstyle hands back whatever theme the
 * provider supplied, and inside `<Workbench>` that is always `ThemeTokens`.
 *
 * Fixing `Theme<T>` upstream would let this be a real generic — tracked as a
 * @pyreon/rocketstyle follow-up, not bundled here (it re-types every consumer).
 */
export const dim = <R>(fn: (t: T) => R) => (t: ThemeDefault): R => fn(t as unknown as T)

/**
 * `el()` is a generic Element and does not type input-specific attrs
 * (placeholder/value/onInput) — cast input components to a permissive shape.
 */
export type InputEl = ComponentFn<Record<string, unknown>>

/** Wrap a raw CSS string into the unistyle `extendCss` prop the bases render. */
export const cx = (extendCss: string) => ({ extendCss })
