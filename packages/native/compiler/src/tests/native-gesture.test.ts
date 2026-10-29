// `<Gesture>` (continuous pan / pinch / rotate) + the transform props.
//
// Locks three things that are each invisible elsewhere:
//   1. the EMIT SHAPE on both targets (`PyreonGesture(onPan:…)` + its typed
//      handler closures, and the transform modifiers in their fixed order);
//   2. the TYPING of the handler parameter — without it `x.set(e.dx)` leaves
//      `x` an Int receiving a Double, an uncompilable line on both targets
//      from the most ordinary gesture handler there is;
//   3. that the emit COMPILES against the stubs on both toolchains (the real
//      SDK + real runtime compile is `real-runtime-typecheck.test.ts`, over
//      `fixtures/every-primitive.tsx`, which carries a <Gesture>).
//
// Device proof: examples/native-tasks-* (XCUITest pinch/drag, Compose
// performTouchInput) — see the toolkit gesture section.

import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const SRC = `import { signal } from '@pyreon/reactivity'
import { Gesture, Stack, Text } from '@pyreon/primitives'
export function Plan() {
  const zoom = signal(1)
  const base = signal(1)
  const x = signal(0)
  const y = signal(0)
  const turn = signal(0)
  const phase = signal('idle')
  return (
    <Gesture
      data-testid="plan"
      onPan={(e) => { x.set(e.dx); y.set(e.dy); phase.set(e.phase) }}
      onPinch={(e) => {
        zoom.set(base() * e.scale)
        if (e.phase === 'end') base.set(zoom())
      }}
      onRotate={(e) => turn.set(e.degrees)}
    >
      <Stack translateX={x()} translateY={y()} scale={zoom()} rotate={turn()}>
        <Text>{phase()}</Text>
      </Stack>
    </Gesture>
  )
}`

const swift = transform(SRC, { target: 'swift' })
const kotlin = transform(SRC, { target: 'kotlin' })

