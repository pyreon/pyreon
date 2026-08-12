// Stub ↔ real-runtime signature drift locks (device-CI unblock arc,
// 2026-06-10).
//
// THE GAP THIS CLOSES: the required `Validate emitted Swift + Kotlin`
// gate typechecks against STUBS (`kotlin-stubs.ts` + `swiftc -parse`),
// not the real `@pyreon/native-{runtime,router}-{swift,kotlin}`
// packages — full real-runtime typecheck needs SwiftUI / Compose SDKs
// that ubuntu runners don't have (that's the nightly device gate's
// job: real xcodebuild + gradle against the REAL packages, wired in
// this same arc). Between nightlies, a runtime signature rename /
// reshape would keep the required gate green while every emitted app
// is broken — invisible until the next device run.
//
// These locks close the visibility window on EVERY PR: each asserts
// the exact signature line the EMIT depends on still exists in the
// real runtime source. A rename fails here naming both sides. The
// assertions are deliberately substring-exact (not regex-fuzzy) — a
// signature change SHOULD require a deliberate two-sided edit (runtime
// + stub + emit), and this test is the forcing function.
//
// Scope: only the symbols the emitters actually reference (the
// load-bearing surface), not the runtimes' full APIs.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const HERE = resolve(import.meta.dirname ?? __dirname)
const NATIVE = resolve(HERE, '..', '..', '..')

function read(rel: string): string {
  return readFileSync(resolve(NATIVE, rel), 'utf8')
}

describe('Swift runtime signatures the emit depends on', () => {
  it('PyreonRouter.matchPath — dispatcher param-bearing branches', () => {
    const src = read('router-swift/Sources/PyreonRouter/PyreonRouter.swift')
    expect(src).toContain(
      'public static func matchPath(_ path: String, _ pattern: String) -> [String: String]?',
    )
  })

  it('useNavigate(router:) — the navigate computed property', () => {
    const src = read('router-swift/Sources/PyreonRouter/Hooks.swift')
    expect(src).toContain('public func useNavigate(router: PyreonRouter?) -> (String) -> Void')
  })

  it('RouterProvider(router:content:) — the provider wrapper', () => {
    const src = read('router-swift/Sources/PyreonRouter/RouterProvider.swift')
    expect(src).toContain(
      'public init(router: PyreonRouter, @ViewBuilder content: @escaping () -> Content)',
    )
  })

  it('@PyreonAppStorage property wrapper — useStorage emit', () => {
    const src = read('../fundamentals/storage/native/swift/PyreonStorage.swift')
    expect(src).toContain('public struct PyreonAppStorage<Value: Codable>: DynamicProperty')
  })
})

describe('Kotlin runtime signatures the emit depends on', () => {
  it('PyreonRouter.matchPath — dispatcher param-bearing branches', () => {
    const src = read('router-kotlin/src/main/kotlin/com/pyreon/router/PyreonRouter.kt')
    expect(src).toContain(
      'public fun matchPath(path: String, pattern: String): Map<String, String>?',
    )
  })

  it('useNavigate() — the navigate val', () => {
    const src = read('router-kotlin/src/main/kotlin/com/pyreon/router/Hooks.kt')
    expect(src).toContain('public fun useNavigate(): (String) -> Unit')
  })

  it('RouterProvider(router, content) — the provider composable', () => {
    const src = read('router-kotlin/src/main/kotlin/com/pyreon/router/RouterProvider.kt')
    expect(src).toContain('public fun RouterProvider(')
    expect(src).toContain('router: PyreonRouter,')
    expect(src).toContain('content: @Composable () -> Unit,')
  })

  it('rememberPyreonStorage(key, initial) — useStorage emit', () => {
    const src = read('../fundamentals/storage/native/kotlin/com/pyreon/runtime/PyreonStorage.kt')
    expect(src).toContain('public inline fun <reified T> rememberPyreonStorage(')
  })
})

describe('stub mirrors stay aligned with the emit surface', () => {
  // The kotlinc validate loop compiles emitted code against these stub
  // declarations — if a stub diverges from the REAL signature above,
  // the validate gate proves the wrong contract. Lock the load-bearing
  // stub lines too so a stub-only edit can't silently widen the gap.
  it('kotlin-stubs PyreonRouter mirrors the real matchPath return shape', () => {
    const stubs = readFileSync(resolve(HERE, '..', 'kotlin-stubs.ts'), 'utf8')
    expect(stubs).toContain('fun matchPath(path: String, pattern: String): Map<String, String>?')
    expect(stubs).toContain('fun RouterProvider(router: PyreonRouter, content: @Composable () -> Unit)')
  })
})

