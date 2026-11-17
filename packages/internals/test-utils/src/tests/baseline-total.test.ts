// A committed baseline that records a `total` must agree with its entries, and
// the ratchet scripts themselves check it (they run in validate-fast and Fast
// Gates), so a git-merged baseline fails on the pull request that produced it.
// On 2026-11-17 `readable-oxlint-baseline.json` reached the default branch
// recording 3403 beside entries that summed to 3405.

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

  it('accepts what the generator wrote', () => {
    expect(perFileBaselineProblems(good)).toEqual([])
  })

  it('a clean git merge of entry lines with one branch\'s total fails', () => {
    // The other branch added a file line; this branch's total line survived.
    const merged = good.replace('    "b.ts"', '    "ab.ts": {"eslint(curly)":2},\n    "b.ts"')
    expect(JSON.parse(merged).total).toBe(3)
    expect(perFileBaselineProblems(merged)).toEqual(['its `total` is 3 but its entries sum to 5'])
  })

  it('a file listed twice fails although JSON.parse reads it as consistent', () => {
    const twice = good.replace('    "b.ts": {"eslint(curly)":2}', '    "b.ts": {"eslint(curly)":7},\n    "b.ts": {"eslint(curly)":2}')
    expect(JSON.parse(twice).files['b.ts']).toEqual({ 'eslint(curly)': 2 })
    expect(perFileBaselineProblems(twice)[0]).toContain('not what the generator writes')
  })

  it('entries out of order, a hand edit of the layout, and conflict markers fail', () => {
    const lines = good.split('\n')
    const swapped = [...lines]
    ;[swapped[4], swapped[5]] = [`${lines[5]},`, lines[4]!.replace(/,$/, '')]
    expect(perFileBaselineProblems(swapped.join('\n'))[0]).toContain('not what the generator writes')
    expect(perFileBaselineProblems(JSON.stringify(JSON.parse(good), null, 2))[0]).toContain('not what the generator writes')
    expect(perFileBaselineProblems(`<<<<<<< HEAD\n${good}`)[0]).toContain('not valid JSON')
  })

  describe('the ratchet gate itself', () => {
    const ratchet: PerFileRatchet = { label: 'Fixture ratchet', description: 'desc', updateCommand: 'bun fixture --update', fixHint: [] }
    const current = { 'a.ts': { 'eslint(complexity)': 1 }, 'b.ts': { 'eslint(curly)': 2 } }
    let dir: string
    let errors: string[]

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'baseline-total-'))
      errors = []
      vi.spyOn(console, 'error').mockImplementation((line: string) => void errors.push(line))
      vi.spyOn(console, 'log').mockImplementation(() => {})
    })
    afterEach(() => {
      vi.restoreAllMocks()
      rmSync(dir, { recursive: true, force: true })
    })

    it('passes on a consistent baseline that matches the findings', () => {
      const path = join(dir, 'baseline.json')
      writeFileSync(path, good)
      expect(checkPerFile(current, path, ratchet)).toBe(true)
    })

    it('FAILS on a wrong total even though no file gained a finding, and prints the command', () => {
      const path = join(dir, 'baseline.json')
      writeFileSync(path, good.replace('"total": 3', '"total": 1'))
      expect(checkPerFile(current, path, ratchet)).toBe(false)
      expect(errors.join('\n')).toContain('its `total` is 1 but its entries sum to 3')
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
