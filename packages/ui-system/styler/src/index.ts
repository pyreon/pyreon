import { name as __pkgName, version as __pkgVersion } from '../package.json' with { type: 'json' }
import { registerSingleton } from '@pyreon/reactivity'

// Singleton sentinel — fail-loud detection of duplicate @pyreon/styler
// instances in the same heap. See @pyreon/reactivity/singleton-sentinel for
// full rationale. Hardcoded version is acceptable here — it's a diagnostic
// aid, not a load-bearing identity check.
registerSingleton(__pkgName, __pkgVersion, import.meta.url)

export { css } from './css'
export { buildProps, filterProps } from './forward'
export { createGlobalStyle } from './globalStyle'
export { HASH_INIT, hash, hashFinalize, hashUpdate } from './hash'
export { keyframes } from './keyframes'
export type { CSSResult, Interpolation } from './resolve'
export { clearNormCache, normalizeCSS, resolve, resolveValue } from './resolve'
export { isDynamic } from './shared'
export type { StyleSheetOptions } from './sheet'
export { createSheet, StyleSheet, sheet } from './sheet'
export type { StyledFunction, StyledOptions } from './styled'
export { styled } from './styled'
export type { DefaultTheme } from './ThemeProvider'
export { ThemeContext, ThemeProvider, useTheme, useThemeAccessor } from './ThemeProvider'
export { useCSS } from './useCSS'
