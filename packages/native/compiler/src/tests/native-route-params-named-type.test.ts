// A route component's `params` prop typed with a NAMED struct is constructed from the matched path, like an inline one.
//
// THE BUGS (both silent, both build failures):
//   1. `function UserPage(props: { params: UserParams })` — the router pre-pass only recognised an INLINE object type,
//      so a named one was 'opaque' and BOTH dispatchers passed matchPath's raw string dictionary where a `UserParams`
//      was expected: `UserPage(params: params)`.
//   2. Kotlin only — an inline params shape identical to a declared struct is TYPED as that struct by the prop's own
//      emit (`fun InlinePage(params: UserParams)`), but the pre-pass predicted the synthesized name and constructed
//      `InlinePageParam(…)`: a type mismatch. Swift's pre-pass already looked the shape up first.
// Writing the params type once and reusing it across route components is the natural way to type them.
import { describe, expect, it } from 'vitest'
import { isKotlincAvailable } from '../validate'
import { transform, validateKotlin } from './first-party-plugins'

const APP = [
  "import { Text } from '@pyreon/primitives'",
  "import { createRouter, RouterProvider, RouterView } from '@pyreon/router'",
  'type UserParams = { id: string }',
  'function UserPage(props: { params: UserParams }) {',
  '  return <Text>{props.params.id}</Text>',
  '}',
  'function InlinePage(props: { params: { id: string } }) {',
  '  return <Text>{props.params.id}</Text>',
  '}',
  'export function App() {',
  "  const router = createRouter({ routes: [{ path: '/u/:id', component: UserPage }, { path: '/i/:id', component: InlinePage }] })",
  '  return <RouterProvider router={router}><RouterView /></RouterProvider>',
  '}',
].join('\n')

describe('a named params type is constructed from the matched path', () => {
  it('Swift', () => {
    const r = transform(APP, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('UserPage(params: UserParams(id: params["id"] ?? ""))')
    expect(r.code).not.toContain('UserPage(params: params)')
  })

  it('Kotlin', () => {
    const r = transform(APP, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('UserPage(params = UserParams(id = params["id"] ?: ""))')
    expect(r.code).not.toContain('UserPage(params = params)')
  })
})

describe('Kotlin: an inline params shape identical to a declared struct', () => {
  it('constructs the struct the parameter is actually typed as', () => {
    const r = transform(APP, { target: 'kotlin' })
    expect(r.code).toContain('fun InlinePage(params: UserParams)')
    expect(r.code).toContain('InlinePage(params = UserParams(id = params["id"] ?: ""))')
    expect(r.code).not.toContain('InlinePageParam(')
  })
})

// The Swift stubs carry no router surface, so the Swift half is proven on a device instead: the router demo's
// `UserPage` takes a named `UserParams`, and the required iOS gate builds and drives it.
describe('the Kotlin emit compiles', () => {
  it.skipIf(!isKotlincAvailable())('kotlinc', () => {
    const r = validateKotlin(transform(APP, { target: 'kotlin' }).code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  }, 180_000)
})
