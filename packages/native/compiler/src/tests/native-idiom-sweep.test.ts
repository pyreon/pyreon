// Zero-silent-drops (P1) — the idiom-sweep CANARY + the 5 silent fails it
// caught on first run (2026-07-02).
//
// The canary: a corpus of common JS idioms, each asserted to be EITHER
// warning-free-and-swiftc-clean OR loudly warned — never silent-and-broken.
// This is the permanent version of the ad-hoc probe that found every gap
// this sprint; a future emit regression that silently breaks an idiom fails
// here before it ships. (swiftc specs skip off-macOS; the emit-shape +
// warning assertions run everywhere.)
//
// The 5 first-run finds, all fixed in this PR:
//   1. `arr.join("-")` on a NON-String array — Swift `joined(separator:)`
//      exists only on [String] (the emit's own comment documented the gap);
//      now maps `.map { String($0) }` first, element-type-aware.
//   2. `arr.lastIndexOf(x)` — no rewrite; now `(lastIndex(of:) ?? -1)`
//      (indexOf's mirror); non-array receivers warn NAMED.
//   3. `arr.flat()` — the EMIT existed but no inference case → `Any`
//      annotation → the receiver literal couldn't type; now array-of-array
//      → the inner array.
//   4. `Number.isInteger(x)` — raw emit failed BOTH targets; now Int-typed
//      arg → `true`, Double → the parenthesized remainder check (the first
//      cut bound `.truncatingRemainder` to the last term of a compound
//      arg), unknown → NAMED warning. Inference → boolean.
//   5. `Math.max(...arr)` / `Math.min(...arr)` — the SPREAD form bypassed
//      the fixed-arity mapping (raw `Math.max(arr)`, both targets); now
//      the collection max()/min() with JS's empty-array sentinel analog
//      (Int.min/Int.max — no Int infinity; Double arrays get ±infinity).
//
// Bisect-load-bearing: each fix's spec fails under its neuter (join →
// element-map dropped; lastIndexOf → raw emit; flat → Any; isInteger →
// raw; max-spread → raw).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

// LOUD-OR-TYPECHECKS — the structural invariant the canary enforces: an emit
// is acceptable IFF it is either loudly WARNED (a named "unsupported"
// diagnostic) OR warning-free AND passes the real toolchain. A warning-free
// emit the toolchain REJECTS is a silent MIS-EMIT (the class this whole
// sprint closed). Runs per target so a Swift-clean / Kotlin-broken emit (or
// vice-versa) can't slip through. NOTE this catches silent MIS-EMITS
// (warning-free + uncompilable); a silent DROP (warning-free + compiles but
// does nothing) is not caught here — those need EFFECT-PRESENT assertions in
// the per-construct suites above.
type Validate = (code: string) => { ok: boolean; error?: string }
function expectLoudOrClean(
  code: string,
  warnings: readonly string[],
  validate: Validate,
  label: string,
): void {
  if (warnings.length > 0) return // loud — acceptable
  const r = validate(code)
  expect(r.ok, `SILENT MIS-EMIT — no warning AND ${label} rejects:\n${r.error?.slice(0, 400)}`).toBe(
    true,
  )
}

const A = (body: string, read = 'String(out())') =>
  `import { signal, computed } from '@pyreon/reactivity'\n` +
  `import { Stack, Text } from '@pyreon/primitives'\n` +
  `export function App(){
  const nums = signal<number[]>([1, 2, 3])
  const s = signal<string>("hello")
${body}
  return (<Stack><Text>{${read}}</Text></Stack>)
}`

