import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { mirrorCmds } from '../../../../fundamentals/charts/src/engine/rtl'
import type { DrawCmd } from '../../../../fundamentals/charts/src/engine/types'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

/**
 * A right-to-left chart is the MIRROR of its left-to-right one, and that
 * mirror exists three times: `mirrorCmds` in the web engine, and
 * `pyreonMirrorCmds` in each native runtime. It is hand-written per target
 * for the reason `pyreonShiftCmds` is — the draw command is a discriminated
 * union in TypeScript and a flat struct with optional fields on native, so the
 * web switch has no lowering.
 *
 * Three implementations of one contract is exactly the shape that drifts, and
 * the drift would be invisible: a chart that mirrors its rects but forgets a
 * rect's corner radii looks *almost* right, in one locale, on one platform.
 * So this asserts by EXECUTION. The corpus is written once, in TypeScript;
 * the Swift and Kotlin harnesses are GENERATED from that same corpus (never
 * re-typed, so they cannot disagree with it); the mirror itself is extracted
 * VERBATIM from the shipped runtime sources; and the three outputs are
 * compared number for number.
 */

const SWIFT_SRC = join(
  __dirname,
  '../../../runtime-swift/Sources/PyreonRuntime/PyreonChartCanvas.swift',
)
const KOTLIN_SRC = join(
  __dirname,
  '../../../runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonChartCanvas.kt',
)

const WIDTH = 400

/**
 * Every field the mirror touches, and the pairs it is easy to get wrong:
 * a rect (mirrored by its FAR edge), corner radii (swapped left-to-right),
 * a gradient axis, both text anchors, a rotated label, and the multi-point
 * kinds.
 */
const CORPUS: DrawCmd[] = [
  { kind: 'rect', rect: { x: 10, y: 4, w: 40, h: 20 }, fill: '#123456' },
  { kind: 'rect', rect: { x: 0, y: 0, w: 400, h: 3 }, fill: '#abcdef', corners: [1, 2, 3, 4] },
  {
    kind: 'rect',
    rect: { x: 100, y: 10, w: 25, h: 60 },
    fill: '#f00',
    grad: { from: { x: 100, y: 0 }, to: { x: 125, y: 0 }, stops: [{ offset: 0, color: '#000' }] },
  },
  { kind: 'line', from: { x: 5, y: 1 }, to: { x: 395, y: 2 }, stroke: '#0f0', width: 1.5 },
  { kind: 'polyline', points: [{ x: 12, y: 3 }, { x: 44, y: 9 }, { x: 300, y: 1 }], stroke: '#00f', width: 2 },
  { kind: 'polygon', points: [{ x: 12, y: 3 }, { x: 44, y: 9 }, { x: 300, y: 1 }], fill: '#fff' },
  { kind: 'circle', center: { x: 33.5, y: 12 }, radius: 4, fill: '#0ff' },
  { kind: 'text', text: 'Revenue', at: { x: 8, y: 20 }, fill: '#111', size: 11, align: 'start', baseline: 'top' },
  { kind: 'text', text: '1.2M', at: { x: 392, y: 20 }, fill: '#111', size: 11, align: 'end', baseline: 'middle' },
  { kind: 'text', text: 'Mon', at: { x: 60, y: 40 }, fill: '#111', size: 10, align: 'middle', baseline: 'bottom', rotate: -35 },
]

/**
 * The comparable projection of a mirrored list: every number the mirror can
 * move, plus the two strings it can flip, in a fixed order.
 *
 * Text CONTENT is included deliberately — a mirror that reversed a string
 * would be a real bug, and this is where it would show.
 */
function project(cmds: DrawCmd[]): string[] {
  const n = (v: number | undefined): string => (v === undefined ? '-' : v.toFixed(3))
  return cmds.map((c) => {
    switch (c.kind) {
      case 'rect':
        return [
          'rect',
          n(c.rect.x), n(c.rect.y), n(c.rect.w), n(c.rect.h),
          (c.corners ?? []).map(n).join('/') || '-',
          c.grad === undefined ? '-' : `${n(c.grad.from.x)}>${n(c.grad.to.x)}`,
        ].join(' ')
      case 'line':
        return ['line', n(c.from.x), n(c.from.y), n(c.to.x), n(c.to.y)].join(' ')
      case 'polyline':
      case 'polygon':
        return [c.kind, ...c.points.map((p) => `${n(p.x)},${n(p.y)}`)].join(' ')
      case 'circle':
        return ['circle', n(c.center.x), n(c.center.y), n(c.radius)].join(' ')
      case 'text':
        return ['text', c.text, n(c.at.x), n(c.at.y), c.align, n(c.rotate)].join(' ')
    }
  })
}

