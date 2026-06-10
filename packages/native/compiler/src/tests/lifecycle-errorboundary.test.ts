// Gap 3 PR-3.3 — real `<ErrorBoundary fallback={X}>` emit tests.
//
// Structural boundary primitive: per-target wrapper holding the
// error state; children render by default. Mirror of #1475's
// Suspense pattern (different semantic: no auto-flip on mount;
// the flag stays false until an external hook flips it).

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
  it('Swift: emits PyreonErrorBoundaryWrapper call site + wrapper definition', () => {
    const r = transform(SRC, { target: 'swift' })
    expect(r.code).toContain('PyreonErrorBoundaryWrapper(content: {')
    expect(r.code).toContain('}, fallback: {')
    expect(r.code).toContain('private struct PyreonErrorBoundaryWrapper')
    expect(r.code).toContain('@State private var hasError = false')
    expect(r.code).toContain('Something went wrong')
    expect(r.code).toContain('Healthy content path')
  })

  it('Kotlin: emits PyreonErrorBoundaryWrapper composable + call site', () => {
    const r = transform(SRC, { target: 'kotlin' })
    expect(r.code).toContain('PyreonErrorBoundaryWrapper(content = {')
    expect(r.code).toContain('}, fallback = {')
    expect(r.code).toContain('private fun PyreonErrorBoundaryWrapper')
    expect(r.code).toContain('var hasError by remember { mutableStateOf(false) }')
    expect(r.code).toContain('Something went wrong')
    expect(r.code).toContain('Healthy content path')
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

  it('Multiple ErrorBoundary sites emit ONE wrapper definition', () => {
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
      const marker =
        target === 'swift'
          ? 'private struct PyreonErrorBoundaryWrapper'
          : 'private fun PyreonErrorBoundaryWrapper'
      const occurrences = r.code.split(marker).length - 1
      expect(occurrences).toBe(1)
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
