/**
 * `show={isOpen}` rendered PERMANENTLY INVISIBLE.
 *
 * The compiler emits a signal read in attribute position as an `_rp` getter
 * that `makeReactiveProps` installs on `props`. Every kinetic surface called
 * `toShowAccessor(props.show)` at SETUP — one read, outside any tracking
 * scope — so the "accessor" it built closed over a frozen boolean. The
 * element mounted with its hidden-state class/style and never left it: no
 * throw, children still mounted (the SSR contract), just opacity 0 forever.
 *
 * The fix is positional, the same one `<Show>` uses with `callWhen(props.when)`:
 * normalize INSIDE the accessor (`showAccessorFrom(props)` re-reads
 * `props.show` per call). These specs feed the REAL compiler shape — an
 * `_rp(() => sig())` prop through `mount()` — at all five sites, with the
 * explicit-accessor and plain-boolean forms as controls.
 *
 * Bisect-verified: with the five sites reverted to `toShowAccessor(props.show)`
 * the `_rp` specs fail (`expected true to be false` on the hidden class,
 * `expected 0 to be 1` on onEnter) while the accessor controls stay green.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { _rp, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { query } from '@pyreon/test-utils'
import Collapse from '../Collapse'
import Stagger from '../Stagger'
import Transition from '../Transition'
import { kinetic } from '../index'
import { fade } from '../presets'
import useTransitionState from '../useTransitionState'

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const c of cleanups.splice(0)) c()
})

const mountIn = (vnode: unknown): HTMLElement => {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const dispose = mount(() => vnode as never, el)
  cleanups.push(() => {
    dispose()
    el.remove()
  })
  return el
}

const CLASSES = { enter: 'k-ing', enterFrom: 'k-from', enterTo: 'k-to', leaveTo: 'k-gone' }

describe('kinetic `show` as a compiler-emitted reactive prop (`_rp` getter)', () => {
  describe('<Transition>', () => {
    for (const [label, shape] of [
      ['_rp getter (the compiled `show={sig}` shape)', (sig: () => boolean) => _rp(() => sig())],
      ['explicit accessor (control)', (sig: () => boolean) => () => sig()],
    ] as const) {
      it(`${label}: leaves the hidden state when the signal flips`, () => {
        const sig = signal(false)
        const onEnter = vi.fn()
        const root = mountIn(
          h(Transition, { show: shape(sig), onEnter, ...CLASSES }, h('div', { 'data-id': 't' }, 'hi')),
        )
        const el = query(root, '[data-id="t"]')
        expect(el.classList.contains('k-gone')).toBe(true)
        sig.set(true)
        expect(onEnter).toHaveBeenCalledTimes(1)
        expect(el.classList.contains('k-gone')).toBe(false)
        expect(el.classList.contains('k-ing')).toBe(true)
      })
    }

    it('a plain boolean stays a static value (control)', () => {
      const root = mountIn(h(Transition, { show: false, ...CLASSES }, h('div', { 'data-id': 't' }, 'hi')))
      expect(root.querySelector('[data-id="t"]')!.classList.contains('k-gone')).toBe(true)
    })

    it('the initially-shown branch also reads the getter live (visible → hidden)', () => {
      const sig = signal(true)
      const onLeave = vi.fn()
      mountIn(h(Transition, { show: _rp(() => sig()), onLeave, ...CLASSES }, h('div', { 'data-id': 't' }, 'hi')))
      sig.set(false)
      expect(onLeave).toHaveBeenCalledTimes(1)
    })
  })

  describe('kinetic(tag) — transition and collapse modes', () => {
    it('transition mode: `_rp` show flips the element out of its hidden style', () => {
      const Fade = kinetic('div').preset(fade)
      const sig = signal(false)
      const onEnter = vi.fn()
      const root = mountIn(h(Fade, { show: _rp(() => sig()), onEnter, 'data-id': 'k' }, h('span', {}, 'hi')))
      const el = query(root, '[data-id="k"]')
      expect(el.style.opacity).toBe('0')
      sig.set(true)
      expect(onEnter).toHaveBeenCalledTimes(1)
    })

    it('collapse mode: `_rp` show starts the enter cycle', () => {
      const Acc = kinetic('div').collapse()
      const sig = signal(false)
      const onEnter = vi.fn()
      mountIn(h(Acc, { show: _rp(() => sig()), onEnter }, h('span', {}, 'hi')))
      expect(onEnter).not.toHaveBeenCalled()
      sig.set(true)
      expect(onEnter).toHaveBeenCalledTimes(1)
    })
  })

  describe('<Collapse>', () => {
    // NOT `onEnter`: `<Collapse>` gates its content on `<Show when={stage !==
    // 'hidden'}>`, so on the initially-hidden path `contentRef` is null when
    // the stage watcher runs and the height/callback branch bails — for the
    // fixed AND the broken build alike (verified: both arms, zero calls). The
    // observable that actually discriminates is the one `showAcc` gates:
    // whether the content mounts at all.
    for (const [label, shape] of [
      ['_rp getter (the compiled `show={sig}` shape)', (sig: () => boolean) => _rp(() => sig())],
      ['explicit accessor (control)', (sig: () => boolean) => () => sig()],
    ] as const) {
      it(`${label}: the flip mounts the collapsed content`, () => {
        const sig = signal(false)
        const root = mountIn(
          h(Collapse, { show: shape(sig) }, h('span', { 'data-id': 'c' }, 'hi')),
        )
        expect(root.querySelector('[data-id="c"]')).toBeNull()
        sig.set(true)
        expect(root.querySelector('[data-id="c"]')?.textContent).toBe('hi')
      })
    }
  })

  describe('<Stagger>', () => {
    // The site the original bug list missed: `<Stagger>` forwarded `own.show`
    // as a VALUE into a `.map()` that runs at setup, so every child
    // `<Transition>` received a frozen boolean even after the five named sites
    // were fixed. It forwards the accessor now.
    for (const [label, shape] of [
      ['_rp getter (the compiled `show={sig}` shape)', (sig: () => boolean) => _rp(() => sig())],
      ['explicit accessor (control)', (sig: () => boolean) => () => sig()],
    ] as const) {
      it(`${label}: the flip reaches every staggered child`, () => {
        const sig = signal(false)
        const root = mountIn(
          h(
            Stagger,
            { show: shape(sig), ...CLASSES },
            h('div', { 'data-id': 'a' }, 'a'),
            h('div', { 'data-id': 'b' }, 'b'),
          ),
        )
        const ids = ['a', 'b'] as const
        for (const id of ids) {
          expect(root.querySelector(`[data-id="${id}"]`)!.classList.contains('k-gone')).toBe(true)
        }
        sig.set(true)
        for (const id of ids) {
          const el = root.querySelector(`[data-id="${id}"]`)!
          expect(el.classList.contains('k-gone'), id).toBe(false)
          expect(el.classList.contains('k-ing'), id).toBe(true)
        }
      })
    }
  })

  describe('useTransitionState', () => {
    it('reads `options.show` per call — a getter-backed options object stays live', () => {
      const sig = signal(false)
      // What a caller passing its own `props` straight through hands us.
      const options = {
        get show() {
          return sig()
        },
      }
      const { stage } = useTransitionState(options)
      expect(stage()).toBe('hidden')
      sig.set(true)
      expect(stage()).toBe('entering')
    })
  })
})
