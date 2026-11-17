// A committed baseline that records a `total` must agree with its entries. The
// two readable baselines record none (a shared line every change rewrites makes
// every open PR conflict) and must be exactly what their generator writes; the
// ratchet scripts check that themselves (validate-fast and Fast Gates).
// On 2026-11-17 `readable-oxlint-baseline.json` reached the default branch
// recording 3403 beside entries that summed to 3405.

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { baselineTotalError, parseBaseline, recordedTotalProblems } from '../../../../../scripts/baseline-total'
import {
  buildReadableBaseline,
  checkPerFile,
  perFileBaselineProblems,
  type PerFileRatchet,
  serializeReadableBaseline,
} from '../../../../../scripts/check-readable-ratchet'

const REPO = resolve(__dirname, '../../../../..')

describe('recordedTotalProblems', () => {
  it('accepts a total that is the sum of its entries, including an empty baseline', () => {
    expect(recordedTotalProblems(5, { a: 2, b: 3 })).toEqual([])
    expect(recordedTotalProblems(0, {})).toEqual([])
  })

  it('names both numbers when they disagree', () => {
    expect(recordedTotalProblems(3403, { a: 3400, b: 5 })).toEqual(['its `total` is 3403 but its entries sum to 3405'])
  })

  it('rejects a missing total, a zero or fractional count and a non-object', () => {
    expect(recordedTotalProblems(undefined, { a: 1 })[0]).toContain('not a count')
    expect(recordedTotalProblems(1, { a: 1, b: 0 })).toEqual(['entry "b" is 0, not a positive count'])
    expect(recordedTotalProblems(1, { a: 1.5 })[0]).toContain('not a positive count')
    expect(recordedTotalProblems(1, [1])).toEqual(['its entries are not an object of counts'])
  })

  it('the gate message says the file is generated and gives the command', () => {
    const message = baselineTotalError('leak-baseline.json', 42, { a: 43 }, 'bun scripts/check-leak-ratchet.ts --update')
    expect(message).toContain('✗ leak-baseline.json is not a file its generator wrote')
    expect(message).toContain('its `total` is 42 but its entries sum to 43')
    expect(message).toContain('regenerate it with `bun scripts/check-leak-ratchet.ts --update`')
    expect(baselineTotalError('x.json', 1, { a: 1 }, 'cmd')).toBeNull()
  })

  it('a file with conflict markers is an error naming the file, never "no baseline"', () => {
    expect(() => parseBaseline('x.json', '<<<<<<< HEAD\n{}\n=======\n{}\n>>>>>>> main\n', 'cmd')).toThrow(/x\.json is not valid JSON/)
    expect(parseBaseline<{ total: number }>('x.json', '{"total":1}', 'cmd').total).toBe(1)
  })
})

