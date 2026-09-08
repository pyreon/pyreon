// The un-themed host's theme text per target — what a host with no `theme`
// and no provider emits now that it follows the runtime colour scheme. Specs
// about OTHER mechanics (a host's layout, a tap, a tooltip) build their
// expectations from this instead of pinning the light literal, which would
// re-pin the very divergence chart-native-parity.test.ts closes.
import { CHART_THEME_FIELDS, chartThemeFields } from '../chart-hosts'
import type { ChartThemeText } from '../chart-hosts'

export const SWIFT_SCHEME = (light: string, dark: string): string => `(pyreonColorScheme == .dark ? ${dark} : ${light})`
export const KOTLIN_SCHEME = (light: string, dark: string): string => `(if (isSystemInDarkTheme()) ${dark} else ${light})`

export function swiftTheme(): ChartThemeText {
  return chartThemeFields(undefined, 'X', () => {}, (items) => `[${items.join(', ')}]`, undefined, SWIFT_SCHEME)
}
export function kotlinTheme(): ChartThemeText {
  return chartThemeFields(undefined, 'X', () => {}, (items) => `listOf(${items.join(', ')})`, undefined, KOTLIN_SCHEME)
}
/** `ChartTheme(...)` as the Swift emitter writes it for an un-themed host. */
export function swiftThemeLiteral(over: Partial<ChartThemeText> = {}): string {
  const f = { ...swiftTheme(), ...over }
  return `ChartTheme(${CHART_THEME_FIELDS.map((x) => `${x.name}: ${f[x.name]}`).join(', ')})`
}
export function kotlinThemeLiteral(over: Partial<ChartThemeText> = {}): string {
  const f = { ...kotlinTheme(), ...over }
  return `ChartTheme(${CHART_THEME_FIELDS.map((x) => `${x.name} = ${f[x.name]}`).join(', ')})`
}
