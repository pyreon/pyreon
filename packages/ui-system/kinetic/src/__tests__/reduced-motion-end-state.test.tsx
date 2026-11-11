/**
 * Reduced motion skips the ANIMATION, not its END STATE.
 *
 * The initially-hidden render bakes the hidden state onto the element
 * (`leaveTo ?? enterFrom` classes, `leaveToStyle ?? enterStyle` style) so
 * SSR/SSG output carries the content. The animated enter clears it and lands
 * on `enterTo` / `enterToStyle`; the reduced-motion branch used to only fire
 * the callbacks, so a scroll-reveal stayed at `opacity: 0` forever for the
 * users who asked for less motion (#4336).
 *
 * Every spec mounts through the real `mount()` with `matchMedia` answering
 * `prefers-reduced-motion: reduce`, and asserts the element's final inline
 * style and classes for an enter and a leave — on every renderer that has a
 * reduced-motion branch: TransitionRenderer (`kinetic(tag)`), TransitionItem
 * (driven through `.stagger()` and `<Stagger>`; `.group()` and
 * `<TransitionGroup>` reach the same branch), the top-level `<Transition>`,
 * and both collapses.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import Collapse from '../Collapse'
import Stagger from '../Stagger'
import Transition from '../Transition'
import { kinetic } from '../index'

const originalMatchMedia = window.matchMedia
const cleanups: Array<() => void> = []

beforeEach(() => {
  window.matchMedia = ((q: string) =>
    ({
      matches: q.includes('prefers-reduced-motion'),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList) as typeof window.matchMedia
})

afterEach(() => {
  for (const c of cleanups.splice(0)) c()
  window.matchMedia = originalMatchMedia
})

const mountIn = (vnode: unknown): HTMLElement => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const dispose = mount(() => vnode as never, root)
  cleanups.push(() => {
    dispose()
    root.remove()
  })
  return root
}

const byId = (root: HTMLElement, id: string): HTMLElement => {
  const el = root.querySelector<HTMLElement>(`[data-id="${id}"]`)
  if (!el) throw new Error(`no [data-id="${id}"] in ${root.innerHTML}`)
  return el
}

// The repro shape from #4336 — style-only, enter side only.
const REVEAL_STYLES = {
  enterStyle: { opacity: 0, transform: 'translateY(16px)' },
  enterToStyle: { opacity: 1, transform: 'none' },
  enterTransition: 'opacity .7s, transform .7s',
  leaveStyle: { opacity: 1 },
  leaveToStyle: { opacity: 0, transform: 'translateY(-8px)' },
  leaveTransition: 'opacity .3s',
}

const CLASSES = {
  enter: 'e-active',
  enterFrom: 'e-from',
  enterTo: 'e-to',
  leave: 'l-active',
  leaveFrom: 'l-from',
  leaveTo: 'l-to',
}

const expectEntered = (el: HTMLElement) => {
  expect(el.style.opacity).toBe('1')
  expect(el.style.transform).toBe('none')
  expect(el.style.transition).toBe('')
}
const expectLeft = (el: HTMLElement) => {
  expect(el.style.opacity).toBe('0')
  expect(el.style.transform).toBe('translateY(-8px)')
  expect(el.style.transition).toBe('')
}
const expectEnteredClasses = (el: HTMLElement) => {
  expect([...el.classList].filter((c) => c !== 'own')).toEqual(['e-to'])
}
const expectLeftClasses = (el: HTMLElement) => {
  expect([...el.classList].filter((c) => c !== 'own')).toEqual(['l-to'])
}

describe('reduced motion — kinetic(tag) transition mode (TransitionRenderer)', () => {
  it('an initially-hidden style reveal ends visible, then hidden on leave', () => {
    const RevealBox = kinetic('div')
      .enter(REVEAL_STYLES.enterStyle)
      .enterTo(REVEAL_STYLES.enterToStyle)
      .enterTransition(REVEAL_STYLES.enterTransition)
      .leave(REVEAL_STYLES.leaveStyle)
      .leaveTo(REVEAL_STYLES.leaveToStyle)
    const visible = signal(false)
    const root = mountIn(h(RevealBox, { show: () => visible(), 'data-id': 'r' }, 'Hello'))
    const el = byId(root, 'r')
    // Baked hidden state (leaveToStyle wins the picker).
    expect(el.style.opacity).toBe('0')

    visible.set(true)
    expectEntered(el)

    visible.set(false)
    expectLeft(el)
  })

  it('the enter-side-only repro (#4336) ends at enterToStyle', () => {
    const RevealBox = kinetic('div')
      .enter({ opacity: 0, transform: 'translateY(16px)' })
      .enterTo({ opacity: 1, transform: 'none' })
      .enterTransition('opacity .7s, transform .7s')
    const visible = signal(false)
    const root = mountIn(h(RevealBox, { show: () => visible(), 'data-id': 'r' }, 'Hello'))
    const el = byId(root, 'r')
    expect(el.style.opacity).toBe('0')
    expect(el.style.transform).toBe('translateY(16px)')

    visible.set(true)
    expect(el.style.opacity).toBe('1')
    expect(el.style.transform).toBe('none')
  })

  it('class config: enter ends on enterTo only, leave on leaveTo only', () => {
    const Box = kinetic('div')
      .enterClass({ active: CLASSES.enter, from: CLASSES.enterFrom, to: CLASSES.enterTo })
      .leaveClass({ active: CLASSES.leave, from: CLASSES.leaveFrom, to: CLASSES.leaveTo })
    const visible = signal(false)
    const root = mountIn(h(Box, { show: () => visible(), 'data-id': 'r', class: 'own' }, 'x'))
    const el = byId(root, 'r')
    expect(el.classList.contains('l-to')).toBe(true)

    visible.set(true)
    expectEnteredClasses(el)
    expect(el.classList.contains('own')).toBe(true)

    visible.set(false)
    expectLeftClasses(el)
  })

  it('callbacks still fire in order around the settle', () => {
    const order: string[] = []
    const visible = signal(false)
    const Box = kinetic('div').enter({ opacity: 0 }).enterTo({ opacity: 1 })
    let el: HTMLElement | null = null
    const root = mountIn(
      h(
        Box,
        {
          show: () => visible(),
          'data-id': 'r',
          onEnter: () => order.push(`enter:${el?.style.opacity}`),
          onAfterEnter: () => order.push(`after:${el?.style.opacity}`),
        },
        'x',
      ),
    )
    el = byId(root, 'r')
    visible.set(true)
    expect(order).toEqual(['enter:0', 'after:1'])
  })
})

describe('reduced motion — top-level <Transition>', () => {
  it('an initially-hidden style reveal ends visible, then hidden on leave', () => {
    const visible = signal(false)
    const root = mountIn(
      h(Transition, { show: () => visible(), ...REVEAL_STYLES }, h('div', { 'data-id': 't' }, 'x')),
    )
    const el = byId(root, 't')
    expect(el.style.opacity).toBe('0')

    visible.set(true)
    expectEntered(el)

    visible.set(false)
    expectLeft(el)
  })

  it('class config: the baked hidden class is removed and enterTo applied', () => {
    const visible = signal(false)
    const root = mountIn(
      h(
        Transition,
        { show: () => visible(), ...CLASSES },
        h('div', { 'data-id': 't', class: 'own' }, 'x'),
      ),
    )
    const el = byId(root, 't')
    expect(el.classList.contains('l-to')).toBe(true)

    visible.set(true)
    expectEnteredClasses(el)

    visible.set(false)
    expectLeftClasses(el)
  })

  it('initially-visible with unmount: false leaves to the hidden fallback', () => {
    const visible = signal(true)
    const root = mountIn(
      h(
        Transition,
        { show: () => visible(), unmount: false, ...CLASSES },
        h('div', { 'data-id': 't' }, 'x'),
      ),
    )
    visible.set(false)
    expect(byId(root, 't').style.display).toBe('none')
    visible.set(true)
    const el = byId(root, 't')
    expect(el.style.display).toBe('')
    expect(el.classList.contains('l-to')).toBe(false)
  })
})

describe('reduced motion — TransitionItem (stagger / group)', () => {
  it('kinetic(tag).stagger(): every initially-hidden child ends visible, then hidden', () => {
    const List = kinetic('ul')
      .enter(REVEAL_STYLES.enterStyle)
      .enterTo(REVEAL_STYLES.enterToStyle)
      .leaveTo(REVEAL_STYLES.leaveToStyle)
      .stagger({ interval: 50 })
    const visible = signal(false)
    const root = mountIn(
      h(
        List,
        { show: () => visible() },
        h('li', { 'data-id': 'a' }, 'a'),
        h('li', { 'data-id': 'b' }, 'b'),
      ),
    )
    for (const id of ['a', 'b']) expect(byId(root, id).style.opacity).toBe('0')

    visible.set(true)
    for (const id of ['a', 'b']) expectEntered(byId(root, id))

    visible.set(false)
    for (const id of ['a', 'b']) expectLeft(byId(root, id))
  })

  it('<Stagger>: class config ends on enterTo, then leaveTo', () => {
    const visible = signal(false)
    const root = mountIn(
      h(
        Stagger,
        { show: () => visible(), ...CLASSES },
        h('li', { 'data-id': 'a' }, 'a'),
        h('li', { 'data-id': 'b' }, 'b'),
      ),
    )
    visible.set(true)
    for (const id of ['a', 'b']) expectEnteredClasses(byId(root, id))
    visible.set(false)
    for (const id of ['a', 'b']) expectLeftClasses(byId(root, id))
  })
})

describe('reduced motion — collapses', () => {
  // Reduced motion measures nothing, so the branch must not wait for the inner
  // content: on a reopen `<Show when={shouldRender}>` mounts it on the very
  // stage change, and the old early return left `height: 0px` forever.
  it('<Collapse>: initially closed opens to height auto, closes to 0', () => {
    const open = signal(false)
    const root = mountIn(h(Collapse, { show: () => open() }, h('p', {}, 'x')))
    const wrapper = root.firstElementChild as HTMLElement
    expect(wrapper.style.height).toBe('0px')

    open.set(true)
    expect(wrapper.style.height).toBe('auto')
    expect(wrapper.style.overflow).toBe('')

    open.set(false)
    expect(wrapper.style.height).toBe('0px')
    expect(wrapper.style.overflow).toBe('hidden')
  })

  it('<Collapse>: initially open, closed, then reopened ends at height auto', () => {
    const open = signal(true)
    const root = mountIn(h(Collapse, { show: () => open() }, h('p', {}, 'x')))
    const wrapper = root.firstElementChild as HTMLElement
    open.set(false)
    expect(wrapper.style.height).toBe('0px')
    open.set(true)
    expect(wrapper.style.height).toBe('auto')
    expect(wrapper.style.overflow).toBe('')
  })

  it('kinetic(tag).collapse(): initially closed opens to height auto, closes to 0', () => {
    const Accordion = kinetic('section').collapse()
    const open = signal(false)
    const root = mountIn(h(Accordion, { show: () => open(), 'data-id': 'w' }, h('p', {}, 'x')))
    const wrapper = byId(root, 'w')
    expect(wrapper.style.height).toBe('0px')

    open.set(true)
    expect(wrapper.style.height).toBe('auto')
    expect(wrapper.style.overflow).toBe('')

    open.set(false)
    expect(wrapper.style.height).toBe('0px')
    expect(wrapper.style.overflow).toBe('hidden')
  })

  it('kinetic(tag).collapse(): initially open, closed, then reopened ends at height auto', () => {
    const Accordion = kinetic('section').collapse()
    const open = signal(true)
    const root = mountIn(h(Accordion, { show: () => open(), 'data-id': 'w' }, h('p', {}, 'x')))
    const wrapper = byId(root, 'w')
    open.set(false)
    expect(wrapper.style.height).toBe('0px')
    open.set(true)
    expect(wrapper.style.height).toBe('auto')
    expect(wrapper.style.overflow).toBe('')
  })
})

// Guard for the harness itself: without the stub the same specs would be
// exercising the ANIMATED path, which would pass for the wrong reason.
it('the matchMedia stub answers reduced motion', () => {
  expect(window.matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true)
})
