import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  CHART_CAPABILITIES,
  CHART_CAPABILITY_CONTRACT,
  CHART_CAPABILITY_TARGETS,
  chartCapabilityScore,
  type ChartCapability,
} from './capability-inventory'

const packageRoot = existsSync('src/engine/option.ts') ? '.' : 'packages/fundamentals/charts'
const engineDir = resolve(packageRoot, 'src/engine')

/** Evidence is a test — a unit / browser spec, or a device UI test. Never a source file. */
const TEST_FILE = /(\.test\.tsx?|UITests\.swift|InstrumentedTest\.kt)$/
const NATIVE_TESTS = '../../native/compiler/src/tests/'
/** Warning codes that report a malformed INPUT rather than a contract gap, so they never need a row. */
const DATA_SHAPE_CODE = 'series-data-shape'
const INVALID_INPUT = 'invalid-input'

interface WarnSite {
  file: string
  line: number
  code: string
  tag: string | undefined
}

/**
 * Every `warn('<code>', …)` / `{ code: '<code>' }` site in the option facade,
 * with the `// ledger:` tag on the line above it (or on the same line). The
 * scan is textual on purpose: it must see a NEW site the moment one is
 * written, not only the sites some fixture happens to reach.
 */
function scanWarnSites(dir: string): WarnSite[] {
  const sites: WarnSite[] = []
  for (const file of readdirSync(dir)) {
    if (!/\.(ts|tsx)$/.test(file) || /\.test\./.test(file)) continue
    const src = readFileSync(resolve(dir, file), 'utf8')
    const lines = src.split('\n')
    const re = /\bwarn\(\s*'([a-z-]+)'|code:\s*'([a-z-]+)'/g
    let m: RegExpExecArray | null
    while ((m = re.exec(src)) !== null) {
      const code = (m[1] ?? m[2])!
      const line = src.slice(0, m.index).split('\n').length
      const tagOf = (text: string | undefined): string | undefined => text?.match(/\/\/ ledger: ([a-z0-9.-]+)/)?.[1]
      sites.push({ file, line, code, tag: tagOf(lines[line - 1]) ?? tagOf(lines[line - 2]) })
    }
  }
  return sites
}

const rowIds = new Set(CHART_CAPABILITIES.map((r) => r.id))

describe('versioned chart capability inventory', () => {
  it('classifies every unique row per target and attaches test evidence', () => {
    expect(CHART_CAPABILITY_CONTRACT).toMatch(/^option-contract-\d{4}-\d{2}-\d{2}\.\d+$/)
    expect(CHART_CAPABILITIES.length).toBeGreaterThan(50)
    expect(new Set(CHART_CAPABILITIES.map((row) => `${row.mode}:${row.id}`)).size).toBe(CHART_CAPABILITIES.length)
    for (const row of CHART_CAPABILITIES) {
      for (const t of CHART_CAPABILITY_TARGETS) expect(['complete', 'partial', 'pending'], `${row.id} ${t}`).toContain(row.targets[t])
      expect(row.evidence.length, row.id).toBeGreaterThan(0)
      for (const path of row.evidence) {
        expect(path.startsWith('src/') || path.startsWith(NATIVE_TESTS) || path.startsWith('../../../examples/'), `${row.id}: ${path}`).toBe(true)
        expect(TEST_FILE.test(path), `${row.id}: evidence must be a test, not a source file — ${path}`).toBe(true)
        expect(existsSync(resolve(packageRoot, path)), `${row.id}: ${path} does not exist`).toBe(true)
      }
    }
  })

  it('a DIRECT row complete on the web cites a test that drives the option path, not only PlotChart', () => {
    // The direct rows describe the ECharts option facade. PlotChart is a
    // separate facade, so its tests prove nothing about <OptionChart>: the
    // legend row once read complete on PlotChart evidence alone, while the
    // option legend could not be clicked.
    const optionPath = /compileOption|planOption|OptionChart|optionToSvg|compileFamily|compiledCommands|readOption[A-Z]/
    const unproven = CHART_CAPABILITIES.filter((r) => r.mode === 'direct' && r.targets.web === 'complete').filter((r) =>
      !r.evidence.some((e) => !e.includes('native/') && existsSync(resolve(packageRoot, e)) && optionPath.test(readFileSync(resolve(packageRoot, e), 'utf8'))),
    )
    expect(unproven.map((r) => r.id)).toEqual([])
  })

  it('a row is only as complete as its weakest target', () => {
    const rank = { pending: 0, partial: 1, complete: 2 } as const
    for (const row of CHART_CAPABILITIES) {
      const weakest = Math.min(...CHART_CAPABILITY_TARGETS.map((t) => rank[row.targets[t]]))
      expect(rank[row.status], row.id).toBe(weakest)
    }
  })

  it('names the gap wherever a target falls short', () => {
    for (const row of CHART_CAPABILITIES) {
      if (row.status !== 'complete') expect(row.gaps.length, `${row.id} is ${row.status} but says nothing about why`).toBeGreaterThan(0)
      else expect(row.gaps, `${row.id} is complete yet still lists gaps`).toEqual([])
    }
  })

  it('a native target is not claimed without a native-compiler test', () => {
    for (const row of CHART_CAPABILITIES) {
      const nativeClaimed = row.targets.ios !== 'pending' || row.targets.android !== 'pending'
      if (!nativeClaimed) continue
      expect(row.evidence.some((p) => p.startsWith(NATIVE_TESTS)), `${row.id} claims native ${row.targets.ios} with no native test`).toBe(true)
    }
  })

  it('every unsupported warning in the option facade is tagged with a row, and that row is not complete', () => {
    const sites = scanWarnSites(engineDir).filter((s) => s.code !== DATA_SHAPE_CODE)
    // Guards the scanner itself: a regex that stopped matching would pass every assertion below vacuously.
    expect(sites.length).toBeGreaterThan(50)
    const untagged = sites.filter((s) => s.tag === undefined).map((s) => `${s.file}:${s.line} (${s.code})`)
    expect(untagged, 'every unsupported-warning site needs a `// ledger: <row-id>` tag (or `invalid-input`)').toEqual([])
    for (const s of sites) {
      if (s.tag === INVALID_INPUT) continue
      expect(rowIds.has(s.tag!), `${s.file}:${s.line} names unknown ledger row "${s.tag}"`).toBe(true)
      const row = CHART_CAPABILITIES.find((r) => r.id === s.tag)!
      expect(row.targets.web, `${s.file}:${s.line} still warns for ${row.id}, so its web status cannot be complete`).not.toBe('complete')
    }
  })

  it('keeps direct and hosted scores separate, derived from rows, and 100 only when every target is complete', () => {
    const direct = chartCapabilityScore('direct')
    const hosted = chartCapabilityScore('hosted')
    expect(direct.total).toBeGreaterThan(hosted.total)
    const allComplete = (rows: readonly ChartCapability[]): boolean => rows.every((row) => row.status === 'complete')
    for (const mode of ['direct', 'hosted'] as const) {
      const rows = CHART_CAPABILITIES.filter((row) => row.mode === mode)
      const score = chartCapabilityScore(mode)
      expect(score.percent === 100, mode).toBe(allComplete(rows))
      expect(score.complete + score.partial + score.pending, mode).toBe(score.total)
      for (const t of CHART_CAPABILITY_TARGETS) {
        const per = chartCapabilityScore(mode, t)
        expect(per.complete, `${mode} ${t}`).toBe(rows.filter((row) => row.targets[t] === 'complete').length)
        // The overall score can never exceed any single target's.
        expect(score.complete, `${mode} ${t}`).toBeLessThanOrEqual(per.complete)
      }
    }
  })

  it('covers every completion-plan area in the direct ledger', () => {
    expect(new Set(CHART_CAPABILITIES.filter((row) => row.mode === 'direct').map((row) => row.area))).toEqual(
      new Set(['data', 'series', 'coordinates', 'runtime', 'presentation']),
    )
  })

  it('an unknown mode scores zero rather than dividing by an empty set', () => {
    // A NaN would render as a blank cell and read as "unknown" rather than "nothing claimed".
    const empty = chartCapabilityScore('nope' as never)
    expect(empty).toEqual({ complete: 0, partial: 0, pending: 0, total: 0, percent: 0 })
  })
})
