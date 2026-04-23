import { values } from '../../units'
import { borderRadius, edge } from '../shorthands'
import processDescriptor from './processDescriptor'
import propertyMap from './propertyMap'
import type { ITheme, InnerTheme, Theme } from './types'

// Dev-time counter sink — populated by `@pyreon/perf-harness` on install().
// No import so unistyle carries zero coupling to a private package.
interface ViteMeta {
  readonly env?: { readonly DEV?: boolean }
}
declare const globalThis: { __pyreon_count__?: (name: string, n?: number) => void }

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
      for (const k of Object.values(d.keys as Record<string, string>)) addKey(k)
    }
  }
}

/**
 * Data-driven style processor. Uses the pre-built key→index lookup to
 * iterate ONLY the descriptors whose theme keys are present in the
 * incoming theme object. Falls back to full scan only if the lookup
 * produces zero matches (defensive — shouldn't happen in practice).
 *
 * IMPORTANT: the return MUST be wrapped in `css\`...\`` — NOT a plain
 * string join. makeItResponsive embeds this result in another template
 * literal, and the CSS interpolation chain requires a css template
 * result (not a raw string) for correct nesting of media queries,
 * pseudo-selectors, and @layer wrapping.
 */
// Module-level reusable containers — cleared before each synchronous styles() call.
// Eliminates per-call Set + array allocations (~160 allocations per 80-component page).
const _seen = new Set<number>()
const _fragments: unknown[] = []

const styles: Styles = ({ theme: t, css, rootSize }) => {
  if ((import.meta as ViteMeta).env?.DEV === true) globalThis.__pyreon_count__?.('unistyle.styles')

  const calc = (...params: any[]) => values(params, rootSize)
  const shorthand = edge(rootSize)
  const borderRadiusFn = borderRadius(rootSize)

  // Reuse module-level containers — safe because styles() runs synchronously.
  _seen.clear()
  _fragments.length = 0

  // Fast path: iterate only descriptors whose keys are present in theme
  for (const key of Object.keys(t)) {
    const indices = keyToIndices.get(key)
    if (!indices) continue
    for (const idx of indices) {
      if (_seen.has(idx)) continue
      _seen.add(idx)
      if ((import.meta as ViteMeta).env?.DEV === true)
        globalThis.__pyreon_count__?.('unistyle.descriptor')
      _fragments.push(processDescriptor(propertyMap[idx]!, t, css, calc, shorthand, borderRadiusFn))
    }
  }

  // Fallback: if lookup produced nothing, full scan (handles edge cases
  // where theme uses non-standard keys that aren't in propertyMap)
  if (_fragments.length === 0 && Object.keys(t).length > 0) {
    if ((import.meta as ViteMeta).env?.DEV === true)
      globalThis.__pyreon_count__?.('unistyle.descriptor.fallback-scan')
    for (const d of propertyMap) {
      if ((import.meta as ViteMeta).env?.DEV === true)
        globalThis.__pyreon_count__?.('unistyle.descriptor')
      _fragments.push(processDescriptor(d, t, css, calc, shorthand, borderRadiusFn))
    }
  }

  const result = css`
    ${_fragments}
  `

  // Release references so GC can collect processDescriptor results
  _fragments.length = 0

  return result
}

export default styles
