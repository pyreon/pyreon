// The chart engine is written in TS and generated into Kotlin + Swift. TS reads
// past the end of an array as `undefined`; Kotlin's `list[i]` and Swift's
// `array[i]` THROW. So a TS guard of the form `const c = xs[k]; if (c === undefined)`
// is correct on web and a crash on both native targets. `inColumn` shipped that
// way: `barColumns` is EMPTY for every chart that does not opt into ECharts' bar
// layout, so every plain bar chart crashed on Android (device-found,
// IndexOutOfBoundsException at inColumn). Lock the bounds check on the generated
// output, where the crash lives.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..', '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const body = (src: string, fn: string, end: RegExp) => {
  const at = src.indexOf(fn)
  expect(at, `${fn} not found`).toBeGreaterThan(-1)
  const rest = src.slice(at)
  const stop = rest.slice(1).search(end)
  return stop < 0 ? rest : rest.slice(0, stop + 1)
}

describe('generated chart engine: inColumn bounds-checks before indexing', () => {
  it('Kotlin checks k against cols before cols[k]', () => {
    const fn = body(read('packages/native/runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonChartEngine.kt'), 'fun inColumn(', /\nfun /)
    const guard = fn.search(/k >= cols\.length/)
    const index = fn.search(/cols\[k\]/)
    expect(guard, 'no bounds check').toBeGreaterThan(-1)
    expect(guard, 'cols[k] is read before the bounds check').toBeLessThan(index)
  })

  it('Swift checks k against cols before cols[k]', () => {
    const fn = body(read('packages/native/runtime-swift/Sources/PyreonRuntime/PyreonChartEngine.swift'), 'func inColumn(', /\n(public |internal |)func /)
    const guard = fn.search(/k >= cols\.count/)
    const index = fn.search(/cols\[k\]/)
    expect(guard, 'no bounds check').toBeGreaterThan(-1)
    expect(guard, 'cols[k] is read before the bounds check').toBeLessThan(index)
  })
})
