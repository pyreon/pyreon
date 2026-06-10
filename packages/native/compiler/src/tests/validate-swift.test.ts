// Compile-validation gate for the Swift emitter.
//
// Snapshot tests in swift.test.ts prove the emit equals what it
// equalled last time. This test proves the emit is syntactically
// valid Swift by piping it through `swiftc -parse`.
//
// Auto-enabled when `swiftc` is on PATH (typical macOS dev machine).
// Set `PYREON_SKIP_NATIVE_VALIDATE=1` to force-skip. Set
// `PYREON_REQUIRE_NATIVE_VALIDATE=1` to fail (instead of skip) if
// the tool is absent — used in the CI job that runs in the
// `swift:latest` Docker image.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, validateSwift } from '../validate'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURES = resolve(HERE, '..', 'fixtures')

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURES, name), 'utf8')
}

function emit(name: string): string {
  const result = transform(loadFixture(name), { target: 'swift' })
  return result.code
}

const skipCondition =
  process.env.PYREON_SKIP_NATIVE_VALIDATE === '1' ||
  (!isSwiftcAvailable() && process.env.PYREON_REQUIRE_NATIVE_VALIDATE !== '1')

describe.skipIf(skipCondition)('Swift emit — swiftc -parse validates each fixture', () => {
  // Phase B5 (native readiness audit 2026-06): added 11-canonical-layout
  // to exercise the broader canonical-primitive set (Stack/Inline/Heading)
  // — pre-B5 the loop only covered Text/Button/Show/For. Scout-1 finding.
  const fixtures = [
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
    // RX-1: rx namespace lowering proof — exercises rx.filter / rx.map /
    // rx.reverse, which `tryRxNamespaceLowering` rewrites into computed-
    // body native collection calls. swiftc-parse passing here proves the
    // lowering produces well-formed Swift.
    'rx-lowering.tsx',
    'rx-full.tsx',
    // Gap 5 showcase (STORE-BACKED — see the fixture header): ONE
    // defineStore singleton carries the auth flag + task list across
    // screens; the per-route beforeEnter guard reads it in the
    // dispatcher; typed route params (`/tasks/:id` → synthesized
    // `TaskDetailPageParam` + dispatcher construction); .set() list
    // mutation through the store; Text-wrapped value-expression
    // children. Mirror of `examples/native-tasks/src/TasksApp.tsx` so
    // the example's source is locked-in via the same swiftc-parse gate
    // that protects the canonical primitives. NOTE: swiftc -parse
    // alone did NOT catch the original scaffold's typecheck-level
    // breakage — the device-CI xcodebuild gate is the real-runtime
    // safety net.
    'showcase-tasks.tsx',
    // Gap 4 PR-3: @pyreon/i18n/core Strategy-B port (v1 — single-arg
    // t() only). Emits @State PyreonI18n with literal locale + messages.
    'tier2-i18n.tsx',
    // @pyreon/permissions — callable can() + web-parity can.not() +
    // variadic all/any + the Show-accessor-arrow condition unwrap.
    // First fixture to validate ANY usePermissions emit shape.
    'tier2-permissions.tsx',
    // Gap 4 PR-2: @pyreon/machine Strategy-B port. Pre-port, this
    // fixture was deliberately NOT in the loop because emit was
    // structurally broken (referenced undefined `m`). Post-port it
    // emits @State PyreonMachine + intact method calls — swiftc-parse
    // passes (PyreonMachine is a reference to the runtime port,
    // resolved at compile time in real apps; -parse skips symbol
    // resolution so the fixture passes regardless).
    'tier2-machine.tsx',
    // Gap 4 PR-4: @pyreon/store Strategy-B port v1. Proves the
    // top-level @Observable singleton class + use-site chain
    // rewriting (`useFoo().store.X` → `PyreonStore_foo.shared.X`)
    // emits as valid Swift.
    'tier2-store.tsx',
    // Gap 4 state-tree v2 emit: @pyreon/state-tree port. Proves the
    // top-level @Observable singleton class + use-site chain
    // rewriting (`counter.field` → `PyreonModel_counter.shared.field`)
    // emits as valid Swift.
    'tier2-state-tree.tsx',
    // Gap 3 PR-3.2: real Suspense emit (mount-time splash). Proves
    // the PyreonSuspenseWrapper module-scope struct + per-Suspense
    // site emit produces valid SwiftUI that compiles through
    // swiftc-parse.
    'lifecycle-suspense.tsx',
    // Gap 3 PR-3.3: real ErrorBoundary emit. Proves the
    // PyreonErrorBoundaryWrapper module-scope struct + per-
    // ErrorBoundary site emit produces valid SwiftUI.
    'lifecycle-errorboundary.tsx',
    // Gap 3 PR-3.4: real KeepAlive emit (visibility-preservation).
    // Proves the PyreonKeepAliveWrapper struct + per-KeepAlive site
    // emit produces valid SwiftUI (opacity + allowsHitTesting +
    // @State hasShown).
    'lifecycle-keepalive.tsx',
  ] as const

  for (const fixture of fixtures) {
    it(`${fixture} — emitted Swift parses cleanly`, () => {
      const swift = emit(fixture)
      const result = validateSwift(swift)
      if (!result.ok) {
        throw new Error(
          `swiftc -parse rejected emitted output for ${fixture}:\n${result.error}\n\n` +
            `--- emitted source ---\n${swift}\n--- end ---`,
        )
      }
      expect(result.ok).toBe(true)
    })
  }
})

describe('validate.ts module surface', () => {
  it('isSwiftcAvailable returns a boolean', () => {
    expect(typeof isSwiftcAvailable()).toBe('boolean')
  })

  it('validateSwift respects PYREON_SKIP_NATIVE_VALIDATE', () => {
    const prev = process.env.PYREON_SKIP_NATIVE_VALIDATE
    process.env.PYREON_SKIP_NATIVE_VALIDATE = '1'
    try {
      const result = validateSwift('this is not swift at all : ;')
      expect(result.ok).toBe(true)
      expect(result.skipped).toBe(true)
      expect(result.skipReason).toBe('PYREON_SKIP_NATIVE_VALIDATE=1')
    } finally {
      if (prev === undefined) delete process.env.PYREON_SKIP_NATIVE_VALIDATE
      else process.env.PYREON_SKIP_NATIVE_VALIDATE = prev
    }
  })

  it.skipIf(!isSwiftcAvailable())(
    'validateSwift catches a genuinely-broken Swift snippet',
    () => {
      const result = validateSwift('this is { not swift at all : ;')
      expect(result.ok).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toMatch(/error:/i)
    },
  )
})
