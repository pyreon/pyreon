// The committed native chart engine is GENERATED — this locks three things:
//
//   1. DRIFT: regenerating from the charts engine sources reproduces the
//      committed PyreonChartEngine.swift/.kt byte-for-byte (an engine edit
//      without regeneration, or a compiler change that moves the emit, fails
//      here naming the regenerate command). The builder THROWS on any
//      transform warning, so byte-equality also proves zero-warning emit —
//      a warning is a silently-gutted function (the arcPolygon/logTicks
//      class).
//   2. iOS: the generated engine typechecks TOGETHER with the runtime's
//      hand-written PyreonChartCanvas.swift — the canvas owns Pt/Rect/
//      DrawCmd and its full defaulted-parameter PyreonDrawCmd init must
//      accept every named-subset construction the emit produces, in the
//      synthesized field order.
//   3. Android: the generated engine compiles with the canvas-owned data
//      classes extracted VERBATIM from PyreonChartCanvas.kt (never re-typed
//      — a re-typed shim drifts; see the stub-fidelity rule).
//   4. ZERO WARNINGS: both Swift runtime packages (`swift build
//      --build-tests`) and the generated Kotlin engine (kotlinc WITHOUT
//      `-nowarn`) compile with no warning in Pyreon's own files. Every app
//      that links the runtime compiles the engine, so an emitter that leaves
//      a dead guard or a redundant conversion puts the warning in every
//      user's build log. The warnings are read from the output and filtered
//      to the packages' own paths — no `-warnings-as-errors`, which would
//      reach dependencies (and `unsafeFlags` in Package.swift would break
//      SwiftPM consumers).
//
// Bisect-load-bearing: hand-edit a byte of either committed file → spec 1
// fails; revert the canvas full init → spec 2 fails with "extra argument in
// call"; narrow an extracted data class → spec 3 fails; put back the
// one-parameter `onChange(of:)` in PyreonChartCanvas.swift or any emitter
// fix of the zero-warning PR (and regenerate) → spec 4 fails naming the line.

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildChartEngine, buildChartEngineStructs } from '../../../../fundamentals/charts/scripts/gen-native-engine'
import { validateKotlin } from './charts-plugin'
import { isKotlincAvailable, isSwiftUIAvailable, validateSwiftTypecheck } from '../validate'
import { kotlinCanvasDataClasses } from '../../../../fundamentals/charts/src/native-plugin/stubs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../../../..')
const read = (p: string) => readFileSync(join(REPO, p), 'utf8')

const SWIFT_OUT = 'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonChartEngine.swift'
const KOTLIN_OUT = 'packages/native/runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonChartEngine.kt'
const CANVAS_SWIFT = 'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonChartCanvas.swift'
const CANVAS_KT = 'packages/native/runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonChartCanvas.kt'
// The engine prints numbers through the runtime's JS-faithful formatter.
const NUMBER_SWIFT = 'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonNumber.swift'
const NUMBER_KT = 'packages/native/runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonNumber.kt'
// ...and slices with a runtime bound through its JS-faithful `pyreonSlice`.
const SLICE_SWIFT = 'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonSlice.swift'
const SLICE_KT = 'packages/native/runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonSlice.kt'
/** An ANSI colour sequence (swift build colours its diagnostics). Built from the code point: a literal ESC in a regex trips no-control-regex. */
const ANSI_ESCAPE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')
const withoutPackage = (code: string): string =>
  code
    .split('\n')
    .filter((l) => !l.startsWith('package '))
    .join('\n')

