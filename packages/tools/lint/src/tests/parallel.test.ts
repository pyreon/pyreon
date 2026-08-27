import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { lint } from '../lint'
import { PARALLEL_FILE_THRESHOLD, lintAsync, partition, workerCountFor } from '../parallel'
import { lintSlice } from '../lint-worker'
import { getPreset } from '../config/presets'

/**
 * The parallel driver exists because linting is embarrassingly parallel and
 * the engine used one core out of fourteen. The property that makes it
 * shippable is not speed — it is that it cannot change the ANSWER.
 *
 * Speed is deliberately NOT asserted here: a timing assertion under a loaded
 * CI runner measures the runner, not the code.
 */

let dir: string
const FILE_COUNT = PARALLEL_FILE_THRESHOLD + 60

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'pyreon-parallel-'))
  mkdirSync(join(dir, 'src'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'par-demo' }))
  // A corpus big enough to cross the threshold, with a deterministic mix of
  // clean files and files carrying a known defect, so ordering and counting
  // are both exercised.
  for (let i = 0; i < FILE_COUNT; i++) {
    const bad = i % 3 === 0
    const src = bad
      ? `export const C${i} = () => <div className="x"><img src="/a.png" /></div>\n`
      : `export const C${i} = () => <div class="x">${i}</div>\n`
    writeFileSync(join(dir, 'src', `F${String(i).padStart(4, '0')}.tsx`), src)
  }
})

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('workerCountFor', () => {
  it('returns 0 below the threshold — small runs stay sequential', () => {
    expect(workerCountFor(0)).toBe(0)
    expect(workerCountFor(PARALLEL_FILE_THRESHOLD - 1)).toBe(0)
  })

  it('scales with the work, never past the cores available', () => {
    expect(workerCountFor(PARALLEL_FILE_THRESHOLD, 14)).toBeGreaterThanOrEqual(1)
    expect(workerCountFor(100_000, 14)).toBe(13) // leaves one core for the main thread
    expect(workerCountFor(100_000, 2)).toBe(1)
  })

  it('does not spawn more workers than there is work to justify', () => {
    // 250 files across 13 cores would be 19 files each — startup dominates.
    expect(workerCountFor(250, 14)).toBe(2)
  })
})

describe('partition', () => {
  it('preserves every item exactly once', () => {
    const items = Array.from({ length: 57 }, (_, i) => i)
    const chunks = partition(items, 5)
    expect(chunks.flat().sort((a, b) => a - b)).toEqual(items)
  })

  it('produces near-equal chunks and never an empty one', () => {
    const chunks = partition(Array.from({ length: 574 }, (_, i) => i), 5)
    expect(chunks).toHaveLength(5)
    const sizes = chunks.map((c) => c.length)
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1)
  })

  it('handles n larger than the item count without emitting empty chunks', () => {
    expect(partition([1, 2], 8).every((c) => c.length > 0)).toBe(true)
  })
})

describe('lintAsync — same answer as lint()', () => {
  it('crosses the parallel threshold for this corpus', () => {
    // Guards the premise: if the corpus fell below the threshold, every
    // equality assertion below would be comparing lint() against itself.
    expect(workerCountFor(FILE_COUNT)).toBeGreaterThan(0)
  })

  it('produces identical results to the sequential path', async () => {
    const opts = { paths: [join(dir, 'src')] }
    const seq = lint(opts)
    const par = await lintAsync(opts)

    expect(par.totalErrors).toBe(seq.totalErrors)
    expect(par.totalWarnings).toBe(seq.totalWarnings)
    expect(par.totalInfos).toBe(seq.totalInfos)
    expect(par.files.length).toBe(seq.files.length)

    // Compare the full diagnostic stream, not just the counts — a partition
    // bug that dropped one file and double-counted another would keep the
    // totals honest while corrupting the output.
    const flatten = (r: typeof seq) =>
      r.files
        .map((f) => `${f.filePath}\n` + f.diagnostics.map((d) => `${d.ruleId}@${d.span.start}:${d.severity}`).join(','))
        .sort()
    expect(flatten(par)).toEqual(flatten(seq))
  })

  it('returns files in a stable order regardless of worker completion order', async () => {
    const opts = { paths: [join(dir, 'src')] }
    const a = await lintAsync(opts)
    const b = await lintAsync(opts)
    expect(a.files.map((f) => f.filePath)).toEqual(b.files.map((f) => f.filePath))
    // And sorted, so CI diffs are meaningful.
    const paths = a.files.map((f) => f.filePath)
    expect([...paths].sort()).toEqual(paths)
  })

  it('finds the seeded defects rather than silently returning nothing', async () => {
    // A parallel driver that returned an empty result would pass every
    // equality check above if the sequential path were also broken. Pin the
    // absolute expectation too.
    const par = await lintAsync({ paths: [join(dir, 'src')] })
    const ids = new Set(par.files.flatMap((f) => f.diagnostics.map((d) => d.ruleId)))
    expect(ids).toContain('pyreon/no-classname')
    expect(ids).toContain('pyreon/require-img-alt')
    expect(par.totalErrors).toBeGreaterThan(FILE_COUNT / 3)
  })
})

describe('lintSlice — the worker body, without spawning', () => {
  it('lints its slice and reports config diagnostics', () => {
    const files = [join(dir, 'src', 'F0000.tsx'), join(dir, 'src', 'F0001.tsx')]
    const out = lintSlice({ files, config: getPreset('recommended'), fix: false, quiet: false })
    expect(out.files).toHaveLength(2)
    expect(Array.isArray(out.configDiagnostics)).toBe(true)
  })

  it('quiet drops non-errors', () => {
    const files = [join(dir, 'src', 'F0000.tsx')]
    const loud = lintSlice({ files, config: getPreset('recommended'), fix: false, quiet: false })
    const quiet = lintSlice({ files, config: getPreset('recommended'), fix: false, quiet: true })
    expect(quiet.files[0]?.diagnostics.every((d) => d.severity === 'error')).toBe(true)
    expect(quiet.files[0]!.diagnostics.length).toBeLessThanOrEqual(loud.files[0]!.diagnostics.length)
  })

  it('skips a file it cannot read instead of throwing', () => {
    const out = lintSlice({
      files: [join(dir, 'src', 'does-not-exist.tsx')],
      config: getPreset('recommended'),
      fix: false,
      quiet: false,
    })
    expect(out.files).toHaveLength(0)
  })
})
