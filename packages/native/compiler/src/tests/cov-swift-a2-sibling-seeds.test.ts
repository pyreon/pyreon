// Branch matrix for `substituteSiblingRead` / `isPureSeedExpr` / the
// sibling-signal seeding pass in `emitSwiftComponent`.
//
// A SwiftUI `@State` stored-property initializer cannot reference another
// stored property: `const b = signal(a() * 2)` emits
// `@State private var b: Int = a * 2`, which is "cannot use instance member
// within property initializer" — a REAL-SDK-only failure, invisible to the
// parse-only gate. So the emit substitutes the sibling's own pure seed IN.
//
// The substituter is DELIBERATELY PARTIAL, and that is the design worth
// locking: anything it does not handle leaves the read in place, and the
// caller's TOTAL residual check (`exprReferencesIdent`) then emits a LOUD
// warning naming the decl instead of shipping an initializer that will not
// compile. So every arm has two directions — substituted, or named.
//
// The `null` returns are the second axis: a nested arrow that RE-BINDS the
// sibling's name shadows it, so the substituter must bail rather than rewrite
// the inner reference. Every container kind has to propagate that null, and
// each one is asserted through its own container below.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const P = '@pyreon/primitives'

function sw(decls: string, uses: string): { code: string; warnings: string[] } {
  const r = transform(
    `import { Stack, Text } from '${P}'
import { signal } from '@pyreon/reactivity'
export function App(props: { base: number }) {
  const a = signal(2)
${decls}
  return (<Stack><Text>{() => \`${uses}\`}</Text></Stack>)
}`,
    { target: 'swift' },
  )
  return { code: r.code, warnings: [...r.warnings] }
}

/** Names of the decls the residual check refused to substitute. */
const refused = (warnings: string[]): string[] =>
  warnings.flatMap((w) => {
    const m = w.match(/^signal '([^']+)': its initializer reads sibling signal/)
    return m ? [m[1]!] : []
  })

describe('a pure sibling seed is substituted IN, through every container kind', () => {
  it('binary, paren, unary, call args, member, index, array, object and arrow bodies', () => {
    const { code, warnings } = sw(
      `  const b = signal(a() * 2)
  const c = signal(b() + 1)
  const call = signal(Math.abs(a()))
  const par = signal((a()) + 1)
  const un = signal(-a())
  const mem = signal([a()].length)
  const idx = signal([1, 2][a()])
  const arr = signal([a(), 3])
  const obj = signal({ v: a() })
  const arrow = signal([1].map(() => a()).length)
  const tThen = signal(true ? a() : 0)
  const tElse = signal(false ? 1 : a())`,
      '${b()}${c()}${call()}${par()}${un()}${mem()}${idx()}${arr().length}${obj().v}${arrow()}${tThen()}${tElse()}',
    )
    expect(code).toContain('@State private var b: Int = (2) * 2')
    // a CHAIN: `c` reads `b`, whose own seed was already substituted
    expect(code).toContain('@State private var c: Int = ((2) * 2) + 1')
    expect(code).toContain('@State private var call: Int = abs((2))')
    expect(code).toContain('@State private var par: Int = ((2)) + 1')
    expect(code).toContain('@State private var un: Int = -(2)')
    expect(code).toContain('@State private var mem: Int = [(2)].count')
    expect(code).toContain('@State private var idx: Int = [1, 2][(2)]')
    expect(code).toContain('@State private var arr: [Int] = [(2), 3]')
    expect(code).toContain('v: (2)')
    expect(code).toContain('[1].map({ (2) })')
    expect(code).toContain('true ? (2) : 0')
    expect(code).toContain('false ? 1 : (2)')
    // none of these needed the loud fallback
    expect(refused(warnings)).toEqual([])
  })
})

