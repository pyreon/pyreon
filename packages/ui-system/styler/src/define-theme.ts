/**
 * Declare the app's design tokens — the single theme declaration the
 * MULTIPLATFORM compiler resolves `styled()` / rocketstyle token
 * interpolations against (`${(t) => t.spacing.md}` → the literal value,
 * baked into the native emit; see docs/multiplatform "Theme-token
 * resolution").
 *
 * On the web this is an IDENTITY helper: it returns the object unchanged,
 * typed, for passing to `<PyreonUI theme={…}>` — the doc had described
 * this helper as existing ("identity on web") while nothing exported it,
 * so a SHARED multiplatform source importing it could not build for web
 * at all (the same resolvability gap useGeolocation/useWebSocket had).
 *
 * PMTC consumes the declaration at COMPILE time (literal leaves only) and
 * drops it from the native output.
 *
 * @example
 * ```tsx
 * const theme = defineTheme({
 *   color:   { primary: '#ff3b30' },
 *   spacing: { sm: 8, xl: 40 },
 *   radius:  { sm: 6 },
 * })
 * const Card = styled(Stack)`
 *   padding: ${(t) => t.spacing.xl};
 * `
 * ```
 */
export function defineTheme<T extends object>(theme: T): T {
  return theme
}
