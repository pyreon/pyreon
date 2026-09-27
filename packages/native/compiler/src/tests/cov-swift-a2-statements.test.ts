// Branch matrices for `emitSwiftStatement` — the arms a shape-driven JS→Swift
// statement emit has to get right because Swift has no analog of the JS form:
//
//   * Swift removed `++`/`--` in Swift 3, and the value-position `update`
//     emit (an IIFE returning the OLD value) mis-compiles as a STATEMENT.
//   * Swift has no descending range literal, so every `down` loop is a
//     negative-step `stride`, and `inclusive` picks `through:` over `to:`.
//   * A `Double`-annotated local initialized with an INTEGER literal has
//     nothing in the literal that says Double — the annotation is the only
//     evidence, and without it the Int poisons every mixed expression.
//   * JS truthiness on an OPTIONAL local must BOTH nil-test and UNWRAP:
//     `if x != nil` alone leaves the then-body reading `T?` where `T` is
//     wanted, so the identifier form lowers to `if let x {`.
//   * A Swift `case` body cannot be empty.
//
// Each is paired with the neighbouring shape that must take the other arm.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

function sw(body: string, params = ''): { code: string; warnings: string[] } {
  const r = transform(
    `import { Stack, Text, Press } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App(${params}) {
  const n = signal<number>(0)
  const run = () => {
${body}
  }
  return (<Stack><Press onPress={run}><Text>{() => String(n())}</Text></Press></Stack>)
}`,
    { target: 'swift' },
  )
  return { code: r.code, warnings: [...r.warnings] }
}

describe('`i++` / `i--` as a STATEMENT', () => {
  it('lowers to `+= 1` / `-= 1`, not the value-position IIFE', () => {
    const { code } = sw(`    let i = 0
    i++
    i--
    n.set(i)`)
    expect(code).toContain('i += 1')
    expect(code).toContain('i -= 1')
    // the IIFE form would not compile as a statement
    expect(code).not.toContain('i++')
    expect(code).not.toContain('}()')
  })
})

describe('a `Double`-annotated local seeded with an INTEGER literal', () => {
  it('emits the literal AS a Double, under `let` or `var` by mutability', () => {
    const { code } = sw(`    const scale: Double = 1
    const f: Float = 3
    let m: Double = 2
    m = 4
    n.set(scale + f + m)`)
    expect(code).toContain('let scale = 1.0')
    // `Float` is the same alias arm — the annotation arrives as a typeRef
    expect(code).toContain('let f = 3.0')
    // reassigned → `var`, same widening
    expect(code).toContain('var m = 2.0')
  })

  it('a NON-integral literal and an UNannotated one are left exactly as written', () => {
    const { code } = sw(`    const a: Double = 1.5
    const b = 1
    n.set(a + b)`)
    expect(code).toContain('let a = 1.5')
    expect(code).not.toContain('1.5.0')
    expect(code).toContain('let b = 1')
    expect(code).not.toContain('let b = 1.0')
  })
})

describe('loops — labels, direction, inclusivity and step are four independent arms', () => {
  it('`while` / `for-of` carry their label; `break`/`continue` carry theirs', () => {
    const { code } = sw(`    let i = 0
    outer: while (i < 3) { i++; if (i === 2) { break outer } else { continue outer } }
    lp: for (const c of [1, 2]) { if (c === 1) { break lp }; continue lp }
    n.set(i)`)
    expect(code).toContain('outer: while i < 3 {')
    expect(code).toContain('break outer')
    expect(code).toContain('continue outer')
    expect(code).toContain('lp: for c in [1, 2] {')
    expect(code).toContain('break lp')
    expect(code).toContain('continue lp')
  })

  it('an UNLABELLED loop, break and continue emit the bare keywords', () => {
    const { code } = sw(`    let i = 0
    while (i < 3) { i++; if (i === 2) { break } else { continue } }
    for (const c of [1, 2]) { if (c === 1) { break }; continue }
    n.set(i)`)
    expect(code).toContain('while i < 3 {')
    expect(code).not.toMatch(/\w+: while/)
    expect(code).toMatch(/\n\s+break\n/)
    expect(code).toMatch(/\n\s+continue\n/)
  })

  it('`do { } while` becomes `repeat { } while`', () => {
    const { code } = sw(`    let i = 0
    do { i++ } while (i < 5)
    n.set(i)`)
    expect(code).toContain('repeat {')
    expect(code).toContain('} while i < 5')
  })

  it('for-range: the 2x2x2 of direction x inclusivity x step', () => {
    const { code } = sw(`    let i = 0
    for (let k = 0; k < 4; k++) { i += k }
    for (let k = 0; k <= 4; k++) { i += k }
    for (let k = 0; k < 8; k += 2) { i += k }
    for (let k = 0; k <= 8; k += 2) { i += k }
    for (let k = 8; k > 0; k--) { i += k }
    for (let k = 8; k >= 0; k--) { i += k }
    for (let k = 8; k >= 0; k -= 2) { i += k }
    n.set(i)`)
    // step 1 ascending → the range literals
    expect(code).toContain('for k in 0..<4 {')
    expect(code).toContain('for k in 0...4 {')
    // a literal step > 1 → stride, `to:` vs `through:` by inclusivity
    expect(code).toContain('for k in stride(from: 0, to: 8, by: 2) {')
    expect(code).toContain('for k in stride(from: 0, through: 8, by: 2) {')
    // Swift has NO descending range literal — always a negative stride
    expect(code).toContain('for k in stride(from: 8, to: 0, by: -1) {')
    expect(code).toContain('for k in stride(from: 8, through: 0, by: -1) {')
    expect(code).toContain('for k in stride(from: 8, through: 0, by: -2) {')
  })
})

