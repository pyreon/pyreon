// Phase 2 — real `<ErrorBoundary fallback={X}>` emit tests.
//
// Inline `Group { if <errored> { fallback } else { children } }`
// (Swift) / `if (<errored>) { ... } else { ... }` (Kotlin) where
// `<errored>` ORs every `useFetch` container's error in the
// component, read directly in the body so it tracks. No fetch →
// `false` (content always shows). Mirror of the Suspense emit.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SRC = `
import { Stack, Text, ErrorBoundary } from '@pyreon/primitives'

export function App() {
  return (
    <ErrorBoundary fallback={<Text>Something went wrong</Text>}>
      <Stack>
        <Text>Healthy content path</Text>
      </Stack>
    </ErrorBoundary>
  )
}
`

describe('Gap 3 PR-3.3 — real ErrorBoundary emit', () => {
  it('Swift: emits an inline Group { if hasError } (no fetch → false)', () => {
    const r = transform(SRC, { target: 'swift' })
    expect(r.code).toContain('Group {')
    expect(r.code).toContain('if false {')
    expect(r.code).not.toContain('PyreonErrorBoundaryWrapper')
    expect(r.code).toContain('Something went wrong')
    expect(r.code).toContain('Healthy content path')
  })

  it('Kotlin: emits an inline if/else (no fetch → false)', () => {
    const r = transform(SRC, { target: 'kotlin' })
    expect(r.code).toContain('if (false) {')
    expect(r.code).not.toContain('PyreonErrorBoundaryWrapper')
    expect(r.code).toContain('Something went wrong')
    expect(r.code).toContain('Healthy content path')
  })

  it('Phase 2: an ErrorBoundary over a useFetch reads the container error (real semantics)', () => {
    const FETCH_SRC = `
      type Quote = { id: number; text: string }
      export function App() {
        const quotes = useFetch<Quote[]>('http://127.0.0.1:8787/quotes.json')
        return (
          <ErrorBoundary fallback={<Text>Something went wrong</Text>}>
            <For each={() => quotes.data() ?? []} by={(q) => q.id}>{(q) => <Text>{q.text}</Text>}</For>
          </ErrorBoundary>
        )
      }
    `
    const swift = transform(FETCH_SRC, { target: 'swift' }).code
    // Failed-fetch error drives the fallback — read INLINE in the body.
    expect(swift).toContain('if quotes.error != nil {')
    expect(swift).not.toContain('if false {')
    expect(swift).not.toContain('PyreonErrorBoundaryWrapper')
    const kotlin = transform(FETCH_SRC, { target: 'kotlin' }).code
    expect(kotlin).toContain('if (quotes.error.value != null) {')
    expect(kotlin).not.toContain('if (false) {')
    expect(kotlin).not.toContain('PyreonErrorBoundaryWrapper')
  })

  it('ErrorBoundary with no fallback prop falls back to walled emit', () => {
    const src = `
import { Stack, Text, ErrorBoundary } from '@pyreon/primitives'

export function App() {
  return (
    <ErrorBoundary>
      <Stack><Text>only children</Text></Stack>
    </ErrorBoundary>
  )
}
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).not.toContain('PyreonErrorBoundaryWrapper')
    expect(r.code).toContain('<ErrorBoundary> unsupported on iOS')
  })

  it('Multiple ErrorBoundary sites each emit self-contained inline if/else (no shared wrapper)', () => {
    const src = `
import { Stack, Text, ErrorBoundary } from '@pyreon/primitives'

export function App() {
  return (
    <Stack>
      <ErrorBoundary fallback={<Text>E1</Text>}>
        <Text>C1</Text>
      </ErrorBoundary>
      <ErrorBoundary fallback={<Text>E2</Text>}>
        <Text>C2</Text>
      </ErrorBoundary>
    </Stack>
  )
}
`
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src, { target })
      expect(r.code).not.toContain('PyreonErrorBoundaryWrapper')
      expect(r.code).toContain('E1')
      expect(r.code).toContain('C1')
      expect(r.code).toContain('E2')
      expect(r.code).toContain('C2')
    }
  })

  it('NO ErrorBoundary sites → NO wrapper definition emitted', () => {
    const src = `
import { Stack, Text } from '@pyreon/primitives'

export function App() {
  return <Stack><Text>plain</Text></Stack>
}
`
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src, { target })
      expect(r.code).not.toContain('PyreonErrorBoundaryWrapper')
    }
  })
})
