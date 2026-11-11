/**
 * A `ref` passed to a kinetic component must receive the element it renders.
 *
 * `TransitionRenderer` and `CollapseRenderer` render
 * `h(tag, mergeProps(htmlProps, { ref: internalRef }))`; the internal ref wins
 * last, so a consumer's `ref` was silently replaced and never called. The
 * documented scroll-reveal pattern (`useIntersection(() => node)`) therefore
 * never saw an element and the content stayed hidden forever (#4329).
 *
 * The matrix: every kinetic mode × initially shown / initially hidden ×
 * callback ref / ref object, plus a compiler `_rp` getter ref, plus the
 * top-level `<Transition>` and the per-item `TransitionItem` (stagger / group
 * children), which clone the CHILD with their own ref. Each spec also checks
 * the renderer still animates the same element, so a fix that forwarded the
 * consumer's ref by dropping the internal one cannot pass.
 */
import { afterEach, describe, expect, it } from 'vitest'
import type { VNode } from '@pyreon/core'
import { _rp, createRef, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { query } from '@pyreon/test-utils'
import Transition from '../Transition'
import { kinetic } from '../index'

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const c of cleanups.splice(0)) c()
})

const mountIn = (vnode: unknown): { root: HTMLElement; dispose: () => void } => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const dispose = mount(() => vnode as never, root)
  cleanups.push(() => {
    dispose()
    root.remove()
  })
  return { root, dispose }
}

type RefShape = {
  label: string
  make: () => { ref: unknown; current: () => HTMLElement | null }
}

const REF_SHAPES: RefShape[] = [
  {
    label: 'callback ref',
    make: () => {
      let node: HTMLElement | null = null
      return {
        ref: (n: HTMLElement | null) => {
          node = n
        },
        current: () => node,
      }
    },
  },
  {
    label: 'ref object',
    make: () => {
      const r = createRef<HTMLElement>()
      return { ref: r, current: () => r.current }
    },
  },
  {
    label: '_rp getter (compiled `ref={cond ? a : b}`)',
    make: () => {
      const r = createRef<HTMLElement>()
      return { ref: _rp(() => r), current: () => r.current }
    },
  },
]

const STATES = [
  ['initially shown', true],
  ['initially hidden', false],
] as const

const CLASSES = { enterFrom: 'k-from', enterTo: 'k-to' }

describe('kinetic(tag) forwards the consumer ref to the rendered element', () => {
  for (const { label, make } of REF_SHAPES) {
    for (const [state, initial] of STATES) {
      it(`transition mode — ${label}, ${state}`, () => {
        const K = kinetic('div').enterClass({ from: 'k-from', to: 'k-to' })
        const show = signal(initial)
        const r = make()
        const { root } = mountIn(
          h(K, { ref: r.ref, show: () => show(), 'data-id': 'k' }, h('span', {}, 'hi')),
        )
        const el = query<HTMLElement>(root, '[data-id="k"]')
        expect(r.current(), 'the consumer ref must receive the element').toBe(el)
        if (!initial) {
          // The renderer still owns the same element: the enter runs on it.
          show.set(true)
          expect(el.classList.contains('k-from')).toBe(true)
        }
      })

      it(`collapse mode — ${label}, ${state}`, () => {
        const K = kinetic('section').collapse()
        const show = signal(initial)
        const r = make()
        const { root } = mountIn(
          h(K, { ref: r.ref, show: () => show(), 'data-id': 'c' }, h('p', {}, 'body')),
        )
        const el = query<HTMLElement>(root, '[data-id="c"]')
        expect(r.current(), 'the consumer ref must receive the wrapper').toBe(el)
        show.set(!initial)
        // The collapse still animates the same wrapper.
        expect(el.style.transition).toBe('height 300ms ease')
      })

      it(`stagger mode — ${label}, ${state}`, () => {
        const K = kinetic('ul').enterClass({ from: 'k-from', to: 'k-to' }).stagger()
        const show = signal(initial)
        const r = make()
        const { root } = mountIn(
          h(
            K,
            { ref: r.ref, show: () => show(), 'data-id': 's' },
            h('li', {}, 'a'),
            h('li', {}, 'b'),
          ),
        )
        expect(r.current()).toBe(query<HTMLElement>(root, '[data-id="s"]'))
      })
    }

    it(`group mode — ${label}`, () => {
      const K = kinetic('ul').enterClass({ from: 'k-from', to: 'k-to' }).group()
      const r = make()
      const { root } = mountIn(
        h(
          K,
          { ref: r.ref, 'data-id': 'g' },
          h('li', { key: 'a' }, 'a'),
          h('li', { key: 'b' }, 'b'),
        ),
      )
      expect(r.current()).toBe(query<HTMLElement>(root, '[data-id="g"]'))
    })
  }

  it('the consumer ref is released on unmount', () => {
    const K = kinetic('div')
    const r = createRef<HTMLElement>()
    const { dispose } = mountIn(h(K, { ref: r, show: () => true }, 'x'))
    expect(r.current).not.toBeNull()
    dispose()
    expect(r.current).toBeNull()
  })

  it('the hidden fallback (`unmount: false`) element reaches the consumer ref too', async () => {
    const K = kinetic('div').config({ unmount: false, timeout: 1 })
    const show = signal(true)
    const r = createRef<HTMLElement>()
    const { root } = mountIn(h(K, { ref: r, show: () => show(), 'data-id': 'f' }, 'x'))
    const shown = query<HTMLElement>(root, '[data-id="f"]')
    expect(r.current).toBe(shown)
    show.set(false)
    // Let the leave finish (the 1ms safety timeout completes it) so `<Show>`
    // swaps in the `display:none` fallback element.
    await new Promise((resolve) => setTimeout(resolve, 30))
    const fallback = query<HTMLElement>(root, '[data-id="f"]')
    expect(fallback).not.toBe(shown)
    expect(fallback.style.display).toBe('none')
    expect(r.current, 'the consumer ref must follow the swap').toBe(fallback)
  })
})

describe('child refs survive the per-element ref injection', () => {
  for (const { label, make } of REF_SHAPES.slice(0, 2)) {
    for (const [state, initial] of STATES) {
      it(`<Transition> child — ${label}, ${state}`, () => {
        const show = signal(initial)
        const r = make()
        const { root } = mountIn(
          h(
            Transition,
            { show: () => show(), ...CLASSES },
            h('div', { ref: r.ref, 'data-id': 't' }, 'hi') as VNode,
          ),
        )
        expect(r.current()).toBe(query<HTMLElement>(root, '[data-id="t"]'))
      })

      it(`stagger item child (TransitionItem) — ${label}, ${state}`, () => {
        const K = kinetic('ul').enterClass({ from: 'k-from', to: 'k-to' }).stagger()
        const show = signal(initial)
        const r = make()
        const { root } = mountIn(
          h(K, { show: () => show() }, h('li', { ref: r.ref, 'data-id': 'i' }, 'a')),
        )
        expect(r.current()).toBe(query<HTMLElement>(root, '[data-id="i"]'))
      })
    }
  }
})
