/**
 * The type-gate stubs a `@pyreon/charts` host emit needs, and the augmentation
 * that appends them (plus the REAL generated engine) to the compile gates'
 * stub bundle — only for the inputs that name `PyreonChartCanvas(`.
 *
 * An emitted `<SankeyChart>` names the GENERATED engine (`layoutSankey` /
 * `renderSankey` / the family structs) and the runtime's `PyreonChartCanvas`.
 * The engine is generated from the charts sources, so a hand-written stub of it
 * would be the drift-prone copy the stub-fidelity rule forbids; instead the
 * bundle pulls in the REAL committed engine plus the canvas-owned draw-list
 * types extracted VERBATIM (exactly how native-chart-engine-generated.test.ts
 * compiles them), and stubs only the views the engine never declares
 * (GeometryReader, PyreonChartCanvas). Outside the monorepo the runtime files are
 * absent: the view stubs still apply and the engine symbols are reported
 * missing — a loud outcome, never a silent pass.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { StubAugmentation } from '@pyreon/native-compiler/plugin-api'

/**
 * The two views a `@pyreon/charts` host emit needs that the generated
 * engine never declares. validate.ts appends the REAL engine + canvas types
 * next to this when a chart host is present; the view stubs live here so the
 * stub-coverage ratchet counts `PyreonChartCanvas` as covered. The init
 * mirrors runtime-swift `PyreonChartCanvas.swift` exactly.
 */
export const SWIFT_CHART_VIEW_STUBS = `
// ---- @pyreon/charts hosts (hosts.ts emit) ----
public struct GeometryProxy { public var size: CGSize = CGSize() }
public func pyreonChartDataUrl(_ cmds: [PyreonDrawCmd], _ width: Double, _ height: Double) -> String { "" }
public func pyreonShareChartImage(_ cmds: [PyreonDrawCmd], _ width: Double, _ height: Double, _ name: String) {}
public final class PyreonChartHandle {
  public var zoom = ZoomWindow(start: 0.0, end: 1.0)
  public var hover: Int = -1
  public var selected: [Int] = []
  public var hidden: [Int] = []
  public var seriesCount: Int = 0
  public var brushType: String = ""
  public var areas: [BrushArea] = []
  public init(seriesCount: Int = 0) { self.seriesCount = seriesCount }
  public func dispatch(_ action: ChartActionInput) {}
}
public struct GeometryReader<Content: View>: View {
  public init(@ViewBuilder content: @escaping (GeometryProxy) -> Content) {}
  public typealias Body = Never
}
public struct PyreonChartCanvas: View {
  public var cmds: [PyreonDrawCmd]
  public var fontFamily: String?
  public var durationMs: Double
  public var universal: Bool
  public var animated: Bool
  public init(cmds: [PyreonDrawCmd], durationMs: Double = 350.0, universal: Bool = false, animated: Bool = true, fontFamily: String? = nil) { self.cmds = cmds; self.fontFamily = fontFamily; self.durationMs = durationMs; self.universal = universal; self.animated = animated }
  public var body: some View { EmptyView() }
}
public func pyreonChartColor(_ s: String) -> Color { Color.clear }
public func pyreonLocaleNumberFormatter(_ tag: String) -> (Double) -> String { { String($0) } }
public func pyreonLocaleDateFormatter(_ tag: String) -> (Double) -> String { { String($0) } }
public func pyreonTransposeCmds(_ cmds: [PyreonDrawCmd]) -> [PyreonDrawCmd] { cmds }
public func pyreonMirrorCmds(_ cmds: [PyreonDrawCmd], _ width: Double) -> [PyreonDrawCmd] { cmds }
public struct PyreonChartEntrance<Content: View>: View {
  public init(durationMs: Double, @ViewBuilder content: @escaping (Double) -> Content) {}
  public typealias Body = Never
}
public struct PyreonChartClock<Content: View>: View {
  public init(@ViewBuilder content: @escaping (Double) -> Content) {}
  public typealias Body = Never
}
// Mirrors runtime-swift PyreonChartDescriptor.swift: VoiceOver's chart data.
public struct PyreonChartDescriptor {
  public let input: A11yInput
  public init(_ input: A11yInput) { self.input = input }
}
extension View {
  public func accessibilityChartDescriptor(_ descriptor: PyreonChartDescriptor) -> some View { self }
}
`

/**
 * The Compose canvas (+ the two runtime helpers the chart hosts call) for a
 * `@pyreon/charts` host emit; validate.ts appends the REAL engine and
 * draw-list data classes next to this. Lives here so the stub-coverage
 * ratchet counts `PyreonChartCanvas` as covered. The signature mirrors
 * runtime-kotlin `PyreonChartCanvas.kt` exactly.
 */
