// The OTHER side of a set of Swift-emit guards whose happy path the sibling
// `cov-swift-a2-*` suites already pin: the shapes that must NOT take the
// rewrite, must NOT resolve, or must fall through to the generic emit.
//
// A one-sided guard is the shape this repo keeps finding bugs in — the
// rewrite fires, the test asserts it fired, and nothing says what happens to
// the neighbour that merely LOOKS like it. So each spec here pairs a
// deliberately-unmatched input with the emit it has to produce instead.
//
// One `it.fails` lock: a ZERO-PARAM top-level function with an explicit
// NON-VIEW return annotation is classified as a COMPONENT and emitted as a
// `struct … : View` whose body is a String — uncompilable, with no warning.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const P = '@pyreon/primitives'
const run = (src: string) => transform(src, { target: 'swift' })
const swift = (src: string) => run(src).code

describe('enum-case rewriting only fires for a field that EXISTS and IS an enum', () => {
  it('a member the declared struct does not carry leaves the literal a String', () => {
    const out = swift(`import { Stack, Text } from '${P}'
type Side = 'left' | 'right'
type Cfg = { side: Side; n: number }
export function ghost(c: Cfg): boolean { return (c as any).nope === 'x' }
export function App() { return (<Stack><Text>hi</Text></Stack>) }`)
    expect(out).toContain('func ghost(_ c: Cfg) -> Bool { (c).nope == "x" }')
    expect(out).not.toContain('== .x')
  })
})

describe('the value-const inliner over the statement kinds that carry NO expression', () => {
  it('`break`, `continue` and a bare `return` are passed through untouched', () => {
    const out = swift(`import { Stack, Text, Press } from '${P}'
import { signal } from '@pyreon/reactivity'
export function App() {
  const n = signal(0)
  const K = 3
  const run = () => {
    let i = 0
    while (i < K) { i++; if (i === 1) { continue }; break }
    n.set(i)
    return
  }
  return (<Stack><Press onPress={run}><Text>{() => String(n())}</Text></Press></Stack>)
}`)
    expect(out).toContain('while i < (3) {')
    expect(out).toMatch(/\n\s+continue\n/)
    expect(out).toMatch(/\n\s+break\n/)
    expect(out).toMatch(/\n\s+return\n/)
  })

  it('a non-identifier UPDATE target is not collected as a mutated local', () => {
    const out = swift(`import { Stack, Text, Press } from '${P}'
import { signal } from '@pyreon/reactivity'
export function App() {
  const n = signal(0)
  const obj = signal<{ a: number }>({ a: 1 })
  const run = () => { obj().a++; n.set(1) }
  return (<Stack><Press onPress={run}><Text>{() => String(n())}</Text></Press></Stack>)
}`)
    expect(out).toContain('obj.a += 1')
  })
})

describe('a parameter that SHADOWS an outer binding is restored afterwards', () => {
  it('a function decl, a `.map` callback and an `Array.from` index param each shadow a signal', () => {
    const out = swift(`import { Stack, Text, Press } from '${P}'
import { signal } from '@pyreon/reactivity'
export function App() {
  const n = signal(0)
  const run = (n: number) => { return n + 1 }
  const idxShadow = () => Array.from({ length: 2 }, (_, n) => n * 2)
  const mapShadow = () => [1, 2].map((n, i) => n + i)
  return (<Stack><Press onPress={() => n.set(1)}><Text>{() => \`\${run(1)}\${idxShadow().length}\${mapShadow().length}\`}</Text></Press></Stack>)
}`)
    expect(out).toContain('private func run(_ n: Int) -> Int { n + 1 }')
    expect(out).toContain('(0..<2).map({ n in n * 2 })')
    expect(out).toContain('[1, 2].enumerated().map({ (i, n) in n + i })')
    // the outer signal is untouched by any of the three
    expect(out).toContain('@State private var n: Int = 0')
  })
})

describe('the fall-through shapes of the member-call rewrite tables', () => {
  it('`Array.<other>` is neither `isArray` nor `from`, and keeps the raw emit', () => {
    const out = swift(`import { Stack, Text } from '${P}'
export function App() {
  const arrOf = () => Array.of(1, 2)
  return (<Stack><Text>{String(arrOf().length)}</Text></Stack>)
}`)
    expect(out).toContain('Array.of(1, 2)')
  })

  it('a MODEL member that is neither a state read nor an action keeps the plain chain', () => {
    const out = swift(`import { Stack, Text } from '${P}'
import { model } from '@pyreon/state-tree'
import { computed } from '@pyreon/reactivity'
const m = model({ state: { c: 1 } }).views((me) => ({ d: () => me.c() * 2 })).actions((me) => ({ inc: () => { me.c.set(1) } })).create()
export function App() {
  const nope = computed(() => m.ghost)
  return (<Stack><Text>{String(nope())}</Text></Stack>)
}`)
    expect(out).toContain('PyreonModel_m.shared.ghost')
  })

  it('a service method called with FEWER args than labels labels only what it was given', () => {
    // `moveTo(latitude:longitude:zoom:)` defaults `zoom`, so BOTH arities are
    // legal — the guard is `<=`, not `===`.
    const out = swift(`import { Stack, Text, Press } from '${P}'
import { useMap } from '@pyreon/hooks'
export function App() {
  const map = useMap()
  const run = () => { map.moveTo(1, 2); map.moveTo(1, 2, 3); map.removeMarker('m') }
  return (<Stack><Press onPress={run}><Text>hi</Text></Press></Stack>)
}`)
    expect(out).toContain('map.moveTo(latitude: 1, longitude: 2)')
    expect(out).toContain('map.moveTo(latitude: 1, longitude: 2, zoom: 3)')
    expect(out).toContain('map.removeMarker(id: "m")')
  })

  it('`Number.isInteger` on a NON-numeric typeRef falls to the unresolved warning', () => {
    const r = run(`import { Stack, Text } from '${P}'
import { computed } from '@pyreon/reactivity'
export function App(props: { box: { a: number } }) {
  const n = computed(() => Number.isInteger(props.box))
  return (<Stack><Text>{String(n())}</Text></Stack>)
}`)
    expect(r.warnings.some((w) => w.startsWith('Number.isInteger(box):'))).toBe(true)
  })

  it('a STORE-field `.set()` with no argument falls back to `= 0`', () => {
    // Nonsense JS, but the arm is total — an arg-less set must not emit
    // `= undefined` or drop the statement.
    const out = swift(`import { Stack, Text, Press } from '${P}'
import { defineStore } from '@pyreon/store'
import { signal } from '@pyreon/reactivity'
const useApp = defineStore('app', () => { const n = signal(0); return { n } })
export function App() {
  const run = () => { useApp().store.n.set() }
  return (<Stack><Press onPress={run}><Text>hi</Text></Press></Stack>)
}`)
    expect(out).toContain('PyreonStore_app.shared.n = 0')
  })
})

