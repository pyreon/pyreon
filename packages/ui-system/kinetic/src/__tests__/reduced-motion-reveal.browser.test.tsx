import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { cdp } from 'vitest/browser'
import kinetic from '../kinetic'
import Collapse from '../Collapse'

// ── Reduced motion still reaches the END state (real Chromium, #4336) ────
//
// The initially-hidden render bakes the hidden state inline so SSR/SSG output
// carries the content; the animated enter clears it. The reduced-motion
// branch used to only fire callbacks, so a scroll-reveal stayed at computed
// `opacity: 0` forever — for exactly the users who asked for less motion.
//
// Reduced motion is EMULATED by Chromium over CDP (`Emulation.setEmulatedMedia`),
// not a `matchMedia` stub: the real media query and the real computed style.

type Session = { send: (method: string, params?: unknown) => Promise<unknown> }
const session = (): Session => cdp() as unknown as Session

const frames = (n = 3) =>
  new Promise<void>((resolve) => {
    const step = (left: number) =>
      left === 0 ? resolve() : requestAnimationFrame(() => step(left - 1))
    step(n)
  })

const mountIn = (vnode: unknown) => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const dispose = mount(() => vnode as never, root)
  return {
    root,
    unmount: () => {
      dispose()
      root.remove()
    },
  }
}

describe('@pyreon/kinetic under emulated prefers-reduced-motion: reduce', () => {
  beforeAll(async () => {
    await session().send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    })
  })

  afterAll(async () => {
    await session().send('Emulation.setEmulatedMedia', { features: [] })
  })

  it('the emulation reaches this frame', () => {
    expect(window.matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true)
  })

  it('an initially-hidden scroll-reveal becomes visible when show flips true', async () => {
    const RevealBox = kinetic('div')
      .enter({ opacity: 0, transform: 'translateY(16px)' })
      .enterTo({ opacity: 1, transform: 'none' })
      .enterTransition('opacity .7s, transform .7s')
    const visible = signal(false)
    const { root, unmount } = mountIn(
      h(RevealBox, { show: () => visible(), 'data-id': 'reveal' }, 'Hello'),
    )
    const el = root.querySelector<HTMLElement>('[data-id="reveal"]')!
    await frames()
    expect(getComputedStyle(el).opacity).toBe('0')

    visible.set(true)
    await frames()
    expect(el.style.opacity).toBe('1')
    expect(getComputedStyle(el).opacity).toBe('1')
    expect(getComputedStyle(el).transform).toBe('none')
    unmount()
  })

  it('a reopened collapse is laid out at its content height', async () => {
    const open = signal(true)
    const { root, unmount } = mountIn(
      h(Collapse, { show: () => open() }, h('p', { style: 'margin:0;height:40px' }, 'x')),
    )
    const wrapper = root.firstElementChild as HTMLElement
    open.set(false)
    await frames()
    expect(wrapper.getBoundingClientRect().height).toBe(0)

    open.set(true)
    await frames()
    expect(wrapper.getBoundingClientRect().height).toBe(40)
    unmount()
  })
})
