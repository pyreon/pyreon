/**
 * Unit half of the browser verify runner: the verdict-merge derivation and the
 * snapshot comparison. The browser half (real Chromium, real coverage
 * bridge, real screenshots) is proven by the subprocess e2e in
 * `e2e/atlas-verify-browser.spec.ts` — these tests pin the pure rules so a
 * refactor can't silently drift `ok`/`checked` away from the pipeline's
 * derivation.
 */
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { VerifyVerdict } from '../../core'
import {
  axeReportToCheck,
  comparePngs,
  countSnapshots,
  mergeA11y,
  mergeBrowserVerdict,
  snapshotScenario,
  writeAtomic,
} from '../runner'
import { decodePng, encodePng } from '../png'

const PASS = { status: 'pass' } as const
const FAIL = { status: 'fail', findings: [{ code: 'mount-threw' as const, message: 'boom' }] } as const
const SKIP = { status: 'skip' } as const

describe('mergeBrowserVerdict', () => {
  it('upgrades a scan verdict: browser checks replace the stubs, node checks survive', () => {
    const scan: VerifyVerdict = {
      ok: true,
      checked: 3,
      a11y: PASS,
      interaction: PASS,
      reactivityCoverage: SKIP,
      leak: PASS,
      snapshot: SKIP,
      ssrParity: { status: 'skip' },
    }
    const merged = mergeBrowserVerdict(scan, { reactivityCoverage: PASS, snapshot: PASS })
    expect(merged.a11y).toBe(PASS)
    expect(merged.leak).toBe(PASS)
    expect(merged.reactivityCoverage).toEqual(PASS)
    expect(merged.snapshot).toEqual(PASS)
    expect(merged.checked).toBe(5)
    expect(merged.ok).toBe(true)
  })

  it('a browser FAIL flips ok even when every node check passed', () => {
    const scan: VerifyVerdict = {
      ok: true,
      checked: 3,
      a11y: PASS,
      interaction: PASS,
      reactivityCoverage: SKIP,
      leak: PASS,
      snapshot: SKIP,
      ssrParity: { status: 'skip' },
    }
    const merged = mergeBrowserVerdict(scan, { reactivityCoverage: PASS, snapshot: FAIL })
    expect(merged.ok).toBe(false)
    expect(merged.checked).toBe(5)
  })

  it('a node FAIL survives the merge — browser passes cannot launder it', () => {
    const scan: VerifyVerdict = {
      ok: false,
      checked: 3,
      a11y: FAIL,
      interaction: PASS,
      reactivityCoverage: SKIP,
      leak: PASS,
      snapshot: SKIP,
      ssrParity: { status: 'skip' },
    }
    const merged = mergeBrowserVerdict(scan, { reactivityCoverage: PASS, snapshot: PASS })
    expect(merged.ok).toBe(false)
    expect(merged.a11y).toBe(FAIL)
  })

  it('an ssrParity FAIL from the scan survives the merge AND keeps ok false', () => {
    // Regression: the recompute iterated a hand-written key list that omitted
    // `ssrParity`, so the carried-through failure was ignored and a scenario
    // with a real hydration mismatch came out of `verify-browser` as ok:true.
    const scan: VerifyVerdict = {
      ok: false,
      checked: 4,
      a11y: PASS,
      interaction: PASS,
      reactivityCoverage: SKIP,
      leak: PASS,
      snapshot: SKIP,
      ssrParity: FAIL,
    }
    const merged = mergeBrowserVerdict(scan, { reactivityCoverage: PASS, snapshot: PASS })
    expect(merged.ssrParity).toBe(FAIL)
    expect(merged.checked).toBe(6)
    expect(merged.ok).toBe(false)
  })

  it('no prior verdict: node checks default to skip, checked counts only the browser pair', () => {
    const merged = mergeBrowserVerdict(undefined, { reactivityCoverage: PASS, snapshot: SKIP })
    expect(merged.a11y.status).toBe('skip')
    expect(merged.interaction.status).toBe('skip')
    expect(merged.leak.status).toBe('skip')
    expect(merged.checked).toBe(1)
    expect(merged.ok).toBe(true)
  })

  it('all-skip result is NOT ok — zero checks ran is unverified, not verified', () => {
    const merged = mergeBrowserVerdict(undefined, { reactivityCoverage: SKIP, snapshot: SKIP })
    expect(merged.checked).toBe(0)
    expect(merged.ok).toBe(false)
  })
})

