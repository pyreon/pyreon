/**
 * An ASYNC component's compiled templates adopt the server DOM even when the
 * body resolves after `hydrateRoot` returns (#4353).
 *
 * `_tpl` defers its build while hydration is active, so a template meets its
 * server node at its own cursor and adopts it. An async body's code after an
 * `await` runs later, in a microtask, after the synchronous walk has ended. Its
 * `_tpl` calls used to build eagerly, as clones, so when the component's
 * `.then` hydrated the resolved output against the `<!--$pas-->` range, every
 * compiled leaf took the swap fallback: the server `<h1>` was replaced by an
 * identical new one, with no report. The `h()` parents adopted. Found on the
 * zero-content blog index (`IndexBody` awaits `getPosts()`).
 *
 * Every spec compiles REAL JSX through `transformJSX` (vitest's own JSX
 * transform never emits `_tpl`), renders it with `renderToString`, and
 * hydrates the client build over that HTML. The real-Chromium twin runs the
 * recorded output in `_async-tpl-adoption-case.ts`, which the first spec here
 * keeps current.
 */
import { transformJSX } from '@pyreon/compiler'
import { _fuse, Fragment, h, Suspense } from '@pyreon/core'
import { _bind, renderEffect, signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import { _bindText, _mountSlot, _setChild, _textSlot, _tpl, hydrateRoot, mount } from '../index'
import { bindPolymorphicText } from '../mount'
import { ASYNC_TPL_CASE } from './_async-tpl-adoption-case'

const DEPS: Record<string, unknown> = {
  _tpl,
  _bind,
  renderEffect,
  _bindText,
  _mountSlot,
  _setChild,
  _textSlot,
  _fuse,
  bindPolymorphicText,
  h,
  Fragment,
}

function build(source: string, globals: Record<string, unknown>, ssr: boolean): () => unknown {
  const { code } = transformJSX(source, 'test.tsx', ssr ? { ssr: true } : {})
  for (const m of code.matchAll(
    /^import\s*\{([^}]*)\}\s*from\s*["']@pyreon\/(?:core|runtime-dom|reactivity)["']/gm,
  )) {
    for (const raw of (m[1] ?? '').split(',')) {
      const n = raw
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim()
      if (n && !(n in DEPS)) throw new Error(`[harness] add ${n} to DEPS`)
    }
  }
  const body = transformSync(code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''), {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code
  const names = [...Object.keys(DEPS), ...Object.keys(globals)]

  return new Function(...names, `${body}\nreturn App`)(
    ...Object.values(DEPS),
    ...Object.values(globals),
  ) as () => unknown
}

const hosts: HTMLElement[] = []

afterEach(() => {
  for (const x of hosts.splice(0)) x.remove()
})

const later = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const SOURCE = ASYNC_TPL_CASE.source

const lower = (code: string) =>
  transformSync(code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''), {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code

async function ssrThenHydrate(
  wait: () => Promise<unknown>,
  wrap: (app: unknown) => unknown = (app) => h(app as never, null),
) {
  const server = { wait: async () => {}, heading: () => 'Blog', description: 'Notes' }
  const html = await renderToString(wrap(build(SOURCE, { S: server }, true)) as never)
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  hosts.push(host)
  const server0 = [...host.querySelectorAll('div, header, h1, p')]
  const heading = signal('Blog')
  const S = { wait, heading, description: 'Notes' }
  const dispose = hydrateRoot(host, wrap(build(SOURCE, { S }, false)) as never)

  return { host, server0, heading, dispose }
}

/** The server elements hydration replaced instead of adopting. */
const replaced = (host: HTMLElement, server0: Element[]) =>
  server0.filter((n) => !host.contains(n)).map((n) => n.localName)

describe('an async component resolving after hydrateRoot adopts its compiled templates (#4353)', () => {
  it('the recorded browser case is what the toolchain produces today', async () => {
    expect(lower(transformJSX(SOURCE, 'case.tsx').code)).toBe(ASYNC_TPL_CASE.compiled)
    const server = { wait: async () => {}, heading: () => 'Blog', description: 'Notes' }
    const App = build(SOURCE, { S: server }, true)
    expect(await renderToString(h(App as never, null))).toBe(ASYNC_TPL_CASE.html)
    expect(await renderToString(h(Suspense, { fallback: null }, h(App as never, null)))).toBe(
      ASYNC_TPL_CASE.suspenseHtml,
    )
  })

  it('adopts every server element and keeps the bindings live', async () => {
    const r = await ssrThenHydrate(() => later(10))
    await later(40)
    expect(replaced(r.host, r.server0)).toEqual([])
    expect(r.host.querySelector('h1')?.textContent).toBe('Blog')
    r.heading.set('Journal')
    expect(r.host.querySelector('h1')).toBe(r.server0.find((n) => n.localName === 'h1'))
    expect(r.host.querySelector('h1')?.textContent).toBe('Journal')
    r.dispose()
    expect(r.host.querySelector('h1')).toBeNull()
  })

  it('adopts inside a <Suspense> boundary too (the shape the blog index renders)', async () => {
    const r = await ssrThenHydrate(
      () => later(10),
      (app) => h(Suspense, { fallback: null }, h(app as never, null)),
    )
    await later(40)
    expect(replaced(r.host, r.server0)).toEqual([])
    r.heading.set('Journal')
    expect(r.host.querySelector('h1')?.textContent).toBe('Journal')
    r.dispose()
  })

  it('a body whose await settles in the next microtask adopts too', async () => {
    const r = await ssrThenHydrate(async () => {})
    await later(20)
    expect(replaced(r.host, r.server0)).toEqual([])
    r.dispose()
  })

  it('a template built by an unrelated client mount while the async body is pending renders normally', async () => {
    let release!: () => void
    const r = await ssrThenHydrate(() => new Promise<void>((res) => (release = res)))
    const other = document.createElement('div')
    hosts.push(other)
    const label = signal('x')
    const dispose = mount(
      h(
        build('const App = () => <em class="o">{S.label()}</em>', { S: { label } }, false) as never,
        null,
      ),
      other,
    )
    expect(other.innerHTML).toBe('<em class="o">x</em>')
    label.set('y')
    expect(other.innerHTML).toBe('<em class="o">y</em>')
    dispose()
    release()
    await later(20)
    expect(replaced(r.host, r.server0)).toEqual([])
    r.dispose()
  })

  it('a pending async body that is unmounted before it resolves releases the deferral', async () => {
    let release!: () => void
    const r = await ssrThenHydrate(() => new Promise<void>((res) => (release = res)))
    r.dispose()
    release()
    await later(20)
    // Deferral is off again: a later template builds at once, as a plain clone.
    const item = _tpl('<i></i>', () => null) as unknown as { __deferred?: true; el: HTMLElement }
    expect(item.__deferred).toBeUndefined()
    expect(item.el.localName).toBe('i')
  })
})
