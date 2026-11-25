// `useLoaderData<T>()` on native: non-optional, gated on the data existing, read through the web's accessor shape.
//
// On the web `useLoaderData<T>()` returns a reactive ACCESSOR, read as `data().title`. On the web a route's loader runs
// BEFORE its component renders, so the data is always there. Natively the loader runs on appear, so the runtime read is
// optional — and the emit once handed that optional straight to the author's code. Now:
//   - Kotlin: `val data = useLoaderData<T>() ?: return` — the composable (and its LaunchedEffects) runs once the data
//     exists, and `data` is non-null everywhere after.
//   - Swift: a non-optional accessor, plus a body gate; `PyreonRouteLoader` holds the route's component back until the
//     data exists, so `onMount` (`.onAppear`, outside the body gate) also sees it — the web's order.
//   - `data()` lowers to the native value read `data`, typed as `T` (so `.length` is `.count` on Swift, and a field `T`
//     declares non-optional is interpolated bare).
//   - A destructure reads fields off the accessor (broken on the web), so it is not lowered: it warns with the fix.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const head = `import { useLoaderData } from '@pyreon/router'
import { Stack, Text } from '@pyreon/primitives'
type Post = { title: string; views: number }
`
const SHAPES: Record<string, string> = {
  'an accessor read by field': `${head}export function P() { const data = useLoaderData<Post>(); return <Stack><Text>{data().title}</Text><Text>{data().views}</Text></Stack> }`,
  'an accessor read in a condition, a list and an effect': `import { useLoaderData } from '@pyreon/router'
import { effect } from '@pyreon/reactivity'
import { For, Stack, Text } from '@pyreon/primitives'
type Post = { title: string; tags: string[] }
export function P() {
  const data = useLoaderData<Post>()
  effect(() => { console.log(data().title) })
  return <Stack>{data().tags.length > 0 ? <Text>{data().tags.length}</Text> : null}<For each={() => data().tags} by={(t) => t}>{(t) => <Text>{t}</Text>}</For></Stack>
}`,
  'an accessor read into a body snapshot, a computed and a local arrow': `import { useLoaderData } from '@pyreon/router'
import { computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
type Post = { title: string; views: number }
export function P() {
  const data = useLoaderData<Post>()
  const snapshot = data().title
  const upper = computed(() => data().title.toUpperCase())
  const views = () => data().views
  return <Stack><Text>{snapshot}</Text><Text>{upper()}</Text><Text>{views()}</Text></Stack>
}`,
  'the accessor passed UNCALLED to a `() => T` prop': `import { useLoaderData } from '@pyreon/router'
import { Stack, Text } from '@pyreon/primitives'
type Post = { title: string; views: number }
function Card(props: { post: () => Post }) { return <Text>{props.post().title}</Text> }
export function P() { const data = useLoaderData<Post>(); return <Stack><Card post={data} /></Stack> }`,
  'an accessor of an inline type': `import { useLoaderData } from '@pyreon/router'
import { Stack, Text } from '@pyreon/primitives'
export function P() { const data = useLoaderData<{ x: string }>(); return <Stack><Text>{data().x}</Text></Stack> }`,
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
function Page() { const data = useLoaderData<{ x: string }>(); return <Stack><Text>{data().x}</Text></Stack> }
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

  it('data() lowers to the same native read the binding is, typed by T', () => {
    const swift = transform(SHAPES['an accessor read in a condition, a list and an effect']!, { target: 'swift' }).code
    expect(swift).toContain('Text(verbatim: "\\(data.tags.count)")')
    expect(swift).toContain('ForEach(data.tags, id: \\.self)')
    expect(swift).not.toContain('data()')
    const kotlin = transform(SHAPES['an accessor read by field']!, { target: 'kotlin' }).code
    expect(kotlin).toContain('Text(text = "${data.title}")')
    expect(kotlin).not.toContain('data()')
  })

  it('the accessor passed uncalled to a `() => T` prop is passed as a closure, not as the value', () => {
    const src = SHAPES['the accessor passed UNCALLED to a `() => T` prop']!
    expect(transform(src, { target: 'swift' }).code).toContain('Card(post: { data })')
    expect(transform(src, { target: 'kotlin' }).code).toContain('Card(post = { data })')
  })

  it('a signal or a computed passed uncalled to a `() => T` prop is passed as a closure too (the same class)', () => {
    const src = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
function Count(props: { n: () => number }) { return <Text>{props.n()}</Text> }
export function P() { const n = signal(1); const doubled = computed(() => n() * 2); return <Stack><Count n={n} /><Count n={doubled} /></Stack> }`
    const swift = transform(src, { target: 'swift' }).code
    const kotlin = transform(src, { target: 'kotlin' }).code
    expect(swift).toContain('Count(n: { n })')
    expect(swift).toContain('Count(n: { doubled })')
    expect(kotlin).toContain('Count(n = { n })')
    expect(kotlin).toContain('Count(n = { doubled })')
    if (isSwiftcAvailable()) {
      const v = validateSwiftWithStubs(swift)
      expect(v.ok, v.error).toBe(true)
    }
    if (isKotlincAvailable()) {
      const v = validateKotlin(kotlin)
      expect(v.ok, v.error).toBe(true)
    }
  })

  it('`useLoaderData<T>()()` (called where it is made) warns by name with the fix instead of dropping T', () => {
    const src = `${head}export function P() { const t = useLoaderData<Post>()().title; return <Text>{t}</Text> }`
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src, { target })
      const w = r.warnings.join('\n')
      expect(w, target).toContain('`useLoaderData<T>()()` (the accessor called where it is made)')
      expect(w, target).toContain('`const data = useLoaderData<T>()`')
      expect(r.code, target).not.toContain('useLoaderData()')
    }
  })

  it('a field read off the accessor itself (`data.title`, the pre-accessor shape) warns by name', () => {
    const src = `${head}export function P() { const data = useLoaderData<Post>(); return <Text>{data.title}</Text> }`
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(src, { target }).warnings.join('\n'), target).toContain(
        '`data.title` reads a field off the accessor `useLoaderData<T>()` returns',
      )
    }
  })

  it('a destructure — object, renamed, rest, nested or default — is not lowered and warns with the accessor fix', () => {
    const forms = [
      'const { title } = useLoaderData<Post>()',
      'const { title: heading, views } = useLoaderData<Post>()',
      'const { ...rest } = useLoaderData<Post>()',
      'const { title: { a } } = useLoaderData<Post>()',
      "const { title = 'x' } = useLoaderData<Post>()",
    ]
    for (const form of forms) {
      for (const target of ['swift', 'kotlin'] as const) {
        const r = transform(`${head}export function P() { ${form}; return <Text>x</Text> }`, { target })
        const w = r.warnings.join('\n')
        expect(w, `${target}: ${form}`).toContain('destructures an accessor and is not lowered on native')
        expect(w, `${target}: ${form}`).toContain('`const data = useLoaderData<T>()`, then `data().')
        expect(r.code, `${target}: ${form}`).not.toContain('useLoaderData')
      }
    }
  })
})
