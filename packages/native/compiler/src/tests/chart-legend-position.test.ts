// `legendPosition` on native — and the placement DIVERGENCE it closed.
//
// The web host spelled the four positions inline in `canvas-host.tsx`, so the
// native emitters had two choices: re-derive them, or draw every legend at the
// top and warn. They did the second. The two placements that both targets DID
// have then disagreed: the emit drew the legend at x = 0 across the full
// width, while the web host inset it by 8 on each side and pushed the plot 8
// further down — a legend 8px left of where a browser puts it, silently.
//
// `placeLegend` in the crossing `legend.ts` is now the ONE implementation, so
// the emitters cannot re-derive it and the positions cannot diverge again.

import { describe, expect, it } from 'vitest'
import { chartChromeUnlowered, PLOT_UNLOWERED_PROPS, plotUnloweredWarning } from '../chart-hosts'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, isSwiftUIAvailable, validateKotlin, validateSwiftTypecheck, validateSwiftWithStubs } from '../validate'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../../../..')
const read = (p: string) => readFileSync(join(REPO, p), 'utf8')
const CANVAS_SWIFT = 'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonChartCanvas.swift'
const ENGINE_SWIFT = 'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonChartEngine.swift'

const src = (attr: string): string => `import { PieChart } from '@pyreon/charts/plot'
interface Row { n: string; v: number }
const ROWS: Row[] = [{ n: 'a', v: 1 }, { n: 'b', v: 2 }]
export function Share() {
  return <PieChart data={ROWS} value={(d) => d.v} label={(d) => d.n} showLegend${attr} height={200} onSelectIndex={(i: number) => console.log(i)} />
}
`
const swift = (attr: string) => transform(src(attr), { target: 'swift' })
const kotlin = (attr: string) => transform(src(attr), { target: 'kotlin' })

