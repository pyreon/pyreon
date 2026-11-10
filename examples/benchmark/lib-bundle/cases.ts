/**
 * Minimal consumer apps, one per (use case × library), for `bench-lib-bundle.ts`.
 *
 * Every entry is a real, minimal use of the library's MAIN use case, written
 * the way its own docs teach it. `host` names the framework the entry mounts
 * with; the entry's OWN cost is its total minus that host's baseline entry
 * (`base:*`), i.e. "what adding this library to an app that already ships the
 * framework costs". `host: 'none'` entries are framework-free libraries, whose
 * total IS the library.
 *
 * `marker` is a string only the real library emits — the driver fails an
 * entry whose library tree-shook away (a tiny number would be meaningless).
 *
 * Rules for adding a row: the rival arm must be the leanest DOCUMENTED way to
 * do the same job (tree-shaken imports, declarative mode where a library has
 * one), never a deliberately heavy setup.
 */
export type Host = 'pyreon' | 'react' | 'vue' | 'none'

export interface Case {
  /** Use-case group; rows sharing it are compared. */
  useCase: string
  name: string
  host: Host
  /** `tsx` = compiled by the Pyreon JSX compiler; rivals use `ts` + createElement/h. */
  ext: 'ts' | 'tsx'
  source: string
  marker: string
  /** Pyreon arms are the ones the table compares against the best rival. */
  pyreon?: boolean
}

const KEEP = `;(globalThis as Record<string, unknown>).__benchKeep`
const P = `import { mount } from '@pyreon/runtime-dom'\n`
const R = `import { createElement as h, useState } from 'react'\nimport { createRoot } from 'react-dom/client'\n`
const V = `import { createApp, h } from 'vue'\n`
const pmount = (jsx: string): string => `${KEEP} = () => mount(${jsx}, document.body)\n`
const rmount = (expr: string): string => `${KEEP} = () => createRoot(document.body).render(${expr})\n`

export const BASES: Case[] = [
  { useCase: 'base', name: 'base:pyreon', host: 'none', ext: 'tsx', source: `${P}${pmount('<div>x</div>')}`, marker: '' },
  { useCase: 'base', name: 'base:react', host: 'none', ext: 'ts', source: `${R}${rmount(`h('div', null, 'x')`)}`, marker: '' },
  {
    useCase: 'base',
    name: 'base:vue',
    host: 'none',
    ext: 'ts',
    source: `${V}${KEEP} = () => createApp({ render: () => h('div', 'x') }).mount(document.body)\n`,
    marker: '',
  },
]

