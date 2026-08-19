// `<Transition>` / `<TransitionGroup>` — REAL-Chromium behaviour.
//
// Everything asserted here needs an engine that actually runs CSS
// transitions and lays out boxes, so happy-dom cannot stand in:
//
//   - a transition genuinely INTERPOLATES (mid-flight opacity is strictly
//     between its endpoints) — happy-dom has no animation clock at all;
//   - assigning the `transition` SHORTHAND resets every longhand it omits,
//     `transition-delay` included. happy-dom does NOT model that reset, so
//     a unit test passes against the exact bug it causes. @pyreon/kinetic
//     shipped that bug: a bare `el.style.transition = …` silently erased
//     the per-child stagger delays, and only real Chromium saw it;
//   - `display: none` removes an element from flex layout AND from its
//     parent's `gap`, which is why a hidden `<Transition>` inside a
//     `<Stack gap>` must not leave a hole;
//   - `ResizeObserver` reports real content geometry.

import { afterEach, describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { Stack, Transition, TransitionGroup } from '../index'

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

let cleanup: (() => void) | null = null
afterEach(() => {
  cleanup?.()
  cleanup = null
})

function render(vnode: ReturnType<typeof h>): HTMLElement {
  const { container, unmount } = mountInBrowser(vnode)
  cleanup = unmount
  return container.firstElementChild as HTMLElement
}

describe('<Transition> — real CSS transitions', () => {
  it('a hidden wrapper is genuinely not rendered', () => {
    const root = render(h(Transition, { show: false }, h('span', null, 'body')))
    expect(getComputedStyle(root).display).toBe('none')
    expect(root.getBoundingClientRect().height).toBe(0)
  })

  // display:none also removes the element from its flex parent's gap, so a
  // hidden Transition inside a Stack leaves no hole. That is the whole
  // reason the hidden state is `display:none` rather than `opacity:0`.
  it('a hidden wrapper contributes no gap inside a <Stack>', async () => {
    const on = signal(false)
    const root = render(
      h(
        Stack,
        { gap: 4 },
        h('span', { id: 'a' }, 'a'),
        h(Transition, { show: () => on() }, h('span', null, 'mid')),
        h('span', { id: 'b' }, 'b'),
      ),
    )
    const a = root.querySelector('#a') as HTMLElement
    const b = root.querySelector('#b') as HTMLElement
    const closed = b.getBoundingClientRect().top - a.getBoundingClientRect().bottom
    on.set(true)
    await flush()
    await wait(500)
    const open = b.getBoundingClientRect().top - a.getBoundingClientRect().bottom
    // One gap when hidden (a→b), two gaps + the content when shown.
    expect(closed).toBeCloseTo(16, 0)
    expect(open).toBeGreaterThan(closed)
  })

  it('arms the real computed transition longhands on enter', async () => {
    const on = signal(false)
    const root = render(
      h(
        Transition,
        { show: () => on(), duration: 400, easing: 'linear' },
        h('span', null, 'body'),
      ),
    )
    on.set(true)
    const cs = getComputedStyle(root)
    expect(cs.transitionProperty).toBe('opacity, transform')
    expect(cs.transitionDuration).toBe('0.4s')
    expect(cs.transitionTimingFunction).toBe('linear')
  })

  // The load-bearing assertion of this file. `el.style.transition = …`
  // resets `transition-delay` to 0s in a spec-compliant engine; longhand
  // writes leave it alone. A consumer who set their own delay must keep it.
  it('preserves a consumer transition-delay across an enter (shorthand trap)', async () => {
    const on = signal(false)
    const root = render(
      h(
        Transition,
        {
          show: () => on(),
          duration: 300,
          style: { 'transition-delay': '120ms' },
        },
        h('span', null, 'body'),
      ),
    )
    expect(getComputedStyle(root).transitionDelay).toBe('0.12s')
    on.set(true)
    await flush()
    expect(getComputedStyle(root).transitionDelay).toBe('0.12s')
    await wait(500)
    expect(getComputedStyle(root).transitionDelay).toBe('0.12s')
  })

  // What actually animates: opacity is strictly BETWEEN its endpoints
  // partway through. A `linear` curve makes the window wide and stable.
  it('interpolates opacity while entering', async () => {
    const on = signal(false)
    const root = render(
      h(
        Transition,
        { show: () => on(), duration: 600, easing: 'linear' },
        h('span', null, 'body'),
      ),
    )
    on.set(true)
    await flush()
    await wait(200)
    const mid = Number.parseFloat(getComputedStyle(root).opacity)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
    await wait(700)
    expect(Number.parseFloat(getComputedStyle(root).opacity)).toBe(1)
  })

  it('interpolates opacity while leaving, then hides', async () => {
    const on = signal(true)
    const root = render(
      h(
        Transition,
        { show: () => on(), duration: 600, easing: 'linear' },
        h('span', null, 'body'),
      ),
    )
    on.set(false)
    await flush()
    await wait(200)
    const mid = Number.parseFloat(getComputedStyle(root).opacity)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
    // Still laid out while leaving — otherwise nothing would be visible.
    expect(getComputedStyle(root).display).not.toBe('none')
    await wait(700)
    expect(getComputedStyle(root).display).toBe('none')
  })

  it('slide-up starts below and settles at rest', async () => {
    const on = signal(false)
    const root = render(
      h(
        Transition,
        { show: () => on(), name: 'slide-up', duration: 600, easing: 'linear' },
        h('span', null, 'body'),
      ),
    )
    on.set(true)
    await flush()
    await wait(150)
    // Mid-flight the wrapper is still translated down toward its resting 0.
    const matrix = new DOMMatrixReadOnly(getComputedStyle(root).transform)
    expect(matrix.f).toBeGreaterThan(0)
    await wait(700)
    expect(getComputedStyle(root).transform).toBe('none')
  })
})

describe('<TransitionGroup> — real ResizeObserver', () => {
  it('adopts the content height without animating the first measurement', async () => {
    const root = render(
      h(
        TransitionGroup,
        null,
        h('div', { style: { height: '60px' } }, 'row'),
      ),
    )
    await flush()
    await wait(60)
    expect(Number.parseFloat(root.style.height)).toBeCloseTo(60, 0)
    expect(getComputedStyle(root).height).toBe('60px')
  })

  it('animates the height when a row is added', async () => {
    const rows = signal([1])
    const root = render(
      h(
        TransitionGroup,
        null,
        () => rows().map((n) => h('div', { style: { height: '40px' } }, String(n))),
      ),
    )
    await flush()
    await wait(60)
    expect(Number.parseFloat(root.style.height)).toBeCloseTo(40, 0)

    rows.set([1, 2])
    await flush()
    await wait(60)
    // The inline target height jumps to the new content size...
    expect(Number.parseFloat(root.style.height)).toBeCloseTo(80, 0)
    // ...while the RENDERED height is still on its way there.
    const rendered = root.getBoundingClientRect().height
    expect(rendered).toBeGreaterThan(40)
    expect(rendered).toBeLessThan(80)

    await wait(500)
    expect(root.getBoundingClientRect().height).toBeCloseTo(80, 0)
  })
})
