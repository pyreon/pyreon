// `useUrlState` binds ONE router search parameter, on both targets.
//
// The prerequisite was a real bug: PyreonRouter advertised `query` in its
// header on both platforms and implemented none of it, so a path carrying
// `?…` went into matchPath whole. That is fixed in the router packages; this
// covers the compiler half.
//
// The helper types (`PyreonUrlState*`) ship in the ROUTER runtime
// (router-swift / router-kotlin `PyreonUrlState.{swift,kt}`), declared once.
// They used to be emitted inline into every file that called `useUrlState`,
// and two such files in one Xcode target / Gradle source set collided
// (`invalid redeclaration` / `Redeclaration`). So the emit asserts here cover
// the CONSTRUCTION; the decode semantics are asserted against the runtime
// sources themselves, which is what an app actually links.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const NATIVE = resolve(import.meta.dirname, '../../..')
const RUNTIME_SWIFT = readFileSync(
  resolve(NATIVE, 'router-swift/Sources/PyreonRouter/PyreonUrlState.swift'),
  'utf8',
)
const RUNTIME_KOTLIN = readFileSync(
  resolve(NATIVE, 'router-kotlin/src/main/kotlin/com/pyreon/router/PyreonUrlState.kt'),
  'utf8',
)
/** A top-level declaration of any url-state helper, in either language. */
const HELPER_DECL =
  /^(?:public |private |internal )?(?:struct|class|func|fun) (?:PyreonUrlState\w*|pyreonUrlNumber)\b/m

const SRC = `import { useUrlState } from '@pyreon/url-state'
import { Stack, Text } from '@pyreon/primitives'
export function C() { const q = useUrlState('q', 'all'); return (<Stack><Text>{q()}</Text></Stack>) }`

describe('useUrlState lowering', () => {
  it('binds the parameter through the router (Swift)', () => {
    const { code } = transform(SRC, { target: 'swift' })
    expect(code).not.toMatch(HELPER_DECL)
    expect(code).toContain('PyreonUrlState(router: pyreonRouter, key: "q", defaultValue: "all")')
    // Optional-chained: the environment router IS optional, so a component
    // rendered outside a RouterProvider degrades to the default rather than
    // crashing — the same choice useNavigate/useParams make.
    expect(RUNTIME_SWIFT).toContain('router?.setQueryParam(key, value)')
  })

  it('binds the parameter through the router (Kotlin)', () => {
    const { code } = transform(SRC, { target: 'kotlin' })
    expect(code).not.toMatch(HELPER_DECL)
    // Was `useRouter()`. router-kotlin ships useNavigate / useParams /
    // useLoaderData and NO useRouter, so that emit could not build -- but the
    // Kotlin STUB declared one, so this assertion and every stub-level check
    // passed while a real `gradle assembleDebug` failed with
    // `Unresolved reference 'useRouter'`. The invariant is unchanged (the
    // parameter binds through the router); only the accessor is corrected to
    // the CompositionLocal the runtime actually exposes.
    expect(code).toContain('PyreonUrlState(LocalPyreonRouter.current, "q", "all")')
    expect(RUNTIME_KOTLIN).toContain('router?.setQueryParam(key, value)')
  })

  // The call shape is what keeps shared source shared: `q()` reads on the web,
  // and must read on both native targets too. Emitting a bare `q` would
  // interpolate the container instead of the value — wrong, and silent.
  it('preserves the CALL, so `q()` reads the value on both targets', () => {
    expect(transform(SRC, { target: 'swift' }).code).toContain('\\(q())')
    expect(transform(SRC, { target: 'kotlin' }).code).toContain('${q()}')
  })

  it('no longer warns, now that the binding lowers', () => {
    expect(transform(SRC, { target: 'swift' }).warnings).toHaveLength(0)
    expect(transform(SRC, { target: 'kotlin' }).warnings).toHaveLength(0)
  })

  // The invariant this spec protects — never silently coerce a default the emit has no codec for — now applies to the
  // shapes that genuinely have none: the web infers a JSON codec for an object, and there is no native type to decode
  // it INTO at this call site. (An array of scalar literals DOES lower — see "list defaults" below.)
  it('declines an object default rather than coercing it', () => {
    for (const def of ['{}', '{ a: 1 }']) {
      const src = `import { useUrlState } from '@pyreon/url-state'
import { Stack } from '@pyreon/primitives'
export function C() { const p = useUrlState('tags', ${def}); return (<Stack />) }`
      const { code, warnings } = transform(src, { target: 'swift' })
      expect(code, def).not.toContain('PyreonUrlState')
      expect(
        warnings.some((w) => w.includes('STRING, NUMBER or BOOLEAN default') && w.includes('JSON codec')),
        def,
      ).toBe(true)
    }
  })

  // A non-literal default cannot be baked in either — same rule as the key.
  it('declines a non-literal default', () => {
    const src = `import { useUrlState } from '@pyreon/url-state'
import { Stack } from '@pyreon/primitives'
export function C() { const d = 'x'; const p = useUrlState('q', d); return (<Stack />) }`
    const { code, warnings } = transform(src, { target: 'swift' })
    expect(code).not.toContain('PyreonUrlState')
    expect(warnings.some((w) => w.includes('STRING, NUMBER or BOOLEAN default'))).toBe(true)
  })

  // A dynamic key cannot be baked into the emit — the same conservative rule
  // useFetch applies to its URL and useStorage to its key.
  it('declines a non-literal key', () => {
    const src = `import { useUrlState } from '@pyreon/url-state'
import { Stack } from '@pyreon/primitives'
export function C() { const k = 'q'; const v = useUrlState(k, ''); return (<Stack />) }`
    expect(transform(src, { target: 'swift' }).code).not.toContain('PyreonUrlState(')
  })

  // One instance per binding, and NO helper declaration — the types are the
  // router runtime's, so a second file binding url-state cannot redeclare them.
  it('constructs one instance per binding and declares no helper', () => {
    const src = `import { useUrlState } from '@pyreon/url-state'
import { Stack, Text } from '@pyreon/primitives'
export function C() { const a = useUrlState('a', ''); const b = useUrlState('b', ''); return (<Stack><Text>{a()}{b()}</Text></Stack>) }`
    for (const target of ['swift', 'kotlin'] as const) {
      const { code } = transform(src, { target })
      expect(code, target).not.toMatch(HELPER_DECL)
      expect(code.split('PyreonUrlState(').length - 1, target).toBe(2)
    }
  })
})

