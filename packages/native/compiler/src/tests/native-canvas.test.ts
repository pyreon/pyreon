// `<Canvas>` + its shape primitives — the drawing half of #3985.
//
// Locks the emit shape on both targets (the runtime path builders, the paint
// defaults shared with the web impl, numeric conversions), that shapes compose
// with `<For>` and signal-driven props, and that the emit compiles against the
// stubs. The real-SDK + real-runtime compile is real-runtime-typecheck.test.ts
// over fixtures/every-primitive.tsx, which carries a full <Canvas>; the SVG
// path parser iOS needs is unit-tested in runtime-swift (PyreonCanvasTests).

import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const SRC = `import { signal } from '@pyreon/reactivity'
import { For } from '@pyreon/core'
import { Canvas, CanvasRect, CanvasCircle, CanvasLine, CanvasPath, CanvasText } from '@pyreon/primitives'
export function Plan() {
  const w = signal(120)
  const d = signal('M10 10 L200 10 L200 200 Z')
  const seats = signal([{ id: 1, x: 10 }, { id: 2, x: 30 }])
  return (
    <Canvas width={800} height={600} background="surface" data-testid="plan">
      <CanvasRect x={40} y={40} width={w()} height={80} radius={8} fill="primary" />
      <CanvasPath d={d()} stroke="text" strokeWidth={2} />
      <CanvasCircle cx={300} cy={300} r={20} fill="#ff0000" stroke="danger" />
      <CanvasLine x1={0} y1={0} x2={100} y2={-5} />
      <For each={seats()} by={(s) => s.id}>{(s) => <CanvasCircle cx={s.x} cy={50} r={4} />}</For>
      <CanvasText x={10} y={10} size={18}>Hall {w()}</CanvasText>
    </Canvas>
  )
}`

const swift = transform(SRC, { target: 'swift' })
const kotlin = transform(SRC, { target: 'kotlin' })

describe('<Canvas> emit', () => {
  it('emits no warnings for the canonical shape', () => {
    expect(swift.warnings).toEqual([])
    expect(kotlin.warnings).toEqual([])
  })

  it('Canvas: the runtime surface with Double sizes and the generic tail', () => {
    expect(swift.code).toContain('PyreonCanvas(width: 800, height: 600) {')
    expect(swift.code).toContain('.background(Color(red: 1, green: 1, blue: 1)).accessibilityElement(children: .contain).accessibilityIdentifier("plan")')
    expect(kotlin.code).toContain('PyreonCanvas(width = 800.0, height = 600.0, modifier = Modifier.background(Color(0xFFFFFFFF)).testTag("plan")) {')
  })

  it('shapes: one path builder each, numeric expressions converted', () => {
    expect(swift.code).toContain('PyreonShape(PyreonCanvasPath.rect(x: 40, y: 40, width: Double(w), height: 80, radius: 8), fill: Color(red: 0.1450980392156863')
    expect(swift.code).toContain('PyreonShape(PyreonCanvasPath.svg(d), fill: nil, stroke: Color(')
    expect(kotlin.code).toContain('PyreonShape(PyreonShapeSpec.Rect(40.0, 40.0, (w).toDouble(), 80.0, 8.0), fill = Color(0xFF2563EB), stroke = null, strokeWidth = 0.0)')
    expect(kotlin.code).toContain('PyreonShape(PyreonShapeSpec.Svg(d), fill = null, stroke = Color(0xFF111827), strokeWidth = 2.0)')
  })

  it('paint: hex parses, stroke defaults to width 1, a line is stroke-only, unpainted fills with text', () => {
    expect(swift.code).toContain('fill: Color(.sRGB, red: 1.000, green: 0.000, blue: 0.000, opacity: 1.000), stroke: Color(red: 0.8627')
    expect(kotlin.code).toContain('PyreonShapeSpec.Circle(300.0, 300.0, 20.0), fill = Color(0xFFFF0000), stroke = Color(0xFFDC2626), strokeWidth = 1.0)')
    expect(kotlin.code).toContain('PyreonShapeSpec.Line(0.0, 0.0, 100.0, -5.0), fill = null, stroke = Color(0xFF111827), strokeWidth = 1.0)')
    // The <For> seat circle has no paint: filled with the `text` colour.
    expect(kotlin.code).toContain('PyreonShapeSpec.Circle((s.x).toDouble(), 50.0, 4.0), fill = Color(0xFF111827), stroke = null, strokeWidth = 0.0)')
  })

  it('shapes compose with <For>', () => {
    expect(swift.code).toMatch(/ForEach\([\s\S]*PyreonCanvasPath\.circle\(cx: Double\(s\.x\)/)
  })

  it('CanvasText wraps the ordinary Text emit', () => {
    expect(swift.code).toMatch(/PyreonCanvasText\(x: 10, y: 10, size: 18, color: Color\([^)]*\)\) \{\s+Text\(verbatim: "Hall \\\(w\)"\)/)
    expect(kotlin.code).toMatch(/PyreonCanvasText\(x = 10\.0, y = 10\.0, size = 18\.0, color = Color\(0xFF111827\)\) \{\s+Text\(text = "Hall \$\{w\}"\)/)
  })

  it.skipIf(!isSwiftcAvailable())('Swift emit type-checks against the stubs', () => {
    const res = validateSwiftWithStubs(swift.code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin emit compiles on kotlinc', () => {
    const res = validateKotlin(kotlin.code)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})

describe('<Canvas> diagnostics', () => {
  const one = (el: string) => `import { Canvas, CanvasRect, CanvasPath } from '@pyreon/primitives'
export function C() { return <Canvas width={10} height={10}>${el}</Canvas> }`

  it('names a missing required prop and draws with 0', () => {
    const out = transform(one('<CanvasRect x={1} y={1} width={2} />'), { target: 'kotlin' })
    expect(out.warnings.some((w) => w.includes('<CanvasRect> is missing its required `height`'))).toBe(true)
    expect(out.code).toContain('PyreonShapeSpec.Rect(1.0, 1.0, 2.0, 0.0, 0.0)')
  })

  it('names a colour that is neither a token nor #hex', () => {
    const out = transform(one('<CanvasRect x={1} y={1} width={2} height={2} fill="tomato" />'), { target: 'swift' })
    expect(out.warnings.some((w) => w.includes('<CanvasRect fill="tomato">'))).toBe(true)
  })

  it('a two-literal ternary colour is reactive on both targets', () => {
    const src = `import { signal } from '@pyreon/reactivity'
import { Canvas, CanvasRect } from '@pyreon/primitives'
export function C() {
  const on = signal(false)
  return <Canvas width={10} height={10}><CanvasRect x={0} y={0} width={5} height={5} fill={on() ? 'success' : 'danger'} /></Canvas>
}`
    expect(transform(src, { target: 'swift' }).code).toMatch(/fill: \(on \? Color\(red: 0\.08[\d.]*, green: 0\.6[\d.]*, blue: 0\.29[\d.]*\) : Color\(red: 0\.86/)
    expect(transform(src, { target: 'kotlin' }).code).toContain('fill = (if (on) Color(0xFF16A34A) else Color(0xFFDC2626))')
  })

  it('a missing d draws nothing, with a warning', () => {
    const out = transform(one('<CanvasPath stroke="text" />'), { target: 'swift' })
    expect(out.warnings.some((w) => w.includes('<CanvasPath> is missing its required `d`'))).toBe(true)
    expect(out.code).toContain('PyreonCanvasPath.svg("")')
  })
})