describe('signal-annotation recovery bails on a shape with no single struct', () => {
  it('a SPREAD element and a MIXED-KIND element array both keep `Any`', () => {
    const out = swift(`import { Stack, Text } from '${P}'
import { signal } from '@pyreon/reactivity'
export function App(props: { box: { a: number } }) {
  const withSpread = signal([{ ...props.box, z: 1 }])
  const mixedEls = signal([1, { a: 1 }])
  return (<Stack><Text>{() => \`\${withSpread().length}\${mixedEls().length}\`}</Text></Stack>)
}`)
    expect(out).toContain('@State private var withSpread: Any =')
    expect(out).toContain('@State private var mixedEls: Any =')
  })

  it('two props with the SAME nested shape reuse ONE synthesized struct', () => {
    const out = swift(`import { Stack, Text } from '${P}'
export function App(props: { box: { a: number }; twin: { a: number } }) {
  return (<Stack><Text>{() => \`\${props.box.a}\${props.twin.a}\`}</Text></Stack>)
}`)
    expect(out).toContain('struct AppBox: Codable')
    expect(out).not.toContain('struct AppTwin: Codable')
    expect(out).toContain('let twin: AppBox')
  })
})

describe('the debounced-value seed is taken ONLY from a sibling signal', () => {
  it('a source call whose callee is a HELPER, not a signal, gets no seed', () => {
    const out = swift(`import { Stack, Text } from '${P}'
import { useDebouncedValue } from '@pyreon/hooks'
function helperV(x: number): string { return 'h' }
export function App() {
  const fromHelper = useDebouncedValue(() => helperV(1), 100)
  return (<Stack><Text>{fromHelper}</Text></Stack>)
}`)
    // the seed is the SOURCE expression itself, not a signal's initial
    expect(out).toContain('@State private var fromHelper: String = helperV(1)')
  })
})

describe('useQuery with HEADERS but no verb defaults the method', () => {
  it('routes through PyreonHttp as a GET', () => {
    const out = swift(`import { Stack, Text } from '${P}'
import { useQuery } from '@pyreon/query'
type Res = { id: number }
export function App() {
  const qh = useQuery<Res>(() => ({ queryKey: ['h'], queryFn: () => fetch('https://x/h', { headers: { A: 'b' } }).then((r) => r.json()) }))
  return (<Stack><Text>{String(qh.data())}</Text></Stack>)
}`)
    expect(out).toContain('PyreonHttpRequest(method: .get, url: "https://x/h", headers: ["A": "b"])')
  })
})

describe('KNOWN BUG — a ZERO-PARAM annotated helper is emitted as a View', () => {
  it.fails(
    'KNOWN BUG: `function helperV(): string { return "h" }` is classified as a COMPONENT and emitted as `struct helperV: View { var body: some View { "h" } }` — swiftc: "static method \'buildExpression\' requires that \'String\' conform to \'View\'", plus "expected member name or initializer call after type name" at the `helperV` call site, and NO warning. Kotlin emits a `@Composable fun helperV() { "h" }` whose body does nothing, so the same source is broken on both targets. The helper gate in `parse.ts:tryComponentFromTopLevel` requires `hasValueParams`, documented as a deliberate false-negative because a no-param value-returning function is "indistinguishable from the harness shape" — but this one is NOT indistinguishable: it carries the explicit NON-VIEW return annotation the gate already computes as `hasNonViewReturnAnnotation` for the nullish-return refinement. Fix: let that annotation satisfy the gate when `hasValueParams` is false. A one-param helper (`dbl(x)`) is already correct, which is what makes this silent.',
    () => {
      const r = transform(
        `import { Stack, Text } from '${P}'
import { computed } from '@pyreon/reactivity'
export function helperV(): string { return 'h' }
export function App() {
  const a = computed(() => helperV())
  return (<Stack><Text>{() => a()}</Text></Stack>)
}`,
        { target: 'swift' },
      )
      expect(r.code).toContain('func helperV() -> String')
      expect(r.code).not.toContain('struct helperV: View')
    },
  )

  it('a ONE-param helper of the same shape IS emitted as a `func` — the contrast', () => {
    const out = swift(`import { Stack, Text } from '${P}'
import { computed } from '@pyreon/reactivity'
export function dbl(x: number): number { return x * 2 }
export function App() {
  const b = computed(() => dbl(21))
  return (<Stack><Text>{() => String(b())}</Text></Stack>)
}`)
    expect(out).toContain('func dbl(_ x: Int) -> Int { x * 2 }')
    expect(out).toContain('private var b: Int { dbl(21) }')
  })
})
