// Swift `-typecheck`-against-STUBS gate — the per-PR type-level safety net.
//
// `validate-swift.test.ts` runs `swiftc -parse` (syntax only): it CANNOT catch a
// type error — the class that shipped three CI incidents, the sharpest being a
// SwiftUI modifier whose generic constraint the emit violates (`.animation(_:value:)`
// requires the value be `Equatable`; a PMTC-emitted struct isn't). `-parse` waves
// that through; only the device gate (`xcodebuild -typecheck`) caught it, days later.
//
// `swift-typecheck-gate.test.ts` closes the type side against the REAL SwiftUI SDK —
// but SwiftUI is an Apple framework, ABSENT on the Linux PR runner, so every case
// there is `it.skipIf(!isSwiftUIAvailable())` and SKIPS per-PR. This file closes the
// remaining gap: `validateSwiftWithStubs` type-checks against a minimal SwiftUI +
// PyreonRuntime STUB (see swift-stubs.ts), needing ONLY `swiftc` (not the SDK), so it
// RUNS on the plain Linux PR runner — the Swift sibling of `validateKotlin`.
//
// Auto-enabled when `swiftc` is on PATH. `PYREON_SKIP_NATIVE_VALIDATE=1` force-skips;
// `PYREON_REQUIRE_NATIVE_VALIDATE=1` (set by the `Validate emitted Swift + Kotlin` CI
// job) promotes the swiftc-absent SKIP to a hard fail.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, validateSwift, validateSwiftWithStubs } from '../validate'

// swiftc cold-starts its frontend per invocation; under parallel-suite load a
// single compile can exceed the repo's 20s default. Give real headroom.
vi.setConfig({ testTimeout: 90_000 })

const HERE = dirname(fileURLToPath(import.meta.url))
// tests → src → compiler → native → packages → <repo root>
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..', '..')

function emitSwift(source: string): string {
  return transform(source, { target: 'swift' }).code
}

function emitExample(relPath: string): string {
  return emitSwift(readFileSync(resolve(REPO_ROOT, relPath), 'utf8'))
}

const skipCondition =
  process.env.PYREON_SKIP_NATIVE_VALIDATE === '1' ||
  (!isSwiftcAvailable() && process.env.PYREON_REQUIRE_NATIVE_VALIDATE !== '1')