// ─── Typed defaults ─────────────────────────────────────────────────────────
//
// A URL carries text, so a non-string binding needs a codec. The web infers
// one from the DEFAULT's type (`inferSerializer`, url-state/src/serializers.ts),
// and these emits mirror it — including the parts that are easy to get subtly
// wrong: `+raw` is JS ToNumber (not either target's own string→number init),
// and the boolean decode is `raw === 'true'`, not a truthiness check.
//
// int-vs-double follows `inferTypeFromInitial`, the same rule every other PMTC
// lowering uses, so `useUrlState('page', 1)` is Int on both targets and
// `` `Page ${page()}` `` renders "Page 1" rather than "Page 1.0".

const TYPED_SRC = `import { useUrlState } from '@pyreon/url-state'
import { Stack, Text } from '@pyreon/primitives'
export function C() {
  const page = useUrlState('page', 1)
  const zoom = useUrlState('zoom', 1.5)
  const open = useUrlState('open', false)
  const bump = () => { page.set(page() + 1); zoom.set(2.5); open.set(true) }
  return (<Stack><Text>{\`\${page()} \${zoom()} \${open()}\`}</Text></Stack>)
}`

describe('useUrlState typed defaults', () => {
  it('lowers number and boolean defaults without warning (Swift)', () => {
    const { code, warnings } = transform(TYPED_SRC, { target: 'swift' })
    expect(warnings).toHaveLength(0)
    expect(code).toContain('PyreonUrlStateInt(router: pyreonRouter, key: "page", defaultValue: 1)')
    expect(code).toContain(
      'PyreonUrlStateDouble(router: pyreonRouter, key: "zoom", defaultValue: 1.5)',
    )
    expect(code).toContain(
      'PyreonUrlStateBool(router: pyreonRouter, key: "open", defaultValue: false)',
    )
  })

  it('lowers number and boolean defaults without warning (Kotlin)', () => {
    const { code, warnings } = transform(TYPED_SRC, { target: 'kotlin' })
    expect(warnings).toHaveLength(0)
    expect(code).toContain('PyreonUrlStateInt(LocalPyreonRouter.current, "page", 1)')
    expect(code).toContain('PyreonUrlStateDouble(LocalPyreonRouter.current, "zoom", 1.5)')
    expect(code).toContain('PyreonUrlStateBool(LocalPyreonRouter.current, "open", false)')
  })

  // An integer literal is Int, a fractional one Double — the repo-wide
  // `inferTypeFromInitial` rule. A url-state binding that alone produced a
  // Double for `1` would be the anomaly, and would print "1.0" in an
  // interpolation where the web prints "1".
  it('splits Int from Double on the default literal, not on the type name', () => {
    const swift = transform(TYPED_SRC, { target: 'swift' }).code
    expect(swift).toContain('PyreonUrlStateInt(router: pyreonRouter, key: "page", defaultValue: 1)')
    expect(swift).toContain(
      'PyreonUrlStateDouble(router: pyreonRouter, key: "zoom", defaultValue: 1.5)',
    )
  })

  // A negated literal parses as a unary WRAPPING the literal — the shape
  // `inferTypeFromInitial` already unwraps for `signal(-5)`.
  it('accepts a negated numeric default', () => {
    const src = `import { useUrlState } from '@pyreon/url-state'
import { Stack, Text } from '@pyreon/primitives'
export function C() { const o = useUrlState('o', -3); return (<Stack><Text>{\`\${o()}\`}</Text></Stack>) }`
    expect(transform(src, { target: 'swift' }).code).toContain(
      'PyreonUrlStateInt(router: pyreonRouter, key: "o", defaultValue: -3)',
    )
    expect(transform(src, { target: 'kotlin' }).code).toContain(
      'PyreonUrlStateInt(LocalPyreonRouter.current, "o", -3)',
    )
  })

  // `set` must round-trip through the web's `String(v)`, which prints a whole
  // number WITHOUT a trailing `.0`. Both targets' own toString would emit
  // "1.0" and produce `?zoom=1.0` where the web writes `?zoom=1`.
  it('serializes a whole Double without a trailing .0 on both targets', () => {
    // The scalar Double `set` and every number-list `set` share ONE formatter, and its behaviour (a whole number prints
    // as digits, never "1.0") is asserted by EXECUTION in `native-url-state-list-parity.test.ts`.
    expect(RUNTIME_SWIFT).toContain('router?.setQueryParam(key, pyreonUrlFormatDouble(value))')
    expect(RUNTIME_KOTLIN).toContain('router?.setQueryParam(key, pyreonUrlFormatDouble(value))')
    expect(RUNTIME_SWIFT).toContain('String(format: "%.0f", value)')
    expect(RUNTIME_KOTLIN).toContain('java.math.BigDecimal(value).toPlainString()')
  })

  // The web's boolean decode is true/1 → true, false/0 → false, anything else
  // → the DEFAULT (not `false`). A truthiness check would diverge on a
  // hand-written link.
  it('decodes a boolean exactly like the web: true/1, false/0, else the default', () => {
    const swift = RUNTIME_SWIFT
    expect(swift).toContain('case "true", "1": return true')
    expect(swift).toContain('case "false", "0": return false')
    expect(swift).toContain('default: return defaultValue')
    const kotlin = RUNTIME_KOTLIN
    expect(kotlin).toContain('"true", "1" -> true')
    expect(kotlin).toContain('"false", "0" -> false')
    expect(kotlin).toContain('else -> defaultValue')
  })

  // `?page=` is ABSENT on the web (the default), not 0 — `+''` is 0 in JS, so
  // the ToNumber reproduction must special-case it the same way.
  it('an empty numeric param decodes to the default on both targets', () => {
    expect(RUNTIME_SWIFT).toContain('if t.isEmpty { return fallback }')
    expect(RUNTIME_KOTLIN).toContain('if (t.isEmpty()) return fallback')
  })

  // No file declares any helper — typed or not — so any mix of url-state
  // bindings across files links against the one set the router ships.
  it('declares no url-state helper for any value type', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const code = transform(TYPED_SRC, { target }).code
      expect(code, target).not.toMatch(HELPER_DECL)
      expect(code, target).not.toContain('pyreonUrlNumber')
    }
  })

  // Swift's Int and Kotlin's Long are both 64-bit, so a shared source reads the
  // same integers on both targets: ?page=3000000000 is a number on iOS AND on
  // Android (it used to fall back to the default on Android, whose Int is
  // 32-bit). Both bound the accepted set to the JS safe-integer range, the
  // way the web's Number(raw) reads it.
  it('accepts the same integer range on both targets', () => {
    // The bound lives in the co-located runtime now (see the file header
    // above these classes moved OUT of per-file emission), not in the
    // per-call-site transform() output.
    expect(RUNTIME_SWIFT).toContain('n >= -9007199254740991, n <= 9007199254740991')
    expect(RUNTIME_KOTLIN).toContain('n < -9007199254740991.0 || n > 9007199254740991.0')
    expect(RUNTIME_KOTLIN).toContain('return n.toLong()')
  })

  // The number helper is shared by Int and Double — declared once per runtime.
  it('the runtime declares the ToNumber helper exactly once per target', () => {
    expect(RUNTIME_SWIFT.split('func pyreonUrlNumber').length - 1).toBe(1)
    expect(RUNTIME_KOTLIN.split('fun pyreonUrlNumber').length - 1).toBe(1)
  })

  // R3 — the emit is TYPECHECKED by the real toolchains, not just asserted as
  // a string. This is what catches an emit that reads plausibly and does not
  // compile (a wrong `Math.floor` receiver, an Int/Double mismatch, a Swift
  // `for … where` that needs a `return`).
  it.skipIf(!isSwiftcAvailable())('typechecks against swiftc (Swift)', () => {
    const r = validateSwiftWithStubs(transform(TYPED_SRC, { target: 'swift' }).code)
    expect(r.ok, r.error).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('compiles against kotlinc (Kotlin)', () => {
    const r = validateKotlin(transform(TYPED_SRC, { target: 'kotlin' }).code)
    expect(r.ok, r.error).toBe(true)
  })
})

