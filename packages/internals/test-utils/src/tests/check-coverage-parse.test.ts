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
import { parseCoverageOutput } from '../../../../../scripts/check-coverage'

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
