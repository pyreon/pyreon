import { describe, expect, it } from 'vitest'
import { transform } from '../index'

// Loop control-flow (iter47, sweep batch 6). Pre-fix, `break` and
// `continue` statements warn-DROPPED — a SEMANTIC mis-emit: the emitted
// loop ran EVERY iteration where JS would exit/skip (a `for…of` with
// `if (x === 3) break` summed all elements). Labeled loops
// ("Unsupported statement: LabeledStatement") dropped the WHOLE handler
// body. Both targets support all of it natively: Swift `outer: for` +
// `break outer`; Kotlin `outer@ for` + `break@outer`. The comma-operator
// arrow body (`onPress={() => (a.set(1), b.set(2))}`) emitted `("")`
// junk, dropping BOTH writes — in statement position the sequence value
// is discarded, so each sub-expression lowers to its own statement.

const LOOPS = `
import { signal } from '@pyreon/reactivity'
import { Stack, Button } from '@pyreon/primitives'
export function App() {
  const n = signal(0)
  const scan = () => {
    outer: for (const i of [1, 2, 3]) {
      for (const j of [1, 2]) {
        if (i * j > 3) break outer
        if (j === 2) continue
        n.set(n() + 1)
      }
    }
    let k = 0
    while (k < 10) {
      k = k + 1
      if (k > 5) break
    }
  }
  return <Stack gap="sm"><Button onPress={() => scan()}>go</Button></Stack>
}`

const COMMA = `
import { signal } from '@pyreon/reactivity'
import { Stack, Button } from '@pyreon/primitives'
export function App() {
  const a = signal(0)
  const b = signal(0)
  const both = () => {
    a.set(3), b.set(4)
  }
  return (
    <Stack gap="sm">
      <Button onPress={() => (a.set(1), b.set(2))}>inline</Button>
      <Button onPress={() => both()}>named</Button>
    </Stack>
  )
}`

describe('break / continue lower faithfully (were semantic mis-emits)', () => {
  it('Swift: plain break + continue inside loops', () => {
    const out = transform(LOOPS, { target: 'swift' }).code
    expect(out).toContain('continue')
    expect(out).toMatch(/if k > 5 \{\n\s+break\n\s+\}/)
  })

  it('Kotlin: plain break + continue inside loops', () => {
    const out = transform(LOOPS, { target: 'kotlin' }).code
    expect(out).toContain('continue')
    expect(out).toMatch(/if \(k > 5\) \{\n\s+break\n\s+\}/)
  })

  it('Swift: labeled loop + labeled break', () => {
    const out = transform(LOOPS, { target: 'swift' }).code
    expect(out).toContain('outer: for i in')
    expect(out).toContain('break outer')
  })

  it('Kotlin: labeled loop + labeled break', () => {
    const out = transform(LOOPS, { target: 'kotlin' }).code
    expect(out).toContain('outer@ for (i in')
    expect(out).toContain('break@outer')
  })

  it('no warnings on the full loop-control shape', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(LOOPS, { target }).warnings ?? []).toEqual([])
    }
  })

  it('a LABELED break inside a switch case survives the fall-through strip', () => {
    const src = `
import { signal } from '@pyreon/reactivity'
import { Stack, Button } from '@pyreon/primitives'
export function App() {
  const n = signal(0)
  const scan = () => {
    outer: for (const i of [1, 2, 3]) {
      switch (i) {
        case 2: break outer
        default: n.set(n() + i)
      }
    }
  }
  return <Stack gap="sm"><Button onPress={() => scan()}>go</Button></Stack>
}`
    const sw = transform(src, { target: 'swift' }).code
    expect(sw).toContain('break outer')
    const kt = transform(src, { target: 'kotlin' }).code
    expect(kt).toContain('break@outer')
  })

  it('a labeled NON-loop statement warns by name', () => {
    const src = `
import { signal } from '@pyreon/reactivity'
import { Stack, Button } from '@pyreon/primitives'
export function App() {
  const n = signal(0)
  const f = () => {
    blk: if (n() > 0) {
      n.set(0)
    }
  }
  return <Stack gap="sm"><Button onPress={() => f()}>go</Button></Stack>
}`
    const out = transform(src, { target: 'swift' })
    expect(
      (out.warnings ?? []).some((w) => w.includes('labeled statement is only supported on a LOOP')),
    ).toBe(true)
  })
})

describe('comma-operator sequences lower in statement position', () => {
  it('arrow body `(a.set(1), b.set(2))` becomes two statements (both targets)', () => {
    const sw = transform(COMMA, { target: 'swift' }).code
    expect(sw).toMatch(/a = 1\n\s+b = 2/)
    const kt = transform(COMMA, { target: 'kotlin' }).code
    expect(kt).toMatch(/a = 1\n\s+b = 2/)
  })

  it('statement-position sequence in a block body expands too', () => {
    const sw = transform(COMMA, { target: 'swift' }).code
    expect(sw).toMatch(/a = 3\n\s+b = 4/)
  })

  it('VALUE-position sequences still warn', () => {
    const src = `
import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const a = signal(1)
  const v = computed(() => { const x = (a(), 2); return x })
  return <Stack gap="sm"><Text>{v()}</Text></Stack>
}`
    const out = transform(src, { target: 'swift' })
    expect((out.warnings ?? []).some((w) => w.includes('SequenceExpression'))).toBe(true)
  })
})
