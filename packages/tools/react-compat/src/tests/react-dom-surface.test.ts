import { afterEach, describe, expect, it } from 'vitest'
import * as dom from '../dom'
import { createElement, useState } from '../index'
import { jsx } from '../jsx-runtime'

// `react-dom` and `react-dom/client` are both aliased to `@pyreon/react-compat/dom`
// in compat mode. That entry only had `createRoot` and `render`, so
// `import { createPortal } from 'react-dom'` (and hydrateRoot, flushSync, …)
// failed as a missing export. Every name React 19 ships from those two
// specifiers must be exported: implemented, or throwing a `[Pyreon]` error
// that says what to use.

/** React 19's public value exports of `react-dom` + `react-dom/client`. */
const REACT_DOM_SURFACE = [
  // react-dom/client
  'createRoot',
  'hydrateRoot',
  // react-dom
  'createPortal',
  'flushSync',
  'unstable_batchedUpdates',
  'version',
  'preconnect',
  'prefetchDNS',
  'preload',
  'preloadModule',
  'preinit',
  'preinitModule',
  'useFormStatus',
  'requestFormReset',
  // React 17 legacy root API, still imported by older code
  'render',
  'hydrate',
  'unmountComponentAtNode',
  'findDOMNode',
] as const

/** The entry as a plain record, for lookups by name. */
const api: Record<string, unknown> = { ...dom }

const NOT_PROVIDED = ['findDOMNode', 'useFormStatus', 'requestFormReset'] as const

const tick = () => new Promise<void>((r) => setTimeout(r, 10))
const host = () => document.body.appendChild(document.createElement('div'))
afterEach(() => {
  document.body.innerHTML = ''
  document.head.innerHTML = ''
})

describe('react-dom alias target carries the whole react-dom surface', () => {
  it.each(REACT_DOM_SURFACE)('exports %s', (name) => {
    expect(typeof api[name]).not.toBe('undefined')
  })

  it.each(NOT_PROVIDED)('%s fails with a [Pyreon] error that names the replacement', (name) => {
    expect(() => (api[name] as (a?: unknown) => unknown)(undefined)).toThrow(
      /^\[Pyreon\] .+ is not provided by @pyreon\/react-compat/,
    )
  })

  it('createPortal renders into another container', () => {
    const target = host()
    const el = host()
    dom
      .createRoot(el)
      .render(
        createElement('div', null, dom.createPortal(createElement('b', null, 'portaled'), target)),
      )
    expect(target.textContent).toBe('portaled')
  })

  it('hydrateRoot takes over server markup and the tree is interactive', async () => {
    function Counter() {
      const [n, setN] = useState(0)
      return createElement('button', { onClick: () => setN(n + 1) }, `count ${n}`)
    }
    const el = host()
    el.innerHTML = '<button>count 0</button>'
    const root = dom.hydrateRoot(el, jsx(Counter, {}))
    // One button — the server markup is taken over, not duplicated.
    expect(el.querySelectorAll('button')).toHaveLength(1)
    el.querySelector('button')!.click()
    await tick()
    expect(el.textContent).toBe('count 1')
    root.unmount()
    expect(el.textContent).toBe('')
  })

  it('legacy render / unmountComponentAtNode', () => {
    const el = host()
    dom.render(createElement('i', null, 'one'), el)
    dom.render(createElement('i', null, 'two'), el) // replaces, does not append
    expect(el.textContent).toBe('two')
    expect(dom.unmountComponentAtNode(el)).toBe(true)
    expect(el.textContent).toBe('')
    expect(dom.unmountComponentAtNode(el)).toBe(false)
  })

  it('unstable_batchedUpdates and flushSync run the callback and return its value', () => {
    expect(dom.unstable_batchedUpdates((x: number) => x * 2, 21)).toBe(42)
    expect(dom.flushSync(() => 'ok')).toBe('ok')
  })

  it('resource hints insert one deduplicated head element each', () => {
    dom.preconnect('https://cdn.example.com', { crossOrigin: 'anonymous' })
    dom.prefetchDNS('https://dns.example.com')
    dom.preload('/font.woff2', { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' })
    dom.preload('/font.woff2', { as: 'font' }) // duplicate
    dom.preloadModule('/chunk.js')
    dom.preinit('/app.css', { as: 'style' })
    dom.preinit('/analytics.js', { as: 'script' })
    dom.preinitModule('/mod.js')
    const head = document.head
    expect(head.querySelector('link[rel="preconnect"]')!.getAttribute('crossorigin')).toBe(
      'anonymous',
    )
    expect(head.querySelectorAll('link[rel="preload"][href="/font.woff2"]')).toHaveLength(1)
    expect(head.querySelector('link[rel="preload"]')!.getAttribute('as')).toBe('font')
    expect(head.querySelector('link[rel="dns-prefetch"]')).not.toBeNull()
    expect(head.querySelector('link[rel="modulepreload"][href="/chunk.js"]')).not.toBeNull()
    expect(head.querySelector('link[rel="stylesheet"][href="/app.css"]')).not.toBeNull()
    expect(head.querySelector('script[src="/analytics.js"]')).not.toBeNull()
    expect(head.querySelector('script[src="/mod.js"][type="module"]')).not.toBeNull()
  })

  it('version matches the main entry', async () => {
    expect(dom.version).toBe((await import('../index')).version)
  })
})
