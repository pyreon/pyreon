// The teardown `onMount` returns runs when the view goes away: Swift `.onDisappear`, Kotlin `DisposableEffect`'s
// `onDispose`. It used to be stripped with a warning, so a subscription opened on mount was never closed on native.
//
// The one shape that stays a warning: a cleanup that reads a local the mount body declared. On the web the returned
// closure captures it; native runs mount and unmount as separate hooks, so the value would not be there.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const comp = (mount: string): string => `import { onMount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function P() {
  const status = signal('idle')
  onMount(() => { ${mount} })
  return <Stack><Text>{status()}</Text></Stack>
}`

const WITH_CLEANUP = comp("status.set('mounted'); return () => { status.set('unmounted') }")

describe('onMount cleanup on native', () => {
  it('lowers the teardown with no warning', () => {
    for (const target of ['swift', 'kotlin'] as const) expect(transform(WITH_CLEANUP, { target }).warnings, target).toEqual([])
  })

  it('Swift: the teardown is an .onDisappear beside the mount .onAppear', () => {
    const code = transform(WITH_CLEANUP, { target: 'swift' }).code
    expect(code).toMatch(/\.onAppear \{\s+status = "mounted"\s+\}/)
    expect(code).toMatch(/\.onDisappear \{\s+status = "unmounted"\s+\}/)
  })

  it('Kotlin: the teardown is a DisposableEffect onDispose, and the mount body keeps its LaunchedEffect', () => {
    const code = transform(WITH_CLEANUP, { target: 'kotlin' }).code
    expect(code).toMatch(/LaunchedEffect\(Unit\) \{\s+status = "mounted"\s+\}/)
    expect(code).toMatch(/DisposableEffect\(Unit\) \{\s+onDispose \{\s+status = "unmounted"\s+\}\s+\}/)
  })

  it('a concise-arrow teardown lowers too', () => {
    const src = comp("status.set('mounted'); return () => status.set('unmounted')")
    expect(transform(src, { target: 'swift' }).code).toMatch(/\.onDisappear \{\s+status = "unmounted"/)
    expect(transform(src, { target: 'kotlin' }).code).toMatch(/onDispose \{\s+status = "unmounted"/)
  })

  it.runIf(isSwiftcAvailable())('Swift emit typechecks', () => {
    const v = validateSwiftWithStubs(transform(WITH_CLEANUP, { target: 'swift' }).code)
    expect(v.ok, v.error).toBe(true)
  })

  it.runIf(isKotlincAvailable())('Kotlin emit typechecks', () => {
    const v = validateKotlin(transform(WITH_CLEANUP, { target: 'kotlin' }).code)
    expect(v.ok, v.error).toBe(true)
  })

  it('a teardown that reads a mount-body local warns by name and is not emitted', () => {
    const src = comp("const label = 'bye'; status.set('mounted'); return () => { status.set(label) }")
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src, { target })
      expect(r.warnings.join('\n'), target).toContain("onMount's cleanup reads `label`")
      expect(r.code, target).not.toMatch(/onDisappear|DisposableEffect/)
    }
  })

  it('a mount with no teardown is unchanged: no .onDisappear, no DisposableEffect', () => {
    const src = comp("status.set('mounted')")
    expect(transform(src, { target: 'swift' }).code).not.toContain('.onDisappear')
    expect(transform(src, { target: 'kotlin' }).code).not.toContain('DisposableEffect')
  })
})