export const CASES: Case[] = [
  // ── reactivity ──────────────────────────────────────────────────────────
  {
    useCase: 'signals (signal+computed+effect)',
    name: '@pyreon/reactivity',
    host: 'none',
    ext: 'ts',
    pyreon: true,
    source: `import { signal, computed, effect } from '@pyreon/reactivity'
const a = signal(1); const b = computed(() => a() * 2)
${KEEP} = () => { effect(() => console.log(b())); a.set(2) }
`,
    marker: '',
  },
  {
    useCase: 'signals (signal+computed+effect)',
    name: '@preact/signals-core',
    host: 'none',
    ext: 'ts',
    source: `import { signal, computed, effect } from '@preact/signals-core'
const a = signal(1); const b = computed(() => a.value * 2)
${KEEP} = () => { effect(() => console.log(b.value)); a.value = 2 }
`,
    marker: '',
  },
  {
    useCase: 'signals (signal+computed+effect)',
    name: 'alien-signals',
    host: 'none',
    ext: 'ts',
    source: `import { signal, computed, effect } from 'alien-signals'
const a = signal(1); const b = computed(() => a() * 2)
${KEEP} = () => { effect(() => console.log(b())); a(2) }
`,
    marker: '',
  },

  // ── router ──────────────────────────────────────────────────────────────
  {
    useCase: 'router (3 routes + link)',
    name: '@pyreon/router',
    host: 'pyreon',
    ext: 'tsx',
    pyreon: true,
    source: `${P}import { createRouter, RouterProvider, RouterView, RouterLink } from '@pyreon/router'
const Home = () => <p>home</p>
const A = () => <p>a</p>
const B = () => <p>b</p>
const router = createRouter({ mode: 'history', routes: [{ path: '/', component: Home }, { path: '/a', component: A }, { path: '/b/:id', component: B }] })
${pmount(`<RouterProvider router={router}><nav><RouterLink to="/a">a</RouterLink></nav><RouterView /></RouterProvider>`)}`,
    marker: 'pushState',
  },
  {
    useCase: 'router (3 routes + link)',
    name: 'vue-router',
    host: 'vue',
    ext: 'ts',
    source: `${V}import { createRouter, createWebHistory, RouterView, RouterLink } from 'vue-router'
const Home = { render: () => h('p', 'home') }
const A = { render: () => h('p', 'a') }
const B = { render: () => h('p', 'b') }
const router = createRouter({ history: createWebHistory(), routes: [{ path: '/', component: Home }, { path: '/a', component: A }, { path: '/b/:id', component: B }] })
${KEEP} = () => createApp({ render: () => [h('nav', [h(RouterLink, { to: '/a' }, () => 'a')]), h(RouterView)] }).use(router).mount(document.body)
`,
    marker: 'pushState',
  },
  {
    useCase: 'router (3 routes + link)',
    name: 'react-router (declarative)',
    host: 'react',
    ext: 'ts',
    source: `${R}import { BrowserRouter, Routes, Route, Link } from 'react-router'
const Home = () => h('p', null, 'home')
const A = () => h('p', null, 'a')
const B = () => h('p', null, 'b')
${rmount(`h(BrowserRouter, null, h('nav', null, h(Link, { to: '/a' }, 'a')), h(Routes, null, h(Route, { path: '/', element: h(Home) }), h(Route, { path: '/a', element: h(A) }), h(Route, { path: '/b/:id', element: h(B) })))`)}`,
    marker: 'pushState',
  },
  {
    useCase: 'router (3 routes + link)',
    name: '@tanstack/react-router',
    host: 'react',
    ext: 'ts',
    source: `${R}import { createRootRoute, createRoute, createRouter, RouterProvider, Link, Outlet } from '@tanstack/react-router'
const root = createRootRoute({ component: () => h('div', null, h('nav', null, h(Link, { to: '/a' }, 'a')), h(Outlet)) })
const routeTree = root.addChildren([
  createRoute({ getParentRoute: () => root, path: '/', component: () => h('p', null, 'home') }),
  createRoute({ getParentRoute: () => root, path: '/a', component: () => h('p', null, 'a') }),
  createRoute({ getParentRoute: () => root, path: '/b/$id', component: () => h('p', null, 'b') }),
])
const router = createRouter({ routeTree })
${rmount(`h(RouterProvider, { router })`)}`,
    marker: 'pushState',
  },

  // ── store ───────────────────────────────────────────────────────────────
  {
    useCase: 'store (one store, read+action)',
    name: '@pyreon/store',
    host: 'pyreon',
    ext: 'tsx',
    pyreon: true,
    source: `${P}import { defineStore, signal } from '@pyreon/store'
const useCounter = defineStore('counter', () => { const count = signal(0); const inc = () => count.update((n) => n + 1); return { count, inc } })
const App = () => { const { store } = useCounter(); return <button onClick={store.inc}>{store.count()}</button> }
${pmount('<App />')}`,
    marker: 'counter',
  },
  {
    useCase: 'store (one store, read+action)',
    name: 'zustand (react)',
    host: 'react',
    ext: 'ts',
    source: `${R}import { create } from 'zustand'
const useCounter = create<{ count: number; inc: () => void }>((set) => ({ count: 0, inc: () => set((s) => ({ count: s.count + 1 })) }))
const App = () => { const count = useCounter((s) => s.count); const inc = useCounter((s) => s.inc); return h('button', { onClick: inc }, count) }
${rmount('h(App)')}`,
    marker: '',
  },
  {
    useCase: 'store (one store, read+action)',
    name: 'zustand/vanilla',
    host: 'none',
    ext: 'ts',
    source: `import { createStore } from 'zustand/vanilla'
const s = createStore<{ count: number; inc: () => void }>((set) => ({ count: 0, inc: () => set((st) => ({ count: st.count + 1 })) }))
${KEEP} = () => { s.subscribe((st) => console.log(st.count)); s.getState().inc() }
`,
    marker: '',
  },
  {
    useCase: 'store (one store, read+action)',
    name: 'nanostores',
    host: 'none',
    ext: 'ts',
    source: `import { atom } from 'nanostores'
const count = atom(0)
${KEEP} = () => { count.subscribe((v) => console.log(v)); count.set(count.get() + 1) }
`,
    marker: '',
  },
  {
    useCase: 'store (one store, read+action)',
    name: 'jotai/vanilla',
    host: 'none',
    ext: 'ts',
    source: `import { atom, createStore } from 'jotai/vanilla'
const count = atom(0); const store = createStore()
${KEEP} = () => { store.sub(count, () => console.log(store.get(count))); store.set(count, (c) => c + 1) }
`,
    marker: '',
  },
  {
    useCase: 'store (one store, read+action)',
    name: 'pinia',
    host: 'vue',
    ext: 'ts',
    source: `${V}import { createPinia, defineStore } from 'pinia'
const useCounter = defineStore('counter', { state: () => ({ count: 0 }), actions: { inc() { this.count++ } } })
${KEEP} = () => createApp({ setup() { const s = useCounter(); return () => h('button', { onClick: s.inc }, s.count) } }).use(createPinia()).mount(document.body)
`,
    marker: 'counter',
  },

  // ── state-tree ──────────────────────────────────────────────────────────
  {
    useCase: 'state tree (model + view + action + snapshot)',
    name: '@pyreon/state-tree',
    host: 'pyreon',
    ext: 'tsx',
    pyreon: true,
    source: `${P}import { model, getSnapshot } from '@pyreon/state-tree'
const Counter = model({ state: { count: 0 } }).views((self) => ({ doubled: () => self.count() * 2 })).actions((self) => ({ inc: () => self.count.update((n: number) => n + 1) }))
${KEEP} = () => { const c = Counter.create(); c.inc(); console.log(c.doubled(), getSnapshot(c)) }
${pmount('<div>x</div>')}`,
    marker: '',
  },
  {
    useCase: 'state tree (model + view + action + snapshot)',
    name: 'mobx-state-tree',
    host: 'none',
    ext: 'ts',
    source: `import { types, getSnapshot } from 'mobx-state-tree'
const Counter = types.model({ count: 0 }).views((self) => ({ get doubled() { return self.count * 2 } })).actions((self) => ({ inc() { self.count++ } }))
${KEEP} = () => { const c = Counter.create(); c.inc(); console.log(c.doubled, getSnapshot(c)) }
`,
    marker: '',
  },

  // ── form + zod ──────────────────────────────────────────────────────────
  {
    useCase: 'form + zod (2 fields, submit)',
    name: '@pyreon/form',
    host: 'pyreon',
    ext: 'tsx',
    pyreon: true,
    source: `${P}import { useForm } from '@pyreon/form'
import { z } from 'zod'
const schema = z.object({ email: z.string().email(), password: z.string().min(8) })
const App = () => {
  const form = useForm({ initialValues: { email: '', password: '' }, schema, onSubmit: (v) => console.log(v) })
  return <form onSubmit={form.handleSubmit}><input {...form.register('email')} /><input type="password" {...form.register('password')} /><button type="submit">go</button></form>
}
${pmount('<App />')}`,
    marker: '',
  },
  {
    useCase: 'form + zod (2 fields, submit)',
    name: 'react-hook-form + resolver',
    host: 'react',
    ext: 'ts',
    source: `${R}import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
const schema = z.object({ email: z.string().email(), password: z.string().min(8) })
const App = () => {
  const { register, handleSubmit } = useForm({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } })
  return h('form', { onSubmit: handleSubmit((v) => console.log(v)) }, h('input', register('email')), h('input', { type: 'password', ...register('password') }), h('button', { type: 'submit' }, 'go'))
}
${rmount('h(App)')}`,
    marker: '',
  },

  // ── validation ──────────────────────────────────────────────────────────
  {
    useCase: 'schema validation (4-field object)',
    name: '@pyreon/validate',
    host: 'pyreon',
    ext: 'tsx',
    pyreon: true,
    source: `${P}import { s } from '@pyreon/validate'
const User = s.object({ name: s.string().min(1), email: s.string().email(), age: s.number().int().min(0), admin: s.boolean() })
${KEEP} = (x: unknown) => User.safeParse(x)
${pmount('<div>x</div>')}`,
    marker: '',
  },
  {
    useCase: 'schema validation (4-field object)',
    name: '@pyreon/validate/mini',
    host: 'pyreon',
    ext: 'tsx',
    pyreon: true,
    source: `${P}import { object, string, number, boolean, email, minLength, minValue, integer } from '@pyreon/validate/mini'
const User = object({ name: string().check(minLength(1)), email: string().check(email()), age: number().check(integer(), minValue(0)), admin: boolean() })
${KEEP} = (x: unknown) => User.safeParse(x)
${pmount('<div>x</div>')}`,
    marker: '',
  },
  {
    useCase: 'schema validation (4-field object)',
    name: 'valibot',
    host: 'none',
    ext: 'ts',
    source: `import * as v from 'valibot'
const User = v.object({ name: v.pipe(v.string(), v.minLength(1)), email: v.pipe(v.string(), v.email()), age: v.pipe(v.number(), v.integer(), v.minValue(0)), admin: v.boolean() })
${KEEP} = (x: unknown) => v.safeParse(User, x)
`,
    marker: '',
  },
  {
    useCase: 'schema validation (4-field object)',
    name: 'zod/mini',
    host: 'none',
    ext: 'ts',
    source: `import * as z from 'zod/mini'
const User = z.object({ name: z.string().check(z.minLength(1)), email: z.email(), age: z.int().check(z.minimum(0)), admin: z.boolean() })
${KEEP} = (x: unknown) => User.safeParse(x)
`,
    marker: '',
  },
  {
    useCase: 'schema validation (4-field object)',
    name: 'zod',
    host: 'none',
    ext: 'ts',
    source: `import { z } from 'zod'
const User = z.object({ name: z.string().min(1), email: z.string().email(), age: z.number().int().min(0), admin: z.boolean() })
${KEEP} = (x: unknown) => User.safeParse(x)
`,
    marker: '',
  },

  // ── query ───────────────────────────────────────────────────────────────
  {
    useCase: 'data fetching (one query)',
    name: '@pyreon/query',
    host: 'pyreon',
    ext: 'tsx',
    pyreon: true,
    source: `${P}import { QueryClient, QueryClientProvider, useQuery } from '@pyreon/query'
const client = new QueryClient()
const Todo = () => { const q = useQuery(() => ({ queryKey: ['todo'], queryFn: () => fetch('/t').then((r) => r.json()) })); return <p>{() => (q.isPending() ? 'loading' : String(q.data()))}</p> }
${pmount('<QueryClientProvider client={client}><Todo /></QueryClientProvider>')}`,
    marker: '',
  },
  {
    useCase: 'data fetching (one query)',
    name: '@tanstack/react-query',
    host: 'react',
    ext: 'ts',
    source: `${R}import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
const client = new QueryClient()
const Todo = () => { const q = useQuery({ queryKey: ['todo'], queryFn: () => fetch('/t').then((r) => r.json()) }); return h('p', null, q.isPending ? 'loading' : String(q.data)) }
${rmount('h(QueryClientProvider, { client }, h(Todo))')}`,
    marker: '',
  },
  {
    useCase: 'data fetching (one query)',
    name: 'swr',
    host: 'react',
    ext: 'ts',
    source: `${R}import useSWR from 'swr'
const Todo = () => { const q = useSWR('/t', (u: string) => fetch(u).then((r) => r.json())); return h('p', null, q.isLoading ? 'loading' : String(q.data)) }
${rmount('h(Todo)')}`,
    marker: '',
  },

  // ── http ────────────────────────────────────────────────────────────────
  {
    useCase: 'http client (GET json)',
    name: '@pyreon/http',
    host: 'pyreon',
    ext: 'tsx',
    pyreon: true,
    source: `${P}import { createHttp } from '@pyreon/http'
const api = createHttp({ baseUrl: '/api', timeout: 10_000 })
${KEEP} = () => api.get('/users/:id', { params: { id: '1' } }).json()
${pmount('<div>x</div>')}`,
    marker: '',
  },
  {
    useCase: 'http client (GET json)',
    name: 'ky',
    host: 'none',
    ext: 'ts',
    source: `import ky from 'ky'
const api = ky.create({ prefixUrl: '/api', timeout: 10_000 })
${KEEP} = () => api.get('users/1').json()
`,
    marker: '',
  },
  {
    useCase: 'http client (GET json)',
    name: 'ofetch',
    host: 'none',
    ext: 'ts',
    source: `import { ofetch } from 'ofetch'
const api = ofetch.create({ baseURL: '/api', timeout: 10_000 })
${KEEP} = () => api('/users/1')
`,
    marker: '',
  },

  // ── i18n ────────────────────────────────────────────────────────────────
  {
    useCase: 'i18n (one locale, interpolation)',
    name: '@pyreon/i18n',
    host: 'pyreon',
    ext: 'tsx',
    pyreon: true,
    source: `${P}import { createI18n } from '@pyreon/i18n'
const i18n = createI18n({ locale: 'en', messages: { en: { greeting: 'Hello, {{name}}!' } } })
${pmount(`<p>{() => i18n.t('greeting', { name: 'World' })}</p>`)}`,
    marker: '',
  },
  {
    useCase: 'i18n (one locale, interpolation)',
    name: '@pyreon/i18n/core',
    host: 'none',
    ext: 'ts',
    pyreon: true,
    source: `import { createI18n } from '@pyreon/i18n/core'
const i18n = createI18n({ locale: 'en', messages: { en: { greeting: 'Hello, {{name}}!' } } })
${KEEP} = () => i18n.t('greeting', { name: 'World' })
`,
    marker: '',
  },
  {
    useCase: 'i18n (one locale, interpolation)',
    name: 'i18next',
    host: 'none',
    ext: 'ts',
    source: `import i18next from 'i18next'
${KEEP} = async () => { await i18next.init({ lng: 'en', resources: { en: { translation: { greeting: 'Hello, {{name}}!' } } } }); return i18next.t('greeting', { name: 'World' }) }
`,
    marker: '',
  },
  {
    useCase: 'i18n (one locale, interpolation)',
    name: 'vue-i18n',
    host: 'vue',
    ext: 'ts',
    source: `${V}import { createI18n, useI18n } from 'vue-i18n'
const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: { greeting: 'Hello, {name}!' } } })
${KEEP} = () => createApp({ setup() { const { t } = useI18n(); return () => h('p', t('greeting', { name: 'World' })) } }).use(i18n).mount(document.body)
`,
    marker: '',
  },

  // ── head ────────────────────────────────────────────────────────────────
  {
    useCase: 'document head (title + meta)',
    name: '@pyreon/head',
    host: 'pyreon',
    ext: 'tsx',
    pyreon: true,
    source: `${P}import { HeadProvider, useHead } from '@pyreon/head'
const Page = () => { useHead({ title: 'Home', meta: [{ name: 'description', content: 'x' }] }); return <p>home</p> }
${pmount('<HeadProvider><Page /></HeadProvider>')}`,
    marker: '',
  },
  {
    useCase: 'document head (title + meta)',
    name: '@unhead/vue',
    host: 'vue',
    ext: 'ts',
    source: `${V}import { useHead } from '@unhead/vue'
import { createHead } from '@unhead/vue/client'
${KEEP} = () => createApp({ setup() { useHead({ title: 'Home', meta: [{ name: 'description', content: 'x' }] }); return () => h('p', 'home') } }).use(createHead()).mount(document.body)
`,
    marker: '',
  },

  // ── styling ─────────────────────────────────────────────────────────────
  {
    useCase: 'CSS-in-JS (5 styled elements)',
    name: '@pyreon/styler',
    host: 'pyreon',
    ext: 'tsx',
    pyreon: true,
    source: `${P}import { styled } from '@pyreon/styler'
const Box = styled('div')\`padding: 8px; color: \${(p: { c?: string }) => p.c ?? 'red'};\`
const Title = styled('h1')\`font-size: 2rem;\`
const Btn = styled('button')\`border: 0; &:hover { opacity: .8 }\`
const Txt = styled('p')\`margin: 0;\`
const Lnk = styled('a')\`text-decoration: none;\`
${pmount(`<Box c="blue"><Title>t</Title><Txt>p</Txt><Btn>b</Btn><Lnk href="#">l</Lnk></Box>`)}`,
    marker: '',
  },
  {
    useCase: 'CSS-in-JS (5 styled elements)',
    name: 'goober (react)',
    host: 'react',
    ext: 'ts',
    source: `${R}import { setup, styled } from 'goober'
setup(h)
const Box = styled('div')<{ c?: string }>\`padding: 8px; color: \${(p) => p.c ?? 'red'};\`
const Title = styled('h1')\`font-size: 2rem;\`
const Btn = styled('button')\`border: 0; &:hover { opacity: .8 }\`
const Txt = styled('p')\`margin: 0;\`
const Lnk = styled('a')\`text-decoration: none;\`
${rmount(`h(Box, { c: 'blue' }, h(Title, null, 't'), h(Txt, null, 'p'), h(Btn, null, 'b'), h(Lnk, { href: '#' }, 'l'))`)}`,
    marker: '',
  },
  {
    useCase: 'CSS-in-JS (5 styled elements)',
    name: 'styled-components',
    host: 'react',
    ext: 'ts',
    source: `${R}import styled from 'styled-components'
const Box = styled.div<{ $c?: string }>\`padding: 8px; color: \${(p) => p.$c ?? 'red'};\`
const Title = styled.h1\`font-size: 2rem;\`
const Btn = styled.button\`border: 0; &:hover { opacity: .8 }\`
const Txt = styled.p\`margin: 0;\`
const Lnk = styled.a\`text-decoration: none;\`
${rmount(`h(Box, { $c: 'blue' }, h(Title, null, 't'), h(Txt, null, 'p'), h(Btn, null, 'b'), h(Lnk, { href: '#' }, 'l'))`)}`,
    marker: '',
  },
  {
    useCase: 'CSS-in-JS (5 styled elements)',
    name: '@emotion/css (class only)',
    host: 'none',
    ext: 'ts',
    source: `import { css } from '@emotion/css'
${KEEP} = (c: string) => [css\`padding: 8px; color: \${c};\`, css\`font-size: 2rem;\`, css\`border: 0; &:hover { opacity: .8 }\`, css\`margin: 0;\`, css\`text-decoration: none;\`]
`,
    marker: '',
  },

  // ── table ───────────────────────────────────────────────────────────────
  {
    useCase: 'table (TanStack v9, sorted, 2 cols)',
    name: '@pyreon/table',
    host: 'pyreon',
    ext: 'tsx',
    pyreon: true,
    source: `${P}import { For } from '@pyreon/core'
import { useTable, tableFeatures, rowSortingFeature, createSortedRowModel, sortFns } from '@pyreon/table'
const features = tableFeatures({ rowSortingFeature })
const data = [{ name: 'a', email: 'x' }, { name: 'b', email: 'y' }]
const App = () => {
  const table = useTable(() => ({ features, _rowModels: { sortedRowModel: createSortedRowModel(sortFns) }, data, columns: [{ accessorKey: 'name', header: 'Name' }, { accessorKey: 'email', header: 'Email' }] }))
  return <table><tbody><For each={() => table.getRowModel().rows} by={(r) => r.id}>{(row) => <tr><td>{row.original.name}</td><td>{row.original.email}</td></tr>}</For></tbody></table>
}
${pmount('<App />')}`,
    marker: '',
  },
  {
    useCase: 'table (TanStack v9, sorted, 2 cols)',
    name: '@tanstack/react-table',
    host: 'react',
    ext: 'ts',
    source: `${R}import { useTable, tableFeatures, rowSortingFeature, createSortedRowModel, sortFns } from '@tanstack/react-table'
const features = tableFeatures({ rowSortingFeature })
const data = [{ name: 'a', email: 'x' }, { name: 'b', email: 'y' }]
const App = () => {
  const table = useTable({ features, _rowModels: { sortedRowModel: createSortedRowModel(sortFns) }, data, columns: [{ accessorKey: 'name', header: 'Name' }, { accessorKey: 'email', header: 'Email' }] } as never)
  return h('table', null, h('tbody', null, (table as any).getRowModel().rows.map((row: any) => h('tr', { key: row.id }, h('td', null, row.original.name), h('td', null, row.original.email)))))
}
${rmount('h(App)')}`,
    marker: '',
  },

  // ── virtual ─────────────────────────────────────────────────────────────
  {
    useCase: 'virtual list (10k rows)',
    name: '@pyreon/virtual',
    host: 'pyreon',
    ext: 'tsx',
    pyreon: true,
    source: `${P}import { For } from '@pyreon/core'
import { useVirtualizer } from '@pyreon/virtual'
const App = () => {
  let el: HTMLElement | null = null
  const v = useVirtualizer(() => ({ count: 10000, getScrollElement: () => el, estimateSize: () => 35 }))
  return <div ref={(n) => (el = n)} style="height:400px;overflow:auto"><div style={() => \`height:\${v.totalSize()}px;position:relative\`}><For each={() => v.virtualItems()} by={(r) => r.index}>{(r) => <div style={\`position:absolute;top:0;transform:translateY(\${r.start}px)\`}>{r.index}</div>}</For></div></div>
}
${pmount('<App />')}`,
    marker: '',
  },
  {
    useCase: 'virtual list (10k rows)',
    name: '@tanstack/react-virtual',
    host: 'react',
    ext: 'ts',
    source: `${R}import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
const App = () => {
  const ref = useRef<HTMLDivElement>(null)
  const v = useVirtualizer({ count: 10000, getScrollElement: () => ref.current, estimateSize: () => 35 })
  return h('div', { ref, style: { height: 400, overflow: 'auto' } }, h('div', { style: { height: v.getTotalSize(), position: 'relative' } }, v.getVirtualItems().map((r) => h('div', { key: r.index, style: { position: 'absolute', top: 0, transform: \`translateY(\${r.start}px)\` } }, r.index))))
}
${rmount('h(App)')}`,
    marker: '',
  },

  // ── toast ───────────────────────────────────────────────────────────────
  {
    useCase: 'toast (Toaster + success)',
    name: '@pyreon/toast',
    host: 'pyreon',
    ext: 'tsx',
    pyreon: true,
    source: `${P}import { toast, Toaster } from '@pyreon/toast'
${pmount(`<div><Toaster /><button onClick={() => toast.success('Saved!')}>s</button></div>`)}`,
    marker: '',
  },
  {
    useCase: 'toast (Toaster + success)',
    name: 'sonner',
    host: 'react',
    ext: 'ts',
    source: `${R}import { Toaster, toast } from 'sonner'
${rmount(`h('div', null, h(Toaster), h('button', { onClick: () => toast.success('Saved!') }, 's'))`)}`,
    marker: '',
  },
  {
    useCase: 'toast (Toaster + success)',
    name: 'notyf',
    host: 'none',
    ext: 'ts',
    source: `import { Notyf } from 'notyf'
import 'notyf/notyf.min.css'
${KEEP} = () => new Notyf().success('Saved!')
`,
    marker: '',
  },

  // ── hotkeys ─────────────────────────────────────────────────────────────
  {
    useCase: 'hotkeys (mod+s)',
    name: '@pyreon/hotkeys',
    host: 'pyreon',
    ext: 'tsx',
    pyreon: true,
    source: `${P}import { useHotkey } from '@pyreon/hotkeys'
const App = () => { useHotkey('mod+s', () => console.log('save')); return <p>x</p> }
${pmount('<App />')}`,
    marker: '',
  },
  {
    useCase: 'hotkeys (mod+s)',
    name: 'tinykeys',
    host: 'none',
    ext: 'ts',
    source: `import { tinykeys } from 'tinykeys'
${KEEP} = () => tinykeys(window, { '$mod+KeyS': () => console.log('save') })
`,
    marker: '',
  },
  {
    useCase: 'hotkeys (mod+s)',
    name: 'hotkeys-js',
    host: 'none',
    ext: 'ts',
    source: `import hotkeys from 'hotkeys-js'
${KEEP} = () => hotkeys('ctrl+s,command+s', () => console.log('save'))
`,
    marker: '',
  },

  // ── dnd ─────────────────────────────────────────────────────────────────
  {
    useCase: 'drag and drop (1 draggable + 1 droppable)',
    name: '@pyreon/dnd',
    host: 'pyreon',
    ext: 'tsx',
    pyreon: true,
    source: `${P}import { useDraggable, useDroppable } from '@pyreon/dnd'
const App = () => {
  let a: HTMLElement | null = null
  let b: HTMLElement | null = null
  useDraggable({ element: () => a, data: { id: 1 } })
  useDroppable({ element: () => b, onDrop: (d) => console.log(d) })
  return <div><div ref={(n) => (a = n)}>drag</div><div ref={(n) => (b = n)}>drop</div></div>
}
${pmount('<App />')}`,
    marker: '',
  },
  {
    useCase: 'drag and drop (1 draggable + 1 droppable)',
    name: '@dnd-kit/core',
    host: 'react',
    ext: 'ts',
    source: `${R}import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core'
const Drag = () => { const d = useDraggable({ id: 'a' }); return h('div', { ref: d.setNodeRef, ...d.listeners, ...d.attributes }, 'drag') }
const Drop = () => { const d = useDroppable({ id: 'b' }); return h('div', { ref: d.setNodeRef }, 'drop') }
${rmount(`h(DndContext, { onDragEnd: (e) => console.log(e) }, h(Drag), h(Drop))`)}`,
    marker: '',
  },
  {
    useCase: 'drag and drop (1 draggable + 1 droppable)',
    name: 'pragmatic-drag-and-drop',
    host: 'none',
    ext: 'ts',
    source: `import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
${KEEP} = (a: HTMLElement, b: HTMLElement) => [draggable({ element: a, getInitialData: () => ({ id: 1 }) }), dropTargetForElements({ element: b, onDrop: (d) => console.log(d) })]
`,
    marker: '',
  },

  // ── storage ─────────────────────────────────────────────────────────────
  {
    useCase: 'persisted state (localStorage)',
    name: '@pyreon/storage',
    host: 'pyreon',
    ext: 'tsx',
    pyreon: true,
    source: `${P}import { useStorage } from '@pyreon/storage'
${KEEP} = () => { const t = useStorage('theme', 'light'); t.set('dark'); return t() }
${pmount('<div>x</div>')}`,
    marker: '',
  },
  {
    useCase: 'persisted state (localStorage)',
    name: 'jotai atomWithStorage',
    host: 'none',
    ext: 'ts',
    source: `import { createStore } from 'jotai/vanilla'
import { atomWithStorage } from 'jotai/vanilla/utils'
const theme = atomWithStorage('theme', 'light'); const store = createStore()
${KEEP} = () => { store.set(theme, 'dark'); return store.get(theme) }
`,
    marker: '',
  },
  {
    useCase: 'persisted state (localStorage)',
    name: 'zustand persist',
    host: 'none',
    ext: 'ts',
    source: `import { createStore } from 'zustand/vanilla'
import { persist } from 'zustand/middleware'
const s = createStore<{ theme: string }>()(persist(() => ({ theme: 'light' }), { name: 'theme' }))
${KEEP} = () => { s.setState({ theme: 'dark' }); return s.getState().theme }
`,
    marker: '',
  },

  // ── url-state ───────────────────────────────────────────────────────────
  {
    useCase: 'URL query state (?page=n)',
    name: '@pyreon/url-state',
    host: 'pyreon',
    ext: 'tsx',
    pyreon: true,
    source: `${P}import { useUrlState } from '@pyreon/url-state'
const App = () => { const page = useUrlState('page', 1); return <button onClick={() => page.set(page() + 1)}>{page()}</button> }
${pmount('<App />')}`,
    marker: '',
  },
  {
    useCase: 'URL query state (?page=n)',
    name: 'nuqs',
    host: 'react',
    ext: 'ts',
    source: `${R}import { useQueryState, parseAsInteger } from 'nuqs'
import { NuqsAdapter } from 'nuqs/adapters/react'
const App = () => { const [page, setPage] = useQueryState('page', parseAsInteger.withDefault(1)); return h('button', { onClick: () => setPage(page + 1) }, page) }
${rmount('h(NuqsAdapter, null, h(App))')}`,
    marker: '',
  },

  // ── machine ─────────────────────────────────────────────────────────────
  {
    useCase: 'state machine (3-state traffic light)',
    name: '@pyreon/machine',
    host: 'pyreon',
    ext: 'tsx',
    pyreon: true,
    source: `${P}import { createMachine } from '@pyreon/machine'
${KEEP} = () => { const m = createMachine({ initial: 'red', states: { red: { on: { NEXT: 'green' } }, green: { on: { NEXT: 'yellow' } }, yellow: { on: { NEXT: 'red' } } } }); m.send('NEXT'); return m() }
${pmount('<div>x</div>')}`,
    marker: '',
  },
  {
    useCase: 'state machine (3-state traffic light)',
    name: 'xstate',
    host: 'none',
    ext: 'ts',
    source: `import { createMachine, createActor } from 'xstate'
${KEEP} = () => { const a = createActor(createMachine({ initial: 'red', states: { red: { on: { NEXT: 'green' } }, green: { on: { NEXT: 'yellow' } }, yellow: { on: { NEXT: 'red' } } } })).start(); a.send({ type: 'NEXT' }); return a.getSnapshot().value }
`,
    marker: '',
  },
  {
    useCase: 'state machine (3-state traffic light)',
    name: 'robot3',
    host: 'none',
    ext: 'ts',
    source: `import { createMachine, state, transition, interpret } from 'robot3'
${KEEP} = () => { const s = interpret(createMachine({ red: state(transition('NEXT', 'green')), green: state(transition('NEXT', 'yellow')), yellow: state(transition('NEXT', 'red')) }), () => {}); s.send('NEXT'); return s.machine.current }
`,
    marker: '',
  },

  // ── permissions ─────────────────────────────────────────────────────────
  {
    useCase: 'permissions (3 rules, check)',
    name: '@pyreon/permissions',
    host: 'pyreon',
    ext: 'tsx',
    pyreon: true,
    source: `${P}import { createPermissions } from '@pyreon/permissions'
${KEEP} = (uid: string) => { const can = createPermissions({ 'posts.read': true, 'posts.delete': (p: { authorId: string }) => p.authorId === uid, 'admin.*': false }); return [can('posts.read'), can('posts.delete', { authorId: uid }), can('admin.users')] }
${pmount('<div>x</div>')}`,
    marker: '',
  },
  {
    useCase: 'permissions (3 rules, check)',
    name: '@casl/ability',
    host: 'none',
    ext: 'ts',
    source: `import { defineAbility } from '@casl/ability'
${KEEP} = (uid: string) => { const a = defineAbility((can, cannot) => { can('read', 'Post'); can('delete', 'Post', { authorId: uid }); cannot('manage', 'Admin') }); return [a.can('read', 'Post'), a.can('delete', 'Post'), a.can('read', 'Admin')] }
`,
    marker: '',
  },

  // ── rx ──────────────────────────────────────────────────────────────────
  {
    useCase: 'reactive collection ops (filter/sort/sum)',
    name: '@pyreon/rx',
    host: 'pyreon',
    ext: 'tsx',
    pyreon: true,
    source: `${P}import { signal } from '@pyreon/reactivity'
import { rx } from '@pyreon/rx'
const users = signal([{ name: 'a', age: 3, active: true }])
${KEEP} = () => { const act = rx.filter(users, (u) => u.active); return [rx.sortBy(act, 'name')(), rx.sum(users, (u) => u.age)()] }
${pmount('<div>x</div>')}`,
    marker: '',
  },
  {
    useCase: 'reactive collection ops (filter/sort/sum)',
    name: 'rxjs (BehaviorSubject + map)',
    host: 'none',
    ext: 'ts',
    source: `import { BehaviorSubject, map } from 'rxjs'
const users = new BehaviorSubject([{ name: 'a', age: 3, active: true }])
${KEEP} = () => [users.pipe(map((u) => u.filter((x) => x.active).sort((a, b) => a.name.localeCompare(b.name)))).subscribe(console.log), users.pipe(map((u) => u.reduce((s, x) => s + x.age, 0))).subscribe(console.log)]
`,
    marker: '',
  },

  // ── charts ──────────────────────────────────────────────────────────────
  {
    useCase: 'line chart (3 points)',
    name: '@pyreon/charts',
    host: 'pyreon',
    ext: 'tsx',
    pyreon: true,
    source: `${P}import { Chart, Line } from '@pyreon/charts'
const rows = [{ i: 0, v: 3 }, { i: 1, v: 7 }, { i: 2, v: 5 }]
${pmount(`<Chart data={rows} width={800} height={300}><Line y="v" /></Chart>`)}`,
    marker: 'getContext',
  },
  {
    useCase: 'line chart (3 points)',
    name: 'uPlot',
    host: 'none',
    ext: 'ts',
    source: `import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
${KEEP} = () => new uPlot({ width: 800, height: 300, scales: { x: { time: false } }, series: [{}, { stroke: 'blue' }] }, [[0, 1, 2], [3, 7, 5]], document.body)
`,
    marker: 'getContext',
  },
  {
    useCase: 'line chart (3 points)',
    name: 'Chart.js (tree-shaken)',
    host: 'none',
    ext: 'ts',
    source: `import { Chart, LinearScale, LineController, LineElement, PointElement } from 'chart.js'
Chart.register(LineController, LineElement, PointElement, LinearScale)
${KEEP} = () => new Chart(document.createElement('canvas'), { type: 'line', data: { datasets: [{ data: [{ x: 0, y: 3 }, { x: 1, y: 7 }, { x: 2, y: 5 }] }] }, options: { scales: { x: { type: 'linear' } } } })
`,
    marker: 'getContext',
  },

  // ── flow ────────────────────────────────────────────────────────────────
  {
    useCase: 'node graph (10 nodes, 9 edges)',
    name: '@pyreon/flow',
    host: 'pyreon',
    ext: 'tsx',
    pyreon: true,
    source: `${P}import { createFlow, Flow } from '@pyreon/flow'
const nodes = Array.from({ length: 10 }, (_, i) => ({ id: String(i), position: { x: i * 120, y: (i % 3) * 80 }, data: { label: 'n' + i } }))
const edges = nodes.slice(1).map((n, i) => ({ id: 'e' + i, source: String(i), target: n.id }))
const flow = createFlow({ nodes, edges })
${pmount('<Flow instance={flow} />')}`,
    marker: '',
  },
  {
    useCase: 'node graph (10 nodes, 9 edges)',
    name: '@xyflow/react',
    host: 'react',
    ext: 'ts',
    source: `${R}import { ReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
const nodes = Array.from({ length: 10 }, (_, i) => ({ id: String(i), position: { x: i * 120, y: (i % 3) * 80 }, data: { label: 'n' + i } }))
const edges = nodes.slice(1).map((n, i) => ({ id: 'e' + i, source: String(i), target: n.id }))
${rmount(`h('div', { style: { height: 400 } }, h(ReactFlow, { nodes, edges }))`)}`,
    marker: '',
  },

  // ── rich text ───────────────────────────────────────────────────────────
  {
    useCase: 'rich-text editor (StarterKit-class)',
    name: '@pyreon/rich-text',
    host: 'pyreon',
    ext: 'tsx',
    pyreon: true,
    source: `${P}import { createRichTextEditor, RichText } from '@pyreon/rich-text'
const editor = createRichTextEditor({ content: '<p>Hello</p>' })
${pmount('<RichText instance={editor} />')}`,
    marker: '',
  },
  {
    useCase: 'rich-text editor (StarterKit-class)',
    name: '@tiptap/core + starter-kit',
    host: 'none',
    ext: 'ts',
    source: `import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
${KEEP} = () => new Editor({ element: document.body, extensions: [StarterKit], content: '<p>Hello</p>' })
`,
    marker: '',
  },
  {
    useCase: 'rich-text editor (StarterKit-class)',
    name: 'lexical + rich-text + history',
    host: 'none',
    ext: 'ts',
    source: `import { createEditor } from 'lexical'
import { registerRichText, HeadingNode, QuoteNode } from '@lexical/rich-text'
import { createEmptyHistoryState, registerHistory } from '@lexical/history'
${KEEP} = () => { const e = createEditor({ namespace: 'x', nodes: [HeadingNode, QuoteNode], onError: console.error }); e.setRootElement(document.body); registerRichText(e); registerHistory(e, createEmptyHistoryState(), 300); return e }
`,
    marker: '',
  },

  // ── code editor ─────────────────────────────────────────────────────────
  {
    useCase: 'code editor (JS, basic setup)',
    name: '@pyreon/code',
    host: 'pyreon',
    ext: 'tsx',
    pyreon: true,
    source: `${P}import { createEditor, CodeEditor } from '@pyreon/code'
const editor = createEditor({ value: '// hello', language: 'javascript' })
${pmount('<CodeEditor instance={editor} />')}`,
    marker: '',
  },
  {
    useCase: 'code editor (JS, basic setup)',
    name: 'codemirror basicSetup + lang-javascript',
    host: 'none',
    ext: 'ts',
    source: `import { EditorView, basicSetup } from 'codemirror'
import { javascript } from '@codemirror/lang-javascript'
${KEEP} = () => new EditorView({ doc: '// hello', extensions: [basicSetup, javascript()], parent: document.body })
`,
    marker: '',
  },

  // ── compat ──────────────────────────────────────────────────────────────
  {
    useCase: 'React-API counter (useState)',
    name: '@pyreon/react-compat',
    host: 'none',
    ext: 'ts',
    pyreon: true,
    source: `import { createElement as h, useState } from '@pyreon/react-compat'
import { createRoot } from '@pyreon/react-compat/dom'
const App = () => { const [n, set] = useState(0); return h('button', { onClick: () => set(n + 1) }, n) }
${KEEP} = () => createRoot(document.body).render(h(App, null))
`,
    marker: '',
  },
  {
    useCase: 'React-API counter (useState)',
    name: 'react + react-dom',
    host: 'none',
    ext: 'ts',
    source: `${R}const App = () => { const [n, set] = useState(0); return h('button', { onClick: () => set(n + 1) }, n) }
${rmount('h(App)')}`,
    marker: '',
  },
  {
    useCase: 'React-API counter (useState)',
    name: 'preact/compat',
    host: 'none',
    ext: 'ts',
    source: `import { createElement as h, useState } from 'preact/compat'
import { createRoot } from 'preact/compat/client'
const App = () => { const [n, set] = useState(0); return h('button', { onClick: () => set(n + 1) }, n) }
${KEEP} = () => createRoot(document.body).render(h(App, null))
`,
    marker: '',
  },
]
