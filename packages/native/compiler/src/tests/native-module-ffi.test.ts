// The FFI escape hatch — `const bt = useNativeModule<T>('Bluetooth')`.
//
// WHY THIS EXISTS. Before this, PMTC recognised platform services by
// HARD-CODED name (`if (calleeName === 'useHaptics')`), so the only way to
// add a capability the framework does not ship — Bluetooth, ARKit, a
// payments SDK — was a framework PR. `<NativeIOS>` is not an escape hatch
// for this: it emits its children through the normal canonical-primitive
// path, so it is a platform CONDITIONAL, not raw-native-code injection.
//
// THE LOWERING is deliberately the same one every built-in imperative
// service already uses (clipboard / haptics / share / linking) — the only
// difference is that the emitted TYPE belongs to the app, not to
// PyreonRuntime:
//   Swift:  @State private var bt = Bluetooth()
//   Kotlin: val btCtx = LocalContext.current
//           val bt = remember { Bluetooth(btCtx) }
// Member calls pass through verbatim, so `await bt.connect(id)` composes
// with the M4.5 async lowering for free.
//
// Because the app owns the type, nothing here can be stubbed by the
// framework — so the compile proofs below concatenate an app-provided
// class exactly as a real project would, and the platform compiler is
// what type-checks the method surface.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

// The canonical shape: a method-only contract type + an async member call.
const SRC = `import { signal } from '@pyreon/reactivity'
import { useNativeModule } from '@pyreon/primitives'
type Bluetooth = { isSupported(): boolean; connect(id: string): Promise<boolean> }
export function Pairing() {
  const bt = useNativeModule<Bluetooth>('Bluetooth')
  const status = signal('idle')
  return (
    <VStack>
      <Text>{status()}</Text>
      <Button onPress={async () => { const ok = await bt.connect('cuff'); status.set(ok ? 'paired' : 'failed') }}>Pair</Button>
    </VStack>
  )
}`

// A synchronous module method — the fire-and-forget shape (no async scope).
const SRC_SYNC = `import { useNativeModule } from '@pyreon/primitives'
export function Scan() {
  const sdk = useNativeModule<{ ping(): void }>('VendorSdk')
  return <Button onPress={() => { sdk.ping() }}>Ping</Button>
}`

describe('native-module FFI — Swift emit', () => {
  it('lowers useNativeModule to an @State instance of the APP-provided class', () => {
    const out = transform(SRC, { target: 'swift' }).code
    expect(out).toContain('@State private var bt = Bluetooth()')
    // NOT a PyreonRuntime container — the whole point is that the app owns it.
    expect(out).not.toContain('PyreonBluetooth')
  })

  it('passes member calls through verbatim and composes with the async lowering', () => {
    const out = transform(SRC, { target: 'swift' }).code
    expect(out).toContain('Task {')
    expect(out).toContain('let ok = await bt.connect("cuff")')
  })

  it('a sync module method needs no async scope', () => {
    const out = transform(SRC_SYNC, { target: 'swift' }).code
    expect(out).toContain('@State private var sdk = VendorSdk()')
    expect(out).toContain('sdk.ping()')
    expect(out).not.toContain('Task {')
  })

  it('emits ZERO warnings for the canonical shape', () => {
    expect(transform(SRC, { target: 'swift' }).warnings ?? []).toEqual([])
  })
})

describe('native-module FFI — Kotlin emit', () => {
  it('lowers useNativeModule to a remembered instance with an injected Context', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    // The Context is hoisted to a sibling val — a LocalContext read cannot
    // live inside `remember`'s non-Composable lambda (the clipboard shape).
    expect(out).toContain('val btCtx = LocalContext.current')
    expect(out).toContain('val bt = remember { Bluetooth(btCtx) }')
  })

  it('passes member calls through verbatim and composes with the async lowering', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    expect(out).toContain('val pyreonAsyncScope = rememberCoroutineScope()')
    // Kotlin carries NO `await` keyword — the coroutine provides the context.
    expect(out).toContain('val ok = bt.connect("cuff")')
    expect(out).not.toContain('await bt.connect')
  })

  it('emits ZERO warnings for the canonical shape', () => {
    expect(transform(SRC, { target: 'kotlin' }).warnings ?? []).toEqual([])
  })
})

