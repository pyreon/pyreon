// Phase 2 — real `<Suspense fallback={X}>` emit tests.
//
// Loading-state semantic: each Suspense site emits an INLINE
// `Group { if <pending> { fallback } else { children } }` (Swift) /
// `if (<pending>) { ... } else { ... }` (Kotlin) where `<pending>`
// ORs every `useFetch` container's isPending in the component. The
// condition is read DIRECTLY in the component body so SwiftUI
// Observation / Compose recomposition tracks it — a child wrapper
// struct arg does NOT (device-found). No fetch → `false`.
//
// Bisect-verify (per .claude/rules/testing.md):
//   1. Revert emitSwiftSuspense / emitKotlinSuspense to walled emit
//   2. The fetch spec fails (no `if quotes.isPending {` in output)
//   3. Restore; all specs pass

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SRC = `
import { Stack, Text, Suspense } from '@pyreon/primitives'

export function App() {
  return (
    <Suspense fallback={<Text>Loading…</Text>}>
      <Stack>
        <Text>Content rendered after first frame</Text>
      </Stack>
    </Suspense>
  )
}
`

describe('Gap 3 PR-3.2 — real Suspense emit', () => {
  it('Swift: emits an inline Group { if isLoading } (no fetch → false)', () => {
    const r = transform(SRC, { target: 'swift' })
    // Inline — the @Observable read must be in the component body to be
    // tracked; a child wrapper arg isn't (device-found). No fetch → false.
    expect(r.code).toContain('Group {')
    expect(r.code).toContain('if false {')
    expect(r.code).not.toContain('PyreonSuspenseWrapper')
    expect(r.code).toContain('Loading')
    expect(r.code).toContain('Content rendered after first frame')
  })

  it('Kotlin: emits an inline if/else (no fetch → false)', () => {
    const r = transform(SRC, { target: 'kotlin' })
    expect(r.code).toContain('if (false) {')
    expect(r.code).not.toContain('PyreonSuspenseWrapper')
    expect(r.code).toContain('Loading')
    expect(r.code).toContain('Content rendered after first frame')
  })

  it('Phase 2: a Suspense over a useFetch reads the container isPending (real semantics)', () => {
    const FETCH_SRC = `
      type Quote = { id: number; text: string }
      export function App() {
        const quotes = useFetch<Quote[]>('http://127.0.0.1:8787/quotes.json')
        return (
          <Suspense fallback={<Text>Loading…</Text>}>
            <For each={() => quotes.data() ?? []} by={(q) => q.id}>{(q) => <Text>{q.text}</Text>}</For>
          </Suspense>
        )
      }
    `
    const swift = transform(FETCH_SRC, { target: 'swift' }).code
    // Fallback shows until the fetch container settles — read INLINE in
    // the component body (NOT { false }, NOT a child-wrapper arg) so
    // SwiftUI Observation tracks it.
    expect(swift).toContain('if quotes.isPending {')
    expect(swift).not.toContain('if false {')
    expect(swift).not.toContain('PyreonSuspenseWrapper')
    const kotlin = transform(FETCH_SRC, { target: 'kotlin' }).code
    expect(kotlin).toContain('if (quotes.isPending.value) {')
    expect(kotlin).not.toContain('if (false) {')
    expect(kotlin).not.toContain('PyreonSuspenseWrapper')
  })

  it('Suspense with no fallback prop falls back to walled emit + warning', () => {
    const src = `
import { Stack, Text, Suspense } from '@pyreon/primitives'

export function App() {
  return (
    <Suspense>
      <Stack><Text>only children</Text></Stack>
    </Suspense>
  )
}
`
    const r = transform(src, { target: 'swift' })
    // No PyreonSuspenseWrapper emitted (no fallback to wrap).
    expect(r.code).not.toContain('PyreonSuspenseWrapper')
    // Walled-emit comment present (kept the legacy semantic for the
    // no-fallback case).
    expect(r.code).toContain('<Suspense> unsupported on iOS')
  })

  it('Multiple Suspense sites each emit self-contained inline if/else (no shared wrapper)', () => {
    const src = `
import { Stack, Text, Suspense } from '@pyreon/primitives'

export function App() {
  return (
    <Stack>
      <Suspense fallback={<Text>L1</Text>}>
        <Text>C1</Text>
      </Suspense>
      <Suspense fallback={<Text>L2</Text>}>
        <Text>C2</Text>
      </Suspense>
    </Stack>
  )
}
`
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src, { target })
      // Inline emit — no shared wrapper struct/composable at module scope.
      expect(r.code).not.toContain('PyreonSuspenseWrapper')
      // Both sites self-contained: fallback + content present per site.
      expect(r.code).toContain('L1')
      expect(r.code).toContain('C1')
      expect(r.code).toContain('L2')
      expect(r.code).toContain('C2')
    }
  })

  it('NO Suspense sites → NO wrapper definition emitted (zero-cost when unused)', () => {
    const src = `
import { Stack, Text } from '@pyreon/primitives'

export function App() {
  return <Stack><Text>plain</Text></Stack>
}
`
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src, { target })
      expect(r.code).not.toContain('PyreonSuspenseWrapper')
    }
  })
})
