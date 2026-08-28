// The coverage-output parser.
//
// Two failure modes made `Coverage (Full)` unable to distinguish "measured and
// bad" from "not measured at all":
//
//   1. It parsed the ASCII `All files | …` row, which the v8 reporter OMITS
//      when a package measures exactly one file. `@pyreon/config` is such a
//      package, so after its instrumentation was fixed the row disappeared and
//      the gate would have silently dropped it.
//   2. It could not tell `0/0` (nothing instrumented) from `0/500` (real, and
//      terrible). `@pyreon/config` reported `0% statements (need 95%)` with
//      nine passing tests and 100% of its logic covered — a message that sends
//      you to write tests that already exist.
//
// Both are read off the `Coverage summary` block, which is always present and
// carries the ratio.

import { describe, expect, it } from 'vitest'
import {
  describeProblem,
  extractVitestFailures,
  parseCoverageOutput,
  usefulFailureMessage,
} from '../../../../../scripts/check-coverage'

const summary = (stmts: string, branches = '90% ( 9/10 )', funcs = '90% ( 9/10 )', lines = '90% ( 9/10 )') =>
  [
    '=============================== Coverage summary ===============================',
    `Statements   : ${stmts}`,
    `Branches     : ${branches}`,
    `Functions    : ${funcs}`,
    `Lines        : ${lines}`,
    '================================================================================',
  ].join('\n')

describe('parseCoverageOutput', () => {
  it('reads the four percentages out of the summary block', () => {
    const out = parseCoverageOutput(
      summary('99.18% ( 365/368 )', '96.65% ( 260/269 )', '100% ( 54/54 )', '100% ( 288/288 )'),
    )
    expect(out).toEqual({
      kind: 'measured',
      statements: 99.18,
      branches: 96.65,
      functions: 100,
      lines: 100,
    })
  })

  it('reports ZERO instrumented files as `empty`, NOT as 0% coverage', () => {
    // This is the @pyreon/config shape: nine tests pass, no file is measured.
    // Calling it 0% is a misdiagnosis, so the distinction is the whole point.
    const out = parseCoverageOutput(
      summary('Unknown% ( 0/0 )', 'Unknown% ( 0/0 )', 'Unknown% ( 0/0 )', 'Unknown% ( 0/0 )'),
    )
    expect(out).toEqual({ kind: 'empty' })
  })

  it('does NOT confuse genuine 0% over real files with an empty measurement', () => {
    const out = parseCoverageOutput(
      summary('0% ( 0/500 )', '0% ( 0/200 )', '0% ( 0/40 )', '0% ( 0/480 )'),
    )
    expect(out).toEqual({ kind: 'measured', statements: 0, branches: 0, functions: 0, lines: 0 })
  })

  it('parses a package that measures ONE file, where the `All files` row is absent', () => {
    // The exact regression: the old parser keyed on `All files | …`, and the
    // reporter omits that row for a single-file package. There is no such row
    // in this fixture on purpose.
    const text = [
      'File      | % Stmts | % Branch | % Funcs | % Lines |',
      summary('100% ( 4/4 )', '100% ( 4/4 )', '100% ( 2/2 )', '100% ( 4/4 )'),
    ].join('\n')
    expect(parseCoverageOutput(text)).toMatchObject({ kind: 'measured', statements: 100 })
  })

  it('returns `unparseable` when the summary block never printed', () => {
    // A killed or crashed run. Previously indistinguishable from success.
    expect(parseCoverageOutput('Test Files 1 passed\nsome unrelated noise')).toEqual({
      kind: 'unparseable',
    })
  })

  it('returns `unparseable` on a TRUNCATED summary block', () => {
    // SIGTERM mid-write: statements printed, the rest did not. Treating this as
    // measured would report a partial number as the package's coverage.
    const truncated = ['Coverage summary', 'Statements   : 99% ( 99/100 )'].join('\n')
    expect(parseCoverageOutput(truncated)).toEqual({ kind: 'unparseable' })
  })

  it('tolerates the surrounding test output', () => {
    const noisy = ['Test Files  12 passed (12)', '', summary('88.5% ( 177/200 )'), '', 'Done'].join('\n')
    expect(parseCoverageOutput(noisy)).toMatchObject({ kind: 'measured', statements: 88.5 })
  })

  it('handles an integer percentage with no decimal part', () => {
    expect(parseCoverageOutput(summary('100% ( 10/10 )'))).toMatchObject({ statements: 100 })
  })
})