describe('native chart engine — generated, drift-locked, compile-proven', () => {
  it('committed files are byte-identical to a fresh generation', () => {
    const { swift, kotlin } = buildChartEngine(REPO)
    const hint = 'regenerate: bun packages/fundamentals/charts/scripts/gen-native-engine.ts'
    expect(read(SWIFT_OUT), hint).toBe(swift)
    expect(read(KOTLIN_OUT), hint).toBe(kotlin)
  })

  it('the compiler-side struct registry is byte-identical to a fresh generation and names the runtime types', () => {
    const fresh = buildChartEngineStructs(REPO)
    expect(read('packages/fundamentals/charts/src/native-plugin/engine-structs.ts'), 'regenerate: bun packages/fundamentals/charts/scripts/gen-native-engine.ts').toBe(fresh)
    expect(fresh).toContain('"name": "SankeyNode"')
    expect(fresh).toContain('"name": "PyreonDrawCmd"')
    expect(fresh).not.toMatch(/"name": "(?:Pt|Rect|DrawCmd)"/)
  })

  it('the generated engine references the runtime draw-list types, never its own', () => {
    for (const p of [SWIFT_OUT, KOTLIN_OUT]) {
      const code = read(p)
        .split('\n')
        .filter((l) => !l.startsWith('//'))
        .join('\n')
      expect(code, p).not.toMatch(/\b(?:struct|data class) (?:Pt|Rect|DrawCmd)\b/)
      expect(code, p).toContain('PyreonDrawCmd(')
    }
  })

  it.skipIf(!isSwiftUIAvailable())('iOS: canvas + engine typecheck as one unit', () => {
    const r = validateSwiftTypecheck(read(CANVAS_SWIFT) + '\n' + read(NUMBER_SWIFT) + '\n' + read(SLICE_SWIFT) + '\n' + read(SWIFT_OUT))
    expect(r.ok, r.error ?? '').toBe(true)
  }, 30_000)

  it.skipIf(!isSwiftUIAvailable())('iOS: both Swift runtime packages build with ZERO warnings', () => {
    for (const pkg of ['runtime-swift', 'router-swift']) {
      const dir = join(REPO, 'packages/native', pkg)
      const scratch = mkdtempSync(join(tmpdir(), `pyreon-${pkg}-warnings-`))
      try {
        const r = spawnSync('swift', ['build', '--build-tests', '--scratch-path', scratch], { cwd: dir, encoding: 'utf8' })
        const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.replace(ANSI_ESCAPE, '')
        expect(r.status, `${pkg}: swift build failed\n${out.slice(-4000)}`).toBe(0)
        const own = [...new Set(out.split('\n').filter((l) => l.startsWith(`${dir}/`) && /: warning: /.test(l)))]
        expect(own, `${pkg}: swift build printed warnings in the package's own files`).toEqual([])
      } finally {
        rmSync(scratch, { recursive: true, force: true })
      }
    }
  }, 900_000)

  it.skipIf(!isKotlincAvailable())('Android: the generated engine compiles with ZERO kotlinc warnings', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-engine-kt-warnings-'))
    try {
      const support = join(dir, 'Support.kt')
      const engine = join(dir, 'PyreonChartEngine.kt')
      writeFileSync(
        support,
        kotlinCanvasDataClasses(read(CANVAS_KT)).join('\n') + '\n' + withoutPackage(read(NUMBER_KT)) + '\n' + withoutPackage(read(SLICE_KT)),
      )
      writeFileSync(engine, withoutPackage(read(KOTLIN_OUT)))
      const r = spawnSync('kotlinc', ['-d', join(dir, 'out'), support, engine], { encoding: 'utf8' })
      expect(r.status, r.stderr).toBe(0)
      const warnings = (r.stderr ?? '').split('\n').filter((l) => /: warning: /.test(l))
      expect(warnings, 'kotlinc warnings in the generated engine or the runtime files it compiles with').toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 300_000)

  it.skipIf(!isKotlincAvailable())('Android: engine compiles with the canvas-owned types (verbatim)', () => {
    const canvas = read(CANVAS_KT)
    const decls = kotlinCanvasDataClasses(canvas)
    // Derived, not listed — a hand list is how the gradient types came back
    // `unresolved reference`. The three originals must still be among them.
    for (const name of ['PyreonChartPt', 'PyreonChartRect', 'PyreonDrawCmd']) {
      expect(decls.some((d) => d.startsWith(`data class ${name}(`)), `${name} in PyreonChartCanvas.kt`).toBe(true)
    }
    const engineBody = read(KOTLIN_OUT)
      .split('\n')
      .filter((l) => !l.startsWith('package '))
      .join('\n')
    const r = validateKotlin(decls.join('\n') + '\n' + withoutPackage(read(NUMBER_KT)) + '\n' + withoutPackage(read(SLICE_KT)) + '\n' + engineBody)
    expect(r.ok, r.error ?? '').toBe(true)
  }, 90_000)
})