describe('Swift emit — swiftc -typecheck against stubs (Linux-viable type gate)', () => {
  it('skips gracefully when swiftc is absent (not a failure on a toolchain-less box)', () => {
    // Contract: with swiftc absent AND not required, this is a SKIP — the gate is
    // additive, never a blocker on a runner that lacks the toolchain.
    if (isSwiftcAvailable()) return
    if (process.env.PYREON_REQUIRE_NATIVE_VALIDATE === '1') return
    const res = validateSwiftWithStubs('let _ = 0')
    expect(res.ok).toBe(true)
    expect(res.skipped).toBe(true)
    expect(res.skipReason).toBe('swiftc not on PATH')
  })

  describe.skipIf(skipCondition)('with swiftc present', () => {
    // The two SHIPPED example apps — the real emits that carry the `.animation`
    // class the device gate caught in M2.8. Locking them here means that class is
    // now caught PER-PR on Linux, not days later on the device gate.
    it('native-counter-ios Counter.tsx emit typechecks clean', () => {
      const res = validateSwiftWithStubs(
        emitExample('examples/native-counter-ios/src/Counter.tsx'),
      )
      expect(res.ok, res.error ?? '').toBe(true)
    })

    it('native-todomvc-ios TodoApp.tsx emit typechecks clean', () => {
      const res = validateSwiftWithStubs(
        emitExample('examples/native-todomvc-ios/src/TodoApp.tsx'),
      )
      expect(res.ok, res.error ?? '').toBe(true)
    })

    // Corpus coverage — every fixture whose emit type-checks against the stub
    // (mirrors validate-kotlin.test.ts's fixture loop). Adding a symbol to a
    // listed fixture that the stub doesn't cover fails HERE, per-PR, on Linux.
    //
    // NEWLY INCLUDED — fixtures the gate SURFACED as real emit bugs, since FIXED in
    // the emitter and locked here: rx-full (`.first`/`.last`/`.find`/`.min`/`.max`/
    // `.average` infer Optional / Double — infer-type.ts rx-call), rx-lowering +
    // tier2-machine (a null-returning component emits `EmptyView()`, not the
    // uncompilable `var body: some View { nil }`), AND tier2-rx (a top-level
    // `interface Todo` is now SYNTHESIZED into a `struct Todo: Codable` — parse.ts
    // `tryStructFromInterface`, so `signal<Todo[]>` resolves).
    //
    // NEWLY INCLUDED (M-gate.1d) — the router-hook + form surface (both emit NO
    // @Observable, so they are fully Linux-typecheckable): router-hooks needs
    // PyreonRouter / EnvironmentValues.pyreonRouter / useNavigate / useParams;
    // tier2-form needs a faithful PyreonForm (validators: [String: (String) ->
    // String] so the { v in … } closure param infers String — a loose Any would
    // MASK). Both stubbed in swift-stubs.ts, mirroring router-swift / runtime-swift.
    //
    // EXCLUDED (4 of 37) — the @Observable service surface (a coherent follow-up):
    // showcase-finance · showcase-tasks · tier2-store · tier2-state-tree. Each emits
    // an @Observable class (PyreonStore_* / PyreonModel_*), and the emit does NOT
    // `import Observation` — on Apple platforms `import SwiftUI` transitively
    // re-exports it, but the Linux stub build strips SwiftUI, so @Observable would be
    // unresolved. Unblocking them needs the harness to guarantee `import Observation`
    // in the input file (real on the Linux 6.0 toolchain) + PyreonStoreProtocol /
    // PyreonModelProtocol / PyreonAuth / PyreonDatabase / PyreonFetch / LazyVStack /
    // Color / .task stubs — a follow-up (M-gate.1e). Verified locally: with those
    // stubs the two SMALL fixtures type-check on macOS (only the missing protocol
    // errored), so the residual gap is purely the Observation-import mechanism.
    const TYPECHECK_FIXTURES = [
      '01-stateless.tsx',
      '02-signal.tsx',
      '03-computed.tsx',
      '04-event.tsx',
      '05-multi-signal.tsx',
      '06-for.tsx',
      '07-show.tsx',
      '08-string-computed.tsx',
      '09-props.tsx',
      '10-multi-component.tsx',
      '11-canonical-layout.tsx',
      '12-canonical-input.tsx',
      '13-canonical-overlay.tsx',
      '14-canonical-content.tsx',
      '15-canonical-link.tsx',
      'lifecycle-errorboundary.tsx',
      'lifecycle-keepalive.tsx',
      'lifecycle-suspense.tsx',
      'router-hooks.tsx',
      'rx-full.tsx',
      'rx-lowering.tsx',
      'showcase-analytics.tsx',
      'synth-prop-types.tsx',
      'tier2-feature.tsx',
      'tier2-form.tsx',
      'tier2-i18n.tsx',
      'tier2-machine.tsx',
      'tier2-permissions.tsx',
      'tier2-rx.tsx',
      'tier2-validate.tsx',
      'tier2-validation.tsx',
      'webview-data-bridge.tsx',
      'webview-dynamic.tsx',
    ]
    const FIXTURES_DIR = resolve(HERE, '..', 'fixtures')
    for (const fx of TYPECHECK_FIXTURES) {
      it(`fixture ${fx} emit typechecks clean`, () => {
        const res = validateSwiftWithStubs(
          emitSwift(readFileSync(resolve(FIXTURES_DIR, fx), 'utf8')),
        )
        expect(res.ok, res.error ?? '').toBe(true)
      })
    }

    // Mechanism: a component named after a stubbed SwiftUI type (here 07-show
    // declares its own `Toggle`) must not "invalid redeclaration" — in a real
    // multi-module build the local type shadows the SwiftUI one. Guarded by the
    // shadow-stripping in validateSwiftWithStubs; 07-show above is the live proof.

    // THE load-bearing discriminating-power proof. This is the exact M2.8 class:
    // `.animation(_:value:)` requires the value be `Equatable`. A PMTC struct is
    // not — so `value: [Row]` must be REJECTED, while `value: <Bool>` is accepted.
    // Crucially, `swiftc -parse` (the OLD per-PR gate) PASSES the broken form —
    // this is precisely why the type gate is needed.
    const GOOD_ANIMATION = `struct GoodView: View {
  var body: some View { Text("x").animation(.default, value: true) }
}`
    const BROKEN_ANIMATION = `struct Row { var id: Int }
struct BrokenView: View {
  var body: some View { Text("x").animation(.default, value: [Row(id: 1)]) }
}`

    it('ACCEPTS .animation over an Equatable value', () => {
      expect(validateSwiftWithStubs(GOOD_ANIMATION).ok).toBe(true)
    })

    it('REJECTS .animation over a non-Equatable value (the class -parse misses)', () => {
      const tc = validateSwiftWithStubs(BROKEN_ANIMATION)
      expect(tc.ok).toBe(false)
      expect(tc.error ?? '').toMatch(/Equatable/)
    })

    it('swiftc -parse PASSES the broken .animation (proves the -parse blind spot)', () => {
      // The discriminating control: the old gate can't see this type error.
      expect(validateSwift(`import SwiftUI\n${BROKEN_ANIMATION}`).ok).toBe(true)
    })
  })
})
