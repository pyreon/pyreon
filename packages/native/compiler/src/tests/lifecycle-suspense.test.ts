// Gap 3 PR-3.2 — real `<Suspense fallback={X}>` emit tests.
//
// Mount-time splash semantic: SwiftUI emits a `PyreonSuspenseWrapper`
// View (per-target helper) holding `@State private var isLoading` +
// `.task { isLoading = false }`. Compose emits the Composable
// equivalent with `LaunchedEffect`. Per-Suspense sites become calls
// to the wrapper.
//
// Bisect-verify (per .claude/rules/testing.md):
//   1. Revert emitSwiftSuspense / emitKotlinSuspense gates in
//      emit-{swift,kotlin}.ts to the pre-PR walled emit
//   2. The first 4 expect()s here fail because PyreonSuspenseWrapper
//      no longer appears in the emitted output
//   3. Restore the gates; all specs pass

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
  it('Swift: emits PyreonSuspenseWrapper call site + wrapper definition', () => {
    const r = transform(SRC, { target: 'swift' })
    expect(r.code).toContain('PyreonSuspenseWrapper(content: {')
    expect(r.code).toContain('}, fallback: {')
    // Wrapper definition emitted once.
    expect(r.code).toContain('private struct PyreonSuspenseWrapper')
    expect(r.code).toContain('@State private var isLoading = true')
    expect(r.code).toContain('.task {')
    expect(r.code).toContain('isLoading = false')
    // Fallback content baked in.
    expect(r.code).toContain('Loading')
    // Children body baked in.
    expect(r.code).toContain('Content rendered after first frame')
  })

  it('Kotlin: emits PyreonSuspenseWrapper composable + call site', () => {
    const r = transform(SRC, { target: 'kotlin' })
    expect(r.code).toContain('PyreonSuspenseWrapper(content = {')
    expect(r.code).toContain('}, fallback = {')
    // Wrapper composable definition emitted once.
    expect(r.code).toContain('private fun PyreonSuspenseWrapper')
    expect(r.code).toContain('var isLoading by remember { mutableStateOf(true) }')
    expect(r.code).toContain('LaunchedEffect(Unit) { isLoading = false }')
    expect(r.code).toContain('Loading')
    expect(r.code).toContain('Content rendered after first frame')
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

  it('Multiple Suspense sites emit ONE wrapper definition', () => {
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
      const marker =
        target === 'swift'
          ? 'private struct PyreonSuspenseWrapper'
          : 'private fun PyreonSuspenseWrapper'
      const occurrences = r.code.split(marker).length - 1
      expect(occurrences).toBe(1)
      // Both call sites present.
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
