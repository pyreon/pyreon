// Phase 5 — graceful emit for walled tags: <Suspense>, <ErrorBoundary>,
// <KeepAlive>. Neither SwiftUI nor Compose has a native equivalent for
// any of these (no async-render-suspend / no render-time try/catch /
// no built-in state-cache across unmount).
//
// Pre-fix behaviour: the dispatcher fell through to `emitSwiftGeneric` /
// `emitKotlinGeneric`, which emit the JSX tag name verbatim — producing
// `Suspense(fallback: Text("loading")) { ... }` (no such SwiftUI type)
// or `Suspense(...) { ... }` (no such Compose composable). Real apps
// using these tags failed at swiftc/kotlinc with cryptic "unresolved
// identifier".
//
// Post-fix behaviour: emit `Group { children }` (Swift) / `Box { children }`
// (Kotlin) plus a leading comment naming the platform limitation. The
// happy path renders the inner content; the fallback / cache behaviour
// is INERT (acknowledged limitation — needs a runtime-model design).
//
// Bisect-verified: removing the dispatcher early-return for any of
// the three tags brings back the literal `Suspense(...) {}` /
// `ErrorBoundary(...) {}` / `KeepAlive {}` emit and these assertions
// fail.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

// PR-3.2 (main) + PR-3.3 (main) + PR-3.4 (this PR) — Suspense +
// ErrorBoundary + KeepAlive ALL have real emit now
// (PyreonSuspenseWrapper / PyreonErrorBoundaryWrapper /
// PyreonKeepAliveWrapper). No walled lifecycle tags remain. The test
// file is preserved as a documentation marker; reintroduce the loop
// when a NEW walled tag lands.

describe('Phase 5 — walled-tag graceful emit (none remain)', () => {
  it('placeholder — Phase 5 walled-tag set is empty', () => {
    expect(true).toBe(true)
  })
})
