/**
 * Shared building blocks for the observatory chrome — the `el`/`txt`
 * rocketstyle bases + helpers, the Atlas kit discipline verbatim: token-typed
 * theme callbacks via `withTheme<LoomTokens>()` on the factory (never a global
 * `ThemeDefault` augmentation), raw CSS through unistyle's `extendCss` key, zero inline
 * styles outside imperative SVG geometry.
 */
import type { ComponentFn } from '@pyreon/core'
import type { LoomTokens } from './theme'

export { el, txt, rs } from './bases'

/** The Loom token shape — the argument every `.theme((t) => …)` receives. */
export type T = LoomTokens

/** `el()` doesn't type input-specific attrs — cast input components. */
export type InputEl = ComponentFn<Record<string, unknown>>

/** Wrap a raw CSS string into the unistyle `extendCss` prop the bases render. */
export const cx = (extendCss: string) => ({ extendCss })

export const MONO = "'JetBrains Mono','SF Mono',ui-monospace,monospace"
export const DISPLAY = "'Space Grotesk','Public Sans',system-ui,sans-serif"
