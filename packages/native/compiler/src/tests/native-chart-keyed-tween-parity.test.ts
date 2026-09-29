import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { keyedGeometry, keyedMorphCmds } from '../../../../fundamentals/charts/src/engine/keyed-morph'
import { defaultTheme, layoutChart, renderChartIn } from '../../../../fundamentals/charts/src/engine/render'
import type { ChartSpec, Series } from '../../../../fundamentals/charts/src/engine/render'
import type { DrawCmd, Rect } from '../../../../fundamentals/charts/src/engine/types'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

/**
 * A keyed `<Chart by>` update morphs by row key on BOTH targets: the web
 * through `keyedMorphCmds` over the engine's geometry, native through
 * `pyreonKeyedTweenChartCommands` over the draw list the SAME engine tags
 * with `key` / `enter` when the spec carries `rowKeys`. Two implementations
 * of one join is the shape that drifts, so this asserts by EXECUTION: each
 * scenario's two frames are rendered by the real engine, the native tween is
 * extracted verbatim from each shipped runtime and run by the real toolchain,
 * and its bar rects at a given progress must equal the web morph's, number
 * for number.
 */

const SWIFT_SRC = join(__dirname, '../../../runtime-swift/Sources/PyreonRuntime/PyreonChartCanvas.swift')
const KOTLIN_SRC = join(__dirname, '../../../runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonChartCanvas.kt')
const PROGRESS = 0.375

const measure = (t: string, s: number): number => t.length * s * 0.6
const ser = (kind: Series['kind'], values: number[], color: string): Series => ({ kind, values, color, label: color, width: 2, radius: 3 })
interface Scenario { name: string; from: ChartSpec; fromKeys: string[]; to: ChartSpec; toKeys: string[] }
const frame = (series: Series[], cats: string[], extra: Partial<ChartSpec> = {}): ChartSpec => ({
  width: 320, height: 200, series, categories: cats, theme: defaultTheme, showXAxis: false, showYAxis: false, showGrid: false, yDomain: { min: -4, max: 12 }, ...extra,
})
const SCENARIOS: Scenario[] = [
  {
    name: 'sliding window of plain bars (one exits, one enters, two slide)',
    from: frame([ser('bars', [1, 2, 3], '#111')], ['a', 'b', 'c']), fromKeys: ['a', 'b', 'c'],
    to: frame([ser('bars', [2, 3, -3], '#111')], ['b', 'c', 'd']), toKeys: ['b', 'c', 'd'],
  },
  {
    name: 'stacked, reordered',
    from: frame([ser('stacked', [1, 2, 3], '#111'), ser('stacked', [2, 1, 1], '#222')], ['a', 'b', 'c']), fromKeys: ['a', 'b', 'c'],
    to: frame([ser('stacked', [3, 1, 4], '#111'), ser('stacked', [1, 2, 2], '#222')], ['c', 'a', 'e']), toKeys: ['c', 'a', 'e'],
  },
  {
    name: 'grouped, horizontal',
    from: frame([ser('grouped', [1, 2], '#111'), ser('grouped', [3, 4], '#222')], ['a', 'b'], { horizontal: true }), fromKeys: ['a', 'b'],
    to: frame([ser('grouped', [5, 1, 2], '#111'), ser('grouped', [6, 3, 4], '#222')], ['z', 'a', 'b'], { horizontal: true }), toKeys: ['z', 'a', 'b'],
  },
]

const draw = (sp: ChartSpec, keys: string[]): DrawCmd[] => renderChartIn({ ...sp, rowKeys: keys }, measure, layoutChart(sp, measure))
type RectCmd = Extract<DrawCmd, { kind: 'rect' }>
const keyedRects = (cmds: DrawCmd[]): RectCmd[] => cmds.filter((c): c is RectCmd => c.kind === 'rect' && c.key !== undefined)
const fmt = (r: Rect): string => [r.x, r.y, r.w, r.h].map((v) => v.toFixed(6)).join(' ')

/** The web morph's bar rects at `PROGRESS`, sorted — the reference. */
function webRects(s: Scenario): string[] {
  const from = keyedGeometry(s.from, layoutChart(s.from, measure), s.fromKeys)
  const to = keyedGeometry(s.to, layoutChart(s.to, measure), s.toKeys)
  return keyedMorphCmds(from, to, PROGRESS).filter((c): c is RectCmd => c.kind === 'rect').map((c) => fmt(c.rect)).sort()
}

const num = (v: number): string => (Number.isInteger(v) ? `${v}.0` : `${v}`)
function swiftFieldOrder(): string[] {
  const src = readFileSync(SWIFT_SRC, 'utf8')
  const at = src.indexOf('    public init(')
  const body = src.slice(at, src.indexOf('\n    ) {', at))
  return [...body.matchAll(/^\s{8}(\w+):/gm)].map((m) => m[1]!)
}
const swRect = (r: Rect): string => `PyreonChartRect(x: ${num(r.x)}, y: ${num(r.y)}, w: ${num(r.w)}, h: ${num(r.h)})`
const ktRect = (r: Rect): string => `PyreonChartRect(${num(r.x)}, ${num(r.y)}, ${num(r.w)}, ${num(r.h)})`
function swiftList(cmds: RectCmd[]): string {
  const order = swiftFieldOrder()
  return `[${cmds.map((c) => {
    const f = new Map<string, string>([['kind', '"rect"'], ['rect', swRect(c.rect)], ['fill', JSON.stringify(c.fill)], ['key', JSON.stringify(c.key)], ['enter', swRect(c.enter!)]])
    return `PyreonDrawCmd(${order.filter((k) => f.has(k)).map((k) => `${k}: ${f.get(k)}`).join(', ')})`
  }).join(', ')}]`
}
const kotlinList = (cmds: RectCmd[]): string =>
  `listOf(${cmds.map((c) => `PyreonDrawCmd(kind = "rect", rect = ${ktRect(c.rect)}, fill = ${JSON.stringify(c.fill)}, key = ${JSON.stringify(c.key)}, enter = ${ktRect(c.enter!)})`).join(', ')})`

