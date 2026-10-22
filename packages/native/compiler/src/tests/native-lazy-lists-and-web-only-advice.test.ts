// "Native lists are lazy by construction" is the whole reason `@pyreon/virtual` stays web-only, so it has to be TRUE
// for the shape a user is told to write — and the web-only warning for `@pyreon/virtual` / `@pyreon/document` has to
// name that remedy rather than only the refusal.
//
// The lazy shape is `<Scroll>` whose ONLY child is a `<For>`. Anything else around the `<For>` nests a lazy list inside
// a scrolling container: Compose rejects that at MEASURE time, so the compiler warns on the Kotlin side.

import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const list = (body: string) => `import { signal } from '@pyreon/reactivity'
import { Scroll, Stack, Text, For } from '@pyreon/primitives'
export function C() {
  const rows = signal([{ id: 1, label: 'a' }, { id: 2, label: 'b' }, { id: 3, label: 'c' }])
  return (
    ${body}
  )
}`

const DIRECT = list(`<Scroll><For each={rows()} by={(r) => r.id}>{(r) => <Text>{r.label}</Text>}</For></Scroll>`)
const NESTED = list(`<Scroll><Stack><For each={rows()} by={(r) => r.id}>{(r) => <Text>{r.label}</Text>}</For></Stack></Scroll>`)

const warnings = (src: string, target: 'swift' | 'kotlin') => (transform(src, { target }).warnings ?? []) as string[]

describe('a <Scroll> whose only child is a <For> is lazy on both targets', () => {
  it('Swift emits a LazyVStack, not an eager VStack', () => {
    const code = transform(DIRECT, { target: 'swift' }).code
    expect(code).toContain('LazyVStack')
    expect(code).not.toMatch(/\bVStack \{/)
    expect(warnings(DIRECT, 'swift')).toEqual([])
  })

  it('Kotlin emits a LazyColumn that is not inside a scrolling Column', () => {
    const code = transform(DIRECT, { target: 'kotlin' }).code
    expect(code).toContain('LazyColumn')
    expect(code).not.toContain('verticalScroll')
    expect(warnings(DIRECT, 'kotlin')).toEqual([])
  })

  it.skipIf(!isSwiftcAvailable())('Swift type-checks', () => {
    expect(validateSwiftWithStubs(transform(DIRECT, { target: 'swift' }).code).ok).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin type-checks', () => {
    expect(validateKotlin(transform(DIRECT, { target: 'kotlin' }).code).ok).toBe(true)
  })
})

describe('the nested shape is the one that is NOT safe, and Kotlin says so', () => {
  it('a <For> among other children inside a <Scroll> warns with the remedy', () => {
    const w = warnings(NESTED, 'kotlin')
    expect(w.some((m) => m.includes('measured with an infinity maximum height') && m.includes('its own <Scroll>'))).toBe(true)
  })
})

describe('the web-only advice names the native route', () => {
  const importing = (pkg: string, name: string) =>
    `import { ${name} } from '${pkg}'\nimport { Stack, Text } from '@pyreon/primitives'\nexport function C() { return (<Stack><Text>x</Text></Stack>) }`

  it('@pyreon/virtual points at <Scroll><For/>', () => {
    const w = warnings(importing('@pyreon/virtual', 'useVirtualizer'), 'swift').join('\n')
    expect(w).toContain('@pyreon/virtual')
    expect(w).toContain('`<Scroll>`')
    expect(w).toContain('LazyVStack')
  })

  it('@pyreon/document points at fetching the file or sharing it', () => {
    const w = warnings(importing('@pyreon/document', 'render'), 'kotlin').join('\n')
    expect(w).toContain('@pyreon/document')
    expect(w).toContain('useFetch')
    expect(w).toContain('useShare')
  })
})