describe('an UNSUBSTITUTABLE read is NAMED, never silently emitted', () => {
  it('a seed that is not a pure construction-time expression refuses its dependents', () => {
    // `impure` reads a PROP, so it is not seedable; `chained` reads `impure`
    // and therefore cannot be substituted either.
    const { warnings } = sw(
      `  const impure = signal(props.base + 1)
  const chained = signal(impure() + 1)`,
      '${impure()}${chained()}',
    )
    expect(refused(warnings)).toEqual(['chained'])
    expect(warnings.some((w) => w.includes('cannot use instance member within property initializer'))).toBe(
      true,
    )
  })

  it('an expression kind the substituter does NOT handle leaves the read and warns', () => {
    // A COMPARISON is not one of `substituteSiblingRead`'s cases (nor one of
    // `isPureSeedExpr`'s), so it falls to the untouched default — which is
    // exactly why the residual check exists.
    const { code, warnings } = sw(`  const t = signal(a() > 1 ? 5 : 0)`, '${t()}')
    expect(refused(warnings)).toEqual(['t'])
    expect(code).toContain('@State private var t: Int = a > 1 ? 5 : 0')
  })

  it('a nested arrow that RE-BINDS the name bails — through every container', () => {
    // Each decl wraps the shadowing arrow in a different container, so each
    // container's null-propagation arm is the thing being exercised.
    const { warnings } = sw(
      `  const c2 = signal(Math.max(1, ((a) => a())(a)))
  const cc = signal((((a) => () => a())(a))())
  const p1 = signal((((a) => a())(a)))
  const u1 = signal(-((a) => a())(a))
  const b1 = signal(1 * ((a) => a())(a))
  const b2 = signal(((a) => a())(a) * 1)
  const tc = signal(((a) => a())(a) ? 1 : 0)
  const t1 = signal(true ? ((a) => a())(a) : 0)
  const t2 = signal(true ? 0 : ((a) => a())(a))
  const m1 = signal([((a) => a())(a)].length)
  const i1 = signal([1, 2][((a) => a())(a)])
  const i2 = signal([((a) => a())(a)][0])
  const ar = signal([1, ((a) => a())(a)])
  const ob = signal({ v: ((a) => a())(a) })`,
      '${c2()}${cc()}${p1()}${u1()}${b1()}${b2()}${tc()}${t1()}${t2()}${m1()}${i1()}${i2()}${ar().length}${ob().v}',
    )
    expect(refused(warnings).sort()).toEqual(
      ['ar', 'b1', 'b2', 'c2', 'cc', 'i1', 'i2', 'm1', 'ob', 'p1', 't1', 't2', 'tc', 'u1'].sort(),
    )
  })

  it('a STORAGE-backed or ENUM-typed signal is never offered as a seed', () => {
    // Its runtime value is not its default / its case rewrite is
    // per-declaration, so `seedable` deliberately skips both.
    const r = transform(
      `import { Stack, Text } from '${P}'
import { signal } from '@pyreon/reactivity'
import { useStorage } from '@pyreon/storage'
type Side = 'left' | 'right'
export function App() {
  const stored = useStorage<number>('k', 1)
  const side = signal<Side>('left')
  const fromStored = signal(stored() + 1)
  const fromEnum = signal(side())
  return (<Stack><Text>{() => \`\${fromStored()}\${String(fromEnum())}\`}</Text></Stack>)
}`,
      { target: 'swift' },
    )
    expect(refused([...r.warnings]).sort()).toEqual(['fromEnum', 'fromStored'])
  })
})

describe('the debounced-value SEED comes from the source signal’s own initial', () => {
  it('a bare signal-read source is seeded; a non-call source and a non-signal name are not', () => {
    const r = transform(
      `import { Stack, Text, Press } from '${P}'
import { signal } from '@pyreon/reactivity'
import { useDebouncedValue } from '@pyreon/hooks'
export function App(props: { raw: string }) {
  const q = signal<string>('seed')
  const fromSignal = useDebouncedValue(() => q(), 100)
  const fromMember = useDebouncedValue(() => props.raw, 100)
  const fromCallOnProp = useDebouncedValue(() => q().trim(), 100)
  return (<Stack><Press onPress={() => q.set('x')}><Text>{() => \`\${fromSignal()}\${fromMember()}\${fromCallOnProp()}\`}</Text></Press></Stack>)
}`,
      { target: 'swift' },
    )
    // seeded from the SOURCE signal's initial, so there is no first-delay gap
    expect(r.code).toContain('@State private var fromSignal: String = "seed"')
    // a member source is not a signal call — no seed, the expression itself
    expect(r.code).toContain('@State private var fromMember: String = raw')
    // a call whose callee is a MEMBER (`q().trim()`) is not a bare signal read
    expect(r.code).toContain('@State private var fromCallOnProp: String = q.trimmingCharacters')
  })
})
