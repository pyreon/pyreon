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
    const src = read('runtime-swift/Sources/PyreonRuntime/PyreonStorage.swift')
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
    const src = read('runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonStorage.kt')
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
