// The NAMED sibling of `native-text-arrow-accessor.test.ts`.
//
// That test covers the INLINE accessor child, `<Text>{() => sig()}</Text>`.
// This one covers the same idiom by REFERENCE:
//
//   const shout = () => raw().toUpperCase()
//   <Text>{shout}</Text>
//
// On web both are accessors and Pyreon renders the CALL. Natively there is no
// accessor concept — the surrounding body re-runs — so the equivalent is the
// call. The inline form was unwrapped; the named form was emitted as the bare
// identifier, i.e. the FUNCTION ITSELF:
//
//   Swift   Text(verbatim: "\(shout)")   → warning only, renders a debug
//                                          description of a function value
//   Kotlin  Text(text = "${shout}")      → HARD ERROR, "function invocation
//                                          'shout()' expected"
//
// So one shared source compiled and rendered garbage on iOS while failing to
// build at all on Android. What made it invisible is that a bare SIGNAL child
// (`{raw}`) has always been correct — the two shapes are indistinguishable in
// the source, and only one of them was handled.
//
// Scope is deliberate: text/child position only, arity zero only. A bare
// reference in PROP position (`onPress={handler}`) passes a reference and must
// keep passing one — asserted below, because that is the way this fix could
// break something that works.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const app = (body: string) => `import { Stack, Text, Button } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
function App() {
  const raw = signal('abc')
  const shout = () => raw().toUpperCase()
  const twice = (s: string) => s + s
  const bump = () => { raw.set('x') }
  return (${body})
}`

const line = (target: 'swift' | 'kotlin', body: string, needle: string) =>
  transform(app(body), { target }).code.split('\n').find((l) => l.includes(needle)) ?? ''

describe('a bare zero-arg fn reference in text position is CALLED', () => {
  it('Swift: {shout} → \\(shout()), matching {shout()}', () => {
    const bare = line('swift', '<Stack><Text>{shout}</Text></Stack>', 'Text(')
    expect(bare).toContain('shout()')
    // The bug shape: the function value interpolated as-is.
    expect(bare).not.toMatch(/\\\(shout\)/)
    const called = line('swift', '<Stack><Text>{shout()}</Text></Stack>', 'Text(')
    expect(bare).toBe(called)
  })

  it('Kotlin: {shout} → ${shout()}, matching {shout()}', () => {
    const bare = line('kotlin', '<Stack><Text>{shout}</Text></Stack>', 'Text(')
    expect(bare).toContain('shout()')
    expect(bare).not.toMatch(/\$\{shout\}/)
    const called = line('kotlin', '<Stack><Text>{shout()}</Text></Stack>', 'Text(')
    expect(bare).toBe(called)
  })

  // A bare SIGNAL child was always right and must stay right: signals lower to
  // a property (SwiftUI @State / Compose state), read WITHOUT parens.
  it('a bare SIGNAL child is untouched (no spurious call)', () => {
    expect(line('swift', '<Stack><Text>{raw}</Text></Stack>', 'Text(')).toContain('\\(raw)')
    expect(line('kotlin', '<Stack><Text>{raw}</Text></Stack>', 'Text(')).toContain('${raw}')
  })

  // Arity gates the rewrite: a function taking arguments is not an accessor,
  // so a bare reference to one is left alone rather than called with none.
  it('a fn that takes ARGUMENTS is not called', () => {
    expect(line('swift', '<Stack><Text>{twice}</Text></Stack>', 'Text(')).not.toContain('twice()')
    expect(line('kotlin', '<Stack><Text>{twice}</Text></Stack>', 'Text(')).not.toContain('twice()')
  })

  // The regression risk of this fix, asserted directly: a handler passed by
  // reference in PROP position must remain a reference. Calling it there would
  // fire the side effect at composition time instead of on press.
  it('PROP position still passes a REFERENCE, not a call', () => {
    const s = line('swift', '<Stack><Button onPress={bump}>go</Button></Stack>', 'Button')
    expect(s).toContain('bump')
    expect(s).not.toContain('"\\(bump())"')
    const k = line('kotlin', '<Stack><Button onPress={bump}>go</Button></Stack>', 'Button')
    expect(k).toContain('bump')
    expect(k).not.toContain('${bump()}')
  })
})

// The toolchain half. Kotlin is the load-bearing one: the bare form was a HARD
// compile failure there, so this assertion genuinely reproduces the shipped
// break. Swift only WARNED on the same source — which is precisely why a
// typecheck-only gate never caught it, and why the string-shape assertions
// above carry the Swift side.
describe('bare-fn text child survives the real toolchains', () => {
  it.skipIf(!isSwiftcAvailable())('Swift: type-checks against the stub', () => {
    const code = transform(app('<Stack><Text>{shout}</Text></Stack>'), { target: 'swift' }).code
    const r = validateSwiftWithStubs(code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: compiles on kotlinc', () => {
    const code = transform(app('<Stack><Text>{shout}</Text></Stack>'), { target: 'kotlin' }).code
    const r = validateKotlin(code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
