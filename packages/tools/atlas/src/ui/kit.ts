/**
 * Shared building blocks for the workbench components — the `el`/`txt` rocketstyle
 * bases plus the tiny `cx` helper that wraps raw CSS into unistyle's `extendCss`
 * key. Every `components/<region>/*` module imports from here so the styled-component
 * definitions stay uniform.
 */
import type { ComponentFn } from '@pyreon/core'
import type { ThemeTokens } from './theme'

export { el, txt } from './bases'

/**
 * The Atlas theme token shape — what every `.theme((t) => …)` and dimension
 * callback receives. Bound once on the factory via `withTheme<ThemeTokens>()`
 * (see ./bases), so `t` is inferred and checked with no global augmentation.
 */
export type T = ThemeTokens

/**
 * `el()` is a generic Element and does not type input-specific attrs
 * (placeholder/value/onInput) — cast input components to a permissive shape.
 */
export type InputEl = ComponentFn<Record<string, unknown>>

/** Wrap a raw CSS string into the unistyle `extendCss` prop the bases render. */
export const cx = (extendCss: string) => ({ extendCss })
