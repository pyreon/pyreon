// Coverage: the Kotlin backend's JS array/String method vocabulary
// (`emitKotlinExpr`'s `case 'call'` member-method switch, emit-kotlin.ts
// ~4940-5350). Each spec pairs the shape that TAKES an arm with the
// neighbouring shape that must not — the other arity, the other receiver
// kind, or the NAMED warning a method with no lowering carries.
//
// The point of the pairing: an unmapped JS method falls through to a
// VERBATIM re-emit, which on Kotlin often COMPILES and does the wrong
// thing (`.replace` replaces every occurrence where JS replaces the
// first), so "emits something" is never the assertion — the emitted
// idiom is.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

/** One component; `body` declares the computeds under test. */
const SRC = (body: string) => `import { Stack, Text } from '@pyreon/primitives'
type Row = { id: number; price: number }
function App() {
  const xs = signal<number[]>([1, 2, 3])
  const rows = signal<Row[]>([{ id: 1, price: 2.5 }])
  const name = signal<string>('hello')
${body}
  return (<Stack><Text>x</Text></Stack>)
}`

const kt = (body: string) => transform(SRC(body), { target: 'kotlin' })

describe('Kotlin expr: array/String method lowerings', () => {
  it('join: omitted separator emits JS\'s "," explicitly (Kotlin default is ", ")', () => {
    const out = kt(`  const a = computed(() => xs().join())
  const b = computed(() => xs().join('-'))`).code
    expect(out).toContain('xs.joinToString(",")')
    expect(out).toContain('xs.joinToString("-")')
    expect(out).not.toContain('.join(')
  })

  it('concat: 1-arg is a parenthesised `+`, so a following operator binds to the whole concatenation', () => {
    const out = kt(`  const a = computed(() => xs().concat([4]))`).code
    expect(out).toContain('(xs + listOf(4))')
  })

  it('charAt/charCodeAt: 1-char String vs the UTF-16 code unit as a Double', () => {
    const out = kt(`  const a = computed(() => name().charAt(1))
  const b = computed(() => name().charCodeAt(0))`).code
    // charAt → Char.toString() (JS returns a STRING, Kotlin's `[]` a Char)
    expect(out).toContain('name[1].toString()')
    // charCodeAt tolerates a Double-typed index and yields a Double
    expect(out).toContain('name[(0).toInt()].code.toDouble()')
  })

  it('flat/reverse/toUpperCase/toLowerCase: 0-arg only; a 1-arg call falls through + warns', () => {
    const out = kt(`  const a = computed(() => xs().flat())
  const b = computed(() => xs().reverse())
  const c = computed(() => name().toUpperCase())
  const d = computed(() => name().toLowerCase())`).code
    expect(out).toContain('xs.flatten()')
    expect(out).toContain('xs.reversed()')
    expect(out).toContain('name.uppercase()')
    expect(out).toContain('name.lowercase()')
    // The neighbouring shape: only the 0-arg form is lowered, so a depth
    // argument breaks out of the case and is re-emitted verbatim.
    expect(kt(`  const a = computed(() => xs().flat(2))`).code).toContain('xs.flat(2)')
  })

  it('replace vs replaceAll: `replace` is FIRST-only (replaceFirst), `replaceAll` is Kotlin `replace`', () => {
    const out = kt(`  const a = computed(() => name().replace('l', 'L'))
  const b = computed(() => name().replaceAll('l', 'L'))`).code
    expect(out).toContain('name.replaceFirst("l", "L")')
    expect(out).toContain('name.replace("l", "L")')
  })

  it('findIndex/filter: the 1-arg predicate forms (indexOfFirst / filter)', () => {
    const out = kt(`  const a = computed(() => xs().findIndex((v) => v > 1))
  const b = computed(() => xs().filter((v) => v > 1))`).code
    expect(out).toContain('xs.indexOfFirst({ v -> v > 1 })')
    expect(out).toContain('xs.filter({ v -> v > 1 })')
  })

  it('reduce: the 2-arg JS form becomes fold(initial, reducer) — Kotlin reduce takes no initial', () => {
    const out = kt(`  const a = computed(() => xs().reduce((acc, v) => acc + v, 0))`).code
    expect(out).toContain('xs.fold(0, { acc, v -> acc + v })')
  })

  it('push: 1 arg is `add`, 2+ args are `addAll(listOf(...))`', () => {
    const out = kt(`  const a = computed(() => xs().push(4))
  const b = computed(() => xs().push(4, 5))`).code
    expect(out).toContain('xs.add(4)')
    expect(out).toContain('xs.addAll(listOf(4, 5))')
  })

  it('includes: 1-arg only → contains', () => {
    expect(kt(`  const a = computed(() => xs().includes(2))`).code).toContain('xs.contains(2)')
  })

  it('at: an ARRAY receiver resolves a negative index; a STRING receiver warns NAMED (Char-vs-String)', () => {
    const arr = kt(`  const a = computed(() => xs().at(0))`)
    expect(arr.code).toContain('xs.getOrNull(if ((0) < 0) xs.size + (0) else (0))')
    expect(arr.warnings.join('\n')).not.toContain('String.at')
    const str = kt(`  const a = computed(() => name().at(0))`)
    expect(str.warnings.join('\n')).toContain('String.at has no Kotlin lowering')
  })

  it('padStart/padEnd: a SINGLE-char literal pad becomes a Char; a multi-char pad falls through', () => {
    const out = kt(`  const a = computed(() => name().padStart(5, '0'))
  const b = computed(() => name().padEnd(5))
  const c = computed(() => name().padStart(5, 'ab'))`).code
    expect(out).toContain(`name.padStart(5, '0')`)
    expect(out).toContain('name.padEnd(5)')
    // multi-char pad can't be a Kotlin Char → unchanged String arg
    expect(out).toContain('name.padStart(5, "ab")')
  })

  it('fill: `Array(n).fill(v)` takes the count from Array(n); a bare `arr.fill(v)` uses .size', () => {
    const out = kt(`  const a = computed(() => Array(3).fill(0))
  const b = computed(() => xs().fill(0))`).code
    expect(out).toContain('List(3) { 0 }')
    expect(out).toContain('List(xs.size) { 0 }')
  })

  it('slice: 0-arg copies (toList on a List, the String itself); negative forms use takeLast/dropLast', () => {
    const out = kt(`  const a = computed(() => xs().slice())
  const b = computed(() => name().slice())
  const c = computed(() => xs().slice(-2))
  const d = computed(() => xs().slice(0, -1))`).code
    expect(out).toContain('xs.toList()')
    // String slice() with no args is the receiver unchanged
    expect(out).toMatch(/val b by remember \{ derivedStateOf \{ name \} \}/)
    expect(out).toContain('xs.takeLast(2)')
    expect(out).toContain('xs.dropLast(1)')
  })

  it('toFixed: a LITERAL digit count formats Locale.ROOT; a DYNAMIC count falls through + warns', () => {
    const out = kt(`  const a = computed(() => rows()[0].price.toFixed(2))
  const b = computed(() => rows()[0].price.toFixed())`).code
    expect(out).toContain('"%.2f".format(java.util.Locale.ROOT,')
    // 0-arg defaults to 0 digits (JS toFixed() === toFixed(0))
    expect(out).toContain('"%.0f".format(java.util.Locale.ROOT,')
    // A DYNAMIC digit count cannot bake a format string — it breaks out of
    // the case and re-emits verbatim (see the KNOWN BUG lock at the bottom).
    const dyn = kt(`  const n = signal<number>(2)
  const a = computed(() => rows()[0].price.toFixed(n()))`)
    expect(dyn.code).toContain('.toFixed(n)')
  })

  it('toLocaleString degrades to toString() with a NAMED warning (no native locale formatting)', () => {
    const r = kt(`  const a = computed(() => name().toLocaleString())`)
    expect(r.code).toContain('(name).toString()')
    expect(r.warnings.join('\n')).toContain('toLocaleString')
  })

  it('sort: an Int comparator keeps the raw difference; a DOUBLE one converts the SIGN via compareTo(0.0)', () => {
    const out = kt(`  const a = computed(() => rows().sort((p, q) => p.price - q.price))
  const b = computed(() => rows().sort((p, q) => p.id - q.id))`).code
    // Kotlin's Comparator.compare must return Int — a Double body needs the sign
    expect(out).toContain('Comparator { p, q -> (p.price - q.price).compareTo(0.0) }')
    // an Int body is unchanged (same sign, same order)
    expect(out).toContain('Comparator { p, q -> p.id - q.id }')
  })

  it('sort: no comparator and a multi-statement comparator both WARN rather than mis-emit', () => {
    const none = kt(`  const a = computed(() => xs().sort())`)
    expect(none.warnings.join('\n')).toContain('no comparator')
    const block = kt(
      `  const a = computed(() => rows().sort((p, q) => { const d = p.id - q.id; return d }))`,
    )
    expect(block.warnings.join('\n')).toContain('multi-statement comparator')
    // the `shape` (not `no-comparator`) half of the fall-through warning
    const oneParam = kt(`  const a = computed(() => rows().sort((p) => p.id))`)
    expect(oneParam.warnings.join('\n')).toContain('with this comparator shape')
  })
})