describe('a per-file baseline must be the text its generator writes', () => {
  const good = serializeReadableBaseline(
    buildReadableBaseline({ 'b.ts': { 'eslint(curly)': 2 }, 'a.ts': { 'eslint(complexity)': 1 } }, 'desc'),
  )

  it('accepts what the generator wrote, and records no total, count or timestamp', () => {
    expect(perFileBaselineProblems(good)).toEqual([])
    expect(Object.keys(JSON.parse(good))).toEqual(['description', 'files'])
    expect(good.split('\n')).toHaveLength(8)
  })

  it('is byte-identical for identical input, whatever order the counts arrive in', () => {
    const again = serializeReadableBaseline(
      buildReadableBaseline({ 'a.ts': { 'eslint(complexity)': 1 }, 'b.ts': { 'eslint(curly)': 2 } }, 'desc'),
    )
    expect(again).toBe(good)
  })

  it('a reintroduced `total` fails, even a correct one', () => {
    const withTotal = good.replace('  "files"', '  "total": 3,\n  "files"')
    expect(JSON.parse(withTotal).total).toBe(3)
    expect(perFileBaselineProblems(withTotal)[0]).toContain('not what the generator writes')
  })

  it('a file listed twice fails although JSON.parse reads it as consistent', () => {
    const twice = good.replace('    "b.ts": {"eslint(curly)":2}', '    "b.ts": {"eslint(curly)":7},\n    "b.ts": {"eslint(curly)":2}')
    expect(JSON.parse(twice).files['b.ts']).toEqual({ 'eslint(curly)': 2 })
    expect(perFileBaselineProblems(twice)[0]).toContain('not what the generator writes')
  })

  it('unsorted entries, a hand-reformatted layout and conflict markers fail', () => {
    const lines = good.split('\n')
    const swapped = [...lines]
    ;[swapped[3], swapped[4]] = [`${lines[4]},`, lines[3]!.replace(/,$/, '')]
    expect(perFileBaselineProblems(swapped.join('\n'))[0]).toContain('not what the generator writes')
    expect(perFileBaselineProblems(JSON.stringify(JSON.parse(good), null, 2))[0]).toContain('not what the generator writes')
    expect(perFileBaselineProblems(`<<<<<<< HEAD\n${good}`)[0]).toContain('not valid JSON')
  })

  it('a zero, fractional or non-object entry is named', () => {
    expect(perFileBaselineProblems(good.replace('"eslint(curly)":2', '"eslint(curly)":0'))).toEqual([
      'entry "b.ts eslint(curly)" is 0, not a positive count',
    ])
    expect(perFileBaselineProblems(good.replace('{"eslint(curly)":2}', '5'))[0]).toContain('is not an object of counts')
  })

  it('an edited description fails when the ratchet pins it', () => {
    expect(perFileBaselineProblems(good, 'desc')).toEqual([])
    expect(perFileBaselineProblems(good, 'another')[0]).toContain('not what the generator writes')
  })

  describe('two branches that change different files merge without a conflict', () => {
    let dir: string
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'baseline-merge-'))
    })
    afterEach(() => {
      rmSync(dir, { recursive: true, force: true })
    })

    const files = { 'a.ts': { r: 9 }, 'b.ts': { r: 8 }, 'c.ts': { r: 7 }, 'd.ts': { r: 6 }, 'e.ts': { r: 5 } }
    const gen = (f: Record<string, Record<string, number>>) => serializeReadableBaseline(buildReadableBaseline(f, 'desc'))
    const merge = (base: string, ours: string, theirs: string, name: string): { status: number; text: string } => {
      const [o, b, t] = ['ours', 'base', 'theirs'].map((n) => join(dir, `${name}.${n}`))
      writeFileSync(o!, ours)
      writeFileSync(b!, base)
      writeFileSync(t!, theirs)
      const r = spawnSync('git', ['merge-file', '-p', o!, b!, t!], { encoding: 'utf8' })

      return { status: r.status ?? -1, text: r.stdout }
    }

    it('PR one tightens a.ts, PR two removes e.ts: git merges them and the result is what the generator writes', () => {
      const base = gen(files)
      const one = gen({ ...files, 'a.ts': { r: 4 } })
      const { 'e.ts': _e, ...withoutE } = files
      const two = gen(withoutE)
      const merged = merge(base, one, two, 'new')
      expect(merged.status).toBe(0)
      expect(perFileBaselineProblems(merged.text)).toEqual([])
      expect(merged.text).toBe(gen({ ...withoutE, 'a.ts': { r: 4 } }))
    })

    it('control: the old shape, with a recorded total, conflicted on the same two changes', () => {
      const old = (f: Record<string, Record<string, number>>) => {
        const total = Object.values(f).reduce((n, rules) => n + Object.values(rules).reduce((x, y) => x + y, 0), 0)

        return gen(f).replace('  "files"', `  "total": ${total},\n  "files"`)
      }
      const merged = merge(old(files), old({ ...files, 'a.ts': { r: 4 } }), old({ ...files, 'e.ts': { r: 3 } }), 'old')
      expect(merged.status).toBeGreaterThan(0)
      expect(merged.text).toContain('<<<<<<<')
    })
  })

  describe('the ratchet gate itself', () => {
    const ratchet: PerFileRatchet = { label: 'Fixture ratchet', description: 'desc', updateCommand: 'bun fixture --update', fixHint: [] }
    const current = { 'a.ts': { 'eslint(complexity)': 1 }, 'b.ts': { 'eslint(curly)': 2 } }
    let dir: string
    let errors: string[]
    let logs: string[]

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'baseline-total-'))
      errors = []
      logs = []
      vi.spyOn(console, 'error').mockImplementation((line: string) => void errors.push(line))
      vi.spyOn(console, 'log').mockImplementation((line: string) => void logs.push(line))
    })
    afterEach(() => {
      vi.restoreAllMocks()
      rmSync(dir, { recursive: true, force: true })
    })

    it('passes on a canonical baseline that matches the findings', () => {
      const path = join(dir, 'baseline.json')
      writeFileSync(path, good)
      expect(checkPerFile(current, path, ratchet)).toBe(true)
    })

    it('passes with FEWER findings than the baseline and says tightening is optional, with the derived total', () => {
      const path = join(dir, 'baseline.json')
      writeFileSync(path, good)
      expect(checkPerFile({ 'a.ts': { 'eslint(complexity)': 1 } }, path, ratchet)).toBe(true)
      expect(logs.join('\n')).toContain('(baseline 3)')
      expect(logs.join('\n')).toContain('Optional: tighten')
    })

    it('FAILS on a reintroduced total even though no file gained a finding, and prints the command', () => {
      const path = join(dir, 'baseline.json')
      writeFileSync(path, good.replace('  "files"', '  "total": 3,\n  "files"'))
      expect(checkPerFile(current, path, ratchet)).toBe(false)
      expect(errors.join('\n')).toContain('not what the generator writes')
      expect(errors.join('\n')).toContain('regenerate it with `bun fixture --update`')
    })
  })
})