describe('legendPosition lowers on both targets', () => {
  it('no longer warns at any position — it used to warn at every one, the default included', () => {
    for (const attr of ['', ' legendPosition="top"', ' legendPosition="bottom"', ' legendPosition="left"', ' legendPosition="right"']) {
      for (const r of [swift(attr), kotlin(attr)]) expect(r.warnings, attr).toEqual([])
    }
    expect(PLOT_UNLOWERED_PROPS).not.toContain('legendPosition')
    // …on the hosts that route through the chrome seam, and NOT on the four
    // whose engines draw their own frame (claiming it per-CLASS is the mistake
    // `CHROME_LOWERED`'s own comment records).
    for (const tag of ['PieChart', 'SankeyChart', 'PlotChart', 'RadarChart']) expect(chartChromeUnlowered(tag), tag).not.toContain('legendPosition')
    for (const tag of ['GaugeChart', 'CandlestickChart', 'HeatmapChart', 'BoxplotChart']) expect(chartChromeUnlowered(tag), tag).toContain('legendPosition')
  })

  it('the position reaches the engine as its own enum case', () => {
    for (const pos of ['top', 'bottom', 'left', 'right'] as const) {
      expect(swift(` legendPosition="${pos}"`).code).toContain(`, .${pos}, LegendOptions(`)
      expect(kotlin(` legendPosition="${pos}"`).code).toContain(`, LegendPosition.${pos}, LegendOptions(`)
    }
    // An absent (or non-literal) position is `top`, as on the web.
    expect(swift('').code).toContain(', .top, LegendOptions(')
    expect(kotlin('').code).toContain(', LegendPosition.top, LegendOptions(')
  })

  // Only the insets a legend at THIS position can take are emitted, so the
  // default keeps the exact shift and height every chart had before.
  it('the default emits the same one-axis shift and height as before', () => {
    for (const r of [swift(''), swift(' legendPosition="top"')]) {
      expect(r.code).toContain('pyreonShiftCmds(')
      expect(r.code).not.toContain('pyreonShiftCmdsXY(')
      expect(r.code).not.toContain('- pyreonLegend.bottom')
      expect(r.code).not.toContain('- pyreonLegend.left - pyreonLegend.right')
    }
  })

  it('a bottom legend shortens the plot; a side legend narrows AND indents it', () => {
    for (const emit of [swift, kotlin]) {
      const below = emit(' legendPosition="bottom"').code
      expect(below).toContain('- pyreonTop - pyreonLegend.bottom')
      expect(below).not.toContain('pyreonShiftCmdsXY(')
      for (const pos of ['left', 'right'] as const) {
        const side = emit(` legendPosition="${pos}"`).code
        expect(side, pos).toContain('pyreonShiftCmdsXY(')
        expect(side, pos).toContain('- pyreonLegend.left - pyreonLegend.right')
        // …and the tap comes back OUT of the indent, or a click reports the
        // wrong slice by exactly the legend's width.
        expect(side, pos).toContain('- pyreonLegend.left')
      }
    }
  })

  // The whole point: neither emitter may re-derive placement. `renderLegend`
  // is what they called when they did.
  it('the emitters call the crossing placeLegend, never renderLegend directly', () => {
    for (const emit of [swift, kotlin]) {
      for (const pos of ['top', 'bottom', 'left', 'right'] as const) {
        const code = emit(` legendPosition="${pos}"`).code
        expect(code, pos).toContain('placeLegend(')
        expect(code, pos).not.toContain('renderLegend(')
      }
    }
  })

  it.skipIf(!isSwiftcAvailable())('swiftc (stub bundle + real engine) accepts every position', () => {
    for (const pos of ['top', 'bottom', 'left', 'right'] as const) {
      const r = validateSwiftWithStubs(swift(` legendPosition="${pos}"`).code)
      expect(r.ok, `${pos}: ${r.error ?? ''}`).toBe(true)
    }
  })
  it.skipIf(!isSwiftUIAvailable())('swiftc against real SwiftUI + canvas + engine accepts a side legend', () => {
    const r = validateSwiftTypecheck(read(CANVAS_SWIFT) + '\n' + read(ENGINE_SWIFT) + '\n' + swift(' legendPosition="left"').code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('kotlinc (stub bundle + real engine) accepts every position', () => {
    for (const pos of ['top', 'bottom', 'left', 'right'] as const) {
      const r = validateKotlin(kotlin(` legendPosition="${pos}"`).code)
      expect(r.ok, `${pos}: ${r.error ?? ''}`).toBe(true)
    }
  })
})

// A reason is what a user gets INSTEAD of the feature, so a bare name is a
// status, not a diagnosis. `<MapChart>`'s decline had a spec asserting it
// "names the blocker and a path, not just a status" — and sixteen of the
// nineteen unlowered plot props warned with only their name, held to nothing.
describe('every unlowered plot prop says WHY, not just its name', () => {
  it('has a reason for each, and each names a mechanism rather than a status', () => {
    for (const prop of PLOT_UNLOWERED_PROPS) {
      const why = plotUnloweredWarning('PlotChart', [prop])
      expect(why, prop).toContain(`\`${prop}\` (`)
      // A status ("not supported yet", "a follow-up") is the shape this is
      // meant to replace; a reason is longer than the prop name and says
      // something about HOW it works.
      // Greedy to the CLOSER, not to the first `)`: a reason may itself
      // contain parens (`createChartHandle().dispatch`), and a lazy match
      // would measure those two characters instead of the sentence.
      const reason = new RegExp('`' + prop + '` \\((.*)\\) (?:is|are) not lowered').exec(why)?.[1] ?? ''
      expect(reason.length, `${prop}: reason too short to be one`).toBeGreaterThan(30)
      expect(reason, prop).not.toMatch(/^(not supported|unsupported|a follow-up|todo)/i)
    }
  })

  it('names the emit-work ones as unbuilt rather than impossible', () => {
    // The distinction is the point: a reader must be able to tell a wall from
    // a backlog item.
    for (const prop of ['emphasis', 'selectedMode', 'maxPoints', 'updateAnimation'] as const) {
      const why = plotUnloweredWarning('PlotChart', [prop])
      expect(why, prop).toMatch(/missing|not yet|unbuilt|waits on|emit work|needs/)
    }
  })
})
