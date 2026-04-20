import { values } from '../../units'
import { borderRadius, edge } from '../shorthands'
import processDescriptor from './processDescriptor'
import propertyMap from './propertyMap'
import type { ITheme, InnerTheme, Theme } from './types'

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
const styles: Styles = ({ theme: t, css, rootSize }) => {
  const calc = (...params: any[]) => values(params, rootSize)
  const shorthand = edge(rootSize)
  const borderRadiusFn = borderRadius(rootSize)

  // Fast path: iterate only descriptors whose keys are present in theme
  const seen = new Set<number>()
  const fragments: unknown[] = []

  for (const key of Object.keys(t)) {
    const indices = keyToIndices.get(key)
    if (!indices) continue
    for (const idx of indices) {
      if (seen.has(idx)) continue
      seen.add(idx)
      fragments.push(processDescriptor(propertyMap[idx]!, t, css, calc, shorthand, borderRadiusFn))
    }
  }

  // Fallback: if lookup produced nothing, full scan (handles edge cases
  // where theme uses non-standard keys that aren't in propertyMap)
  if (fragments.length === 0 && Object.keys(t).length > 0) {
    for (const d of propertyMap) {
      fragments.push(processDescriptor(d, t, css, calc, shorthand, borderRadiusFn))
    }
  }

  return css`
    ${fragments}
  `
}

export default styles
