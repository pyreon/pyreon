import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { KOTLIN_MARKERS, PARITY_SCENARIOS, SWIFT_MARKERS, expectationsOf, renderKotlin, renderSwift, spliceRegion } from './native-parity-fixture'

/**
 * F2's shared-fixture lock. The web engine is the oracle; the Swift and
 * Kotlin behaviour fixtures carry a GENERATED region that replays the same
 * scenarios and asserts the oracle's answers, and the co-source gate runs
 * them. This spec (a) sanity-checks the oracle on facts the scenarios rely
 * on, and (b) locks both regions byte-for-byte to the generator, so a
 * changed scenario, oracle or emit shape fails here until
 * `PYREON_WRITE_FLOW_PARITY=1` regenerates them.
 */
// vitest runs with the package as cwd; a file URL from import.meta.url is not usable here.
const SWIFT = join(process.cwd(), 'native/tests/PyreonFlowStateTests.swift')
const KOTLIN = join(process.cwd(), 'native/tests/PyreonFlowStateTest.kt')

describe('flow native parity fixture', () => {
  it('the web oracle answers every scenario deterministically', () => {
    for (const s of PARITY_SCENARIOS) {
      const a = expectationsOf(s)
      const b = expectationsOf(s)
      expect(a).toEqual(b)
      expect(a.answers).toHaveLength(s.queries.length)
    }
    const crud = expectationsOf(PARITY_SCENARIOS[0]!)
    expect(crud.nodes.map((n) => n.id)).toEqual(['2', '3', '4'])
    expect(crud.edges.map((e) => e.id)).toEqual(['e2', 'e3'])
    const history = expectationsOf(PARITY_SCENARIOS.find((s) => s.name.startsWith('history'))!)
    expect(history.nodes.map((n) => n.id)).toEqual(['1', '2', '3'])
    // undo ×2 restores the edge and the move; redo re-applies only the move.
    expect(history.edges.map((e) => e.id)).toEqual(['e1'])
    expect(history.nodes[0]).toEqual({ id: '1', x: 5, y: 5 })
  })

  it('both native fixtures carry the generated region byte-for-byte', () => {
    const write = process.env['PYREON_WRITE_FLOW_PARITY'] === '1'
    const targets = [
      { url: SWIFT, markers: SWIFT_MARKERS, region: renderSwift(), anchor: '    static func main() {', call: ['    static func main() {\n', '    static func main() {\n        runParityChecks()\n'] },
      { url: KOTLIN, markers: KOTLIN_MARKERS, region: renderKotlin(), anchor: 'fun main() {', call: ['fun main() {\n', 'fun main() {\n    runParityChecks()\n'] },
    ] as const
    for (const t of targets) {
      const file = readFileSync(t.url, 'utf8')
      let next = spliceRegion(file, t.markers, t.region, t.anchor)
      if (!next.includes('runParityChecks()\n') || !next.includes(t.call[1])) next = next.replace(t.call[0], t.call[1])
      if (write && next !== file) writeFileSync(t.url, next)
      const current = write ? next : file
      const a = current.indexOf(t.markers[0])
      const b = current.indexOf(t.markers[1])
      expect(a, `${t.url} has no generated flow-parity region — run with PYREON_WRITE_FLOW_PARITY=1`).toBeGreaterThanOrEqual(0)
      expect(current.slice(a, b + t.markers[1].length)).toBe(t.region)
      // Parity runs FIRST so a shared-scenario divergence is reported as such,
      // not by whichever hand-written check happens to read the same value.
      expect(current, 'main must call the generated parity checks first').toContain(t.call[1])
    }
  })
})