// The child is spawned with `--reporter=json` precisely so its output is
// machine-readable — and until 2026-08 the gate never read it. When a test
// failed under the coverage run, the error was "produced no parseable coverage
// summary" with a tail of raw coverageMap JSON, while the SAME captured blob
// named the failing test (main run 30946924730, @pyreon/mcp, load-dependent).
// These specs lock the extraction that turns that mystery into a named test.
describe('extractVitestFailures', () => {
  const blob = (assertions: unknown[]) =>
    JSON.stringify({
      numFailedTests: assertions.filter((a) => (a as { status: string }).status === 'failed').length,
      testResults: [{ assertionResults: assertions }],
      coverageMap: { '/w/src/x.ts': { statementMap: {}, s: {} } },
    })

  it('names failed tests with their first failure message, whitespace-collapsed', () => {
    const out = extractVitestFailures(
      blob([
        { fullName: 'suite > passes', status: 'passed' },
        {
          fullName: 'suite > flakes under load',
          status: 'failed',
          failureMessages: ['AssertionError:\n  expected 1\n  to be 2'],
        },
      ]),
    )
    expect(out).toEqual([
      { name: 'suite > flakes under load', message: 'AssertionError: expected 1 to be 2' },
    ])
  })

  it('returns an empty list for an all-green blob (vitest threshold exits fall through to measured)', () => {
    expect(extractVitestFailures(blob([{ fullName: 'ok', status: 'passed' }]))).toEqual([])
  })

  it('WIRING: a sentinel message in the blob is recovered from the surrounding output', () => {
    // The specs above prove `usefulFailureMessage` works; this proves it is
    // actually CALLED by the extractor. Without it, a failing spec on main
    // reports `Error: STACK_TRACE_ERROR` and nothing else — which is what
    // happened to @pyreon/loom on run 31788903029.
    const out = extractVitestFailures(
      `AssertionError: expected [ 'pkg/a.ts: mismatch' ] to deeply equal []\n` +
        blob([
          {
            fullName: 'strip agrees on every source file',
            status: 'failed',
            failureMessages: ['Error: STACK_TRACE_ERROR at task (/x/@vitest/runner/dist/c.js:1:2)'],
          },
        ]),
    )
    expect(out).toHaveLength(1)
    expect(out?.[0]?.message).toContain('to deeply equal')
    expect(out?.[0]?.message).not.toMatch(/^Error: STACK_TRACE_ERROR/)
  })

  it('returns null when no json-reporter blob is present (crash before reporting)', () => {
    expect(extractVitestFailures('Error: Coverage APIs are not supported\n')).toBeNull()
  })

  it('parses the LAST json line and survives leading non-json noise', () => {
    const noise = '{ not json at all\n'
    const out = extractVitestFailures(
      noise + blob([{ fullName: 'a > b', status: 'failed', failureMessages: [] }]),
    )
    expect(out).toEqual([{ name: 'a > b', message: '' }])
  })

  it('caps a runaway failure message at 240 chars', () => {
    const out = extractVitestFailures(
      blob([{ fullName: 'big', status: 'failed', failureMessages: ['x'.repeat(1000)] }]),
    )
    expect(out?.[0]?.message).toHaveLength(240)
  })
})

// A load-only CI failure has exactly ONE artifact: its message. vitest's json
// reporter normally carries the assertion in `failureMessages[0]`, but under
// the instrumented run it sometimes carries the sentinel
// `Error: STACK_TRACE_ERROR` plus a runner-internal stack — the error could
// not be serialised. Observed on main run 31788903029, where @pyreon/loom's
// failure reported exactly that and nothing else, leaving a main-branch
// failure that could not be diagnosed from its own report.
describe('usefulFailureMessage', () => {
  it('passes a real assertion straight through', () => {
    const m = usefulFailureMessage('AssertionError: expected 1 to be 2', 'irrelevant output')
    expect(m).toBe('AssertionError: expected 1 to be 2')
    expect(m).not.toContain('recovered')
  })

  it('recovers the assertion from stdout when the json message is the sentinel', () => {
    const m = usefulFailureMessage(
      'Error: STACK_TRACE_ERROR at task (/x/@vitest/runner/dist/chunk.js:1784:27)',
      "some noise\nAssertionError: expected [ 'a.ts: why' ] to deeply equal []\nmore noise",
    )
    expect(m).toContain('to deeply equal')
    // Say WHERE it came from — a recovered message is weaker evidence than a
    // reported one, and the reader should know which they are holding.
    expect(m).toContain('recovered from output')
  })

  it('recovers when the json message is missing entirely', () => {
    expect(usefulFailureMessage('', 'TypeError: x is not a function')).toContain('TypeError')
  })

  it('does not invent a message when neither source has one', () => {
    expect(usefulFailureMessage('', 'no errors here, all green')).toBe('')
  })

  it('keeps a MULTI-LINE assertion diff, which is where the detail lives', () => {
    const m = usefulFailureMessage(
      'Error: STACK_TRACE_ERROR',
      'AssertionError: expected\n  - one\n  + two\n    at foo.ts:1',
    )
    expect(m).toContain('one')
    expect(m).toContain('two')
  })
})

/**
 * `STACK_TRACE_ERROR` with no assertion text is a DEAD WORKER — almost always
 * out-of-memory under this job's 4-way parallelism — and vitest attributes it
 * to whichever spec was in flight, reliably the package's longest-running one.
 *
 * The gate's guidance used to say "deflake the NAMED test" for every failure,
 * which for this shape sends the reader at an innocent spec. It has already
 * done that once, naming `@pyreon/loom`'s `strip-equivalence` when the real
 * cause was a 3.9 GB build; it named the same spec again on 2026-08-28, which
 * is what prompted discriminating the two.
 */
describe('describeProblem discriminates a dead worker from a failed assertion', () => {
  const problem = (error: string) =>
    describeProblem({ kind: 'tests-failed', package: '@pyreon/loom', error } as never)

  it('a STACK_TRACE_ERROR is reported as a dead worker, not a bad spec', () => {
    const out = problem(
      '1 test(s) FAILED under the coverage run (exit=1): "strip-equivalence agrees on every ' +
        'source file in this repo" — Error: STACK_TRACE_ERROR\n at task (…)',
    )
    expect(out).toContain('WORKER DIED')
    expect(out).toContain('out-of-memory')
    expect(out).toContain('peak RSS per test FILE')
    // and must NOT send the reader at the named spec
    expect(out).not.toContain('deflake the NAMED test')
  })

  it('an ordinary assertion failure still says to deflake the named test', () => {
    const out = problem(
      '1 test(s) FAILED under the coverage run (exit=1): "widget renders" — ' +
        'AssertionError: expected 1 to be 2',
    )
    expect(out).toContain('deflake the NAMED test')
    expect(out).not.toContain('WORKER DIED')
  })

  it('names the package either way', () => {
    for (const e of ['Error: STACK_TRACE_ERROR', 'AssertionError: nope']) {
      expect(problem(e)).toContain('@pyreon/loom')
    }
  })
})
