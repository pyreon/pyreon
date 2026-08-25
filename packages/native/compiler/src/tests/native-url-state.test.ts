// `useUrlState` binds ONE router search parameter, on both targets.
//
// The prerequisite was a real bug: PyreonRouter advertised `query` in its
// header on both platforms and implemented none of it, so a path carrying
// `?…` went into matchPath whole. That is fixed in the router packages; this
// covers the compiler half.
//
// The helper type is emitted INLINE rather than shipped as a co-located
// runtime because it needs the ACTIVE router — a standalone runtime would have
// to import PyreonRouter and stop being self-contained. Same reasoning as
// `PyreonSchemaError`.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const SRC = `import { useUrlState } from '@pyreon/url-state'
import { Stack, Text } from '@pyreon/primitives'
export function C() { const q = useUrlState('q', 'all'); return (<Stack><Text>{q()}</Text></Stack>) }`

describe('useUrlState lowering', () => {
  it('binds the parameter through the router (Swift)', () => {
    const { code } = transform(SRC, { target: 'swift' })
    expect(code).toContain('struct PyreonUrlState')
    expect(code).toContain('PyreonUrlState(router: pyreonRouter, key: "q", defaultValue: "all")')
    // Optional-chained: the environment router IS optional, so a component
    // rendered outside a RouterProvider degrades to the default rather than
    // crashing — the same choice useNavigate/useParams make.
    expect(code).toContain('router?.setQueryParam(key, value)')
  })

  it('binds the parameter through the router (Kotlin)', () => {
    const { code } = transform(SRC, { target: 'kotlin' })
    expect(code).toContain('class PyreonUrlState')
    // Was `useRouter()`. router-kotlin ships useNavigate / useParams /
    // useLoaderData and NO useRouter, so that emit could not build -- but the
    // Kotlin STUB declared one, so this assertion and every stub-level check
    // passed while a real `gradle assembleDebug` failed with
    // `Unresolved reference 'useRouter'`. The invariant is unchanged (the
    // parameter binds through the router); only the accessor is corrected to
    // the CompositionLocal the runtime actually exposes.
    expect(code).toContain('PyreonUrlState(LocalPyreonRouter.current, "q", "all")')
    expect(code).toContain('router.setQueryParam(key, value)')
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

  // This spec used to assert `useUrlState('page', 1)` was DECLINED, which was
  // the v1 limit rather than the invariant. The invariant it was protecting —
  // never silently coerce a default the emit has no codec for — is what is
  // asserted here, now against the shapes that genuinely have none: the web
  // infers a comma-join for an array and a JSON codec for an object, and there
  // is no native type to decode either INTO at this call site.
  it('declines an array or object default rather than coercing it', () => {
    for (const def of ['[]', "['a']", '{}', '{ a: 1 }']) {
      const src = `import { useUrlState } from '@pyreon/url-state'
import { Stack } from '@pyreon/primitives'
export function C() { const p = useUrlState('tags', ${def}); return (<Stack />) }`
      const { code, warnings } = transform(src, { target: 'swift' })
      expect(code, def).not.toContain('PyreonUrlState')
      expect(
        warnings.some((w) => w.includes('STRING, NUMBER or BOOLEAN default')),
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

  // The helper is emitted once per file, not once per binding.
  it('emits the helper exactly once for two bindings', () => {
    const src = `import { useUrlState } from '@pyreon/url-state'
import { Stack, Text } from '@pyreon/primitives'
export function C() { const a = useUrlState('a', ''); const b = useUrlState('b', ''); return (<Stack><Text>{a()}{b()}</Text></Stack>) }`
    const { code } = transform(src, { target: 'swift' })
    // `split('struct PyreonUrlState')` would also match PyreonUrlStateInt et
    // al, so anchor on the declaration's own opening brace.
    expect(code.split('struct PyreonUrlState {').length - 1).toBe(1)
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
    expect(code).toContain(
      'PyreonUrlStateInt(router: pyreonRouter, key: "page", defaultValue: 1)',
    )
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
    expect(swift).toContain('let defaultValue: Int')
    expect(swift).toContain('let defaultValue: Double')
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
    expect(transform(TYPED_SRC, { target: 'swift' }).code).toContain('String(Int(value))')
    expect(transform(TYPED_SRC, { target: 'kotlin' }).code).toContain('value.toLong().toString()')
  })

  // The web's boolean decode is `raw === 'true'` — "1"/"TRUE" are false. A
  // permissive check would diverge on a hand-written link.
  it('decodes a boolean by exact "true" match, not truthiness', () => {
    expect(transform(TYPED_SRC, { target: 'swift' }).code).toContain('return raw == "true"')
    expect(transform(TYPED_SRC, { target: 'kotlin' }).code).toContain('return raw == "true"')
  })

  // Only the helpers actually bound are emitted, so a string-only file is
  // byte-identical to what it produced before typed defaults existed.
  it('emits only the helpers a file actually binds', () => {
    const stringOnly = transform(SRC, { target: 'swift' }).code
    expect(stringOnly).toContain('struct PyreonUrlState {')
    expect(stringOnly).not.toContain('PyreonUrlStateInt')
    expect(stringOnly).not.toContain('pyreonUrlNumber')

    // ... and a number-only file does not drag in the string helper.
    const numOnly = `import { useUrlState } from '@pyreon/url-state'
import { Stack, Text } from '@pyreon/primitives'
export function C() { const n = useUrlState('n', 0); return (<Stack><Text>{\`\${n()}\`}</Text></Stack>) }`
    const code = transform(numOnly, { target: 'swift' }).code
    expect(code).not.toContain('struct PyreonUrlState {')
    expect(code).toContain('struct PyreonUrlStateInt')
    expect(code).toContain('pyreonUrlNumber')
  })

  // Swift's Int is 64-bit and Kotlin's is 32-bit, so a range guard written
  // per-target would ACCEPT ?page=3000000000 on iOS and fall back to the
  // default on Android — one shared source, two answers. Both are pinned to
  // the narrower (32-bit) bound so the accepted set is identical.
  it('accepts the same integer range on both targets', () => {
    expect(transform(TYPED_SRC, { target: 'swift' }).code).toContain(
      'n >= -2147483648, n <= 2147483647',
    )
    const kotlin = transform(TYPED_SRC, { target: 'kotlin' }).code
    expect(kotlin).toContain('n < Int.MIN_VALUE.toDouble() || n > Int.MAX_VALUE.toDouble()')
  })

  // The number helper is shared by Int and Double — emitted once, not twice.
  it('emits the ToNumber helper exactly once when both numeric forms are bound', () => {
    const swift = transform(TYPED_SRC, { target: 'swift' }).code
    expect(swift.split('func pyreonUrlNumber').length - 1).toBe(1)
    const kotlin = transform(TYPED_SRC, { target: 'kotlin' }).code
    expect(kotlin.split('fun pyreonUrlNumber').length - 1).toBe(1)
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