describe('P1 — the five idiom-sweep finds (fixed)', () => {
  it('join on a non-String array maps elements to String first (element-type-aware)', () => {
    const rs = transform(A(`  const out = computed(() => nums().join("-"))`, 'out()'), {
      target: 'swift',
    })
    expect(rs.code).toContain('nums.map { String($0) }.joined(separator: "-")')
    // control: a String array keeps the direct joined
    const ctrl = transform(
      `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App(){
  const tags = signal<string[]>(["a", "b"])
  const out = computed(() => tags().join("-"))
  return (<Stack><Text>{out()}</Text></Stack>)
}`,
      { target: 'swift' },
    )
    expect(ctrl.code).toContain('tags.joined(separator: "-")')
    expect(ctrl.code).not.toContain('map { String($0) }')
  })
  it('lastIndexOf lowers to `(lastIndex(of:) ?? -1)`; non-array receivers warn NAMED', () => {
    const rs = transform(A(`  const out = computed(() => nums().lastIndexOf(2))`), {
      target: 'swift',
    })
    expect(rs.code).toContain('(nums.lastIndex(of: 2) ?? -1)')
    expect(rs.warnings).toHaveLength(0)
  })
  it('flat() infers the inner array (annotation [Int].count path, not Any)', () => {
    const rs = transform(A(`  const out = computed(() => [[1], [2]].flat().length)`), {
      target: 'swift',
    })
    expect(rs.code).toContain('var out: Int {')
    expect(rs.code).not.toContain('var out: Any {')
  })
  it('Number.isInteger: Int arg → `true` (Bool annotation); Double arg → parenthesized remainder check', () => {
    const int = transform(A(`  const out = computed(() => Number.isInteger(nums()[0]))`), {
      target: 'swift',
    })
    expect(int.code).toContain('var out: Bool { true }')
    const dbl = transform(A(`  const out = computed(() => Number.isInteger(nums()[0] / 2))`), {
      target: 'swift',
    })
    expect(dbl.code).toContain(').truncatingRemainder(dividingBy: 1) == 0)')
    const kt = transform(A(`  const out = computed(() => Number.isInteger(nums()[0] / 2))`), {
      target: 'kotlin',
    })
    expect(kt.code).toContain(') % 1.0 == 0.0)')
  })
  it('Math.max/min spread lowers to the collection max()/min() with the sentinel', () => {
    const mx = transform(A(`  const out = computed(() => Math.max(...nums()))`), { target: 'swift' })
    expect(mx.code).toContain('(nums.max() ?? Int.min)')
    const mn = transform(A(`  const out = computed(() => Math.min(...nums()))`), { target: 'swift' })
    expect(mn.code).toContain('(nums.min() ?? Int.max)')
    const kt = transform(A(`  const out = computed(() => Math.max(...nums()))`), { target: 'kotlin' })
    expect(kt.code).toContain('(nums.maxOrNull() ?: Int.MIN_VALUE)')
    // control: fixed-arity Math.max unchanged
    const ctrl = transform(A(`  const out = computed(() => Math.max(nums()[0], 5))`), {
      target: 'swift',
    })
    expect(ctrl.code).toContain('max(nums[0], 5)')
  })
})

