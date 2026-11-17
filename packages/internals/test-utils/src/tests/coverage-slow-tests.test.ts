import { SLOW_TEST_LOG_MS, slowestTests } from '../../../../../scripts/check-coverage'

// The shape vitest's JSON reporter writes: one entry per file, one assertion
// per test, `duration` in milliseconds (absent for a skipped test).
const report = [
  {
    assertionResults: [
      { fullName: 'engine fuzz chunk 0', status: 'passed', duration: 11_400 },
      { fullName: 'engine quick case', status: 'passed', duration: 12 },
      { fullName: 'engine skipped case', status: 'skipped' },
    ],
  },
  {
    assertionResults: [
      { fullName: 'host mounts', status: 'passed', duration: 5000 },
      { fullName: 'host times out', status: 'failed', duration: 60_004 },
      { fullName: 'host paints', status: 'passed', duration: 7200 },
      { fullName: 'host resizes', status: 'passed', duration: 4999 },
    ],
  },
  { message: 'a file that failed to load has no assertions' },
]

describe('the coverage log names the slowest tests', () => {
  it('lists tests at or above the threshold, slowest first, failed ones included', () => {
    expect(slowestTests(report)).toEqual([
      { name: 'host times out', ms: 60_004 },
      { name: 'engine fuzz chunk 0', ms: 11_400 },
      { name: 'host paints', ms: 7200 },
    ])
  })

  it('keeps the boundary test and honours the limit', () => {
    expect(slowestTests(report, SLOW_TEST_LOG_MS, 10).map((t) => t.name)).toEqual([
      'host times out',
      'engine fuzz chunk 0',
      'host paints',
      'host mounts',
    ])
  })

  it('prints nothing for a healthy package', () => {
    expect(slowestTests([{ assertionResults: [{ fullName: 'fast', status: 'passed', duration: 30 }] }])).toEqual([])
    expect(slowestTests([])).toEqual([])
  })
})
