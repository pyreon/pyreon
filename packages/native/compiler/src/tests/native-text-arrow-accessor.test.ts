// A `{() => expr}` arrow accessor as a value-interpolation child (the
// web-idiomatic reactive-text shape) must UNWRAP to the plain expression on
// native, not emit a closure into the string.
//
// Before the fix, `<Text>{() => sig()}</Text>` emitted Swift
// `Text("\({ sig })")` / Kotlin `Text(text = "${{ sig }}")` — a CLOSURE
// interpolated into the string. Proven at runtime: swiftc `\({ sig })` prints
// "(Function)" (with only a WARNING, so `-typecheck` passes), and kotlinc
// `${{ sig }}` prints the lambda's toString. So the value rendered as garbage
// on BOTH platforms for a common shape (`{() => a() + b()}`, `{() => cond ? …}`).
// The `<Show when>` / disabled paths already unwrap the arrow; the text /
// value-interpolation path did not. Fix: unwrap in swiftInterpSegment /
// kotlinInterpSegment (+ the template fast-path in emit*Text).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const wrap = (child: string) => `import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
function App() {
  const sig = signal(0)
  return (<Stack><Text>${child}</Text></Stack>)
}`

const swiftText = (child: string) =>
  transform(wrap(child), { target: 'swift' }).code.split('\n').find((l) => l.includes('Text(')) ?? ''
const kotlinText = (child: string) =>
  transform(wrap(child), { target: 'kotlin' }).code.split('\n').find((l) => l.includes('Text(')) ?? ''

describe('arrow-accessor text child unwraps (no closure interpolation)', () => {
  it('Swift: {() => sig()} → \\(sig), NOT a closure \\({ … })', () => {
    const line = swiftText('{() => sig()}')
    expect(line).toContain('Text("\\(sig)")')
    // The bug shape — a closure interpolated into the string — must be gone.
    expect(line).not.toContain('{ sig }')
    expect(line).not.toMatch(/\\\(\{/)
  })

  it('Kotlin: {() => sig()} → ${sig}, NOT a lambda ${{ … }}', () => {
    const line = kotlinText('{() => sig()}')
    expect(line).toContain('Text(text = "${sig}")')
    expect(line).not.toContain('{{ sig }}')
    expect(line).not.toMatch(/\$\{\{/)
  })

  it('multi-signal + ternary arrow bodies unwrap on both backends', () => {
    expect(swiftText('{() => sig() + 1}')).toContain('\\(sig + 1)')
    expect(kotlinText('{() => sig() + 1}')).toContain('${sig + 1}')
    expect(swiftText('{() => (sig() > 0 ? "a" : "b")}')).toContain('sig > 0 ? "a" : "b"')
    expect(swiftText('{() => (sig() > 0 ? "a" : "b")}')).not.toMatch(/\\\(\{/)
    expect(kotlinText('{() => (sig() > 0 ? "a" : "b")}')).not.toMatch(/\$\{\{/)
  })

  it('arrow-wrapped template hits the template fast-path (no nested string)', () => {
    expect(swiftText('{() => `n=${sig()}`}')).toContain('Text("n=\\(sig)")')
    expect(kotlinText('{() => `n=${sig()}`}')).toContain('Text(text = "n=${sig}")')
  })

  it('bare {sig()} is unchanged (no regression)', () => {
    expect(swiftText('{sig()}')).toContain('Text("\\(sig)")')
    expect(kotlinText('{sig()}')).toContain('Text(text = "${sig}")')
  })

  // The container value-child path (`<Stack>{() => sig()}</Stack>`) wraps the
  // child in a Text via swiftInterpSegment DIRECTLY (not through emit*Text's
  // loop), so it exercises the interp-segment unwrap specifically.
  it('container value-child {() => sig()} unwraps (the direct interp-segment path)', () => {
    const containerSrc = `import { Stack } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
function App() {
  const sig = signal(0)
  return (<Stack>{() => sig()}</Stack>)
}`
    const sw = transform(containerSrc, { target: 'swift' }).code.split('\n').find((l) => l.includes('Text(')) ?? ''
    const kt = transform(containerSrc, { target: 'kotlin' }).code.split('\n').find((l) => l.includes('Text(')) ?? ''
    expect(sw).toContain('Text("\\(sig)")')
    expect(sw).not.toMatch(/\\\(\{/)
    expect(kt).toContain('Text(text = "${sig}")')
    expect(kt).not.toMatch(/\$\{\{/)
  })

  // Compile-PROOF — both shapes must type-check/compile (they did BEFORE the
  // fix too: the bug was a runtime misrender swiftc only WARNS about, which is
  // exactly why the string-shape assertions above are the load-bearing ones).
  it.skipIf(!isSwiftcAvailable())('Swift: arrow-text emit type-checks against the stub', () => {
    const res = validateSwiftWithStubs(transform(wrap('{() => sig()}'), { target: 'swift' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: arrow-text emit compiles on kotlinc', () => {
    const res = validateKotlin(transform(wrap('{() => sig()}'), { target: 'kotlin' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