/** A solid-colour RGBA PNG, optionally with one pixel recoloured. */
function solidPng(w: number, h: number, rgb: [number, number, number], odd?: { at: number; rgb: [number, number, number] }): Buffer {
  const data = Buffer.alloc(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    const c = odd && odd.at === i ? odd.rgb : rgb
    data[i * 4] = c[0]
    data[i * 4 + 1] = c[1]
    data[i * 4 + 2] = c[2]
    data[i * 4 + 3] = 255
  }
  return encodePng(w, h, data)
}

describe('comparePngs', () => {
  it('returns the differing-pixel fraction', () => {
    // A 10x10 white image with one black pixel far from any slope: 1 of 100.
    const a = solidPng(10, 10, [255, 255, 255])
    const b = solidPng(10, 10, [255, 255, 255], { at: 55, rgb: [0, 0, 0] })
    expect(comparePngs(a, b).ratio).toBe(0.01)
  })

  it('dimension mismatch is a total diff (1) with no diff image, not a crash inside the diff', () => {
    const result = comparePngs(solidPng(10, 10, [0, 0, 0]), solidPng(12, 10, [0, 0, 0]))
    expect(result).toEqual({ ratio: 1, diffPng: null })
  })

  it('identical images diff to 0', () => {
    expect(comparePngs(solidPng(4, 4, [9, 9, 9]), solidPng(4, 4, [9, 9, 9])).ratio).toBe(0)
  })

  it('the diff image marks exactly the differing pixel red', () => {
    const { diffPng } = comparePngs(
      solidPng(3, 3, [255, 255, 255]),
      solidPng(3, 3, [255, 255, 255], { at: 4, rgb: [0, 0, 0] }),
    )
    const img = decodePng(diffPng!)
    const red = [...Array(9).keys()].filter((i) => img.data[i * 4] === 255 && img.data[i * 4 + 1] === 0)
    expect(red).toEqual([4])
  })
})

describe('snapshotScenario + countSnapshots', () => {
  it('a THROWN screenshot is a failure the summary counts (not "0 visual diffs")', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atlas-snap-'))
    const page = {
      locator: () => ({
        screenshot: async (): Promise<Buffer> => {
          throw new Error('Target page, context or browser has been closed')
        },
      }),
    }
    const outcome = await snapshotScenario(page, 'card--default', {
      snapshotDir: dir,
      maxRatio: 0.01,
      updateSnapshots: false,
    })
    expect(outcome.snapshot.status).toBe('fail')
    expect(outcome.snapshot.findings?.[0]?.code).toBe('snapshot-failed')
    expect(countSnapshots([outcome])).toEqual({ created: 0, failed: 1 })
  })

  it('a first run creates the baseline (pass, counted as created, not failed)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atlas-snap-'))
    const page = { locator: () => ({ screenshot: async () => Buffer.from('png') }) }
    const outcome = await snapshotScenario(page, 'card--default', {
      snapshotDir: dir,
      maxRatio: 0.01,
      updateSnapshots: false,
    })
    expect(outcome.snapshot.status).toBe('pass')
    expect(readFileSync(join(dir, 'card--default.png'), 'utf8')).toBe('png')
    expect(countSnapshots([outcome])).toEqual({ created: 1, failed: 0 })
  })

  it('a real visual diff fails and writes the actual AND a diff image beside the baseline', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atlas-snap-'))
    writeFileSync(join(dir, 'card--default.png'), solidPng(4, 4, [255, 255, 255]))
    const shot = solidPng(4, 4, [0, 0, 0])
    const page = { locator: () => ({ screenshot: async () => shot }) }
    const outcome = await snapshotScenario(page, 'card--default', {
      snapshotDir: dir,
      maxRatio: 0.01,
      updateSnapshots: false,
    })
    expect(outcome.snapshot.status).toBe('fail')
    expect(outcome.snapshot.findings?.[0]?.message).toMatch(/diff image to .*card--default\.diff\.png/)
    expect(readFileSync(join(dir, 'card--default.actual.png')).equals(shot)).toBe(true)
    expect(decodePng(readFileSync(join(dir, 'card--default.diff.png'))).width).toBe(4)
    expect(countSnapshots([outcome])).toEqual({ created: 0, failed: 1 })
  })
})

describe('writeAtomic', () => {
  it('replaces the file whole and leaves no tmp sibling behind', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atlas-atomic-'))
    const path = join(dir, 'atlas-catalog.json')
    writeFileSync(path, 'old')
    writeAtomic(path, '{"new":true}')
    expect(readFileSync(path, 'utf8')).toBe('{"new":true}')
    expect(readdirSync(dir)).toEqual(['atlas-catalog.json'])
  })
})

