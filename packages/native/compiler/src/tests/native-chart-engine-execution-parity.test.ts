/**
 * The chart-engine functions whose source the zero-warning PR changed — counting loops became `Number(n)`, the
 * `0.0 / 0.0` gaps became `NaN`, two narrowing workarounds went away — RUN the same on the web, on Swift and on Kotlin.
 *
 * The drift test proves the generated engine is what the generator produces and that it compiles; this proves it
 * behaves. The cases (`fixtures/chart-engine-parity-cases.ts.txt`) are appended to the engine bundle and run as
 * JavaScript and, through PMTC, as native code, with the differential harness.
 *
 * The web half also locks the one semantic question the `Number(n)` rewrite raises: a counting loop over a
 * FRACTIONAL bound counted `ceil(n)`, `Number(n)` is `n`. Natively every bound is an integer (a `number` parameter is
 * `Int` / `Long`), so only the web could see it, and only through a public function: `sliceRange` keeps the old
 * result with `Math.ceil`; the others are internal and every caller passes a length or an index.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bundleEngineSource } from '../../../../fundamentals/charts/scripts/gen-native-engine'
import { sliceRange } from '../../../../fundamentals/charts/src/engine/zoom'
import { canRunKotlinLite, canRunSwift, caseNames, mismatches, runKotlinLite, runSwift, runWeb } from './differential-harness'

const REPO = join(__dirname, '../../../../..')
const CASES = readFileSync(join(__dirname, 'fixtures/chart-engine-parity-cases.ts.txt'), 'utf8')
const CORPUS = `${bundleEngineSource(REPO)}\n${CASES}`
/** CI's native job sets this: an absent toolchain there is a broken runner, never a skipped spec. */
const REQUIRED = process.env.PYREON_REQUIRE_NATIVE_VALIDATE === '1'

describe('chart engine — the changed functions run the same on the web, Swift and Kotlin', () => {
  const names = caseNames(CORPUS)
  const web = runWeb(CORPUS)

  it('the web results are real answers (no case threw)', () => {
    expect(names.length).toBe(19)
    for (const [i, w] of web.entries()) expect(w, names[i]).not.toMatch(/^<THROW/)
    expect(web[names.indexOf('c_count_to_double')]).toBe('-3,0,5')
    expect(web[names.indexOf('c_count_of')]).toBe('0,0,3')
  })

  it.runIf(canRunSwift())('Swift', () => {
    expect(mismatches(names, web, runSwift(CORPUS))).toEqual([])
  }, 600_000)

  it.runIf(canRunKotlinLite() || REQUIRED)('Kotlin', () => {
    expect(mismatches(names, web, runKotlinLite(CORPUS))).toEqual([])
  }, 600_000)
})

describe('sliceRange keeps its web result for a fractional row count', () => {
  // The implementation before the PR, verbatim apart from the name: the row count was COUNTED.
  const before = (win: { start: number; end: number }, n: number): { from: number; to: number } => {
    if (n <= 0) return { from: 0, to: 0 }
    let nF = 0.0
    for (let i = 0; i < n; i++) nF = nF + 1.0
    const startAt = win.start * nF
    const endAt = win.end * nF
    let from = 0
    let fromF = 0.0
    while (fromF + 1.0 <= startAt && from < n - 1) {
      from = from + 1
      fromF = fromF + 1.0
    }
    let to = 0
    let toF = 0.0
    while (toF < endAt && to < n) {
      to = to + 1
      toF = toF + 1.0
    }

    return { from, to: to < from + 1 ? from + 1 : to }
  }

  it('matches the counting implementation for whole and fractional counts', () => {
    for (const n of [1, 2.5, 3, 7, 7.25, 0.4, 10]) {
      for (const win of [{ start: 0.1, end: 0.6 }, { start: 0.0, end: 1.0 }, { start: 0.95, end: 0.97 }]) {
        expect(sliceRange(win, n), `n=${n} ${JSON.stringify(win)}`).toEqual(before(win, n))
      }
    }
  })
})
