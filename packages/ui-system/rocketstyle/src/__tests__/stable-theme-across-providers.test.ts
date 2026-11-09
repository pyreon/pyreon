/**
 * A second `<PyreonUI>` with the SAME raw theme object must not re-resolve
 * rocketstyle themes.
 *
 * `_rsMemo` (and the ThemeManager) key on the ENRICHED theme object.
 * `<PyreonUI>` enriches inside a computed created per mount, and
 * `enrichTheme` used to return a fresh object per call — so every provider
 * mount (every SSR request) made each (definition × dimension tuple) pay the
 * cold `getTheme` pipeline again. `enrichTheme` is now an identity memo, so
 * the second provider's subtree is fully warm. Load-independent: counts
 * `rocketstyle.getTheme` (one per cold resolution).
 */
import { h } from '@pyreon/core'
import { mountReactive } from '@pyreon/test-utils'
import { PyreonUI } from '@pyreon/ui-core'
// Registers unistyle's theme engine (enrichTheme) into ui-core.
import '@pyreon/unistyle'
import rocketstyle from '../init'

type CountSink = ((name: string, n?: number) => void) | undefined
const g = globalThis as { __pyreon_count__?: CountSink }

const Capture: any = ({ $rocketstyle, $rocketstate, ...rest }: any) => {
  // Read the accessors so `_resolveRsEntry` runs (it emits the counters).
  if (typeof $rocketstyle === 'function') $rocketstyle()
  if (typeof $rocketstate === 'function') $rocketstate()
  return h('div', rest)
}

const Badge: any = rocketstyle()({ name: 'StableThemeBadge', component: Capture })
  .theme((t: any) => ({ color: t.colors?.primary ?? 'black' }))
  .states(() => ({ primary: { color: 'blue' }, danger: { color: 'red' } }))

const theme = { rootSize: 16, colors: { primary: 'teal' } }
const page = () =>
  h(PyreonUI as never, { theme }, h(Badge, { state: 'primary' }), h(Badge, { state: 'danger' }))

describe('rocketstyle — theme caches survive a fresh <PyreonUI> with the same theme', () => {
  it('the second provider mount runs zero cold theme resolutions', () => {
    const counts: Record<string, number> = {}
    const prev = g.__pyreon_count__
    g.__pyreon_count__ = (name, n = 1) => {
      counts[name] = (counts[name] ?? 0) + n
    }
    const cleanups: (() => void)[] = []
    try {
      cleanups.push(mountReactive(page()).cleanup)
      expect(counts['rocketstyle.getTheme'] ?? 0).toBeGreaterThan(0) // cold
      for (const k of Object.keys(counts)) delete counts[k]

      cleanups.push(mountReactive(page()).cleanup)
      expect(counts['rocketstyle.getTheme'] ?? 0).toBe(0)
      expect(counts['rocketstyle.dimensionMemo.hit'] ?? 0).toBeGreaterThan(0)
    } finally {
      for (const c of cleanups) c()
      g.__pyreon_count__ = prev
    }
  })
})
