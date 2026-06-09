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
  describe('<Suspense fallback={...}>', () => {
    const SRC = `export function App() {
      return <Suspense fallback={<Text>Loading...</Text>}><Text>Done</Text></Suspense>
    }`

    it('Swift: warns when fallback prop is present', () => {
      const result = transform(SRC, { target: 'swift' })
      const w = result.warnings.find((w) => w.includes('<Suspense>'))
      expect(w).toBeDefined()
      expect(w!).toContain('Swift')
      expect(w!).toContain('fallback')
      expect(w!).toContain('no async-render-suspend on SwiftUI')
      expect(w!).toContain('Layer 4')
    })

    it('Kotlin: warns when fallback prop is present', () => {
      const result = transform(SRC, { target: 'kotlin' })
      const w = result.warnings.find((w) => w.includes('<Suspense>'))
      expect(w).toBeDefined()
      expect(w!).toContain('Kotlin')
      expect(w!).toContain('fallback')
      expect(w!).toContain('no async-render-suspend on Compose')
    })

    it('Swift: children STILL render — emit is structurally unchanged', () => {
      const result = transform(SRC, { target: 'swift' })
      expect(result.code).toContain('Done')
      expect(result.code).toContain('Group {')
    })

    it('Kotlin: children STILL render — emit is structurally unchanged', () => {
      const result = transform(SRC, { target: 'kotlin' })
      expect(result.code).toContain('Done')
      expect(result.code).toContain('Box {')
    })

    it('does NOT warn when fallback prop is absent (baseline)', () => {
      const src = `export function App() {
        return <Suspense><Text>Done</Text></Suspense>
      }`
      const swift = transform(src, { target: 'swift' })
      const kotlin = transform(src, { target: 'kotlin' })
      expect(swift.warnings.some((w) => w.includes('<Suspense>'))).toBe(false)
      expect(kotlin.warnings.some((w) => w.includes('<Suspense>'))).toBe(false)
    })
  })

  describe('<ErrorBoundary fallback={...}>', () => {
    const SRC = `export function App() {
      return <ErrorBoundary fallback={<Text>Error!</Text>}><Text>Safe</Text></ErrorBoundary>
    }`

    it('Swift: warns when fallback prop is present', () => {
      const result = transform(SRC, { target: 'swift' })
      const w = result.warnings.find((w) => w.includes('<ErrorBoundary>'))
      expect(w).toBeDefined()
      expect(w!).toContain('fallback')
      expect(w!).toContain('no render-time try/catch on SwiftUI')
    })

    it('Kotlin: warns when fallback prop is present', () => {
      const result = transform(SRC, { target: 'kotlin' })
      const w = result.warnings.find((w) => w.includes('<ErrorBoundary>'))
      expect(w).toBeDefined()
      expect(w!).toContain('fallback')
      expect(w!).toContain('no render-time try/catch on Compose')
    })

    it('does NOT warn when fallback prop is absent (baseline)', () => {
      const src = `export function App() {
        return <ErrorBoundary><Text>Safe</Text></ErrorBoundary>
      }`
      const swift = transform(src, { target: 'swift' })
      expect(swift.warnings.some((w) => w.includes('<ErrorBoundary>'))).toBe(false)
    })
  })

  describe('<KeepAlive when={...}>', () => {
    const SRC = `export function App() {
      return <KeepAlive when={shouldCache}><Text>Cached</Text></KeepAlive>
    }`

    it('Swift: warns when `when` prop is present', () => {
      const result = transform(SRC, { target: 'swift' })
      const w = result.warnings.find((w) => w.includes('<KeepAlive>'))
      expect(w).toBeDefined()
      expect(w!).toContain('when')
      expect(w!).toContain('no native state-cache across unmount on SwiftUI')
      expect(w!).toContain('cache behaviour is inert')
    })

    it('Kotlin: warns when `when` prop is present', () => {
      const result = transform(SRC, { target: 'kotlin' })
      const w = result.warnings.find((w) => w.includes('<KeepAlive>'))
      expect(w).toBeDefined()
      expect(w!).toContain('when')
      expect(w!).toContain('no native state-cache across unmount on Compose')
    })

    it('does NOT warn when `when` is absent (baseline)', () => {
      const src = `export function App() {
        return <KeepAlive><Text>Cached</Text></KeepAlive>
      }`
      const swift = transform(src, { target: 'swift' })
      expect(swift.warnings.some((w) => w.includes('<KeepAlive>'))).toBe(false)
    })
  })

  describe('warning surfaces dropped prop list', () => {
    it('Swift: lists ALL dropped props when multiple present', () => {
      // KeepAlive accepts include/exclude alongside `when` (multi-prop
      // shape proves the diagnostic enumerates rather than picking one).
      const src = `export function App() {
        return <KeepAlive when={x} include={["A"]} exclude={["B"]}><Text>x</Text></KeepAlive>
      }`
      const result = transform(src, { target: 'swift' })
      const w = result.warnings.find((w) => w.includes('<KeepAlive>'))
      expect(w).toBeDefined()
      expect(w!).toContain('when')
      expect(w!).toContain('include')
      expect(w!).toContain('exclude')
    })
  })

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

  describe('warning is identical-shape across both targets', () => {
    // Lock the structural contract: every walled-tag warning carries
    // the tag + dropped prop list + target name + per-target limitation
    // + Layer-4 workaround pointer. Tests both targets see the same
    // information shape (different target-specific wording).
    const SRC = `export function App() {
      return <Suspense fallback={<Text>L</Text>}><Text>x</Text></Suspense>
    }`

    it('both targets carry tag name, dropped prop, target name, and Layer-4 pointer', () => {
      for (const target of ['swift', 'kotlin'] as const) {
        const result = transform(SRC, { target })
        const w = result.warnings.find((w) => w.includes('<Suspense>'))
        expect(w, `${target} should warn`).toBeDefined()
        expect(w!).toContain('<Suspense>')
        expect(w!).toContain('fallback')
        expect(w!).toContain(target === 'swift' ? 'Swift' : 'Kotlin')
        expect(w!).toContain('Layer 4')
        expect(w!).toContain(target === 'swift' ? '<NativeIOS>' : '<NativeAndroid>')
      }
    })
  })
})
