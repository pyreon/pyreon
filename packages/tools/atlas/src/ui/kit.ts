/**
 * Shared building blocks for the workbench chrome — the `el`/`txt` rocketstyle
 * bases plus the tiny `cx` helper that wraps raw CSS into unistyle's `extendCss`
 * key. Every `chrome/*` module imports from here so the styled-component
 * definitions stay uniform.
 */
import type { ComponentFn } from '@pyreon/core'
import type { ThemeTokens } from './theme'

export { el, txt } from './bases'

/** The Atlas theme token shape — the argument every `.theme((t) => …)` receives. */
export type T = ThemeTokens

/**
 * `el()` is a generic Element and does not type input-specific attrs
 * (placeholder/value/onInput) — cast input components to a permissive shape.
 */
export type InputEl = ComponentFn<Record<string, unknown>>

/** Wrap a raw CSS string into the unistyle `extendCss` prop the bases render. */
export const cx = (extendCss: string) => ({ extendCss })
