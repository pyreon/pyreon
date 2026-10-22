// `@pyreon/head` on native: the document `<head>` has no native counterpart, so `useHead(...)` lowers to nothing and
// `<HeadProvider>` is transparent. Shared source that sets a page title for the web build must still COMPILE for
// iOS and Android — before this, the web-only import warning fired and the emit referenced `useHead`/`HeadProvider`,
// symbols neither runtime defines.

import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const SHARED = `import { signal } from '@pyreon/reactivity'
import { useHead, HeadProvider } from '@pyreon/head'
import { Stack, Text } from '@pyreon/primitives'
export function Page() {
  const n = signal(1)
  useHead({ title: 'Inbox', meta: [{ name: 'description', content: 'mail' }] })
  useHead(() => ({ title: 'Inbox ' + n() }))
  return (
    <HeadProvider>
      <Stack>
        <Text>hello</Text>
      </Stack>
    </HeadProvider>
  )
}`

describe.each(['swift', 'kotlin'] as const)('%s', (target) => {
  const r = transform(SHARED, { target })

  it('compiles shared source that uses useHead + HeadProvider with ZERO warnings', () => {
    expect(r.warnings ?? []).toEqual([])
  })

  it('emits no trace of the head API', () => {
    expect(r.code).not.toMatch(/useHead|HeadProvider/)
  })

  it('keeps the children of <HeadProvider> in place', () => {
    expect(r.code).toContain('hello')
  })
})

describe('the real compilers accept it', () => {
  it.skipIf(!isSwiftcAvailable())('Swift type-checks', () => {
    const v = validateSwiftWithStubs(transform(SHARED, { target: 'swift' }).code)
    expect(v.ok, v.ok ? '' : String((v as { error?: string }).error)).toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Kotlin type-checks', () => {
    const v = validateKotlin(transform(SHARED, { target: 'kotlin' }).code)
    expect(v.ok, v.ok ? '' : String((v as { error?: string }).error)).toBe(true)
  })
})

describe('the rest of the package still warns by name', () => {
  it('createHeadContext has no native lowering and says so', () => {
    const src = `import { createHeadContext } from '@pyreon/head'
import { Stack, Text } from '@pyreon/primitives'
export function C() {
  const ctx = createHeadContext()
  return (<Stack><Text>x</Text></Stack>)
}`
    const w = ((transform(src, { target: 'swift' }).warnings ?? []) as string[]).join('\n')
    expect(w).toContain('createHeadContext')
    expect(w).toContain('@pyreon/head')
  })
})