// STUB ↔ REAL fidelity — the direction this file did not previously cover.
//
// Everything above locks REAL-RUNTIME ↔ EMIT: "the signature the emit depends
// on still exists upstream." That is one of two ways the gate can lie, and the
// tests above only see one of them.
//
// The other: the STUB drifts from the real runtime. Both directions break, in
// opposite and equally bad ways —
//
//   stub is a SUPERSET  → gate accepts an emit the real runtime rejects
//                         (green PR, broken app; the masking direction)
//   stub is a SUBSET    → gate rejects an emit the real runtime accepts
//                         (valid source, failing build; manufactured failure)
//
// PyreonI18n was the SUBSET case and shipped that way. The real init has
// `fallbackLocale: String? = nil`; the stub made it required. So
// `createI18n({ locale, messages })` — the two-argument form the docs show,
// and the common case — failed the required Swift gate with "missing argument
// for parameter 'fallbackLocale'". Kotlin's stub had the default and accepted
// the identical source, and that TARGET ASYMMETRY is the diagnostic: when one
// target rejects what the other accepts, suspect the gate before the emit.
//
// Asserting DEFAULTED-ness specifically, because that is the property that
// decides whether a call site is legal, and it is invisible to a "does the
// symbol exist" check.
describe('stub ↔ real runtime fidelity (both drift directions)', () => {
  it('PyreonI18n.fallbackLocale is OPTIONAL and DEFAULTED in the real Swift runtime', () => {
    // PyreonI18n co-located into @pyreon/i18n (native/swift) — the runtime is
    // the native half of the same package whose src/ implements the web half.
    const real = read('../fundamentals/i18n/native/swift/PyreonI18n.swift')
    expect(real).toContain('fallbackLocale: String? = nil')
  })

  it('the Swift STUB mirrors that default — a required param rejects valid source', () => {
    const stub = readFileSync(
      resolve(HERE, '..', 'swift-stubs.ts'),
      'utf8',
    )
    // Bounded by the NEXT member rather than the next `}` — the surrounding
    // comment contains braces, and slicing on those cut the init in half.
    const from = stub.indexOf('public struct PyreonI18n')
    const init = stub.slice(from, stub.indexOf('public func t(', from))
    expect(init).toContain('fallbackLocale: String? = nil')
    // The exact broken form, named so a revert fails here rather than in a
    // confusing downstream typecheck.
    expect(init).not.toContain('fallbackLocale: String)')
  })

  it('the Swift stub has scaledToFill — the DEFAULT <Image> emit needs it', () => {
    // Second instance of the SAME subset-stub defect, found the same way.
    // ImageProps.fit defaults to "cover", which lowers to `.scaledToFill()`.
    // The stub had its sibling `scaledToFit()` but not `scaledToFill()`, so
    // every plain `<Image src alt />` — the most common usage of a canonical
    // primitive — failed the required gate on valid SwiftUI. Only fit="contain"
    // and fit="none" got through. Kotlin accepted the identical source.
    const stub = readFileSync(resolve(HERE, '..', 'swift-stubs.ts'), 'utf8')
    expect(stub).toContain('public func scaledToFill()')
    // Its sibling must stay too — a "fix" that swapped one for the other would
    // simply move the failure to fit="contain".
    expect(stub).toContain('public func scaledToFit()')
  })

  // CLASS-LEVEL GUARD, not a third hand-written assertion.
  //
  // Three separate subset-stub bugs were found by hand in this arc — PyreonI18n's
  // fallbackLocale, View.scaledToFill, and useLoaderData — each discovered only
  // when someone happened to write the affected shape. The router hooks are a
  // CLOSED SET declared in one file, so parity can be enforced outright rather
  // than waiting for a fourth omission to surface as a mystifying gate failure
  // on valid source.
  it('the Swift stub declares EVERY public router hook the runtime does', () => {
    const real = read('router-swift/Sources/PyreonRouter/Hooks.swift')
    const stub = readFileSync(resolve(HERE, '..', 'swift-stubs.ts'), 'utf8')

    const declared = [...real.matchAll(/public func (use[A-Za-z]+)/g)].map((m) => m[1]!)
    // Guard the guard: a regex that silently matches nothing would make this
    // test vacuously green, which is the failure mode it exists to prevent.
    expect(declared.length, 'found no router hooks — the regex or path is wrong').toBeGreaterThan(2)

    const missing = declared.filter((h) => !stub.includes(`func ${h}`))
    expect(missing, `stub is missing router hook(s): ${missing.join(', ')}`).toEqual([])
  })

  it('the Kotlin stub and runtime agree too (this target was already correct)', () => {
    const real = read('../fundamentals/i18n/native/kotlin/com/pyreon/runtime/PyreonI18n.kt')
    const stub = readFileSync(resolve(HERE, '..', 'kotlin-stubs.ts'), 'utf8')
    expect(real).toContain('val fallbackLocale: String? = null')
    expect(stub).toContain('val fallbackLocale: String? = null')
  })
})
