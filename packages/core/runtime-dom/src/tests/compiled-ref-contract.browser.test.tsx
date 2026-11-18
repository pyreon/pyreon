/**
 * Real-Chromium twin of `compiled-ref-contract.test.tsx` (#4390). happy-dom
 * gives a `<template>`'s content the page document, so only a real browser
 * shows the bug: a clone of `template.content` belongs to the template's INERT
 * document (`defaultView === null`) until it is inserted, and a compiled ref
 * fires on the clone before that.
 *
 * The binds below are the compiler's emit for the shapes named (the happy-dom
 * twin locks the emit through `transformJSX`).
 */
import { createRef, h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { _ref, _tpl, createTemplate, mount } from '../index'

describe('compiled refs see the page document in Chromium (#4390)', () => {
  it('a root and a nested ref: owned by the page document, with its window; null on unmount', () => {
    const seen: { el: Element | null; view: unknown; doc: unknown }[] = []
    const cb = (el: Element | null) => seen.push({ el, view: el?.ownerDocument.defaultView, doc: el?.ownerDocument })
    const r = createRef<HTMLElement>()
    // <div ref={cb}><span ref={r}>x</span></div>
    const App = () =>
      _tpl('<div class="ref-root"><span>x</span></div>', (__root) => {
        const __e0 = __root.firstElementChild as Element
        const __d0 = _ref(__root, cb)
        const __d1 = _ref(__e0, r)

        return () => {
          __d0()
          __d1()
        }
      })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const dispose = mount(h(App as never, null), host)
    expect(seen).toHaveLength(1)
    expect(seen[0]!.doc).toBe(document)
    expect(seen[0]!.view).toBe(window)
    expect(r.current?.ownerDocument).toBe(document)
    expect(r.current?.ownerDocument.defaultView).toBe(window)
    dispose()
    expect(seen.map((s) => s.el)).toEqual([seen[0]!.el, null])
    expect(r.current).toBeNull()
    host.remove()
  })

  it('createTemplate clones are owned by the page document too', () => {
    const make = createTemplate<string>('<p><b></b></p>', (el, label) => {
      ;(el.firstChild as HTMLElement).textContent = label
      return null
    })
    const item = make('hi')
    expect(item.el.ownerDocument).toBe(document)
    expect(item.el.ownerDocument.defaultView).toBe(window)
  })
})
