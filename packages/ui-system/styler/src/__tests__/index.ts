/**
 * Test barrel / helper file.
 * Re-exports commonly used test utilities from the styler source.
 */
import type { VNode, VNodeChild } from '@pyreon/core'
import { provide } from '@pyreon/core'
import { ThemeContext } from '../theme-context'

export { css } from '../css'
export { createGlobalStyle } from '../globalStyle'
export { HASH_INIT, hash, hashFinalize, hashUpdate } from '../hash'
export { keyframes } from '../keyframes'
export type { CSSResult, Interpolation } from '../resolve'
export { clearNormCache, normalizeCSS, resolve, resolveValue } from '../resolve'
export type { StyleSheetOptions } from '../sheet'
export { createSheet, StyleSheet, sheet } from '../sheet'
export { styled } from '../styled'
export { ThemeContext, useTheme } from '../theme-context'

/**
 * Test-only theme scope. Styler ships no provider component (apps use
 * `<PyreonUI>` from `@pyreon/ui-core`, a layer ABOVE styler), so styler's own
 * tests provide `ThemeContext` directly. `props.theme` is read inside the
 * accessor, never at setup, so a getter-backed (`_rp`) prop stays reactive.
 */
export function TestThemeProvider(props: {
  theme: Record<string, unknown> | null
  children?: VNodeChild
}): VNode | null {
  provide(ThemeContext, () => props.theme as Record<string, unknown>)
  return (props.children ?? null) as VNode | null
}