// ─── List defaults ──────────────────────────────────────────────────────────
//
// `useUrlState('tags', ['a', 'b'])` is a list binding over the web's comma format. The element type is read off the
// literals the way the web reads it off the first element (`inferElementCodec`); an empty array carries none, so it
// stays strings. The codec itself is asserted by EXECUTION in `native-url-state-list-parity.test.ts`; this covers the
// lowering and — the part that needed a compiler change — the TYPE of `tags()`, without which a method chained onto
// it lowers with an unknown receiver (`.length` stays `.length` where Swift needs `.count`).

const LIST_SRC = `import { useUrlState } from '@pyreon/url-state'
import { Stack, Text, Button } from '@pyreon/primitives'
export function C() {
  const tags = useUrlState('tags', ['a', 'b'])
  const ids = useUrlState('ids', [1, 2])
  const zs = useUrlState('zs', [1.5, 2])
  const fl = useUrlState('fl', [true, false])
  const none = useUrlState('none', [])
  const add = () => tags.set([...tags(), 'c'])
  return (<Stack><Text>{\`\${tags().length} \${ids().length} \${zs().length} \${fl().length} \${none().length}\`}</Text><Button onPress={add}>x</Button></Stack>)
}`

describe('useUrlState list defaults', () => {
  it('picks the list binding from the literals (Swift)', () => {
    const { code, warnings } = transform(LIST_SRC, { target: 'swift' })
    expect(warnings).toHaveLength(0)
    expect(code).toContain('PyreonUrlStateStrings(router: pyreonRouter, key: "tags", defaultValue: ["a", "b"])')
    expect(code).toContain('PyreonUrlStateInts(router: pyreonRouter, key: "ids", defaultValue: [1, 2])')
    // A whole number inside a fractional list is spelled as a Double, so the literal types on both targets.
    expect(code).toContain('PyreonUrlStateDoubles(router: pyreonRouter, key: "zs", defaultValue: [1.5, 2.0])')
    expect(code).toContain('PyreonUrlStateBools(router: pyreonRouter, key: "fl", defaultValue: [true, false])')
    // An empty default has no element type: strings, as on the web.
    expect(code).toContain('PyreonUrlStateStrings(router: pyreonRouter, key: "none", defaultValue: [])')
  })

  it('picks the list binding from the literals (Kotlin)', () => {
    const { code, warnings } = transform(LIST_SRC, { target: 'kotlin' })
    expect(warnings).toHaveLength(0)
    expect(code).toContain('PyreonUrlStateStrings(LocalPyreonRouter.current, "tags", listOf("a", "b"))')
    expect(code).toContain('PyreonUrlStateInts(LocalPyreonRouter.current, "ids", listOf(1, 2))')
    expect(code).toContain('PyreonUrlStateDoubles(LocalPyreonRouter.current, "zs", listOf(1.5, 2.0))')
    expect(code).toContain('PyreonUrlStateBools(LocalPyreonRouter.current, "fl", listOf(true, false))')
    expect(code).toContain('PyreonUrlStateStrings(LocalPyreonRouter.current, "none", listOf())')
  })

  // The compiler change: the bare `tags()` call of a callable declaration is TYPED by its owner (`DeclTyping.value`).
  // `slice` is the receiver-type-dependent method: it lowers to a copy only when the receiver is KNOWN to be an array
  // (`Array(x)` / `x.toList()`), and is emitted verbatim — which neither target accepts — when the receiver is unknown.
  // (`length` is not the witness: it lowers by name, so it passes with or without the typing.)
  const SLICE_SRC = `import { useUrlState } from '@pyreon/url-state'
import { Stack, Text } from '@pyreon/primitives'
import { For } from '@pyreon/core'
export function C() {
  const tags = useUrlState('tags', ['a', 'b'])
  const copy = tags().slice()
  const head = tags().slice(0, 1)
  return (<Stack><For each={copy} by={(t) => t}>{(t) => <Text>{t}</Text>}</For><For each={head} by={(t) => t}>{(t) => <Text>{t}</Text>}</For></Stack>)
}`

  it('types the bare call, so a receiver-typed method chained onto it lowers (Swift)', () => {
    const { code } = transform(SLICE_SRC, { target: 'swift' })
    expect(code).toContain('let copy = Array(tags())')
    expect(code).not.toContain('.slice(')
    if (isSwiftcAvailable()) {
      const r = validateSwiftWithStubs(code)
      expect(r.ok, r.error).toBe(true)
    }
  })

  it('types the bare call, so a receiver-typed method chained onto it lowers (Kotlin)', () => {
    const { code } = transform(SLICE_SRC, { target: 'kotlin' })
    expect(code).toContain('val copy = tags().toList()')
    expect(code).not.toContain('tags().slice()')
    if (isKotlincAvailable()) {
      const r = validateKotlin(code)
      expect(r.ok, r.error).toBe(true)
    }
  })

  it('lowers the spread of a list binding to a concatenation', () => {
    expect(transform(LIST_SRC, { target: 'swift' }).code).toContain('tags.set((tags() + ["c"]))')
  })

  it('declines an array it cannot type, naming the reason', () => {
    for (const def of ["['a', 1]", '[1, true]', '[[1], [2]]', '[{ a: 1 }]', '[x]', "[...['a']]", '[1e999]']) {
      const src = `import { useUrlState } from '@pyreon/url-state'
import { Stack } from '@pyreon/primitives'
export function C() { const x = 1; const p = useUrlState('tags', ${def}); return (<Stack />) }`
      const { code, warnings } = transform(src, { target: 'swift' })
      expect(code, def).not.toContain('PyreonUrlState')
      expect(warnings.some((w) => w.includes('STRING, NUMBER or BOOLEAN default')), def).toBe(true)
    }
  })

  it('declares no helper for a list binding either', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(LIST_SRC, { target }).code, target).not.toMatch(HELPER_DECL)
    }
  })

  it.skipIf(!isSwiftcAvailable())('typechecks against swiftc (Swift)', () => {
    const r = validateSwiftWithStubs(transform(LIST_SRC, { target: 'swift' }).code)
    expect(r.ok, r.error).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('compiles against kotlinc (Kotlin)', () => {
    const r = validateKotlin(transform(LIST_SRC, { target: 'kotlin' }).code)
    expect(r.ok, r.error).toBe(true)
  })
})