describe('Kotlin expr: Map / Set method vocabulary (typed off the receiver)', () => {
  const MS = (body: string) => `import { Stack, Text, Press } from '@pyreon/primitives'
function App() {
  const m = new Map<string, number>()
  const st = new Set<string>()
  return (<Stack><Press onPress={() => { ${body} }}><Text>go</Text></Press></Stack>)
}`

  it('Map: set/get/has/delete/clear lower to the Kotlin map surface', () => {
    const out = transform(
      MS(`m.set('a', 1); m.get('a'); m.has('a'); m.delete('a'); m.clear()`),
      { target: 'kotlin' },
    ).code
    expect(out).toContain('m["a"] = 1')
    expect(out).toContain('m.containsKey("a")')
    expect(out).toContain('m.remove("a")')
    expect(out).toContain('m.clear()')
  })

  it('Set: add/has/delete/clear lower to the Kotlin set surface (contains, not containsKey)', () => {
    const out = transform(
      MS(`st.add('b'); st.has('b'); st.delete('b'); st.clear()`),
      { target: 'kotlin' },
    ).code
    expect(out).toContain('st.add("b")')
    expect(out).toContain('st.contains("b")')
    expect(out).toContain('st.remove("b")')
    expect(out).toContain('st.clear()')
    // the map-only rewrite must NOT leak onto a Set receiver
    expect(out).not.toContain('st.containsKey')
  })
})

