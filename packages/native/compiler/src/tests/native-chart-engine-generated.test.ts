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
//
// Bisect-load-bearing: hand-edit a byte of either committed file → spec 1
// fails; revert the canvas full init → spec 2 fails with "extra argument in
// call"; narrow an extracted data class → spec 3 fails.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildChartEngine } from '../../scripts/gen-chart-engine'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../../../..')
const read = (p: string) => readFileSync(join(REPO, p), 'utf8')

const SWIFT_OUT = 'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonChartEngine.swift'
const KOTLIN_OUT = 'packages/native/runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonChartEngine.kt'
const CANVAS_SWIFT = 'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonChartCanvas.swift'
const CANVAS_KT = 'packages/native/runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonChartCanvas.kt'

describe('native chart engine — generated, drift-locked, compile-proven', () => {
  it('committed files are byte-identical to a fresh generation', () => {
    const { swift, kotlin } = buildChartEngine(REPO)
    const hint = 'regenerate: bun packages/native/compiler/scripts/gen-chart-engine.ts'
    expect(read(SWIFT_OUT), hint).toBe(swift)
    expect(read(KOTLIN_OUT), hint).toBe(kotlin)
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
    const r = validateSwiftTypecheck(read(CANVAS_SWIFT) + '\n' + read(SWIFT_OUT))
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Android: engine compiles with the canvas-owned types (verbatim)', () => {
    const canvas = read(CANVAS_KT)
    const decls: string[] = []
    for (const name of ['PyreonChartPt', 'PyreonChartRect', 'PyreonDrawCmd']) {
      const m = canvas.match(new RegExp(`data class ${name}\\([^)]*\\)`))
      expect(m, `${name} declaration in PyreonChartCanvas.kt`).not.toBeNull()
      decls.push(m![0])
    }
    const engineBody = read(KOTLIN_OUT)
      .split('\n')
      .filter((l) => !l.startsWith('package '))
      .join('\n')
    const r = validateKotlin(decls.join('\n') + '\n' + engineBody)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
