import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { kotlinCanvasDataClasses } from '../../../../fundamentals/charts/src/native-plugin/stubs'

const runtime = join(__dirname, '../../..')
const read = (path: string): string => readFileSync(join(runtime, path), 'utf8')
const swiftDir = 'runtime-swift/Sources/PyreonRuntime/'
const kotlinDir = 'runtime-kotlin/src/main/kotlin/com/pyreon/runtime/'
const corpus = [
  {
    high: [5, 6, NaN, 7, 8],
    low: [1, 2, 3, 4, 5],
    runs: [
      [0, 1],
      [3, 4],
    ],
  },
  {
    high: [5, NaN, 6, 7, NaN, 8, 9],
    low: [1, 2, 2, 3, 4, 5, 6],
    runs: [
      [2, 3],
      [5, 6],
    ],
  },
  {
    high: [5, 6, 7, 8, 9],
    low: [1, 2, Infinity, 4, 5],
    runs: [
      [0, 1],
      [3, 4],
    ],
  },
  { high: [5, 6, 7], low: [1, 2, 3], runs: [[0, 1, 2]] },
]
const num = (v: number, target: 'swift' | 'kotlin'): string =>
  Number.isNaN(v)
    ? target === 'swift'
      ? 'Double.nan'
      : 'Double.NaN'
    : v === Infinity
      ? target === 'swift'
        ? 'Double.infinity'
        : 'Double.POSITIVE_INFINITY'
      : Number.isInteger(v)
        ? `${v}.0`
        : String(v)
const list = (values: number[], target: 'swift' | 'kotlin'): string =>
  target === 'swift'
    ? `[${values.map((v) => num(v, target)).join(', ')}]`
    : `listOf(${values.map((v) => num(v, target)).join(', ')})`
const expected = (c: (typeof corpus)[number], target: 'swift' | 'kotlin'): string => {
  const points = c.runs.map((indices) =>
    [
      ...indices.map((i) => [i, c.high[i]!]),
      ...indices.toReversed().map((i) => [i, c.low[i]!]),
    ].map(([i, v]) => {
      const x = (388 / c.high.length) * (i! + 0.5)
      const y = 240 - 232 * (v! / 10)
      return `PyreonChartPt(x${target === 'swift' ? ':' : ' ='} ${num(x, target)}, y${target === 'swift' ? ':' : ' ='} ${num(y, target)})`
    }),
  )
  return target === 'swift'
    ? `[${points.map((p) => `[${p.join(', ')}]`).join(', ')}]`
    : `listOf(${points.map((p) => `listOf(${p.join(', ')})`).join(', ')})`
}

describe('shipped native band geometry', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: each filled run closes against its own lower boundary`, (ctx) => {
      if (target === 'swift' ? !isSwiftcAvailable() : !isKotlincAvailable()) return ctx.skip()
      const dir = mkdtempSync(join(tmpdir(), 'pyreon-band-runs-'))
      ctx.onTestFinished(() => rmSync(dir, { recursive: true, force: true }))
      if (target === 'swift') {
        const canvas = read(swiftDir + 'PyreonChartCanvas.swift')
        const types = canvas.slice(
          canvas.indexOf('public struct PyreonChartPt'),
          canvas.indexOf('/// Text width in engine units'),
        )
        const cases = corpus
          .map(
            (c, i) => `
let s${i} = Series(kind: "band", values: ${list(c.high, target)}, color: "#ff0000", width: 2.0, radius: 3.0, label: "range", values2: ${list(c.low, target)})
let spec${i} = ChartSpec(width: 400.0, height: 240.0, series: [s${i}], categories: [], theme: defaultTheme, showXAxis: false, showYAxis: false, showGrid: false, yDomain: Domain(min: 0.0, max: 10.0))
let actual${i} = renderChart(spec${i}, { text, size in Double(text.count) * size * 0.6 }).filter { $0.kind == "polygon" }.map { $0.points! }
let expected${i}: [[PyreonChartPt]] = ${expected(c, target)}
precondition(actual${i}.count == expected${i}.count)
for (a, b) in zip(actual${i}, expected${i}) {
  precondition(a.count == b.count)
  for (p, q) in zip(a, b) { precondition(abs(p.x - q.x) < 0.000001 && abs(p.y - q.y) < 0.000001) }
}`,
          )
          .join('\n')
        writeFileSync(
          join(dir, 'main.swift'),
          [
            types,
            read(swiftDir + 'PyreonNumber.swift'),
            read(swiftDir + 'PyreonChartEngine.swift'),
            cases,
          ].join('\n'),
        )
        expect(() => {
          execFileSync('swiftc', [join(dir, 'main.swift'), '-o', join(dir, 'run')], {
            stdio: 'pipe',
            timeout: 180_000,
          })
          execFileSync(join(dir, 'run'), { stdio: 'pipe', timeout: 30_000 })
        }).not.toThrow()
      } else {
        const withoutPackage = (s: string): string =>
          s
            .split('\n')
            .filter((l) => !l.startsWith('package '))
            .join('\n')
        const cases = corpus
          .map(
            (c, i) => `
  val s${i} = Series(kind = "band", values = ${list(c.high, target)}, color = "#ff0000", width = 2.0, radius = 3.0, label = "range", values2 = ${list(c.low, target)})
  val spec${i} = ChartSpec(width = 400.0, height = 240.0, series = listOf(s${i}), categories = listOf(), theme = defaultTheme, showXAxis = false, showYAxis = false, showGrid = false, yDomain = Domain(min = 0.0, max = 10.0))
  val actual${i} = renderChart(spec${i}) { text, size -> text.length * size * 0.6 }.filter { it.kind == "polygon" }.map { it.points!! }
  val expected${i} = ${expected(c, target)}
  check(actual${i}.size == expected${i}.size)
  for ((a, b) in actual${i}.zip(expected${i})) {
    check(a.size == b.size)
    for ((p, q) in a.zip(b)) { check(kotlin.math.abs(p.x - q.x) < 0.000001 && kotlin.math.abs(p.y - q.y) < 0.000001) }
  }`,
          )
          .join('\n')
        // Kotlin imports must precede declarations; keep the three shipped
        // sources as separate files, with only their package line removed.
        writeFileSync(
          join(dir, 'canvas.kt'),
          kotlinCanvasDataClasses(read(kotlinDir + 'PyreonChartCanvas.kt')).join('\n'),
        )
        writeFileSync(join(dir, 'number.kt'), withoutPackage(read(kotlinDir + 'PyreonNumber.kt')))
        writeFileSync(
          join(dir, 'main.kt'),
          withoutPackage(read(kotlinDir + 'PyreonChartEngine.kt')) +
            '\nfun main() {\n' +
            cases +
            '\n}',
        )
        expect(() => {
          execFileSync(
            'kotlinc',
            [
              join(dir, 'canvas.kt'),
              join(dir, 'number.kt'),
              join(dir, 'main.kt'),
              '-include-runtime',
              '-d',
              join(dir, 'run.jar'),
            ],
            { stdio: 'pipe', timeout: 180_000 },
          )
          execFileSync('java', ['-cp', join(dir, 'run.jar'), 'MainKt'], {
            stdio: 'pipe',
            timeout: 30_000,
          })
        }).not.toThrow()
      }
    }, 240_000)
  }
})
