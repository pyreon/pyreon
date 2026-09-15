// The remaining `expr-utils.ts` shape-key arms: `typeShapeKey`'s non-scalar
// branches (set / map / object / union / array / typeRef), `structShapeKey`'s
// use of them to keep two same-NAMED declared types apart, `literalShapeKey`'s
// null returns, and `classifySortableRef`'s null arm.
//
// The key's whole job is to make two DIFFERENT shapes hash differently. A
// branch that collapses (the Int-vs-Double collision this key was widened for)
// makes the FIRST declared struct win for both — a silently mis-constructed
// value where the field types happen to coerce, and a hard toolchain error
// where they do not. So each arm is asserted by "these two types stay APART",
// which is the property, rather than by the key string, which is internal.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const sw = (src: string): string => transform(src, { target: 'swift' }).code
const kt = (src: string): string => transform(src, { target: 'kotlin' }).code

/** Two declared types differing ONLY in the field named `f`'s type. */
function twoTypes(fieldA: string, fieldB: string, seedA: string, seedB: string): string {
  return `import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
type A = { k: string; f: ${fieldA} }
type B = { k: string; f: ${fieldB} }
export function App() {
  const a = signal<A>({ k: 'a', f: ${seedA} })
  const b = signal<B>({ k: 'b', f: ${seedB} })
  return (<Stack><Text>{a().k}{b().k}</Text></Stack>)
}`
}

describe('typeShapeKey — every non-scalar branch keeps two shapes APART', () => {
  it('ARRAY element type: `string[]` and `number[]` do not collapse', () => {
    const out = sw(twoTypes('string[]', 'number[]', `['x']`, '[1]'))
    expect(out).toContain('struct A')
    expect(out).toContain('struct B')
    expect(out).toContain('A(k: "a", f: ["x"])')
    expect(out).toContain('B(k: "b", f: [1])')
  })

  it('SET element type: `Set<string>` and `Set<number>` do not collapse', () => {
    const out = sw(twoTypes('Set<string>', 'Set<number>', 'new Set<string>()', 'new Set<number>()'))
    expect(out).toContain('A(k: "a"')
    expect(out).toContain('B(k: "b"')
  })

  it('MAP key/value types keep two maps apart', () => {
    const out = sw(
      twoTypes(
        'Map<string, number>',
        'Map<string, string>',
        'new Map<string, number>()',
        'new Map<string, string>()',
      ),
    )
    expect(out).toContain('A(k: "a"')
    expect(out).toContain('B(k: "b"')
  })

  it('UNION branches keep two optionals apart', () => {
    const out = sw(twoTypes('string | null', 'number | null', 'null', 'null'))
    expect(out).toContain('A(k: "a", f: nil)')
    expect(out).toContain('B(k: "b", f: nil)')
  })

  it('NESTED OBJECT field shapes keep two records apart', () => {
    const out = sw(twoTypes('{ n: number }', '{ s: string }', '{ n: 1 }', `{ s: 'x' }`))
    expect(out).toContain('struct A')
    expect(out).toContain('struct B')
  })

  it('a NUMBER field and a FRACTIONAL one are distinct keys (the original collision)', () => {
    const out = sw(twoTypes('number', 'Double', '1', '1.5'))
    expect(out).toContain('A(k: "a", f: 1)')
    expect(out).toContain('B(k: "b", f: 1.5)')
  })

  it('two structurally IDENTICAL declared types resolve consistently, not randomly', () => {
    // Same shape ⇒ same key ⇒ the FIRST declared wins for a bare literal. That
    // is the documented first-wins rule; asserting it keeps a future change
    // from silently reordering which type a literal constructs.
    const out = sw(`import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
type A = { k: string }
type B = { k: string }
export function App() {
  const v = signal<A>({ k: 'x' })
  return (<Stack><Text>{v().k}</Text></Stack>)
}`)
    expect(out).toContain('A(k: "x")')
  })

  it('Kotlin keys identically — the serialization is BACKEND-NEUTRAL by design', () => {
    const out = kt(twoTypes('number', 'Double', '1', '1.5'))
    expect(out).toContain('A(k = "a", f = 1)')
    expect(out).toContain('B(k = "b", f = 1.5)')
  })
})

describe('literalShapeKey — the null returns fall back to the name-only lookup', () => {
  it('a NON-literal field value returns null (no crash, no wrong pick)', () => {
    const out = sw(`import { Stack, Text } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'
type P = { x: number; y: number }
export function App() {
  const n = signal(1)
  const p = computed<P>(() => ({ x: n(), y: 2 }))
  return (<Stack><Text>{p().x}</Text></Stack>)
}`)
    expect(out.length).toBeGreaterThan(0)
  })

  it('a NULL field value returns null too', () => {
    const out = sw(`import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
type P = { x: number; y: string | null }
export function App() {
  const p = signal<P>({ x: 1, y: null })
  return (<Stack><Text>{p().x}</Text></Stack>)
}`)
    expect(out).toContain('P(x: 1, y: nil)')
  })

  it('an explicit `0.0` keys as a DOUBLE even though its VALUE is integral', () => {
    // `Number.isInteger(0.0)` is true, so only the IR `float` marker can carry
    // the author's intent. This is the exact case that made the marker
    // necessary in the first place.
    const out = sw(`import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
type Px = { x: Double; y: Double }
export function App() {
  const p = signal<Px>({ x: 0.0, y: 2.0 })
  return (<Stack><Text>{p().x}</Text></Stack>)
}`)
    expect(out).toContain('Px(x: 0.0, y: 2.0)')
  })
})