describe('`if` over an OPTIONAL — bind-and-narrow vs a bare nil test', () => {
  it('the truthiness and `!== null` forms both bind `if let x` and NARROW the body', () => {
    // `.length` on the narrowed local proves the narrowing: an un-narrowed
    // `String?` would not offer it.
    const { code } = sw(`    const t: string | undefined = props.tok
    if (t) { n.set(t.length) }
    if (t !== null) { n.set(t.length) }`, 'props: { tok?: string }')
    // The truthiness form also rejects '' (JS falsy) — a `!== null` test does not.
    expect(code).toContain('if let t, !t.isEmpty {')
    expect(code.match(/if let t \{/g)).toHaveLength(1)
    expect(code).toContain('n = t.utf16.count')
  })

  it('`=== null` WITH an else binds the ELSE body (swapped); without an else it stays a nil test', () => {
    const { code } = sw(`    const t: string | undefined = props.tok
    if (t === null) { n.set(0) } else { n.set(t.length) }
    if (t === null) { n.set(0) }`, 'props: { tok?: string }')
    // swapped: the narrowed body is the else
    expect(code).toContain('if let t {\n      n = t.utf16.count\n    } else {\n      n = 0\n    }')
    // a LONE absent-check has no body to narrow — keeps `== nil`
    expect(code).toContain('if t == nil {')
  })

  it('a NON-optional condition keeps the ordinary `if <cond>` emit', () => {
    const { code } = sw(`    const i = 2
    if (i > 1) { n.set(1) } else { n.set(2) }`)
    expect(code).toContain('if i > 1 {')
    expect(code).not.toContain('if let i')
  })
})

describe('`switch`', () => {
  it('cases carry their own bodies, the default is `default:`, and adjacent empty tests merge', () => {
    const { code } = sw(`    let i = 0
    switch (i) {
      case 1:
      case 2: i = 7; break
      default: i = 5
    }
    n.set(i)`)
    expect(code).toContain('switch i {')
    // JS fall-through over an empty case merges into one Swift pattern list
    expect(code).toContain('case 1, 2:')
    expect(code).toContain('i = 7')
    expect(code).toContain('default:')
    expect(code).toContain('i = 5')
  })

  it('a case whose body emits NOTHING gets `break` — a Swift case body cannot be empty', () => {
    // A braced case body is an unsupported BlockStatement: it is WARNED, the
    // case body comes out empty, and the no-op `break` is what keeps the
    // emitted switch compiling rather than failing on an empty case.
    const { code, warnings } = sw(`    let i = 0
    switch (i) {
      case 2: { i = 9; break }
      default: i = 5
    }
    n.set(i)`)
    expect(warnings).toContain('Unsupported statement: BlockStatement.')
    expect(code).toContain('case 2:\n        break')
  })
})

describe('for-range bounds that are FLOAT-typed are coerced to Int', () => {
  it('both the `Double` and the `Float` alias trip the coercion, ascending and descending', () => {
    // A Double TO-bound makes `0..<n` a Range<Double> — not a Sequence at
    // all — and a Double FROM bound would type the counter Double, breaking
    // the Int-counter contract the body coercion relies on.
    const { code } = sw(`    let s = 0
    for (let i = 0; i < props.f; i++) { s += i }
    for (let j = 0; j < props.d; j++) { s += j }
    for (let k = props.f; k >= 0; k--) { s += k }
    n.set(s)`, 'props: { f: Float; d: Double }')
    // JS `i < n` trips ceil(n) times for a fractional n
    expect(code).toContain('for i in 0..<Int(ceil(Double(f))) {')
    expect(code).toContain('for j in 0..<Int(ceil(Double(d))) {')
    // descending starts at floor(f)
    expect(code).toContain('for k in stride(from: Int(floor(Double(f))), through: 0, by: -1) {')
  })

  it('an INT-typed bound is left exactly as written', () => {
    const { code } = sw(`    let s = 0
    for (let i = 0; i < 4; i++) { s += i }
    n.set(s)`)
    expect(code).toContain('for i in 0..<4 {')
    expect(code).not.toContain('Int(ceil(Double(4)))')
  })
})
