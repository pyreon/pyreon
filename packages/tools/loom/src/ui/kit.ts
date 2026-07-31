/**
 * Shared building blocks for the observatory chrome — the `el`/`txt`
 * rocketstyle bases + helpers, the Atlas kit discipline verbatim: token-typed
 * theme callbacks via a LOCAL `T` alias (never a global `ThemeDefault`
 * augmentation), raw CSS through unistyle's `extendCss` key, zero inline
 * styles outside imperative SVG geometry.
 */
import type { ComponentFn } from '@pyreon/core'
import type { ThemeDefault } from '@pyreon/rocketstyle'
import type { LoomTokens } from './theme'

export { el, txt, rs } from './bases'

/** The Loom token shape — the argument every `.theme((t) => …)` receives. */
export type T = LoomTokens

/**
 * Adapt a token-typed DIMENSION callback to rocketstyle's declared callback
 * type (its `Theme<T>` generic is degenerate — see the Atlas kit for the full
 * derivation; the cast lives at this one boundary only).
 */
export const dim = <R>(fn: (t: T) => R) => (t: ThemeDefault): R => fn(t as unknown as T)

/** `el()` doesn't type input-specific attrs — cast input components. */
export type InputEl = ComponentFn<Record<string, unknown>>

/** Wrap a raw CSS string into the unistyle `extendCss` prop the bases render. */
export const cx = (extendCss: string) => ({ extendCss })

export const MONO = "'JetBrains Mono','SF Mono',ui-monospace,monospace"
export const DISPLAY = "'Space Grotesk','Public Sans',system-ui,sans-serif"