/** Extract a declaration range, verbatim, from a shipped runtime file. */
function extractRange(path: string, fromNeedle: string, toNeedle: string): string {
  const src = readFileSync(path, 'utf8')
  const a = src.indexOf(fromNeedle)
  expect(a, `${fromNeedle} not found in ${path}`).toBeGreaterThan(-1)
  const b = src.indexOf(toNeedle, a)
  expect(b, `${toNeedle} not found after ${fromNeedle} in ${path}`).toBeGreaterThan(-1)
  return src.slice(a, b)
}

function withTempDir<T>(prefix: string, fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** `kotlinc` ships its own compiler but running the jar needs a JVM. */
function jvmPath(): string | undefined {
  try {
    execFileSync('java', ['-version'], { stdio: 'ignore' })
    return 'java'
  } catch {
    // fall through to the off-PATH locations a developer Mac commonly uses
  }
  for (const c of [
    '/opt/homebrew/opt/openjdk/bin/java',
    '/opt/homebrew/opt/openjdk@17/bin/java',
    '/usr/bin/java',
  ]) {
    if (existsSync(c)) return c
  }
  return undefined
}

const num = (v: number): string => (Number.isInteger(v) ? `${v}.0` : `${v}`)
const pt = (p: { x: number; y: number }): string => `PyreonChartPt(x: ${num(p.x)}, y: ${num(p.y)})`
const ktPt = (p: { x: number; y: number }): string => `PyreonChartPt(${num(p.x)}, ${num(p.y)})`

/**
 * The corpus as Swift constructor calls, generated from the corpus itself.
 *
 * Fields are emitted in DECLARATION order: Swift's memberwise initialiser is
 * positional even when every argument is labelled, so a field out of order is
 * a compile error rather than a wrong value.
 */
/**
 * Read the initialiser's parameter order out of the shipped struct rather
 * than re-typing it: Swift's labelled arguments are still POSITIONAL, and
 * `PyreonDrawCmd` carries an explicit init whose order differs from its
 * field declarations. A copy here would compile today and break the day
 * someone reorders the init — which is the drift this whole file exists to
 * catch, so it should not be reintroduced by the test's own harness.
 */
function swiftFieldOrder(): string[] {
  const src = readFileSync(SWIFT_SRC, 'utf8')
  const at = src.indexOf('    public init(')
  expect(at, 'PyreonDrawCmd has no explicit init').toBeGreaterThan(-1)
  const body = src.slice(at, src.indexOf('\n    ) {', at))
  return [...body.matchAll(/^\s{8}(\w+):/gm)].map((m) => m[1]!)
}

function swiftCorpus(): string {
  const one = (c: DrawCmd): string => {
    const f = new Map<string, string>()
    f.set('kind', JSON.stringify(c.kind))
    if (c.kind === 'rect') {
      f.set('rect', `PyreonChartRect(x: ${num(c.rect.x)}, y: ${num(c.rect.y)}, w: ${num(c.rect.w)}, h: ${num(c.rect.h)})`)
      f.set('fill', JSON.stringify(c.fill))
      if (c.corners !== undefined) f.set('corners', `[${c.corners.map(num).join(', ')}]`)
      if (c.grad !== undefined) {
        const stops = c.grad.stops.map((st) => `PyreonChartGradientStop(offset: ${num(st.offset)}, color: ${JSON.stringify(st.color)})`).join(', ')
        f.set('grad', `PyreonChartGradient(from: ${pt(c.grad.from)}, to: ${pt(c.grad.to)}, stops: [${stops}])`)
      }
    } else if (c.kind === 'line') {
      f.set('from', pt(c.from)); f.set('to', pt(c.to)); f.set('stroke', JSON.stringify(c.stroke)); f.set('width', num(c.width))
    } else if (c.kind === 'polyline') {
      f.set('points', `[${c.points.map(pt).join(', ')}]`); f.set('stroke', JSON.stringify(c.stroke)); f.set('width', num(c.width))
    } else if (c.kind === 'polygon') {
      f.set('points', `[${c.points.map(pt).join(', ')}]`); f.set('fill', JSON.stringify(c.fill))
    } else if (c.kind === 'circle') {
      f.set('center', pt(c.center)); f.set('radius', num(c.radius)); f.set('fill', JSON.stringify(c.fill))
    } else {
      f.set('text', JSON.stringify(c.text)); f.set('at', pt(c.at)); f.set('fill', JSON.stringify(c.fill))
      f.set('size', num(c.size)); f.set('align', JSON.stringify(c.align)); f.set('baseline', JSON.stringify(c.baseline))
      if (c.rotate !== undefined) f.set('rotate', num(c.rotate))
    }
    const args = swiftFieldOrder().filter((k) => f.has(k)).map((k) => `${k}: ${f.get(k)!}`)
    return `PyreonDrawCmd(${args.join(', ')})`
  }
  return `[\n  ${CORPUS.map(one).join(',\n  ')},\n]`
}

/** The corpus as Kotlin constructor calls, generated from the corpus itself. */
function kotlinCorpus(): string {
  const one = (c: DrawCmd): string => {
    const f: string[] = [`kind = ${JSON.stringify(c.kind)}`]
    if (c.kind === 'rect') {
      f.push(`rect = PyreonChartRect(${num(c.rect.x)}, ${num(c.rect.y)}, ${num(c.rect.w)}, ${num(c.rect.h)})`)
      f.push(`fill = ${JSON.stringify(c.fill)}`)
      if (c.corners !== undefined) f.push(`corners = listOf(${c.corners.map(num).join(', ')})`)
      if (c.grad !== undefined) {
        const stops = c.grad.stops.map((s) => `PyreonChartGradientStop(${num(s.offset)}, ${JSON.stringify(s.color)})`).join(', ')
        f.push(`grad = PyreonChartGradient(${ktPt(c.grad.from)}, ${ktPt(c.grad.to)}, listOf(${stops}))`)
      }
    } else if (c.kind === 'line') {
      f.push(`from = ${ktPt(c.from)}`, `to = ${ktPt(c.to)}`, `stroke = ${JSON.stringify(c.stroke)}`, `width = ${num(c.width)}`)
    } else if (c.kind === 'polyline') {
      f.push(`points = listOf(${c.points.map(ktPt).join(', ')})`, `stroke = ${JSON.stringify(c.stroke)}`, `width = ${num(c.width)}`)
    } else if (c.kind === 'polygon') {
      f.push(`points = listOf(${c.points.map(ktPt).join(', ')})`, `fill = ${JSON.stringify(c.fill)}`)
    } else if (c.kind === 'circle') {
      f.push(`center = ${ktPt(c.center)}`, `radius = ${num(c.radius)}`, `fill = ${JSON.stringify(c.fill)}`)
    } else {
      f.push(`text = ${JSON.stringify(c.text)}`, `at = ${ktPt(c.at)}`, `fill = ${JSON.stringify(c.fill)}`, `size = ${num(c.size)}`, `align = ${JSON.stringify(c.align)}`, `baseline = ${JSON.stringify(c.baseline)}`)
      if (c.rotate !== undefined) f.push(`rotate = ${num(c.rotate)}`)
    }
    return `PyreonDrawCmd(${f.join(', ')})`
  }
  return `listOf(\n  ${CORPUS.map(one).join(',\n  ')},\n)`
}

/** The projection, written once per target, mirroring `project` above. */
const SWIFT_PROJECT = `
func n(_ v: Double?) -> String { v == nil ? "-" : String(format: "%.3f", v!) }
func line(_ c: PyreonDrawCmd) -> String {
    switch c.kind {
    case "rect":
        let r = c.rect!
        let cs = c.corners == nil ? "-" : c.corners!.map { n($0) }.joined(separator: "/")
        let g = c.grad == nil ? "-" : "\\(n(c.grad!.from.x))>\\(n(c.grad!.to.x))"
        return "rect \\(n(r.x)) \\(n(r.y)) \\(n(r.w)) \\(n(r.h)) \\(cs) \\(g)"
    case "line":
        return "line \\(n(c.from!.x)) \\(n(c.from!.y)) \\(n(c.to!.x)) \\(n(c.to!.y))"
    case "polyline", "polygon":
        return c.kind + " " + c.points!.map { "\\(n($0.x)),\\(n($0.y))" }.joined(separator: " ")
    case "circle":
        return "circle \\(n(c.center!.x)) \\(n(c.center!.y)) \\(n(c.radius))"
    default:
        return "text \\(c.text!) \\(n(c.at!.x)) \\(n(c.at!.y)) \\(c.align!) \\(n(c.rotate))"
    }
}
`

const KOTLIN_PROJECT = `
fun n(v: Double?): String = if (v == null) "-" else String.format("%.3f", v)
fun line(c: PyreonDrawCmd): String = when (c.kind) {
    "rect" -> {
        val r = c.rect!!
        val cs = c.corners?.joinToString("/") { n(it) } ?: "-"
        val g = c.grad?.let { "\${n(it.from.x)}>\${n(it.to.x)}" } ?: "-"
        "rect \${n(r.x)} \${n(r.y)} \${n(r.w)} \${n(r.h)} $cs $g"
    }
    "line" -> "line \${n(c.from!!.x)} \${n(c.from!!.y)} \${n(c.to!!.x)} \${n(c.to!!.y)}"
    "polyline", "polygon" -> c.kind + " " + c.points!!.joinToString(" ") { "\${n(it.x)},\${n(it.y)}" }
    "circle" -> "circle \${n(c.center!!.x)} \${n(c.center!!.y)} \${n(c.radius)}"
    else -> "text \${c.text} \${n(c.at!!.x)} \${n(c.at!!.y)} \${c.align} \${n(c.rotate)}"
}
`

describe('pyreonMirrorCmds — parity with the web engine mirror', () => {
  /**
   * The always-running half. It cannot prove parity, but it refuses the two
   * mistakes that make a mirror look right and be wrong: mirroring a rect by
   * its NEAR edge (which shifts every rect by its own width) and forgetting
   * that corner radii and text anchors have a left and a right.
   */
  it('both runtimes mirror the rect by its far edge and flip the sided fields', () => {
    for (const [path, needle] of [
      [SWIFT_SRC, 'public func pyreonMirrorCmds'],
      [KOTLIN_SRC, 'fun pyreonMirrorCmds'],
    ] as const) {
      const src = readFileSync(path, 'utf8')
      const at = src.indexOf(needle)
      expect(at, `${needle} missing from ${path}`).toBeGreaterThan(-1)
      const body = src.slice(at, at + 1400)
      expect(body, `${needle} must mirror a rect by x + w`).toMatch(/mx\((?:it|r)\.x \+ (?:it|r)\.w\)/)
      expect(body, `${needle} must swap corner radii`).toContain('corners')
      expect(body, `${needle} must flip the text anchor`).toContain('"start"')
    }
  })

  it.skipIf(!isSwiftcAvailable())('the SHIPPED Swift mirror matches, executed', () => {
    const got = withTempDir('pyreon-mirror-swift-', (dir) => {
      const harness = `import Foundation

${extractRange(SWIFT_SRC, 'public struct PyreonChartPt', '/// Text width in engine units')}
${extractRange(SWIFT_SRC, 'public func pyreonMirrorCmds', 'public func pyreonChartColor')}
${SWIFT_PROJECT}
let corpus: [PyreonDrawCmd] = ${swiftCorpus()}
print(pyreonMirrorCmds(corpus, ${num(WIDTH)}).map { line($0) }.joined(separator: "\\n"))
`
      writeFileSync(join(dir, 'main.swift'), harness)
      execFileSync('swiftc', ['-O', join(dir, 'main.swift'), '-o', join(dir, 'run')], { stdio: 'pipe' })
      return execFileSync(join(dir, 'run'), { encoding: 'utf8' }).trimEnd().split('\n')
    })
    expect(got).toEqual(project(mirrorCmds(CORPUS, WIDTH)))
  })

  it.skipIf(!isKotlincAvailable() || jvmPath() === undefined)(
    'the SHIPPED Kotlin mirror matches, executed',
    () => {
      const got = withTempDir('pyreon-mirror-kotlin-', (dir) => {
        const harness = `${extractRange(KOTLIN_SRC, 'data class PyreonChartPt', '/**\n * Parse the engine')}
${extractRange(KOTLIN_SRC, 'fun pyreonMirrorCmds', '/**\n * A Compose brush')}
${KOTLIN_PROJECT}
fun main() {
  val corpus: List<PyreonDrawCmd> = ${kotlinCorpus()}
  println(pyreonMirrorCmds(corpus, ${num(WIDTH)}).joinToString("\\n") { line(it) })
}
`
        writeFileSync(join(dir, 'main.kt'), harness)
        execFileSync('kotlinc', [join(dir, 'main.kt'), '-include-runtime', '-d', join(dir, 'out.jar')], { stdio: 'pipe' })
        return execFileSync(jvmPath()!, ['-jar', join(dir, 'out.jar')], { encoding: 'utf8' })
          .trimEnd()
          .split('\n')
      })
      expect(got).toEqual(project(mirrorCmds(CORPUS, WIDTH)))
    },
    600_000,
  )
})
