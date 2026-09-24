/**
 * Unit half of the browser verify runner: the verdict-merge derivation and the
 * pixel-diff ratio logic. The browser half (real Chromium, real coverage
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
  countSnapshots,
  diffPngs,
  mergeBrowserVerdict,
  snapshotScenario,
  writeAtomic,
} from '../runner'

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

describe('diffPngs', () => {
  const png = (width: number, height: number, data = Buffer.alloc(0)) => ({ width, height, data })

  it('returns the differing-pixel fraction from pixelmatch', () => {
    const deps = {
      PNG: { sync: { read: () => png(10, 10) } },
      pixelmatch: () => 25,
    }
    expect(diffPngs(Buffer.alloc(0), Buffer.alloc(0), deps)).toBe(0.25)
  })

  it('dimension mismatch is a total diff (1), not a crash inside pixelmatch', () => {
    let calls = 0
    const reads = [png(10, 10), png(12, 10)]
    const deps = {
      PNG: { sync: { read: () => reads[calls++]! } },
      pixelmatch: () => {
        throw new Error('pixelmatch must not run on mismatched dimensions')
      },
    }
    expect(diffPngs(Buffer.alloc(0), Buffer.alloc(0), deps)).toBe(1)
  })

  it('identical images diff to 0', () => {
    const deps = {
      PNG: { sync: { read: () => png(4, 4) } },
      pixelmatch: () => 0,
    }
    expect(diffPngs(Buffer.alloc(0), Buffer.alloc(0), deps)).toBe(0)
  })
})

describe('snapshotScenario + countSnapshots', () => {
  const deps = {
    PNG: { sync: { read: () => ({ width: 1, height: 1, data: Buffer.alloc(4) }) } },
    pixelmatch: () => 0,
  }

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
      deps,
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
      deps,
    })
    expect(outcome.snapshot.status).toBe('pass')
    expect(readFileSync(join(dir, 'card--default.png'), 'utf8')).toBe('png')
    expect(countSnapshots([outcome])).toEqual({ created: 1, failed: 0 })
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