describe('<Gesture> emit', () => {
  it('emits no warnings for the canonical shape', () => {
    expect(swift.warnings).toEqual([])
    expect(kotlin.warnings).toEqual([])
  })

  it('Swift: PyreonGesture with one typed closure per handler, in a fixed order', () => {
    expect(swift.code).toMatch(/PyreonGesture\(onPan: \{ e in\s+x = e\.dx\s+y = e\.dy\s+phase = e\.phase/)
    expect(swift.code).toMatch(/onPinch: \{ e in\s+zoom = base \* e\.scale\s+if e\.phase == "end"/)
    expect(swift.code).toContain('onRotate: { e in turn = e.degrees })')
    // The region is a container: SwiftUI flattens it, so the testid needs `.contain`.
    expect(swift.code).toContain('.accessibilityElement(children: .contain).accessibilityIdentifier("plan")')
  })

  it('Kotlin: PyreonGesture with named lambdas and the region modifier', () => {
    expect(kotlin.code).toMatch(/PyreonGesture\(onPan = \{ e ->\s+x = e\.dx/)
    expect(kotlin.code).toContain('onRotate = { e -> turn = e.degrees }')
    expect(kotlin.code).toContain('modifier = Modifier.testTag("plan")) {')
  })

  it('types the handler parameter, so a signal written e.dx widens to Double', () => {
    // The whole reason gesture-events.ts exists. Before it, every one of these
    // was `Int` / `0L` and received a Double.
    for (const name of ['zoom', 'base', 'x', 'y', 'turn']) {
      expect(swift.code).toMatch(new RegExp(`@State private var ${name}: Double = [01]\\.0`))
      expect(kotlin.code).toMatch(new RegExp(`var ${name} by remember \\{ mutableStateOf\\([01]\\.0\\) \\}`))
    }
    expect(swift.code).toContain('@State private var phase: String = "idle"')
  })

  it('transform props: Swift rotate → scale → offset, each value converted', () => {
    expect(swift.code).toContain(
      '.rotationEffect(.degrees(Double(turn))).scaleEffect(CGFloat(zoom)).offset(x: CGFloat(x), y: CGFloat(y))',
    )
  })

  it('transform props: Kotlin offset → scale → rotate, OUTERMOST in the chain', () => {
    expect(kotlin.code).toContain(
      'Column(modifier = Modifier.offset(x = (x).dp, y = (y).dp).scale((zoom).toFloat()).rotate((turn).toFloat()))',
    )
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

describe('<Gesture> handler forms', () => {
  const one = (handler: string) => `import { signal } from '@pyreon/reactivity'
import { Gesture, Text } from '@pyreon/primitives'
export function G() {
  const n = signal(0)
  function onMove(e: unknown) { n.set(1) }
  return <Gesture onPan={${handler}}><Text>x</Text></Gesture>
}`

  it('a zero-parameter arrow ignores the event', () => {
    expect(transform(one('() => n.set(2)'), { target: 'swift' }).code).toContain(
      'PyreonGesture(onPan: { _ in n = 2 })',
    )
    expect(transform(one('() => n.set(2)'), { target: 'kotlin' }).code).toContain(
      'PyreonGesture(onPan = { n = 2L })',
    )
  })

  it('a bare function reference is called with the event', () => {
    expect(transform(one('onMove'), { target: 'swift' }).code).toContain(
      'onPan: { pyreonEvent in onMove(pyreonEvent) }',
    )
    expect(transform(one('onMove'), { target: 'kotlin' }).code).toContain(
      'onPan = { pyreonEvent -> onMove(pyreonEvent) }',
    )
  })

  it('a handler absent from the source is absent from the call', () => {
    const code = transform(one('() => n.set(2)'), { target: 'swift' }).code
    expect(code).not.toContain('onPinch')
    expect(code).not.toContain('onRotate')
  })

  it('an empty <Gesture> still emits valid content', () => {
    const src = `import { Gesture } from '@pyreon/primitives'
export function G() { return <Gesture onRotate={() => {}} /> }`
    expect(transform(src, { target: 'swift' }).code).toContain('{ EmptyView() }')
    expect(transform(src, { target: 'kotlin' }).code).toContain('PyreonGesture(onRotate = { }) {}')
  })
})

describe('<Gesture> diagnostics', () => {
  it('warns when no handler is given', () => {
    const src = `import { Gesture, Text } from '@pyreon/primitives'
export function G() { return <Gesture><Text>x</Text></Gesture> }`
    const w = transform(src, { target: 'swift' }).warnings
    expect(w.some((m) => m.includes('<Gesture> without an `onPan`'))).toBe(true)
  })

  it('warns when the region itself is transformed', () => {
    const src = `import { Gesture, Text } from '@pyreon/primitives'
export function G() { return <Gesture onPan={() => {}} scale={2}><Text>x</Text></Gesture> }`
    const w = transform(src, { target: 'kotlin' }).warnings
    expect(w.some((m) => m.includes('<Gesture scale>') && m.includes('CHILD'))).toBe(true)
  })
})

describe('transform props on any primitive', () => {
  const lit = `import { Stack, Text } from '@pyreon/primitives'
export function T() {
  return <Stack translateX={12} translateY={-4} scale={1.5} rotate={-30} padding={2}><Text>x</Text></Stack>
}`

  it('literals pass bare on Swift and AFTER the padding (a render transform of the whole box)', () => {
    expect(transform(lit, { target: 'swift' }).code).toContain(
      '.padding(8).rotationEffect(.degrees(-30)).scaleEffect(1.5).offset(x: 12, y: -4)',
    )
  })

  it('literals become Dp / Float on Kotlin, BEFORE the padding (outside-in)', () => {
    expect(transform(lit, { target: 'kotlin' }).code).toContain(
      'Modifier.offset(x = (12).dp, y = (-4).dp).scale(1.5f).rotate(-30f).padding(8.dp)',
    )
  })

  it('one axis of translation emits only that axis', () => {
    const src = `import { Text } from '@pyreon/primitives'
export function T() { return <Text translateY={3}>x</Text> }`
    expect(transform(src, { target: 'swift' }).code).toContain('.offset(y: 3)')
    expect(transform(src, { target: 'kotlin' }).code).toContain('.offset(y = (3).dp)')
  })

  it('no transform props → no transform modifiers', () => {
    const src = `import { Stack, Text } from '@pyreon/primitives'
export function T() { return <Stack padding={2}><Text>x</Text></Stack> }`
    for (const target of ['swift', 'kotlin'] as const) {
      const code = transform(src, { target }).code
      expect(code).not.toMatch(/rotationEffect|scaleEffect|\.offset\(|\.scale\(|\.rotate\(/)
    }
  })

  it.skipIf(!isSwiftcAvailable())('the literal form type-checks on Swift', () => {
    const res = validateSwiftWithStubs(transform(lit, { target: 'swift' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the literal form compiles on Kotlin', () => {
    const res = validateKotlin(transform(lit, { target: 'kotlin' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
