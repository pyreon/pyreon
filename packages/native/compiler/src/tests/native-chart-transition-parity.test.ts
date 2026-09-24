import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform } from '../index'

const ROOT = join(import.meta.dirname, '../../../..')
const SWIFT = join(ROOT, 'native/runtime-swift/Sources/PyreonRuntime/PyreonChartCanvas.swift')
const KOTLIN = join(ROOT, 'native/runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonChartCanvas.kt')

function range(path: string, start: string, end: string): string {
  const source = readFileSync(path, 'utf8')
  const a = source.indexOf(start)
  const b = source.indexOf(end, a)
  expect(a).toBeGreaterThan(-1)
  expect(b).toBeGreaterThan(a)
  return source.slice(a, b)
}

function temp<T>(prefix: string, run: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  try { return run(dir) } finally { rmSync(dir, { recursive: true, force: true }) }
}

const swiftTypes = `
public struct PyreonChartPt { var x: Double; var y: Double }
public struct PyreonChartRect { var x: Double; var y: Double; var w: Double; var h: Double }
public struct PyreonChartGradientStop { var offset: Double; var color: String }
public struct PyreonChartGradient { var from: PyreonChartPt; var to: PyreonChartPt; var stops: [PyreonChartGradientStop] }
public struct PyreonChartPattern { var kind: String; var color: String; var spacing: Double; var width: Double }
public struct PyreonDrawCmd { var kind: String; var rect: PyreonChartRect? = nil; var from: PyreonChartPt? = nil; var to: PyreonChartPt? = nil; var stroke: String? = nil; var width: Double? = nil; var dash: [Double]? = nil; var points: [PyreonChartPt]? = nil; var fill: String? = nil; var corners: [Double]? = nil; var grad: PyreonChartGradient? = nil; var pattern: PyreonChartPattern? = nil; var center: PyreonChartPt? = nil; var radius: Double? = nil; var text: String? = nil; var at: PyreonChartPt? = nil; var size: Double? = nil; var align: String? = nil; var baseline: String? = nil; var rotate: Double? = nil }
`

const kotlinTypes = `
data class PyreonChartPt(var x: Double, var y: Double)
data class PyreonChartRect(var x: Double, var y: Double, var w: Double, var h: Double)
data class PyreonChartGradientStop(var offset: Double, var color: String)
data class PyreonChartGradient(var from: PyreonChartPt, var to: PyreonChartPt, var stops: List<PyreonChartGradientStop>)
data class PyreonChartPattern(var kind: String, var color: String, var spacing: Double, var width: Double)
data class PyreonDrawCmd(var kind: String, var rect: PyreonChartRect? = null, var from: PyreonChartPt? = null, var to: PyreonChartPt? = null, var stroke: String? = null, var width: Double? = null, var dash: List<Double>? = null, var points: List<PyreonChartPt>? = null, var fill: String? = null, var corners: List<Double>? = null, var grad: PyreonChartGradient? = null, var pattern: PyreonChartPattern? = null, var center: PyreonChartPt? = null, var radius: Double? = null, var text: String? = null, var at: PyreonChartPt? = null, var size: Double? = null, var align: String? = null, var baseline: String? = null, var rotate: Double? = null)
`

const expected = '55.0,52.5,13.5\n2,3.0'