describe('the committed baselines', () => {
  const read = (path: string) => JSON.parse(readFileSync(join(REPO, path), 'utf8'))

  it.each(['lint-baseline.json', 'pyreon-lint-baseline.json', 'leak-baseline.json'])('%s: total equals the sum of its rules', (path) => {
    const baseline = read(path)
    expect(recordedTotalProblems(baseline.total, baseline.rules)).toEqual([])
  })

  it('scripts/app-loc-baseline.json: total equals the sum of its apps', () => {
    const baseline = read('scripts/app-loc-baseline.json') as { total: number; apps: Record<string, { code: number }> }
    const perApp = Object.fromEntries(Object.entries(baseline.apps).map(([app, count]) => [app, count.code]))
    expect(recordedTotalProblems(baseline.total, perApp)).toEqual([])
  })

  it.each(['readable-baseline.json', 'readable-oxlint-baseline.json'])('%s is exactly what its generator writes', (path) => {
    expect(perFileBaselineProblems(readFileSync(join(REPO, path), 'utf8'))).toEqual([])
  })
})

describe('every ratchet script checks its own baseline before comparing', () => {
  // The unit test above runs in a shard a pull request may not select; the
  // scripts run in Fast Gates on every pull request. This pins the wiring.
  it.each([
    ['scripts/check-lint-ratchet.ts', 'baselineTotalError(BASELINE_PATH, baseline.total, baseline.rules'],
    ['scripts/check-pyreon-lint-ratchet.ts', 'baselineTotalError(BASELINE_PATH, baseline.total, baseline.rules'],
    ['scripts/check-leak-ratchet.ts', 'baselineTotalError(BASELINE_PATH, baseline.total, baseline.rules'],
    ['scripts/check-app-loc.ts', 'baselineTotalError(BASELINE_NAME, baseline.total, perApp'],
    ['scripts/check-readable-ratchet.ts', 'perFileBaselineProblems(readFileSync(path'],
  ])('%s', (script, call) => {
    expect(readFileSync(join(REPO, script), 'utf8')).toContain(call)
  })
})
