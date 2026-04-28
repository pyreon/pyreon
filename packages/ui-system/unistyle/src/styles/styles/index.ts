import { values } from '../../units'
import { borderRadius, edge } from '../shorthands'
import processDescriptor from './processDescriptor'
import propertyMap from './propertyMap'
import type { ITheme, InnerTheme, Theme } from './types'

// Dev-time counter sink — populated by `@pyreon/perf-harness` on install().
// No import so unistyle carries zero coupling to a private package.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

export type { ITheme, Theme as StylesTheme }

type Css = (strings: TemplateStringsArray, ...args: any[]) => any

export type Styles = ({
  theme,
  css,
  rootSize,
  globalTheme,
}: {
  theme: InnerTheme
  css: Css
  rootSize?: number | undefined
  globalTheme?: Record<string, any> | undefined
}) => ReturnType<Css>

// ─── Tier 1: Key → descriptor-index lookup ──────────────────────────────────
// Built once at module init. Instead of scanning all 257 descriptors on every
// styles() call, we look up only the indices whose keys are present in the
// incoming theme object. Reduces iterations from ~257 to ~10-20 for a typical
// component that uses 5-10 properties.

const keyToIndices = new Map<string, number[]>()

for (let i = 0; i < propertyMap.length; i++) {
  const d = propertyMap[i] as Record<string, any>
  const addKey = (k: string) => {
    let arr = keyToIndices.get(k)
    if (!arr) {
      arr = []
      keyToIndices.set(k, arr)
    }
    arr.push(i)
  }

  if (d.key) addKey(d.key)
  if (d.keys) {
    if (Array.isArray(d.keys)) {
      for (const k of d.keys) addKey(k)
    } else {
      for (const inner of Object.values(d.keys as Record<string, string>)) {
        addKey(inner)
      }
    }
  }
}

/**
 * Convert a normalized theme object (Record<key, value>) into a CSS template
 * by walking the property map. Each entry in propertyMap describes a single
 * CSS property — its kind (simple / convert / convert_fallback / edge /
 * border_radius), the input theme key(s) to read, and the output CSS name.
 *
 * Returns a `css` tagged template literal so makeItResponsive can embed the
 * result inside the responsive breakpoint structure. Each call returns a
 * FRESH array — the result CSSResult holds onto that array by reference,
 * and reusing one module-level array across calls would clobber an earlier
 * CSSResult's data when the next styles() call clears the shared array.
 *
 * IMPORTANT: the return MUST be wrapped in `css\`...\`` — NOT a plain
 * string join. makeItResponsive embeds this result in another template
 * literal, and the CSS interpolation chain requires a css template
 * result (not a raw string) for correct nesting of media queries,
 * pseudo-selectors, and @layer wrapping.
 */
// Module-level reusable Set — cleared before each synchronous styles() call.
// The fragments array CANNOT be module-level because the returned CSSResult
// captures it by reference; the next styles() call would clear-out the
// previous result before its consumer ever resolved it.
const _seen = new Set<number>()

const styles: Styles = ({ theme: t, css, rootSize }) => {
  if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('unistyle.styles')

  const calc = (...params: any[]) => values(params, rootSize)
  const shorthand = edge(rootSize)
  const borderRadiusFn = borderRadius(rootSize)

  // Per-call fragments array — owned by the returned CSSResult.
  const fragments: unknown[] = []

  // Reuse module-level Set — safe because the Set is fully consumed before
  // styles() returns. The fragments array is the one we MUST allocate fresh
  // (see top-of-function comment) — its lifetime extends past this call.
  _seen.clear()

  // Fast path: iterate only descriptors whose keys are present in theme
  for (const key of Object.keys(t)) {
    const indices = keyToIndices.get(key)
    if (!indices) continue
    for (const idx of indices) {
      if (_seen.has(idx)) continue
      _seen.add(idx)
      if (process.env.NODE_ENV !== 'production')
        _countSink.__pyreon_count__?.('unistyle.descriptor')
      fragments.push(processDescriptor(propertyMap[idx]!, t, css, calc, shorthand, borderRadiusFn))
    }
  }

  // Fallback: if lookup produced nothing, full scan (handles edge cases
  // where theme uses non-standard keys that aren't in propertyMap)
  if (fragments.length === 0 && Object.keys(t).length > 0) {
    if (process.env.NODE_ENV !== 'production')
      _countSink.__pyreon_count__?.('unistyle.descriptor.fallback-scan')
    for (const d of propertyMap) {
      if (process.env.NODE_ENV !== 'production')
        _countSink.__pyreon_count__?.('unistyle.descriptor')
      fragments.push(processDescriptor(d, t, css, calc, shorthand, borderRadiusFn))
    }
  }

  return css`
    ${fragments}
  `
}

export default styles