function extractRange(path: string, fromNeedle: string, toNeedle: string): string {
  const src = readFileSync(path, 'utf8')
  const a = src.indexOf(fromNeedle)
  expect(a, `${fromNeedle} not found`).toBeGreaterThan(-1)
  const b = src.indexOf(toNeedle, a)
  expect(b, `${toNeedle} not found`).toBeGreaterThan(-1)
  return src.slice(a, b)
}
function withTempDir<T>(prefix: string, fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  try { return fn(dir) } finally { rmSync(dir, { recursive: true, force: true }) }
}
function jvmPath(): string | undefined {
  try { execFileSync('java', ['-version'], { stdio: 'ignore' }); return 'java' } catch { /* try known locations */ }
  for (const c of ['/opt/homebrew/opt/openjdk/bin/java', '/opt/homebrew/opt/openjdk@17/bin/java', '/usr/bin/java']) if (existsSync(c)) return c
  return undefined
}

describe('keyed chart tween — native parity with the web morph', () => {
  it('the engine tags every bar of each scenario (the corpus is not empty)', () => {
    for (const s of SCENARIOS) {
      expect(keyedRects(draw(s.from, s.fromKeys)).length, s.name).toBeGreaterThan(0)
      expect(keyedRects(draw(s.to, s.toKeys)).length, s.name).toBeGreaterThan(0)
    }
  })

  it.skipIf(!isSwiftcAvailable())('the SHIPPED Swift keyed tween matches the web morph, executed', () => {
    const got = withTempDir('pyreon-keyed-swift-', (dir) => {
      const cases = SCENARIOS.map((s, i) => `let f${i}: [PyreonDrawCmd] = ${swiftList(keyedRects(draw(s.from, s.fromKeys)))}
let t${i}: [PyreonDrawCmd] = ${swiftList(keyedRects(draw(s.to, s.toKeys)))}
print(pyreonKeyedTweenChartCommands(f${i}, t${i}, ${PROGRESS}).map { r in [r.rect!.x, r.rect!.y, r.rect!.w, r.rect!.h].map { String(format: "%.6f", $0) }.joined(separator: " ") }.sorted().joined(separator: "|"))`).join('\n')
      const harness = `import Foundation
${extractRange(SWIFT_SRC, 'public struct PyreonChartPt', '/// Text width in engine units')}
${extractRange(SWIFT_SRC, 'private func pyreonChartMix', 'private struct PyreonStaticChartCanvas')}
${cases}
`
      writeFileSync(join(dir, 'main.swift'), harness)
      execFileSync('swiftc', ['-O', join(dir, 'main.swift'), '-o', join(dir, 'run')], {
        stdio: 'pipe',
        env: { ...process.env, CLANG_MODULE_CACHE_PATH: join(dir, 'clang-module-cache'), SWIFT_MODULECACHE_PATH: join(dir, 'swift-module-cache') },
      })
      return execFileSync(join(dir, 'run'), { encoding: 'utf8' }).trimEnd().split('\n')
    })
    expect(got).toEqual(SCENARIOS.map((s) => webRects(s).join('|')))
  }, 120_000)

  it.skipIf(!isKotlincAvailable() || jvmPath() === undefined)('the SHIPPED Kotlin keyed tween matches the web morph, executed', () => {
    const got = withTempDir('pyreon-keyed-kotlin-', (dir) => {
      const cases = SCENARIOS.map((s, i) => `  val f${i} = ${kotlinList(keyedRects(draw(s.from, s.fromKeys)))}
  val t${i} = ${kotlinList(keyedRects(draw(s.to, s.toKeys)))}
  println(pyreonKeyedTweenChartCommands(f${i}, t${i}, ${PROGRESS}).map { r -> listOf(r.rect!!.x, r.rect!!.y, r.rect!!.w, r.rect!!.h).joinToString(" ") { String.format(java.util.Locale.ROOT, "%.6f", it) } }.sorted().joinToString("|"))`).join('\n')
      const harness = `${extractRange(KOTLIN_SRC, 'data class PyreonChartPt', '/**\n * Parse the engine')}
${extractRange(KOTLIN_SRC, 'private fun pyreonChartMix', '@Composable\nprivate fun PyreonStaticChartCanvas')}
fun main() {
${cases}
}
`
      writeFileSync(join(dir, 'main.kt'), harness)
      execFileSync('kotlinc', [join(dir, 'main.kt'), '-include-runtime', '-d', join(dir, 'run.jar')], { stdio: 'pipe' })
      return execFileSync(jvmPath()!, ['-cp', join(dir, 'run.jar'), 'MainKt'], { encoding: 'utf8' }).trimEnd().split('\n')
    })
    expect(got).toEqual(SCENARIOS.map((s) => webRects(s).join('|')))
  }, 600_000)
})