describe('axe-core in verify-browser (#3803)', () => {
  const report = (over: Partial<Parameters<typeof axeReportToCheck>[0]> = {}) => ({
    status: 'done' as const,
    violations: [] as { id: string; impact: string; help: string; target: string; html: string; nodes: number }[],
    incomplete: 0,
    ...over,
  })
  const v = (id: string, impact: string) => ({ id, impact, help: `${id} help`, target: 'button', html: '<button></button>', nodes: 2 })

  it('violations FAIL with structured axe-violation findings', () => {
    const c = axeReportToCheck(report({ violations: [v('button-name', 'critical')] }))
    expect(c.status).toBe('fail')
    expect(c.findings?.[0]?.code).toBe('axe-violation')
    expect(c.findings?.[0]?.message).toContain('button-name')
  })

  it('a clean run PASSES; incomplete items are reported, not dropped', () => {
    expect(axeReportToCheck(report()).status).toBe('pass')
    const c = axeReportToCheck(report({ incomplete: 3 }))
    expect(c.status).toBe('pass')
    expect(c.findings?.[0]?.code).toBe('axe-incomplete')
  })

  it('a run that did NOT happen is a SKIP with the reason — never a pass', () => {
    const c = axeReportToCheck({ status: 'failed', violations: [], incomplete: 0, error: 'boom' })
    expect(c.status).toBe('skip')
    expect(c.findings?.[0]?.code).toBe('not-run')
    expect(c.findings?.[0]?.message).toContain('boom')
  })

  it('minImpact drops lower-impact violations but keeps unranked ones', () => {
    const r = report({ violations: [v('a', 'minor'), v('b', 'moderate')] })
    expect(axeReportToCheck(r, 'serious').status).toBe('pass')
    expect(axeReportToCheck(r, 'moderate').findings).toHaveLength(1)
    expect(axeReportToCheck(report({ violations: [v('x', 'unknown')] }), 'critical').status).toBe('fail')
  })

  it('merge: a static skip is replaced by axe pass/fail; static FAIL survives an axe pass', () => {
    const staticSkip = { status: 'skip', findings: [{ code: 'nothing-to-check', message: 'run verify-browser' }] } as const
    expect(mergeA11y(staticSkip, { status: 'pass' })).toEqual({ status: 'pass' })
    expect(mergeA11y(undefined, { status: 'pass' }).status).toBe('pass')
    const merged = mergeA11y(FAIL_A11Y, { status: 'pass' })
    expect(merged.status).toBe('fail')
    expect(merged.findings?.map((f) => f.code)).toEqual(['missing-accessible-name'])
  })

  it('merge: axe not run keeps an honest skip — it never becomes a pass', () => {
    const notRun = axeReportToCheck({ status: 'failed', violations: [], incomplete: 0, error: 'no preview' })
    const m = mergeA11y({ status: 'skip' }, notRun)
    expect(m.status).toBe('skip')
    expect(m.findings?.[0]?.message).toContain('no preview')
  })

  it('merge is idempotent: a re-run replaces prior axe findings instead of stacking them', () => {
    const fail = axeReportToCheck(report({ violations: [v('button-name', 'critical')] }))
    const once = mergeA11y({ status: 'skip' }, fail)
    const twice = mergeA11y(once, fail)
    expect(twice).toEqual(once)
    // and when the violation is fixed the verdict recovers
    expect(mergeA11y(once, { status: 'pass' }).status).toBe('pass')
  })

  it('mergeBrowserVerdict: axe FAIL flips ok; absent axe carries the prior a11y unchanged', () => {
    const scan: VerifyVerdict = {
      ok: true, checked: 1, a11y: { status: 'skip' }, interaction: SKIP, reactivityCoverage: SKIP,
      leak: SKIP, snapshot: SKIP, ssrParity: SKIP,
    }
    const failed = mergeBrowserVerdict(scan, {
      reactivityCoverage: PASS, snapshot: PASS,
      a11y: axeReportToCheck(report({ violations: [v('image-alt', 'critical')] })),
    })
    expect(failed.a11y.status).toBe('fail')
    expect(failed.ok).toBe(false)
    const carried = mergeBrowserVerdict(scan, { reactivityCoverage: PASS, snapshot: PASS })
    expect(carried.a11y).toBe(scan.a11y)
  })
})

const FAIL_A11Y = {
  status: 'fail',
  findings: [{ code: 'missing-accessible-name' as const, message: 'label is empty' }],
} as const
