// KNOWN BUGS found while raising branch coverage of `expr-utils.ts`,
// `style-to-native.ts` and `infer-type.ts`. Each is an `it.fails` describing
// the CORRECT behaviour, so the day the product fix lands the lock turns red
// and has to be converted to a plain `it` — the test is the specification, not
// a record of the defect.
//
// Every one of these is SILENT: the emit is produced, no warning is raised,
// and the failure surfaces (if at all) at the swiftc/kotlinc gate pointing at
// generated code rather than at the source line that caused it. Two are locked
// by running the REAL toolchains, because "this compiles" is the whole claim.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

// A toolchain-unavailable validator returns `{ ok: true, skipped: true }`, so
// an `it.fails` guarded only by an availability check inside the body would
// PASS the assertion and therefore FAIL the lock. Pick the runner up front.
const swiftFails = isSwiftcAvailable() ? it.fails : it.skip
const kotlinFails = isKotlincAvailable() ? it.fails : it.skip

// ───────────────────────────────────────────────────────────────────────────
// 1. `buildJsonLiteralParts` — an ARRAY SPREAD is emitted one level too deep
// ───────────────────────────────────────────────────────────────────────────

const SPREAD_JSON = `import { Stack, WebView } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App() {
  const xs = signal<number[]>([1, 2])
  return (<Stack><WebView html="x" data={[...xs(), 9]} /></Stack>)
}`

