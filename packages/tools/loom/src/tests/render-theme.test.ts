/**
 * `loom scan`'s human report, snapshotted at every colour level (plain, 16
 * colours, truecolor), on a dark and a light background, and with the ASCII
 * symbol fallback. ESC is shown as `␛` so the escape codes read in review.
 *
 * The fixture workspace carries one instance of every issue class, so every
 * severity group, the importing-file locations and the red verdict appear.
 */
import { rmSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { renderScanText, type ScanTextOptions } from '../cli/render'
import { buildReport } from '../core/report'
import type { LoomReport } from '../core/types'
import { makeFixtureWorkspace } from './fixture'

const ESC = String.fromCharCode(27)
const show = (s: string): string => s.split(ESC).join('␛')

let root: string
let report: LoomReport
beforeAll(() => {
  root = makeFixtureWorkspace()
  report = buildReport(root)
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

const BASE: ScanTextOptions = { dir: '.', strict: false, reportPath: 'loom-report.json', elapsedMs: 412 }

describe('loom scan, themed', () => {
  const variants: Array<[string, Partial<ScanTextOptions>]> = [
    ['plain', { color: 0, unicode: true }],
    ['16 colours', { color: 1, theme: 'dark', unicode: true }],
    ['truecolor dark', { color: 2, theme: 'dark', unicode: true }],
    ['truecolor light', { color: 2, theme: 'light', unicode: true }],
    ['ascii', { color: 0, unicode: false }],
  ]
  for (const [name, term] of variants) {
    it(name, () => {
      expect(show(renderScanText(report, { ...BASE, ...term }))).toMatchSnapshot()
    })
  }

  it('a clean fabric says so, and a strict run names itself', () => {
    const clean: LoomReport = {
      ...report,
      issues: [],
      stats: { ...report.stats, errors: 0, warnings: 0, infos: 0 },
    }
    const out = renderScanText(clean, { ...BASE, color: 0, unicode: true, strict: true, reportPath: undefined })
    expect(out.trimEnd().split('\n').at(-1)).toBe('✓ fabric clean · strict · 5 packages · 412 ms')
    expect(out).not.toContain('report ')
  })

  it('warnings alone are a warning verdict, and a failing one under --strict', () => {
    const warnOnly: LoomReport = {
      ...report,
      issues: report.issues.filter((i) => i.severity !== 'error'),
      stats: { ...report.stats, errors: 0 },
    }
    const last = (strict: boolean) =>
      renderScanText(warnOnly, { ...BASE, color: 0, unicode: true, strict }).trimEnd().split('\n').at(-1)
    expect(last(false)).toBe('! 3 warnings, 8 info · 5 packages · 412 ms')
    expect(last(true)).toBe('✗ 3 warnings, 8 info · strict · 5 packages · 412 ms')
  })
})
