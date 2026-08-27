import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { lint } from '../lint'
import {
  PARALLEL_FILE_THRESHOLD,
  _workerEntry,
  lintAsync,
  resolveWorkerEntry,
  partition,
  planRun,
  workerCountFor,
} from '../parallel'
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

  it('returns a single chunk for n <= 1 — one worker means no split', () => {
    // `workerCountFor` can legitimately return 1, and partitioning into one
    // chunk must be the identity rather than a copy that reorders anything.
    const items = [1, 2, 3]
    expect(partition(items, 1)).toEqual([items])
    expect(partition(items, 0)).toEqual([items])
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

  it('_workerEntry() points at a file that EXISTS', () => {
    // The bug this locks: the bundler folds `parallel.ts` into `lib/_chunks/`,
    // so a path derived from `import.meta.url` resolved to
    // `lib/_chunks/lint-worker.js` — which does not exist. Every spawn failed
    // and the fallback swallowed it, so the parallel path never ran in dev OR
    // in the published build while every test still passed.
    //
    // Asserting the path RESOLVES is what catches that; asserting behaviour
    // does not, because the fallback makes broken and working produce the
    // same answer.
    expect(existsSync(_workerEntry()), `_workerEntry() -> ${_workerEntry()}`).toBe(true)
  })

  it('DECLARES why this environment runs sequentially, rather than discovering it by throwing', () => {
    // Under `src/*.ts` a worker cannot resolve the entry's extensionless
    // imports, so the pool is unavailable. `planRun` states that up front —
    // which is also what makes the equality spec below honest about its own
    // scope: here it compares the sequential path with itself.
    const plan = planRun(FILE_COUNT)
    if (_workerEntry().endsWith('.ts')) {
      expect(plan).toEqual({ kind: 'sequential', reason: 'source-entry' })
    } else {
      expect(plan.kind).toBe('parallel')
    }
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

describe('the BUILT worker actually spawns', () => {
  // The source path always falls back (see above), so without this the
  // parallel driver would ship with zero real coverage of the path it exists
  // for. Mirrors `bin-invokes-cli.test.ts`: exercise the artifact a consumer
  // gets, and fail loudly if it is missing rather than skipping quietly.
  const LIB_WORKER = join(import.meta.dirname, '..', '..', 'lib', 'lint-worker.js')
  const LIB_INDEX = join(import.meta.dirname, '..', '..', 'lib', 'index.js')

  it.skipIf(!existsSync(LIB_INDEX))(
    'the BUILT _workerEntry() resolves to a file that exists',
    async () => {
      // THE spec that catches the real bug. Under `src` the relative guess
      // happens to resolve, so a source-side assertion is blind: the failure
      // only exists in the BUNDLED layout, where `parallel.ts` lives in
      // `lib/_chunks/` and a relative path lands one directory too deep.
      // Import the built artifact so the test sees what a consumer sees.
      const built = (await import(LIB_INDEX)) as { _workerEntry?: () => string }
      expect(typeof built._workerEntry).toBe('function')
      const entry = built._workerEntry!()
      expect(existsSync(entry), `built _workerEntry() -> ${entry}`).toBe(true)
    },
  )

  it.skipIf(!existsSync(LIB_WORKER))(
    'loads lib/lint-worker.js in a real worker and returns results',
    async () => {
      const { Worker } = await import('node:worker_threads')
      const file = join(dir, 'src', 'F0000.tsx')
      const out = await new Promise<{ files: unknown[] }>((resolve, reject) => {
        const w = new Worker(LIB_WORKER, {
          workerData: {
            files: [file],
            config: getPreset('recommended'),
            fix: false,
            quiet: false,
          },
        })
        w.once('message', (m) => {
          resolve(m as { files: unknown[] })
          void w.terminate()
        })
        w.once('error', reject)
      })
      expect(out.files).toHaveLength(1)
    },
  )

  it('lib/lint-worker.js is built in this environment (the spec above is NOT skipped)', () => {
    // A skipped suite must never masquerade as coverage. Bootstrap builds lib/.
    expect(existsSync(LIB_WORKER), `missing ${LIB_WORKER} — run bun scripts/bootstrap.ts`).toBe(
      true,
    )
  })
})

describe('planRun — the decision is explicit, not an exception', () => {
  it('reports below-threshold for a small run', () => {
    expect(planRun(10, '/x/lint-worker.js')).toEqual({
      kind: 'sequential',
      reason: 'below-threshold',
    })
  })

  it('reports source-entry for a .ts entry WITHOUT attempting a spawn', () => {
    // The dev layout. Attempting a spawn that is known to fail and catching
    // the result turns a decision into an accident — and makes a genuine
    // worker crash indistinguishable from it.
    expect(planRun(FILE_COUNT, '/x/lint-worker.ts')).toEqual({
      kind: 'sequential',
      reason: 'source-entry',
    })
  })

  it('reports entry-missing rather than spawning at a path that does not exist', () => {
    // The shipped bug: the bundler moved this module, the derived path pointed
    // at `lib/_chunks/lint-worker.js`, and every spawn failed into a silent
    // fallback. Now it is a named, reported condition.
    expect(planRun(FILE_COUNT, '/definitely/not/here/lint-worker.js')).toEqual({
      kind: 'sequential',
      reason: 'entry-missing',
    })
  })

  it('plans a parallel run when the entry really exists', () => {
    const real = join(import.meta.dirname, '..', '..', 'lib', 'lint-worker.js')
    if (!existsSync(real)) return // covered by the built-artifact specs
    const plan = planRun(FILE_COUNT, real)
    expect(plan.kind).toBe('parallel')
    if (plan.kind === 'parallel') {
      expect(plan.workers).toBeGreaterThan(0)
      expect(plan.entry).toBe(real)
    }
  })
})

describe('resolveWorkerEntry — the fallback, made verifiable', () => {
  // The wiring reads `import.meta.resolve` and `existsSync`, neither of which
  // can be un-defined in-process — so before this split the fallback was
  // literally untestable, which is how it shipped disabling the worker pool.
  const never = () => false
  const always = () => true

  it('prefers the export-map resolution when the host offers one', () => {
    const out = resolveWorkerEntry('file:///pkg/lib/lint-worker.js', 'file:///pkg/lib/_chunks/p.js', never)
    expect(out).toBe('/pkg/lib/lint-worker.js')
    // ...and does NOT consult the filesystem to get there.
  })

  it('falls back to the SIBLING candidate when there is no resolver', () => {
    const out = resolveWorkerEntry(null, 'file:///pkg/src/parallel.ts', (p) =>
      p === '/pkg/src/lint-worker.ts')
    expect(out).toBe('/pkg/src/lint-worker.ts')
  })

  it('falls back to the PARENT candidate for the bundled layout', () => {
    // The shape that broke: `parallel.ts` folded into `lib/_chunks/`, so the
    // worker is one directory UP. The sibling guess misses it.
    const out = resolveWorkerEntry(null, 'file:///pkg/lib/_chunks/parallel.js', (p) =>
      p === '/pkg/lib/lint-worker.js')
    expect(out).toBe('/pkg/lib/lint-worker.js')
  })

  it('picks the extension from the module it is running as', () => {
    expect(resolveWorkerEntry(null, 'file:///pkg/src/parallel.ts', always)).toMatch(/lint-worker\.ts$/)
    expect(resolveWorkerEntry(null, 'file:///pkg/lib/parallel.js', always)).toMatch(/lint-worker\.js$/)
  })

  it('returns the primary candidate when NOTHING exists, so the failure names a path', () => {
    // Returning something unusable beats returning nothing: `planRun` then
    // reports `entry-missing` instead of the pool vanishing without a word.
    const out = resolveWorkerEntry(null, 'file:///pkg/lib/_chunks/parallel.js', never)
    expect(out).toBe('/pkg/lib/_chunks/lint-worker.js')
    expect(planRun(FILE_COUNT, out)).toEqual({ kind: 'sequential', reason: 'entry-missing' })
  })
})