describe('native universal chart transition runtime', () => {
  it('emits configurable update hosts on both targets and honors the opt-out', () => {
    const source = `import { PlotChart, bars } from '@pyreon/charts/plot'
const DATA = [{ value: 1 }]
export function Demo() { return <PlotChart data={DATA} marks={[bars(d => d.value)]} updateDuration={480} universalTransition /> }`
    const swift = transform(source, { target: 'swift' })
    const kotlin = transform(source, { target: 'kotlin' })
    expect(swift.warnings).toEqual([])
    expect(kotlin.warnings).toEqual([])
    expect(swift.code).toContain('PyreonChartCanvas(cmds:')
    expect(swift.code).toContain('durationMs: 480.0, universal: true)')
    expect(kotlin.code).toContain('PyreonChartCanvas(cmds =')
    expect(kotlin.code).toContain('durationMs = 480.0, universal = true)')

    const disabled = source.replace('updateDuration={480} universalTransition', 'updateAnimation={false}')
    expect(transform(disabled, { target: 'swift' }).code).toContain('animated: false)')
    expect(transform(disabled, { target: 'kotlin' }).code).toContain('animated = false)')
  })

  it.skipIf(!isSwiftcAvailable())('executes the Swift geometry', () => {
    const output = temp('pyreon-transition-swift-', (dir) => {
      const source = `${swiftTypes}\n${range(SWIFT, 'private func pyreonChartMix', 'private struct PyreonStaticChartCanvas')}\nlet from = [PyreonDrawCmd(kind: "rect", rect: PyreonChartRect(x: 0, y: 10, w: 20, h: 30), fill: "#111")]\nlet to = [PyreonDrawCmd(kind: "circle", fill: "#222", center: PyreonChartPt(x: 100, y: 80), radius: 12)]\nlet mid = pyreonUniversalTweenChartCommands(from, to, 0.5)[0]\nprint("\\(mid.center!.x),\\(mid.center!.y),\\(mid.radius!)")\nlet a = PyreonDrawCmd(kind: "circle", fill: "#111", center: PyreonChartPt(x: 10, y: 10), radius: 8)\nlet b = PyreonDrawCmd(kind: "circle", fill: "#222", center: PyreonChartPt(x: 30, y: 30), radius: 6)\nlet removed = pyreonUniversalTweenChartCommands([a, b], [b], 0.5)\nprint("\\(removed.count),\\(removed[1].radius!)")\n`
      const file = join(dir, 'main.swift'); writeFileSync(file, source)
      execFileSync('swiftc', [file, '-o', join(dir, 'run')], { env: { ...process.env, CLANG_MODULE_CACHE_PATH: join(dir, 'clang-cache'), SWIFT_MODULECACHE_PATH: join(dir, 'swift-cache') } })
      return execFileSync(join(dir, 'run'), { encoding: 'utf8' }).trim()
    })
    expect(output).toBe(expected)
  }, 60_000)

  it.skipIf(!isKotlincAvailable())('executes the Kotlin geometry', () => {
    const output = temp('pyreon-transition-kotlin-', (dir) => {
      const source = `${kotlinTypes}\n${range(KOTLIN, 'private fun pyreonChartMix', '@Composable\nprivate fun PyreonStaticChartCanvas')}\nfun main() {\n val from = listOf(PyreonDrawCmd(kind="rect", rect=PyreonChartRect(0.0,10.0,20.0,30.0), fill="#111"))\n val to = listOf(PyreonDrawCmd(kind="circle", fill="#222", center=PyreonChartPt(100.0,80.0), radius=12.0))\n val mid=pyreonUniversalTweenChartCommands(from,to,0.5)[0]; println("${'$'}{mid.center!!.x},${'$'}{mid.center!!.y},${'$'}{mid.radius}")\n val a=PyreonDrawCmd(kind="circle",fill="#111",center=PyreonChartPt(10.0,10.0),radius=8.0); val b=PyreonDrawCmd(kind="circle",fill="#222",center=PyreonChartPt(30.0,30.0),radius=6.0)\n val removed=pyreonUniversalTweenChartCommands(listOf(a,b),listOf(b),0.5); println("${'$'}{removed.size},${'$'}{removed[1].radius}")\n}`
      const file = join(dir, 'main.kt'); writeFileSync(file, source)
      execFileSync('kotlinc', [file, '-include-runtime', '-d', join(dir, 'run.jar')])
      return execFileSync('kotlin', ['-classpath', join(dir, 'run.jar'), 'MainKt'], { encoding: 'utf8' }).trim()
    })
    expect(output).toBe(expected)
  }, 600_000)
})