// ── The CANARY — every idiom must be loud-or-lowered, never silent+broken.
// Add new idioms here as they come up; a silent regression on any of them
// fails this suite before it ships.
const CORPUS: Array<[string, string, string?]> = [
  ['template expr', `  const out = computed(() => \`\${s()}!\`)`, 'out()'],
  ['str.split', `  const out = computed(() => s().split(",").length)`],
  ['str.slice', `  const out = computed(() => s().slice(1, 3))`, 'out()'],
  ['str.charAt', `  const out = computed(() => s().charAt(0))`, 'out()'],
  ['str.repeat', `  const out = computed(() => s().repeat(2))`, 'out()'],
  ['arr.join non-string', `  const out = computed(() => nums().join("-"))`, 'out()'],
  ['arr.join default sep', `  const out = computed(() => nums().join())`, 'out()'],
  ['arr.concat', `  const out = computed(() => nums().concat([4]).length)`],
  ['arr.lastIndexOf', `  const out = computed(() => nums().lastIndexOf(2))`],
  ['arr.every', `  const out = computed(() => nums().every((x: number) => x > 0))`],
  ['arr.flat', `  const out = computed(() => [[1], [2]].flat().length)`],
  ['Number.isInteger', `  const out = computed(() => Number.isInteger(nums()[0]))`],
  ['Math.max spread', `  const out = computed(() => Math.max(...nums()))`],
  ['Math.min spread', `  const out = computed(() => Math.min(...nums()))`],
  ['toFixed', `  const out = computed(() => (nums()[0] / 2).toFixed(2))`, 'out()'],
  ['str.padEnd', `  const out = computed(() => s().padEnd(8, "."))`, 'out()'],
  ['includes ternary', `  const out = computed(() => s().includes("he") ? "y" : "n")`, 'out()'],
  ['nested template', `  const out = computed(() => \`a\${\`b\${s()}\`}c\`)`, 'out()'],
  // This-session silent-drop fixes — LOCKED loud: each now emits a NAMED
  // warning (was a silent mis-emit). If a future change makes any of them
  // warning-free AND uncompilable (a naive re-attempt), the canary fails.
  ['computed object key', `  const k = "a"; const out = computed(() => { const o = { [k]: 1 }; return String(o) })`, 'out()'],
  ['regex literal test', `  const out = computed(() => /he/.test(s()))`],
  ['call-arg spread', `  function f(a: number, b: number) { return a + b }; const out = computed(() => { const xs = [1, 2]; return f(...xs) })`],
]

// Statement-context idioms (handler body). A separate wrapper because these
// are statements, not computed expressions. The logical-assignment entries
// are the load-bearing lock: a naive parse-time desugar `a ||= b` → `a = a ||
// b` is UNSOUND (JS truthiness ≠ native Bool ops — `n &&= 5` → `n = n && 5`
// fails swiftc/kotlinc), so these MUST stay loud until a type-aware emitter
// lowering exists. This corpus makes that regression fail loudly.
const H = (body: string) =>
  `import { signal } from '@pyreon/reactivity'\n` +
  `import { Button } from '@pyreon/primitives'\n` +
  `export function App(){
  const s = signal<number>(0)
  const on = () => {
${body}
  }
  return (<Button onPress={on}>{String(s())}</Button>)
}`

const STMT_CORPUS: Array<[string, string]> = [
  ['logical-assign ||=', `    let a = false\n    a ||= true\n    s.set(a ? 1 : 0)`],
  ['logical-assign &&= numeric', `    let n = 1\n    n &&= 5\n    s.set(n)`],
  ['logical-assign ??=', `    let name: string | null = null\n    name ??= "x"\n    s.set(name === "x" ? 1 : 0)`],
]

describe.skipIf(!isSwiftUIAvailable())('P1 — idiom-sweep canary · Swift (loud-or-typechecks)', () => {
  for (const [name, body, read] of CORPUS) {
    it(`canary swift: ${name}`, () => {
      const rs = transform(A(body, read), { target: 'swift' })
      expectLoudOrClean(rs.code, rs.warnings, validateSwiftTypecheck, 'swiftc')
    })
  }
  for (const [name, body] of STMT_CORPUS) {
    it(`canary swift (stmt): ${name}`, () => {
      const rs = transform(H(body), { target: 'swift' })
      expectLoudOrClean(rs.code, rs.warnings, validateSwiftTypecheck, 'swiftc')
    })
  }
})

describe.skipIf(!isKotlincAvailable())('P1 — idiom-sweep canary · Kotlin (loud-or-typechecks)', () => {
  for (const [name, body, read] of CORPUS) {
    it(`canary kotlin: ${name}`, () => {
      const rs = transform(A(body, read), { target: 'kotlin' })
      expectLoudOrClean(rs.code, rs.warnings, validateKotlin, 'kotlinc')
    })
  }
  for (const [name, body] of STMT_CORPUS) {
    it(`canary kotlin (stmt): ${name}`, () => {
      const rs = transform(H(body), { target: 'kotlin' })
      expectLoudOrClean(rs.code, rs.warnings, validateKotlin, 'kotlinc')
    })
  }
})