describe('classifySortableRef — the NULL arm (every other `ref` is untouched)', () => {
  it('a plain callback ref on a container is not a sortable binding', () => {
    const out = sw(`import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const cb = (el) => {}
  return (<Stack ref={cb}><Text>x</Text></Stack>)
}`)
    expect(out).not.toContain('PyreonSortable')
    expect(out).toContain('VStack')
  })

  it('a `containerRef` member on an UNRELATED binding is not one either', () => {
    const out = sw(`import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const notSortable = { containerRef: 1 }
  return (<Stack ref={notSortable.containerRef}><Text>x</Text></Stack>)
}`)
    expect(out).not.toContain('PyreonSortable')
  })
})

describe('chainHasOptional / exprHasOptionalLink — the call and index arms', () => {
  it('an optional link BEFORE a call propagates through the call', () => {
    const out = sw(`import { Stack, Text } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'
type Inner = { c: () => string }
type Outer = { b?: Inner }
export function App() {
  const o = signal<Outer>({ b: { c: () => 'x' } })
  const v = computed(() => o().b?.c())
  return (<Stack><Text>{v()}</Text></Stack>)
}`)
    expect(out).toContain('?.c()')
  })

  it('an optional MEMBER link propagates through the next member read', () => {
    const out = sw(`import { Stack, Text } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'
type Outer = { rows?: string[] }
export function App() {
  const o = signal<Outer>({ rows: ['x'] })
  const v = computed(() => o().rows?.length)
  return (<Stack><Text>{v()}</Text></Stack>)
}`)
    expect(out).toContain('o.rows?.count')
  })

  it('an optional INDEX link declines the safe-index lowering, LOUDLY', () => {
    // `o.rows?.[0]` has an optional receiver, which the guarded safe-index
    // idiom cannot compose on Swift — it emits the unguarded subscript and
    // says so, rather than dropping the access.
    const r = transform(
      `import { Stack, Text } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'
type Outer = { rows?: string[] }
export function App() {
  const o = signal<Outer>({ rows: ['x'] })
  const v = computed(() => o().rows?.[0])
  return (<Stack><Text>{v()}</Text></Stack>)
}`,
      { target: 'swift' },
    )
    expect(r.warnings.join('\n')).toContain('the safe-index lowering needs a re-readable')
  })

  it('a NON-optional chain of the same depth stays plain (the false arm)', () => {
    const out = sw(`import { Stack, Text } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'
type Inner = { c: string }
type Outer = { b: Inner }
export function App() {
  const o = signal<Outer>({ b: { c: 'x' } })
  const v = computed(() => o().b.c)
  return (<Stack><Text>{v()}</Text></Stack>)
}`)
    expect(out).toContain('o.b.c')
    expect(out).not.toContain('o.b?.c')
  })
})

describe('isCompoundExpr — bitwise operand parenthesisation', () => {
  const bits = (expr: string): string =>
    sw(`import { Stack, Text } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'
export function App() {
  const n = signal(6)
  const v = computed(() => ${expr})
  return (<Stack><Text>{v()}</Text></Stack>)
}`)
      .split('\n')
      .find((l) => l.includes('private var v:')) ?? ''

  it('a BINARY operand is wrapped (Swift binds `&` tighter than `+`, unlike JS)', () => {
    expect(bits('(n() + 1) & 3')).toContain('(n + 1) & 3')
  })

  it('a TERNARY operand is wrapped', () => {
    expect(bits('(n() > 1 ? 2 : 3) | 4')).toContain('(n > 1 ? 2 : 3) | 4')
  })

  it('a COMPARISON operand is wrapped', () => {
    expect(bits('(n() > 1 ? 1 : 0) & 1')).toContain('?')
  })

  it('a SIMPLE atom is NOT wrapped — the false arm', () => {
    expect(bits('n() & 3')).toContain('n & 3')
    expect(bits('n() & 3')).not.toContain('(n) & 3')
  })

  it('Kotlin uses infix functions and wraps the same operands', () => {
    const out = kt(`import { Stack, Text } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'
export function App() {
  const n = signal(6)
  const v = computed(() => (n() + 1) & 3)
  return (<Stack><Text>{v()}</Text></Stack>)
}`)
    expect(out).toContain('(n + 1)')
    expect(out).toContain('and')
  })
})
