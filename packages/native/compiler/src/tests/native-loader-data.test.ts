// `useLoaderData<T>()` on native: non-optional, gated on the data existing, and destructurable.
//
// On the web a route's loader runs BEFORE its component renders, so `useLoaderData()` always returns the data. Natively
// the loader runs on appear, so the runtime read is optional — and the emit handed that optional straight to the
// author's code: `data.title` failed to compile on BOTH targets, with no warning, and `const { title } = …` was not
// lowered at all. Now:
//   - Kotlin: `val data = useLoaderData<T>() ?: return` — the composable (and its LaunchedEffects) runs once the data
//     exists, and `data` is non-null everywhere after.
//   - Swift: a non-optional accessor, plus a body gate; `PyreonRouteLoader` holds the route's component back until the
//     data exists, so `onMount` (`.onAppear`, outside the body gate) also sees it — the web's order.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const head = `import { useLoaderData } from '@pyreon/router'
import { Stack, Text } from '@pyreon/primitives'
type Post = { title: string; views: number }
`
const SHAPES: Record<string, string> = {
  'a single binding read by field': `${head}export function P() { const data = useLoaderData<Post>(); return <Stack><Text>{data.title}</Text><Text>{data.views}</Text></Stack> }`,
  'a destructure, with a rename': `${head}export function P() { const { title: heading, views } = useLoaderData<Post>(); return <Stack><Text>{heading}</Text><Text>{views}</Text></Stack> }`,
  'a destructure of an inline type': `import { useLoaderData } from '@pyreon/router'
import { Stack, Text } from '@pyreon/primitives'
export function P() { const { x } = useLoaderData<{ x: string }>(); return <Stack><Text>{x}</Text></Stack> }`,
}

describe('useLoaderData on native', () => {
  for (const [label, src] of Object.entries(SHAPES)) {
    describe(label, () => {
      it('lowers with no warning', () => {
        for (const target of ['swift', 'kotlin'] as const) expect(transform(src, { target }).warnings, target).toEqual([])
      })

      it('Kotlin returns early until the data exists, so every read is non-null', () => {
        expect(transform(src, { target: 'kotlin' }).code).toMatch(/= useLoaderData<\w+>\(\) \?: return/)
      })

      it('Swift reads a non-optional value inside a body gated on the data', () => {
        const code = transform(src, { target: 'swift' }).code
        expect(code).toMatch(/: \w+ \{ useLoaderData\(router: pyreonRouter\)! \}/)
        expect(code).toMatch(/if \(useLoaderData\(router: pyreonRouter\) as \w+\?\) != nil \{/)
      })

      it.runIf(isSwiftcAvailable())('Swift emit typechecks', () => {
        const v = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
        expect(v.ok, v.error).toBe(true)
      })

      it.runIf(isKotlincAvailable())('Kotlin emit typechecks', () => {
        const v = validateKotlin(transform(src, { target: 'kotlin' }).code)
        expect(v.ok, v.error).toBe(true)
      })
    })
  }

  it('an inline type names the same struct the route loader literal builds (the runtime casts with as? T)', () => {
    const src = `import { createRouter, useLoaderData, RouterProvider, RouterView } from '@pyreon/router'
import { Stack, Text } from '@pyreon/primitives'
function Page() { const { x } = useLoaderData<{ x: string }>(); return <Stack><Text>{x}</Text></Stack> }
export function App() {
  const router = createRouter({ routes: [{ path: '/', component: Page, loader: () => ({ x: 'hi' }) }] })
  return <RouterProvider router={router}><RouterView /></RouterProvider>
}`
    for (const target of ['swift', 'kotlin'] as const) {
      const code = transform(src, { target }).code
      const read = /useLoaderData<?(?:\(router: pyreonRouter\) as )?(\w+)/.exec(
        target === 'swift' ? code.slice(code.indexOf('as ') - 40) : code,
      )
      const built = /load(?: =|:) \{ \(?(\w+)\(/.exec(code)
      expect(read?.[1], `${target}: the type the component reads`).toBeDefined()
      expect(built?.[1], `${target}: the type the loader builds`).toBe(read?.[1])
    }
  })

  it('a field the type does not declare warns on both targets instead of emitting a read that cannot compile', () => {
    const src = `${head}export function P() { const { title, nope } = useLoaderData<Post>(); return <Text>{title}</Text> }`
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(src, { target }).warnings.join('\n'), target).toContain('declares no field `nope`')
    }
  })

  it('a rest element, a nested pattern and a default each warn by name', () => {
    const forms = ['const { ...rest } = useLoaderData<Post>()', 'const { title: { a } } = useLoaderData<Post>()', "const { title = 'x' } = useLoaderData<Post>()"]
    for (const form of forms) {
      const w = transform(`${head}export function P() { ${form}; return <Text>x</Text> }`, { target: 'swift' }).warnings.join('\n')
      expect(w, form).toMatch(/useLoaderData<T>\(\)/)
    }
  })
})
