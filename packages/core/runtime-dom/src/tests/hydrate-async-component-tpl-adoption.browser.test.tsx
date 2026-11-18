/**
 * Real-Chromium twin of `hydrate-async-component-tpl-adoption.test.tsx` (#4353):
 * an async component whose body resolves after `hydrateRoot` returns adopts the
 * server elements of the templates it builds after its `await`, instead of
 * replacing them with identical clones.
 *
 * Runs the REAL compiler output recorded in `_async-tpl-adoption-case.ts` (the
 * happy-dom twin regenerates it and fails on drift).
 */
import { h, Suspense } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { _bindText, _setChild, _tpl, hydrateRoot } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { ASYNC_TPL_CASE } from './_async-tpl-adoption-case'

afterEach(() => {
  document.body.innerHTML = ''
})

const later = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function hydrateLate(html: string, wrap: (app: unknown) => unknown) {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  const server = [...host.querySelectorAll('div, header, h1, p')]
  const heading = signal('Blog')
  const S = { wait: () => later(10), heading, description: 'Notes' }
  const App = new Function(
    '_tpl',
    '_bindText',
    '_setChild',
    'S',
    `${ASYNC_TPL_CASE.compiled}\nreturn App`,
  )(_tpl, _bindText, _setChild, S) as () => unknown
  const dispose = hydrateRoot(host, wrap(App) as never)

  return { host, server, heading, dispose }
}

const replaced = (host: HTMLElement, server: Element[]) =>
  server.filter((n) => !host.contains(n)).map((n) => n.localName)

describe('async component templates adopt the server DOM — real browser (#4353)', () => {
  it('adopts every server element and keeps the bindings live', async () => {
    const r = hydrateLate(ASYNC_TPL_CASE.html, (app) => h(app as never, null))
    await later(60)
    expect(replaced(r.host, r.server)).toEqual([])
    r.heading.set('Journal')
    expect(r.host.querySelector('h1')).toBe(r.server.find((n) => n.localName === 'h1'))
    expect(r.host.querySelector('h1')?.textContent).toBe('Journal')
    expect(r.host.querySelector('p')?.textContent).toBe('Notes')
    r.dispose()
  })

  it('adopts inside a <Suspense> boundary', async () => {
    const r = hydrateLate(ASYNC_TPL_CASE.suspenseHtml, (app) =>
      h(Suspense, { fallback: null }, h(app as never, null)),
    )
    await later(60)
    expect(replaced(r.host, r.server)).toEqual([])
    r.heading.set('Journal')
    expect(r.host.querySelector('h1')?.textContent).toBe('Journal')
    r.dispose()
  })
})
