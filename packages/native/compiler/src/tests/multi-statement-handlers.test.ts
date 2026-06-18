// Gap fix — a multi-statement event handler (`onPress={() => { a.set(1);
// b.set(2) }}`) used to silently drop ALL BUT THE FIRST statement on both
// targets (the parse `.find()`'d the first expr/return statement). A HIGH
// "1 code, all platforms" bug — the handler ran differently than on web.
// Now the arrow IR carries the full `stmts` list and the action emitters
// emit every statement. The single-statement compact form is unchanged.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, isKotlincAvailable, validateSwift, validateKotlin } from '../validate'

const SRC = `import { Stack, Button } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
function C() {
  const n = signal(0)
  const m = signal(0)
  const k = signal(0)
  return (<Stack>
    <Button onPress={() => { n.set(n() + 1); m.set(m() + 1); k.set(k() + 1) }}>multi</Button>
    <Button onPress={() => n.set(n() + 1)}>single</Button>
  </Stack>)
}`

describe('multi-statement event handlers emit every statement', () => {
  it('Swift: all three statements survive (not just the first)', () => {
    const out = transform(SRC, { target: 'swift' }).code
    expect(out).toContain('n = n + 1')
    expect(out).toContain('m = m + 1')
    expect(out).toContain('k = k + 1')
    // single-statement compact form unchanged
    expect(out).toContain('Button("single") { n = n + 1 }')
  })

  it('Kotlin: all three statements survive (not just the first)', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    expect(out).toContain('n = n + 1')
    expect(out).toContain('m = m + 1')
    expect(out).toContain('k = k + 1')
    expect(out).toContain('Button(onClick = { n = n + 1 })')
  })

  it('a handler with an `if` statement after an expression emits both (parseStatementBlock path)', () => {
    const src = `import { Stack, Button } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
function C() {
  const n = signal(0)
  const m = signal(0)
  return (<Stack><Button onPress={() => { n.set(n() + 1); if (n() > 2) { m.set(0) } }}>x</Button></Stack>)
}`
    const sw = transform(src, { target: 'swift' }).code
    expect(sw).toContain('n = n + 1')
    expect(sw).toContain('if n > 2 {')
    expect(sw).toContain('m = 0')
    const kt = transform(src, { target: 'kotlin' }).code
    expect(kt).toContain('n = n + 1')
    expect(kt).toContain('if (n > 2) {')
    expect(kt).toContain('m = 0')
  })

  it.skipIf(!isSwiftcAvailable())('emitted Swift parses on real swiftc', () => {
    const out = transform(SRC, { target: 'swift' }).code
    const r = validateSwift(out)
    if (!r.ok) throw new Error(`swiftc rejected:\n${r.error}\n---\n${out}`)
    expect(r.ok).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('emitted Kotlin compiles on real kotlinc', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    const r = validateKotlin(out)
    if (!r.ok) throw new Error(`kotlinc rejected:\n${r.error}\n---\n${out}`)
    expect(r.ok).toBe(true)
  })
})
