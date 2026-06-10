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

// PR-3.2 — Suspense has real emit (PyreonSuspenseWrapper), so it's no
// longer in the walled-tag list. Only ErrorBoundary + KeepAlive remain
// walled here.
const TAGS = ['ErrorBoundary', 'KeepAlive'] as const

describe('Phase 5 — walled-tag graceful emit (ErrorBoundary / KeepAlive)', () => {
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

  // PR-3.2: Suspense has real emit now — fallback IS rendered. The
  // following two specs covered Suspense + ErrorBoundary's old walled
  // fallback-drop behaviour. ErrorBoundary still drops its fallback;
  // assert it via ErrorBoundary alone.
  it('Swift: ErrorBoundary fallback prop is silently dropped (intentional — fallback path inert)', () => {
    const out = transform(
      `export function App() { return <ErrorBoundary fallback={<Text>FALLBACK_MARKER</Text>}><Text>ok</Text></ErrorBoundary> }`,
      { target: 'swift' },
    ).code
    // The fallback is acknowledged as inert; its content should NOT
    // appear in the emitted output (no view ever renders it).
    expect(out).not.toContain('FALLBACK_MARKER')
    // Happy-path children still emit.
    expect(out).toContain('Text("ok")')
  })

  it('Kotlin: ErrorBoundary fallback prop is silently dropped (intentional — fallback path inert)', () => {
    const out = transform(
      `export function App() { return <ErrorBoundary fallback={<Text>FALLBACK_MARKER</Text>}><Text>ok</Text></ErrorBoundary> }`,
      { target: 'kotlin' },
    ).code
    expect(out).not.toContain('FALLBACK_MARKER')
    expect(out).toContain('Text(text = "ok")')
  })
})
