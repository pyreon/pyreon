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

// PR-3.2 (main) + PR-3.3 (this PR) — Suspense + ErrorBoundary have real
// emit (PyreonSuspenseWrapper + PyreonErrorBoundaryWrapper), so neither
// is in the walled-tag list. Only KeepAlive remains walled.
const TAGS = ['KeepAlive'] as const

describe('Phase 5 — walled-tag graceful emit (KeepAlive)', () => {
  for (const tag of TAGS) {
    it(`Swift: <${tag}> emits Group { children } + a [Pyreon] limitation comment, NO fake identifier`, () => {
      const out = transform(
        `export function App() { return <${tag} fallback={<Text>fb</Text>}><Text>inner</Text></${tag}> }`,
        { target: 'swift' },
      ).code
      // The limitation surfaces at code-read time.
      expect(out).toContain(`// [Pyreon] <${tag}> unsupported on iOS`)
      // Neutral container + the child renders.
      expect(out).toContain('Group {')
      expect(out).toContain('Text("inner")')
      // NO fake-identifier emit (the bug shape we're closing).
      expect(out).not.toMatch(new RegExp(`\\b${tag}\\(`))
      expect(out).not.toMatch(new RegExp(`\\b${tag}\\s*\\{`))
    })

    it(`Kotlin: <${tag}> emits Box { children } + a [Pyreon] limitation comment, NO fake identifier`, () => {
      const out = transform(
        `export function App() { return <${tag} fallback={<Text>fb</Text>}><Text>inner</Text></${tag}> }`,
        { target: 'kotlin' },
      ).code
      expect(out).toContain(`// [Pyreon] <${tag}> unsupported on Android`)
      expect(out).toContain('Box {')
      expect(out).toContain('Text(text = "inner")')
      expect(out).not.toMatch(new RegExp(`\\b${tag}\\(`))
      expect(out).not.toMatch(new RegExp(`\\b${tag}\\s*\\{`))
    })
  }

  // PR-3.2 (main) + PR-3.3 (this PR): Suspense + ErrorBoundary now have
  // real emit; their fallback IS rendered. KeepAlive remains walled but
  // uses `when` (not `fallback`) — drop the standalone fallback-drop
  // specs; the walled-tag children-only assertion above already covers
  // KeepAlive's child-emit shape.
})
