/**
 * REAL CHROMIUM lock for #4439: server-rendered camelCase SVG elements
 * (`linearGradient`, `clipPath`, `foreignObject`, `feGaussianBlur`, …) hydrate
 * in place. The browser's HTML parser case-adjusts SVG tag names, so the
 * element's tag name is `linearGradient`; the hydration walk compared
 * `tagName.toLowerCase()` with the vnode type, which can never match. Every
 * such element was reported as a tag mismatch and re-mounted (losing node
 * identity, and with it focus, listeners and any running SMIL animation).
 *
 * `renderToString` and `transformJSX` cannot run in the page, so the server
 * HTML and the compiled template are literals; `hydrate-svg-camelcase.test.tsx`
 * renders and compiles them for real and asserts they match.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { _bindDirect, _setAttr, _tpl, hydrateRoot, onHydrationMismatch } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CAMEL_SVG_SSR,
  CAMEL_SVG_TAGS,
  camelSvgRows,
  camelSvgTree,
  SVG_ROWS_DATA,
  SVG_ROWS_SSR,
  type SvgRow,
} from './_svg-camelcase-cases'

const SVG_NS = 'http://www.w3.org/2000/svg'

let stopListening: (() => void) | null = null
afterEach(() => {
  stopListening?.()
  stopListening = null
  document.body.innerHTML = ''
})

function collectMismatches(): string[] {
  const seen: string[] = []
  stopListening = onHydrationMismatch((ctx) =>
    seen.push(`${ctx.type}: ${String(ctx.expected)} vs ${String(ctx.actual)}`),
  )
  return seen
}

describe('hydrating camelCase SVG elements (real Chromium)', () => {
  it('the parser really does case-adjust these names (the premise)', () => {
    const host = document.createElement('div')
    host.innerHTML = CAMEL_SVG_SSR
    for (const tag of CAMEL_SVG_TAGS) {
      const el = host.querySelector(`[id="x-${tag}"]`)!
      expect(el.localName).toBe(tag)
      expect(el.namespaceURI).toBe(SVG_NS)
    }
  })

  it('h() path: every camelCase SVG element is adopted, not re-mounted', () => {
    const host = document.createElement('div')
    host.innerHTML = CAMEL_SVG_SSR
    document.body.appendChild(host)
    const before = [...host.querySelectorAll('*')]
    const mismatches = collectMismatches()
    let clicks = 0
    const dispose = hydrateRoot(
      host,
      camelSvgTree(() => clicks++),
    )

    expect(mismatches).toEqual([])
    const after = [...host.querySelectorAll('*')]
    expect(after).toHaveLength(before.length)
    after.forEach((el, i) => expect(el).toBe(before[i]))
    const grad = host.querySelector('[id="x-linearGradient"]')!
    grad.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(clicks).toBe(1)
    dispose()
  })

  it('compiled path: a _tpl over camelCase SVG adopts the server nodes and binds', () => {
    // Exactly what transformJSX emits for
    //   <svg viewBox="0 0 20 20"><defs><linearGradient id="g" gradientTransform={t()}>
    //   <stop offset="0" stop-color="red" /></linearGradient><clipPath id="c">
    //   <rect width="10" height="10" /></clipPath></defs></svg>
    // (asserted in hydrate-svg-camelcase.test.tsx).
    const t = signal('rotate(1)')
    const App = () =>
      _tpl(
        '<svg viewBox="0 0 20 20"><defs><linearGradient id="g"><stop offset="0" stop-color="red"></stop></linearGradient><clipPath id="c"><rect width="10" height="10"></rect></clipPath></defs></svg>',
        (__root) => {
          const __e0 = __root.firstElementChild!.firstElementChild!
          const __d0 = _bindDirect(t, (v) => _setAttr(__e0, 'gradientTransform', v as string))
          return __d0
        },
      )
    const host = document.createElement('div')
    host.innerHTML =
      '<svg viewBox="0 0 20 20"><defs><linearGradient id="g" gradientTransform="rotate(1)"><stop offset="0" stop-color="red"></stop></linearGradient><clipPath id="c"><rect width="10" height="10"></rect></clipPath></defs></svg>'
    document.body.appendChild(host)
    const grad = host.querySelector('linearGradient')!
    const clip = host.querySelector('clipPath')!
    const mismatches = collectMismatches()
    const dispose = hydrateRoot(host, h(App as never, null))
    expect(mismatches).toEqual([])
    expect(host.querySelector('linearGradient')).toBe(grad)
    expect(host.querySelector('clipPath')).toBe(clip)
    t.set('rotate(2)')
    expect(grad.getAttribute('gradientTransform')).toBe('rotate(2)')
    dispose()
  })

  it('<For> rows (row-plan replay) adopt camelCase SVG elements and stay reactive', () => {
    const host = document.createElement('div')
    host.innerHTML = SVG_ROWS_SSR
    document.body.appendChild(host)
    const grads = [...host.querySelectorAll('linearGradient')]
    const clips = [...host.querySelectorAll('clipPath')]
    const mismatches = collectMismatches()
    const rows = signal<SvgRow[]>(SVG_ROWS_DATA)
    const stops: number[] = []
    // Every row replays the plan built from the row shape; a plan whose tag
    // check rejected every camelCase element bailed each row to the slow walk.
    let replays = 0
    const g = globalThis as { __pyreon_count__?: (name: string) => void }
    g.__pyreon_count__ = (name) => {
      if (name === 'runtime.hydrate.rowReplay') replays++
    }
    let dispose: () => void
    try {
      dispose = hydrateRoot(
        host,
        camelSvgRows(rows, (id) => stops.push(id)),
      )
    } finally {
      delete g.__pyreon_count__
    }
    expect(replays).toBe(SVG_ROWS_DATA.length)
    expect(mismatches).toEqual([])
    expect([...host.querySelectorAll('linearGradient')]).toEqual(grads)
    expect([...host.querySelectorAll('clipPath')]).toEqual(clips)
    for (const g of grads) g.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(stops).toEqual([1, 2, 3])
    dispose()
  })

  it('a component whose root is a camelCase SVG element hydrates in place', () => {
    function Grad(props: { id: string }) {
      return h('linearGradient', { id: props.id }, h('stop', { offset: '0' }))
    }
    function Clip() {
      return h('clipPath', { id: 'cp' }, h('rect', { width: '4', height: '4' }))
    }
    const tree = () => h('svg', null, h('defs', null, h(Grad, { id: 'g' }), h(Clip, null)))
    const host = document.createElement('div')
    host.innerHTML =
      '<svg><defs><linearGradient id="g"><stop offset="0"></stop></linearGradient><clipPath id="cp"><rect width="4" height="4"></rect></clipPath></defs></svg>'
    document.body.appendChild(host)
    const grad = host.querySelector('linearGradient')!
    const mismatches = collectMismatches()
    const dispose = hydrateRoot(host, h(tree, null))
    expect(mismatches).toEqual([])
    expect(host.querySelector('linearGradient')).toBe(grad)
    dispose()
  })

  it('a real mismatch is still reported, with the case-preserved actual name', () => {
    const host = document.createElement('div')
    host.innerHTML = '<svg><defs><radialGradient id="g"></radialGradient></defs></svg>'
    document.body.appendChild(host)
    const mismatches = collectMismatches()
    const dispose = hydrateRoot(
      host,
      h('svg', null, h('defs', null, h('linearGradient', { id: 'g' }))),
    )
    expect(mismatches).toEqual(['tag: linearGradient vs radialGradient'])
    expect(host.querySelector('linearGradient')?.namespaceURI).toBe(SVG_NS)
    dispose()
  })
})