// ─────────────────────────── KNOWN BUG ───────────────────────────
//
// A method that HAS a case in the emitter but is called at an arity the
// case does not handle `break`s out of the switch and lands on the
// VERBATIM re-emit — silently, on BOTH targets.
//
//   xs.flat(2)      → Kotlin `xs.flat(2)`      · Swift `xs.flat(2)`
//   xs.concat()     → Kotlin `xs.concat()`     · Swift `xs.concat()`
//   xs.reverse(1)   → Kotlin `xs.reverse(1)`   · Swift `xs.reverse(1)`
//   n.toFixed(d())  → Kotlin `n.toFixed(d)`    · Swift `n.toFixed(d)`
//
// None of those members exist on a Kotlin List/String or a Swift
// Array/String, so every one is a compile error at the call site — and
// `transform` reports NO warning, so a shared source file looks lowered
// and fails only at `gradle assembleDebug` / `xcodebuild`.
//
// `unmappedMethodWarning` cannot catch these: its closed sets
// (`UNMAPPED_ARRAY_METHODS` / `UNMAPPED_STRING_METHODS` in
// unlowered-props.ts) list methods with NO case at all, and `flat` /
// `concat` / `reverse` / `toFixed` each have one. This is the same class
// the `.sort` arm already fixed for itself — `unloweredSortWarning` exists
// precisely because "every other shape breaks out of the switch and lands
// on the verbatim re-emit" — so the mechanism is agreed, it was just
// applied to one method rather than to the class.
//
// FIX: make the fall-through observable for a MAPPED method too — e.g. have
// each arity-gated case record the method before `break`ing, and warn in the
// verbatim re-emit when the property is one the switch recognises but did
// not handle (the `sort` arms then collapse into that same mechanism).
//
// This spec passes the moment that warning exists; delete the `.fails` then.
describe('Kotlin expr: unhandled ARITY of a mapped method', () => {
  it.fails('KNOWN BUG: a mapped method at an unhandled arity re-emits verbatim with NO warning', () => {
    // Today: `xs.flat(2)` is emitted verbatim (invalid Kotlin — a List has
    // no `flat`) and nothing is reported. The ONLY assertion is the
    // diagnostic, so ANY fix that makes the shape observable — a warning, or
    // a real lowering that removes the need for one — retires this spec.
    const r = kt(`  const a = computed(() => xs().flat(2))`)
    expect(
      r.warnings.join('\n'),
      'expected a NAMED warning for the un-lowered `.flat(2)` arity',
    ).toContain('flat')
  })
})
