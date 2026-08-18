/**
 * Real-Chromium contract for MOUNT-HOLE hydration adoption.
 *
 * The happy-dom twin (`hydrate-template-hole-limit.test.tsx`) drives the same
 * mechanism through the REAL compiler transform, which is what proves the
 * compiler and runtime halves agree. This file exists for the half happy-dom
 * cannot vouch for: that the DOM operations the hole path performs — attribute
 * stripping on a `<template>`'s content, cursor walking with `nextSibling`,
 * `remove()` on a live range — behave the same in a browser.
 *
 * Both halves are hand-written rather than generated, because neither the
 * compiler nor `renderToString` can run in the page (runtime-server imports
 * `node:async_hooks`). They are not guesses: the happy-dom twin asserts that
 * `transformJSX` emits these exact templates AND that `renderToString` emits
 * these exact server strings, so a drift on either side fails there.
 */
import { h } from '@pyreon/core'
import { _mountChild, _tpl, hydrateRoot } from '@pyreon/runtime-dom'
import { describe, expect, it } from 'vitest'

type Counts = Record<string, number>
const g = globalThis as { __pyreon_count__?: ((name: string, n?: number) => void) | undefined }

/** Parse the server HTML, hydrate the compiled-shape client tree over it. */
function hydrateAndMeasure(ssrHtml: string, client: () => unknown) {
  const host = document.createElement('div')
  host.innerHTML = ssrHtml
  document.body.appendChild(host)

  const counts: Counts = {}
  const prev = g.__pyreon_count__
  g.__pyreon_count__ = (name, n = 1) => {
    counts[name] = (counts[name] ?? 0) + n
  }
  const before = [...host.querySelectorAll('*')]
  const errs: string[] = []
  const realError = console.error
  console.error = (...a: unknown[]) => errs.push(a.map(String).join(' '))
  try {
    hydrateRoot(host, h(client as never, null))
  } finally {
    console.error = realError
    g.__pyreon_count__ = prev
  }
  // A hydration throw is swallowed by the error boundary and still leaves a
  // plausible retention number behind, from a run that never hydrated.
  if (errs.length > 0) throw new Error(`hydration errored: ${errs.join(' | ')}`)

  const after = new Set(host.querySelectorAll('*'))
  const result = {
    retained: before.filter((n) => after.has(n)).length,
    total: before.length,
    adopts: counts['runtime.tpl.adopt'] ?? 0,
    html: host.innerHTML,
  }
  host.remove()
  return result
}

// Emitted shape of:
//   const Leaf = () => <span class="t">leaf</span>
//   const Mid  = () => <section class="mid"><Leaf /></section>
//   const App  = () => <div class="app"><main class="m"><Mid /></main></div>
const Leaf = () => _tpl('<span class="t">leaf</span>', () => null)
const Mid = () =>
  _tpl('<section class="mid" data-pyreon-hole></section>', (root) =>
    _mountChild(h(Leaf as never, null), root, null),
  )
const App = () =>
  _tpl('<div class="app"><main class="m" data-pyreon-hole></main></div>', (root) =>
    _mountChild(h(Mid as never, null), root.firstElementChild as HTMLElement, null),
  )

const HTML =
  '<div class="app"><main class="m"><section class="mid"><span class="t">leaf</span></section></main></div>'

describe('mount-hole hydration adoption — real browser', () => {
  it('adopts every level through two nested holes', () => {
    const r = hydrateAndMeasure(HTML, App)
    expect(r.html).toBe(HTML)
    expect([r.retained, r.total]).toEqual([4, 4])
    expect(r.adopts).toBe(3)
  })

  it('the hole marker never reaches the live DOM, hydrated or cloned', () => {
    const r = hydrateAndMeasure(HTML, App)
    expect(r.html).not.toContain('data-pyreon-hole')

    const item = _tpl('<div class="c" data-pyreon-hole></div>', () => null)
    expect((item.el as HTMLElement).outerHTML).toBe('<div class="c"></div>')
    expect((item.el as HTMLElement).hasAttribute('data-pyreon-hole')).toBe(false)
  })

  it('adjacent holes hydrate in source order from one shared cursor', () => {
    const A2 = () => _tpl('<i>a</i>', () => null)
    const B2 = () => _tpl('<b>b</b>', () => null)
    const App2 = () =>
      _tpl('<div class="app" data-pyreon-hole></div>', (root) => {
        const d0 = _mountChild(h(A2 as never, null), root, null)
        const d1 = _mountChild(h(B2 as never, null), root, null)
        return () => {
          d0()
          d1()
        }
      })
    const r = hydrateAndMeasure('<div class="app"><i>a</i><b>b</b></div>', App2)
    expect(r.html).toBe('<div class="app"><i>a</i><b>b</b></div>')
    expect([r.retained, r.total]).toEqual([3, 3])
  })

  it('sweeps server content the render did not claim', () => {
    // The server sent one more child than the client renders. The sweep leaves
    // exactly what a clone-and-swap would have produced.
    const A2 = () => _tpl('<i>a</i>', () => null)
    const App3 = () =>
      _tpl('<div class="app" data-pyreon-hole></div>', (root) =>
        _mountChild(h(A2 as never, null), root, null),
      )
    const r = hydrateAndMeasure('<div class="app"><i>a</i><b>extra</b></div>', App3)
    expect(r.html).toBe('<div class="app"><i>a</i></div>')
  })

  it('a hole the bind never fills is swept empty — the clone-equivalent result', () => {
    const App4 = () => _tpl('<div class="app" data-pyreon-hole></div>', () => null)
    const r = hydrateAndMeasure('<div class="app"><i>stale</i></div>', App4)
    expect(r.html).toBe('<div class="app"></div>')
  })
})