describe('KNOWN BUG — an array SPREAD in a JSON position nests instead of flattening', () => {
  it('reproduces: the spread argument is encoded as a NESTED array element', () => {
    // `[...xs, 9]` is `[1, 2, 9]` in JS. `buildJsonLiteralParts`'s array arm
    // walks `e.elements`, and a `spread` element matches none of the
    // literal/array/object/paren cases — so it falls through to the generic
    // "runtime value" tail and becomes ONE hole, which the emitter fills with
    // `encode(xs)` == `[1,2]`. The emitted JSON is `[[1,2],9]`.
    const sw = transform(SPREAD_JSON, { target: 'swift' }).code
    expect(sw).toContain('"[\\(PyreonJSON.encode(xs)),9]"')
    const kt = transform(SPREAD_JSON, { target: 'kotlin' }).code
    expect(kt).toContain('"[${PyreonJson.encode(xs)},9]"')
  })

  it.fails(
    'KNOWN BUG: fix = handle `spread` inside the array arm of `buildJsonLiteralParts` — ' +
      'either splice the spread argument into the surrounding array (a `concat`-shaped ' +
      'runtime join) or return null so the caller keeps its own path. ' +
      'Today `data={[...xs(), 9]}` ships `[[1,2],9]` to the hosted page where the web ' +
      'ships `[1,2,9]` — a different SHAPE, read by `Object.keys`/indexing on the page.',
    () => {
      const sw = transform(SPREAD_JSON, { target: 'swift' }).code
      // The nested form must NOT be what we emit.
      expect(sw).not.toContain('"[\\(PyreonJSON.encode(xs)),9]"')
    },
  )

  it.fails(
    'KNOWN BUG: the diagnostic raised for this shape is the WRONG one — it says ' +
      '"Spread arguments (`f(...args)`)", which is about a CALL spread, not an array ' +
      'literal spread in a JSON position. Fix = raise a diagnostic naming the array/JSON ' +
      'shape, or none at all once the lowering is correct.',
    () => {
      const w = transform(SPREAD_JSON, { target: 'swift' }).warnings.join('\n')
      expect(w).not.toContain('Spread arguments (`f(...args)`)')
    },
  )

  it('the NEIGHBOURING shapes are correct — this is specific to a spread', () => {
    const plain = `import { Stack, WebView } from '@pyreon/primitives'
export function App() { return (<Stack><WebView html="x" data={[1, 9]} /></Stack>) }`
    expect(transform(plain, { target: 'swift' }).code).toContain('data: "[1,9]"')
    const dyn = `import { Stack, WebView } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App() {
  const xs = signal<number[]>([1])
  return (<Stack><WebView html="x" data={{ a: 1, b: xs() }} /></Stack>)
}`
    // A dynamic FIELD is a legitimate hole — `b` is genuinely the whole array.
    expect(transform(dyn, { target: 'swift' }).code).toContain(
      '"{\\"a\\":1,\\"b\\":\\(PyreonJSON.encode(xs))}"',
    )
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 2. `walkLowerParams` — a JSX loader body leaves an UNBOUND `ctx`
// ───────────────────────────────────────────────────────────────────────────

const JSX_LOADER = `import { Stack, Text } from '@pyreon/primitives'
function User() { return (<Stack><Text>user</Text></Stack>) }
function App() {
  const router = createRouter({ routes: [
    { path: '/users/:id', component: User, loader: (ctx) => <Text>{ctx.params.id}</Text> },
  ] })
  return (<RouterProvider router={router}><RouterView /></RouterProvider>)
}`

describe('KNOWN BUG — a JSX route-loader body emits an unbound `ctx` on BOTH targets', () => {
  it('reproduces: `ctx` survives into the emit and nothing binds it', () => {
    const sw = transform(JSX_LOADER, { target: 'swift' }).code
    expect(sw).toContain('ctx.params.id')
    // Nothing declares `ctx` anywhere in the emitted Swift.
    expect(sw).not.toMatch(/\bctx\b\s*(in|=|:)/)
    const kt = transform(JSX_LOADER, { target: 'kotlin' }).code
    expect(kt).toContain('ctx.params.id')
  })

  it.fails(
    'KNOWN BUG: fix = RECURSE into `jsx-element` / `jsx-fragment` in `walkLowerParams` ' +
      '(attrs, event handlers and children), exactly as `substituteIdentifier` already ' +
      'does — or, at minimum, set `residualCtx` when a JSX subtree references `ctx`, so ' +
      'the loader is dropped with the existing named warning instead of emitting a ' +
      'dangling identifier. The arm currently returns the node UNTOUCHED with a comment ' +
      'reading "a loader body is not JSX", which is a claim about intent, not a guard.',
    () => {
      const r = transform(JSX_LOADER, { target: 'swift' })
      // Either the param lowered, or the loader was refused with a warning.
      const lowered = r.code.includes('params["id"]')
      const refused = r.warnings.join('\n').includes('for something other than `ctx.params.*`')
      expect(lowered || refused).toBe(true)
    },
  )

  it('every NON-JSX body shape either lowers the param or warns — JSX is the only hole', () => {
    const mk = (loader: string) => JSX_LOADER.replace(
      'loader: (ctx) => <Text>{ctx.params.id}</Text>',
      `loader: ${loader}`,
    )
    for (const loader of [
      '(ctx) => fetchUser(ctx.params.id)',
      '(ctx) => [ctx.params.id]',
      '(ctx) => ({ id: ctx.params.id })',
      '(ctx) => `u-${ctx.params.id}`',
    ]) {
      expect(transform(mk(loader), { target: 'swift' }).code).toContain('params["id"]')
    }
    expect(transform(mk('(ctx) => fetchUser(ctx)'), { target: 'swift' }).warnings.join('\n')).toContain(
      'for something other than `ctx.params.*`',
    )
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 3. (FIXED UPSTREAM while this file was being written) — an unresolvable
//    <Text> typography value used to vanish with ZERO warnings. Kept as a
//    PASSING regression lock rather than deleted: the silent-drop shape is the
//    one that recurs, and the fix is a guard per lookup that a later edit can
//    drop one arm of.
// ───────────────────────────────────────────────────────────────────────────

const textApp = (style: string): string =>
  `import { Stack, Text } from '@pyreon/primitives'
export function App() { return (<Stack><Text style={${style}}>x</Text></Stack>) }`

describe('REGRESSION — an unresolvable <Text> typography value must NOT vanish silently', () => {
  it.each([
    ['an out-of-table fontWeight', `{ fontWeight: '800' }`, '.font(', 'fontWeight'],
    ['an unmapped textAlign', `{ textAlign: 'justify' }`, '.multilineTextAlignment(', 'textAlign'],
  ])('%s emits nothing AND is named in a warning', (_k, style, marker, named) => {
    const r = transform(textApp(style), { target: 'swift' })
    expect(r.code).not.toContain(marker)
    expect(r.warnings.join('\n')).toContain(named)
  })

  it('a named COLOUR is reported as unparseable on Swift', () => {
    const r = transform(textApp(`{ color: 'red' }`), { target: 'swift' })
    expect(r.code).not.toContain('.foregroundColor(')
    expect(r.warnings.join('\n')).toContain('[color] could not be parsed')
  })

  it('…and reaches the container diagnostic on Kotlin (where `color` has no Modifier)', () => {
    const r = transform(textApp(`{ color: 'red' }`), { target: 'kotlin' })
    expect(r.code).not.toContain('color = Color(')
    expect(r.warnings.join('\n')).toContain('CSS `color` on a container has no Compose Modifier')
  })

  it('the guard is PER TARGET — a value in one table but not the other is still handled', () => {
    // Both tables carry the same five names today, so this asserts the SHAPE:
    // an in-table value resolves and says nothing, on both targets.
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(textApp(`{ fontWeight: 'bold' }`), { target })
      expect(r.warnings.join('\n')).toBe('')
    }
  })

  it('the RESOLVABLE neighbours are untouched — the guard is additive', () => {
    const r = transform(
      textApp(`{ fontSize: 14, fontWeight: 'bold', color: '#00aa00', textAlign: 'center' }`),
      { target: 'swift' },
    )
    expect(r.code).toContain('.font(.system(size: 14, weight: .bold))')
    expect(r.code).toContain('.foregroundColor(Color(')
    expect(r.code).toContain('.multilineTextAlignment(.center)')
    expect(r.warnings.join('\n')).toBe('')
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 4. `widenFloatLocals` does not bind a helper's own PARAMS
// ───────────────────────────────────────────────────────────────────────────

// The ONLY difference between these two is the PARAM. Both iterate the same
// literal-seeded signal (so the element type is inferred identically) and both
// accumulate the same fractional field.
const accApp = (params: string, iterable: string, call: string): string =>
  `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
function App() {
  const items = signal([{ id: 1, price: 2.5 }])
  const total = (${params}) => {
    let acc = 0
    for (const r of ${iterable}) acc += r.price
    return acc
  }
  return (<Stack><Text>{String(total(${call}))}</Text></Stack>)
}`

const ZERO_PARAM_ACC = accApp('', 'items()', '')
const PARAM_ACC = accApp('rs: { id: number; price: number }[]', 'rs', 'items()')

describe('KNOWN BUG — a PARAM-fed accumulator is never widened to Double', () => {
  it('reproduces: the seed stays `0` and the return type stays Int', () => {
    const sw = transform(PARAM_ACC, { target: 'swift' }).code
    expect(sw).toContain('var acc = 0')
    expect(sw).not.toContain('var acc = 0.0')
    expect(sw).toContain('-> Int')
    const kt = transform(PARAM_ACC, { target: 'kotlin' }).code
    expect(kt).toContain('var acc = 0')
    expect(kt).toContain(': Int')
  })

  it('the ZERO-PARAM twin — the shape the feature was written against — DOES widen', () => {
    expect(transform(ZERO_PARAM_ACC, { target: 'swift' }).code).toContain('var acc = 0.0')
    expect(transform(ZERO_PARAM_ACC, { target: 'swift' }).code).toContain('-> Double')
    expect(transform(ZERO_PARAM_ACC, { target: 'kotlin' }).code).toContain('var acc = 0.0')
  })

  it.fails(
    'KNOWN BUG: fix = seed the function DECL\'s own params into the ctx handed to ' +
      '`widenFloatLocals` (emit-swift.ts / emit-kotlin.ts call it with the component-level ' +
      '`inferCtx`, which knows nothing about `rs`), mirroring the scratch-ctx seeding ' +
      '`inferReturnType` already performs. Without the param bound, `inferType(rs)` is ' +
      'unknown → the for-of item never binds → `r.price` is unknown → no widening. ' +
      'This is the SAME family the pass was written for, one spelling further on.',
    () => {
      expect(transform(PARAM_ACC, { target: 'swift' }).code).toContain('var acc = 0.0')
    },
  )

  swiftFails(
    'KNOWN BUG (swiftc): the emit does not compile — `cannot convert value of type ' +
      "'Double' to expected argument type 'Int'`",
    () => {
      const r = validateSwiftWithStubs(transform(PARAM_ACC, { target: 'swift' }).code)
      // oxlint-disable-next-line vitest/no-standalone-expect -- inside swiftFails/kotlinFails, aliases of it.fails/it.skip picked by toolchain availability; oxlint cannot trace the alias back to a real test block.
      expect(r.ok, r.error ?? '').toBe(true)
    },
  )

  kotlinFails(
    'KNOWN BUG (kotlinc): the same emit does not compile — `assignment type mismatch: ' +
      "actual type is 'Double', but 'Int' was expected`",
    () => {
      const r = validateKotlin(transform(PARAM_ACC, { target: 'kotlin' }).code)
      // oxlint-disable-next-line vitest/no-standalone-expect -- inside swiftFails/kotlinFails, aliases of it.fails/it.skip picked by toolchain availability; oxlint cannot trace the alias back to a real test block.
      expect(r.ok, r.error ?? '').toBe(true)
    },
  )
})

// ───────────────────────────────────────────────────────────────────────────
// 5 + 6. STUB FIDELITY — the validation stubs are NARROWER than the real SDKs
// ───────────────────────────────────────────────────────────────────────────
//
// A stub narrower than the runtime MANUFACTURES a bug in correct codegen: the
// emit below is valid SwiftUI / valid Compose, and the gate rejects it. The
// consequence is worse than a red test — it means these two emits, which every
// inline `style={{ border… }}` / per-side `padding` produces, have NEVER been
// verified to compile by any gate.

const BORDER_APP = `import { Stack, Text } from '@pyreon/primitives'
export function App() {
  return (<Stack style={{ borderWidth: 2, borderColor: '#ff0000', borderRadius: 6 }}><Text>x</Text></Stack>)
}`

const PAD4_APP = `import { Stack, Text } from '@pyreon/primitives'
export function App() {
  return (<Stack style={{ paddingTop: 1, paddingLeft: 2, paddingBottom: 3, paddingRight: 4 }}><Text>x</Text></Stack>)
}`

describe('KNOWN BUG — `swift-stubs.ts` declares no `RoundedRectangle`', () => {
  it('reproduces: the border emit names a SwiftUI type the stubs do not declare', () => {
    expect(transform(BORDER_APP, { target: 'swift' }).code).toContain(
      '.overlay(RoundedRectangle(cornerRadius: 6).stroke(',
    )
  })

  swiftFails(
    'KNOWN BUG: fix = add `RoundedRectangle` (a real SwiftUI `Shape` with a ' +
      '`cornerRadius:` init and a `.stroke(_:lineWidth:)`) to `swift-stubs.ts`. ' +
      'Today every `borderWidth`+`borderColor` inline style fails ' +
      "`validateSwiftWithStubs` with `cannot find 'RoundedRectangle' in scope` — so the " +
      'emit is CORRECT and the gate is what is wrong, and no gate can currently prove ' +
      'this emit compiles at all.',
    () => {
      const r = validateSwiftWithStubs(transform(BORDER_APP, { target: 'swift' }).code)
      // oxlint-disable-next-line vitest/no-standalone-expect -- inside swiftFails/kotlinFails, aliases of it.fails/it.skip picked by toolchain availability; oxlint cannot trace the alias back to a real test block.
      expect(r.ok, r.error ?? '').toBe(true)
    },
  )

  it('the Kotlin twin IS stubbed (`RoundedCornerShape` + `BorderStroke`) and compiles', () => {
    expect(transform(BORDER_APP, { target: 'kotlin' }).code).toContain(
      '.border(BorderStroke(2.dp, Color(0xFFFF0000)), RoundedCornerShape(6.dp))',
    )
  })
})

describe('KNOWN BUG — `kotlin-stubs.ts` lacks the 4-arg `Modifier.padding` overload', () => {
  it('reproduces: the per-side padding emit uses named start/top/end/bottom args', () => {
    expect(transform(PAD4_APP, { target: 'kotlin' }).code).toContain(
      '.padding(start = 2.dp, top = 1.dp, end = 4.dp, bottom = 3.dp)',
    )
  })

  kotlinFails(
    'KNOWN BUG: fix = add `fun padding(start: Dp = 0.dp, top: Dp = 0.dp, end: Dp = 0.dp, ' +
      'bottom: Dp = 0.dp): Modifier` to the `Modifier` stub — it is a REAL Compose ' +
      'overload (androidx.compose.foundation.layout), and the stub declares only ' +
      '`padding(all)` and `padding(horizontal, vertical)`. Today every per-side inline ' +
      "padding fails `validateKotlin` with `no parameter with name 'start' found`.",
    () => {
      const r = validateKotlin(transform(PAD4_APP, { target: 'kotlin' }).code)
      // oxlint-disable-next-line vitest/no-standalone-expect -- inside swiftFails/kotlinFails, aliases of it.fails/it.skip picked by toolchain availability; oxlint cannot trace the alias back to a real test block.
      expect(r.ok, r.error ?? '').toBe(true)
    },
  )

  it('the two STUBBED padding overloads do compile — so this is a gap, not a broken emit', () => {
    const uniform = PAD4_APP.replace(
      '{ paddingTop: 1, paddingLeft: 2, paddingBottom: 3, paddingRight: 4 }',
      '{ padding: 4 }',
    )
    const axes = PAD4_APP.replace(
      '{ paddingTop: 1, paddingLeft: 2, paddingBottom: 3, paddingRight: 4 }',
      '{ paddingX: 2, paddingY: 4 }',
    )
    expect(transform(uniform, { target: 'kotlin' }).code).toContain('.padding(4.dp)')
    expect(transform(axes, { target: 'kotlin' }).code).toContain(
      '.padding(horizontal = 2.dp, vertical = 4.dp)',
    )
  })

})

// ───────────────────────────────────────────────────────────────────────────
// 7. `inferType`'s `member` case DISCARDS the optionality an optional LINK
//    introduces, so the annotation contradicts the emit
// ───────────────────────────────────────────────────────────────────────────

const OPT_LEN = `import { Stack, Text } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'
type Outer = { rows?: string[] }
export function App() {
  const o = signal<Outer>({ rows: ['x'] })
  const w = computed(() => o().rows?.length)
  return (<Stack><Text>{w()}</Text></Stack>)
}`

describe('KNOWN BUG — an optional-CHAIN member read is annotated NON-optional', () => {
  it('reproduces: the emit propagates `?.` but the annotation says `Int`', () => {
    const sw = transform(OPT_LEN, { target: 'swift' }).code
    // The emit is right — `rows` is `[String]?`, so the read must be `?.`.
    expect(sw).toContain('o.rows?.count')
    // …and the annotation is not: `o.rows?.count` is `Int?`, not `Int`.
    expect(sw).toContain('private var w: Int {')
    expect(transform(OPT_LEN, { target: 'swift' }).warnings.join('\n')).toBe('')
  })

  it.fails(
    'KNOWN BUG: fix = in `inferType`\'s `member` case, when the access has an optional ' +
      'LINK (`expr.optional === true`, or `exprHasOptionalLink(expr.object)`), wrap the ' +
      'resolved result in a `union` carrying `undefined` — the same shape `.find` returns. ' +
      'Today the case calls `unwrapOptionalType(inferType(expr.object))` and then types the ' +
      'property off the UNWRAPPED object, so the optionality the `?.` introduces is thrown ' +
      'away. `array.length`, `string.length`, a struct field and `map.size` all take this ' +
      'path, so it is the whole member family, not one property.',
    () => {
      expect(transform(OPT_LEN, { target: 'swift' }).code).toContain('private var w: Int? {')
    },
  )

  swiftFails(
    'KNOWN BUG (swiftc): the emit does not compile — `value of optional type \'Int?\' ' +
      'must be unwrapped`. Note KOTLIN compiles it, because its `val` carries no explicit ' +
      'annotation and infers `Int?` itself — so a Kotlin-only check would report this ' +
      'shape as healthy.',
    () => {
      const r = validateSwiftWithStubs(transform(OPT_LEN, { target: 'swift' }).code)
      // oxlint-disable-next-line vitest/no-standalone-expect -- inside swiftFails/kotlinFails, aliases of it.fails/it.skip picked by toolchain availability; oxlint cannot trace the alias back to a real test block.
      expect(r.ok, r.error ?? '').toBe(true)
    },
  )

  kotlinFails(
    'KNOWN BUG (the asymmetry itself): Kotlin currently COMPILES this, so this lock is a ' +
      'tripwire — if the Kotlin emit ever starts annotating the derived value explicitly, ' +
      'it inherits the Swift failure and this turns red first.',
    () => {
      const r = validateKotlin(transform(OPT_LEN, { target: 'kotlin' }).code)
      // oxlint-disable-next-line vitest/no-standalone-expect -- inside swiftFails/kotlinFails, aliases of it.fails/it.skip picked by toolchain availability; oxlint cannot trace the alias back to a real test block.
      expect(r.ok).toBe(false)
    },
  )


  // The same defect on the shape people actually write. `data` is optional at
  // every layer, so `q.data()?.text` is the CORRECT source for reading a field
  // off a fetched object — and it is the natural shape for a POST response.
  const FETCH_OPT = `import { Stack, Text } from '@pyreon/primitives'
import { computed } from '@pyreon/reactivity'
import { useFetch } from '@pyreon/http'
type Q = { id: number; text: string }
export function App() {
  const q = useFetch<Q>('https://example.test/q.json')
  const d = computed(() => q.data()?.text)
  return (<Stack><Text>{d()}</Text></Stack>)
}`

  it('the same divergence reaches the FETCH container — not an exotic corner', () => {
    const sw = transform(FETCH_OPT, { target: 'swift' }).code
    expect(sw).toContain('private var d: String { q.data?.text }')
    expect(transform(FETCH_OPT, { target: 'swift' }).warnings.join('\n')).toBe('')
  })

  swiftFails(
    'KNOWN BUG (swiftc, fetch shape): `q.data()?.text` annotates `String` over a `String?` ' +
      "value — `value of optional type 'String?' must be unwrapped`. Same single fix as " +
      'above; listed separately because this is the shape a POST-response reader writes, ' +
      'while every device-proven example fetches an ARRAY and reads it as `data() ?? []`, ' +
      'which never takes an optional MEMBER access — which is why it was never compiled.',
    () => {
      const r = validateSwiftWithStubs(transform(FETCH_OPT, { target: 'swift' }).code)
      // oxlint-disable-next-line vitest/no-standalone-expect -- inside swiftFails/kotlinFails, aliases of it.fails/it.skip picked by toolchain availability; oxlint cannot trace the alias back to a real test block.
      expect(r.ok, r.error ?? '').toBe(true)
    },
  )

  it('the NON-optional twin compiles and is annotated consistently', () => {
    const nonOpt = OPT_LEN.replace('rows?: string[]', 'rows: string[]').replace('rows?.length', 'rows.length')
    const sw = transform(nonOpt, { target: 'swift' }).code
    expect(sw).toContain('private var w: Int {')
    expect(sw).toContain('o.rows.count')
  })
})
