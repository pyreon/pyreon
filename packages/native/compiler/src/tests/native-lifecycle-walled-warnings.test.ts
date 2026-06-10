// Phase 3 native-readiness gap fix (2026-06-05).
//
// The "walled" lifecycle tags — <Suspense>, <ErrorBoundary>, <KeepAlive> —
// have NO SwiftUI / Compose equivalent for their fallback / cache
// contracts. The compiler's existing approach: render the CHILDREN
// (apps' inner content always shows) and emit a leading comment
// naming the limitation.
//
// Pre-this-PR: a user wrote `<Suspense fallback={<Spinner/>}>` and
// shipped it. On web: fallback shows during loading. On native: the
// fallback was SILENTLY DROPPED — children rendered unconditionally,
// no warning, no diagnostic. The "one source rules them all" promise
// broke whenever someone used these.
//
// This PR: when a walled tag carries a FEATURE-BEARING prop (`fallback`
// on Suspense/ErrorBoundary; `when`/`include`/`exclude` on KeepAlive),
// the emit STILL renders children — same shape as before, no regression
// — BUT a user-visible diagnostic now appears in `result.warnings`.
//
// Pattern is the same shape as #1235 (useLoaderData silent-drop
// diagnostic): name the tag + the dropped prop(s) + the per-target
// limitation + the workaround (Layer-4 escape hatch).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

describe('Phase 3 — walled lifecycle tags surface silent-drop diagnostics', () => {
  // PR-3.2 — <Suspense fallback={...}> no longer surfaces a silent-drop
  // warning here: real Suspense emit (PyreonSuspenseWrapper on Swift +
  // Kotlin) replaces the walled path. See `lifecycle-suspense.test.ts`
  // for the new structural contract. The `<Suspense>` (no fallback)
  // shape is unchanged — never warned.

  // PR-3.3 — <ErrorBoundary fallback={...}> no longer surfaces a
  // silent-drop warning: real ErrorBoundary emit (PyreonErrorBoundaryWrapper
  // on Swift + Kotlin) replaces the walled path. See
  // `lifecycle-errorboundary.test.ts` for the new structural contract.
  // The `<ErrorBoundary>` (no fallback) shape is unchanged — never
  // warned.

  // PR-3.4 — <KeepAlive when={...}> no longer surfaces a silent-drop
  // warning: real KeepAlive emit (PyreonKeepAliveWrapper on Swift +
  // Kotlin) replaces the walled path. See `lifecycle-keepalive.test.ts`
  // for the new structural contract. The `<KeepAlive>` (no when) shape
  // is unchanged — never warned.
  //
  // The "warning surfaces dropped prop list" describe block (which used
  // KeepAlive's multi-prop shape — `when`/`include`/`exclude` — as the
  // example) is dropped with it. Suspense + ErrorBoundary expose only
  // `fallback`, so the multi-prop enumeration is no longer exercisable
  // from the walled set. Reintroduce the test if a new multi-prop
  // walled tag lands.

  describe('non-walled tags (control case — no warning)', () => {
    it('plain <Stack><Text/></Stack> emits zero walled-tag warnings', () => {
      const src = `export function App() {
        return <Stack><Text>hi</Text></Stack>
      }`
      const result = transform(src, { target: 'swift' })
      const walledWarns = result.warnings.filter(
        (w) =>
          w.includes('<Suspense>') ||
          w.includes('<ErrorBoundary>') ||
          w.includes('<KeepAlive>'),
      )
      expect(walledWarns.length).toBe(0)
    })
  })

  // PR-3.2 (main) + PR-3.3 (main) + PR-3.4 (this PR) — Suspense +
  // ErrorBoundary + KeepAlive all have real emit. The "warning
  // identical-shape across both targets" structural contract no
  // longer has a walled lifecycle tag to exercise. The non-walled-
  // tag control case above is still load-bearing. Reintroduce the
  // shape-lock test when a new walled lifecycle tag lands.
})