export const KOTLIN_CHART_VIEW_STUBS = `
// ---- @pyreon/charts hosts (hosts.ts emit) ----
@Composable
@Suppress("UNUSED_PARAMETER")
fun PyreonChartCanvas(cmds: List<PyreonDrawCmd>, modifier: Modifier = Modifier, durationMs: Double = 350.0, universal: Boolean = false, animated: Boolean = true) {}
@Composable
fun PyreonChartEntrance(durationMs: Double, content: @Composable (Double) -> Unit) { content(1.0) }
@Composable
@Suppress("UNUSED_PARAMETER")
fun PyreonChartPoints(input: A11yInput, plot: PyreonChartRect, visible: Long, first: Long = 0L, horizontal: Boolean = false, left: Double = 0.0, top: Double = 0.0, mirrorWidth: Double = -1.0) {}
@Composable
fun PyreonChartClock(content: @Composable (Double) -> Unit) { content(0.0) }
fun pyreonChartMeasure(text: String, size: Double): Double = text.length * size * 0.6
fun pyreonChartColor(s: String): Color = Color(0)
fun pyreonShiftCmds(cmds: List<PyreonDrawCmd>, dy: Double): List<PyreonDrawCmd> = cmds
fun pyreonShiftCmdsXY(cmds: List<PyreonDrawCmd>, dx: Double, dy: Double): List<PyreonDrawCmd> = cmds
fun pyreonTransposeCmds(cmds: List<PyreonDrawCmd>): List<PyreonDrawCmd> = cmds
fun pyreonMirrorCmds(cmds: List<PyreonDrawCmd>, width: Double): List<PyreonDrawCmd> = cmds
fun pyreonChartDouble(v: Double): Double = v
fun pyreonChartDouble(v: Int): Double = v.toDouble()
fun pyreonChartDouble(v: Long): Double = v.toDouble()
fun pyreonChartString(v: String): String = v
fun pyreonChartString(v: Double): String = ""
fun pyreonChartString(v: Int): String = ""
fun pyreonChartString(v: Long): String = ""
fun pyreonLocaleNumberFormatter(tag: String): (Double) -> String = { it.toString() }
fun pyreonLocaleDateFormatter(tag: String): (Double) -> String = { it.toString() }
fun pyreonChartDataUrl(cmds: List<PyreonDrawCmd>, width: Double, height: Double, density: Float): String = ""
fun pyreonShareChartImage(context: Context, cmds: List<PyreonDrawCmd>, width: Double, height: Double, density: Float, name: String) {}
class PyreonChartHandle {
  var zoom: ZoomWindow = ZoomWindow(start = 0.0, end = 1.0)
  var hover: Long = -1L
  var selected: List<Long> = listOf()
  var hidden: List<Long> = listOf()
  var seriesCount: Long = 0L
  var brushType: String = ""
  var areas: List<BrushArea> = listOf()
  fun dispatch(action: ChartActionInput) {}
}
`

const CHART_HOST_MARK = /\bPyreonChartCanvas\(/
// The runtime sources sit at a different depth from the built `lib/` than from `src/`, so try both.
const MODULE_DIR = dirname(fileURLToPath(import.meta.url))
const NATIVE_PACKAGES_DIRS = [join(MODULE_DIR, '..', '..', '..', '..', 'native'), join(MODULE_DIR, '..', '..', '..', 'native')]
// The runtime files' own imports are stubbed in the gate (the emit's are stripped the same way).
const SWIFT_STUBBED_IMPORTS = /^import (?:SwiftUI|PyreonRuntime|PyreonRouter)\s*$/gm

function readRuntimeFile(relative: string): string | undefined {
  for (const dir of NATIVE_PACKAGES_DIRS) {
    try {
      return readFileSync(join(dir, relative), 'utf8')
    } catch {
      // Not at this depth — try the other.
    }
  }
  return undefined
}

/** The Swift stub text a chart-host emit needs beyond the SwiftUI bundle; `''` when no host is present. */
export function swiftChartAugmentation(source: string): string {
  if (!CHART_HOST_MARK.test(source)) return ''
  const canvas = readRuntimeFile('runtime-swift/Sources/PyreonRuntime/PyreonChartCanvas.swift')
  const engine = readRuntimeFile('runtime-swift/Sources/PyreonRuntime/PyreonChartEngine.swift')
  if (canvas === undefined || engine === undefined) return SWIFT_CHART_VIEW_STUBS
  const start = canvas.indexOf('public struct PyreonChartPt')
  const end = canvas.indexOf('/// Parse the engine')
  const types = start >= 0 && end > start ? canvas.slice(start, end) : ''
  // The extracted canvas section owns the real locale helpers. Keep their tiny
  // fallback declarations only when the runtime source is absent; concatenating
  // both made every unrelated chart-host swiftc test fail with redeclarations.
  const viewStubs = SWIFT_CHART_VIEW_STUBS
    .replace('public func pyreonLocaleNumberFormatter(_ tag: String) -> (Double) -> String { { String($0) } }\n', '')
    .replace('public func pyreonLocaleDateFormatter(_ tag: String) -> (Double) -> String { { String($0) } }\n', '')
  return viewStubs + '\n' + types + '\n' + engine.replace(SWIFT_STUBBED_IMPORTS, '')
}

/**
 * The `data class Pyreon…(…)` declarations of the Kotlin chart canvas, verbatim.
 * Comments are stripped first: the match ends at the first `)`, so a doc
 * comment with a parenthesis in it would cut a class short mid-parameter-list.
 */
export function kotlinCanvasDataClasses(canvas: string): string[] {
  const code = canvas.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  return [...code.matchAll(/data class Pyreon\w+\([^)]*\)/g)].map((m) => m[0])
}

/** The Kotlin stub text a chart-host emit needs beyond the Compose bundle; `''` when no host is present. */
export function kotlinChartAugmentation(source: string): string {
  if (!CHART_HOST_MARK.test(source)) return ''
  const canvas = readRuntimeFile('runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonChartCanvas.kt')
  const engine = readRuntimeFile('runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonChartEngine.kt')
  if (canvas === undefined || engine === undefined) return KOTLIN_CHART_VIEW_STUBS
  const decls = kotlinCanvasDataClasses(canvas)
  const body = engine
    .split('\n')
    .filter((l) => !l.startsWith('package '))
    .join('\n')
  return '\n' + decls.join('\n') + '\n' + KOTLIN_CHART_VIEW_STUBS + '\n' + body
}

/** The plugin's `stubs`: appended to the compile gates' bundle by a caller that passes it as `ValidateOptions.augment`. */
export const chartsStubs: StubAugmentation = Object.freeze({
  swift: swiftChartAugmentation,
  kotlin: kotlinChartAugmentation,
})