describe('native-module FFI — module-name validation (named warning, never silent)', () => {
  // The name is emitted VERBATIM as a native type name and PMTC resolves one
  // file at a time, so a non-literal has no value source here.
  const NON_LITERAL = `import { useNativeModule } from '@pyreon/primitives'
const NAME = 'Bluetooth'
export function C() {
  const bt = useNativeModule<{ go(): void }>(NAME)
  return <Button onPress={() => { bt.go() }}>Go</Button>
}`

  // Emitting arbitrary text as a type name would splice it into the output.
  const BAD_IDENT = `import { useNativeModule } from '@pyreon/primitives'
export function C() {
  const bt = useNativeModule<{ go(): void }>('Foo(); evil()')
  return <Button onPress={() => { bt.go() }}>Go</Button>
}`

  it('a non-literal module name warns by NAME and skips the declaration', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(NON_LITERAL, { target })
      expect(r.warnings?.join('\n')).toMatch(/useNativeModule `bt`.*STRING LITERAL/s)
      expect(r.code).not.toContain('= Bluetooth(')
    }
  })

  it('a module name that is not an identifier warns and never reaches the emit', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(BAD_IDENT, { target })
      expect(r.warnings?.join('\n')).toMatch(/not a valid identifier/)
      expect(r.code).not.toContain('evil()')
    }
  })
})

describe('object-type member classification (fixed alongside the FFI)', () => {
  // A method-only type is the NATURAL shape for a native-module contract.
  // It used to report "skipped — empty object type", which is both wrong
  // (it is not empty) and a dead end (there is nothing to fix).
  it('a method-only type alias is skipped SILENTLY — it is a contract, not data', () => {
    const r = transform(`type M = { go(): boolean }\nexport function C() { return <Text>hi</Text> }`, {
      target: 'swift',
    })
    expect(r.warnings ?? []).toEqual([])
    expect(r.code).not.toContain('struct M')
  })

  it('a method-only interface is skipped SILENTLY too', () => {
    const r = transform(`interface M { go(): boolean }\nexport function C() { return <Text>hi</Text> }`, {
      target: 'swift',
    })
    expect(r.warnings ?? []).toEqual([])
  })

  it('a GENUINELY empty object type still warns (the defensive bail is correct)', () => {
    const r = transform(`type M = {}\nexport function C() { return <Text>hi</Text> }`, {
      target: 'swift',
    })
    expect(r.warnings?.join('\n')).toMatch(/empty object type/)
  })

  it('a MIXED type emits the data fields and warns that methods were dropped', () => {
    const r = transform(
      `type M = { id: string; act(): void }\nexport function C() { return <Text>hi</Text> }`,
      { target: 'swift' },
    )
    // The struct still emits from the property members…
    expect(r.code).toContain('struct M')
    expect(r.code).toContain('var id: String')
    // …and the dropped method is named, not silent.
    expect(r.warnings?.join('\n')).toMatch(/1 method member\(s\) dropped/)
  })
})

// ---------------------------------------------------------------------------
// COMPILE PROOFS. A string-matching emit test cannot catch an uncompilable
// emit (the M2.8 `.animation(value:)`-needs-Equatable class shipped exactly
// that way). The app-provided class is concatenated here the way a real
// project ships it — the framework cannot stub a type the app owns.
// ---------------------------------------------------------------------------

const SWIFT_APP_MODULE = `
// The class an app drops into its Xcode target. No-argument initialiser;
// @Observable so its state can drive the view.
@Observable
final class Bluetooth {
  var connected: Bool = false
  func isSupported() -> Bool { true }
  func connect(_ id: String) async -> Bool { connected = true; return true }
}
`

const KOTLIN_APP_MODULE = `
// The class an app drops into its Gradle module. Single Context parameter.
class Bluetooth(private val context: Context) {
  fun isSupported(): Boolean = true
  suspend fun connect(id: String): Boolean = true
}
`

describe('native-module FFI — compile proofs (real toolchains)', () => {
  it.skipIf(!isSwiftcAvailable())('the emitted Swift compiles against an app-provided class', () => {
    const emitted = transform(SRC, { target: 'swift' }).code
    const res = validateSwiftWithStubs(`${emitted}\n${SWIFT_APP_MODULE}`)
    expect(res.ok, res.error).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())(
    'the emitted Kotlin compiles against an app-provided class',
    () => {
      const emitted = transform(SRC, { target: 'kotlin' }).code
      const res = validateKotlin(`${emitted}\n${KOTLIN_APP_MODULE}`)
      expect(res.ok, res.error).toBe(true)
    },
  )
})
