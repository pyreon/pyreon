import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { kinetic } from '../index'
import { fade } from '../presets'
import { toShowAccessor } from '../show-accessor'

/**
 * `show` arrives in three shapes, and two of them used to crash.
 *
 * Found by the native-tasks WEB e2e: `<FadeIn>content</FadeIn>` — a preset used
 * for a plain entrance, which is the whole reason presets exist — threw
 * `TypeError: show is not a function` from inside `useTransitionState`, naming a
 * prop the author never wrote. The screen rendered nothing.
 *
 * The value form is the same class from the other direction: the compiler
 * auto-calls a known signal in attribute position, so `show={isOpen}` reaches
 * the component as a resolved boolean, not as the accessor the author typed.
 *
 * Same normalization rule as `<Show when>` / `<Match when>`.
 */
describe('kinetic `show` accepts absent, value, and accessor forms', () => {
  describe('toShowAccessor', () => {
    it('treats an absent show as shown — an element with no `show` is not conditional', () => {
      expect(toShowAccessor(undefined)()).toBe(true)
    })

    it('accepts the value form the compiler produces for `show={sig}`', () => {
      expect(toShowAccessor(true)()).toBe(true)
      expect(toShowAccessor(false)()).toBe(false)
    })

    it('passes an accessor through unchanged, so tracking still works', () => {
      let reads = 0
      const acc = () => {
        reads += 1
        return true
      }
      const out = toShowAccessor(acc)
      expect(out).toBe(acc)
      out()
      expect(reads).toBe(1)
    })
  })

  describe('rendering', () => {
    const FadeIn = kinetic('div').preset(fade)

    it('renders a preset used with NO show prop (the shipped crash)', () => {
      const el = document.createElement('div')
      expect(() => mount(() => h(FadeIn, {}, h('span', { id: 'inner' }, 'hi')), el)).not.toThrow()
      expect(el.querySelector('#inner')?.textContent).toBe('hi')
    })

    it('renders a plain-boolean `show={true}`', () => {
      const el = document.createElement('div')
      expect(() =>
        mount(() => h(FadeIn, { show: true }, h('span', { id: 'inner' }, 'hi')), el),
      ).not.toThrow()
      expect(el.querySelector('#inner')?.textContent).toBe('hi')
    })

    // The load-bearing negative: the fix is a DEFAULT for the absent case, not
    // a coercion of every value to `true`. An initially-hidden transition still
    // renders its children (deliberate — SSR must ship the content), so DOM
    // presence cannot discriminate; the honest invariant is that the value form
    // produces exactly what the equivalent ACCESSOR produces.
    it('renders `show={false}` identically to `show={() => false}` — faithful, not coerced', () => {
      const value = document.createElement('div')
      mount(() => h(FadeIn, { show: false }, h('span', {}, 'hi')), value)
      const accessor = document.createElement('div')
      mount(() => h(FadeIn, { show: () => false }, h('span', {}, 'hi')), accessor)

      expect(value.innerHTML).toBe(accessor.innerHTML)
      // ...and NOT what `true` produces, or the normalization swallowed it.
      const shown = document.createElement('div')
      mount(() => h(FadeIn, { show: true }, h('span', {}, 'hi')), shown)
      expect(value.innerHTML).not.toBe(shown.innerHTML)
    })
  })
})
