// `<Transition>` / `<TransitionGroup>` — web state machine.
//
// happy-dom has no layout and no CSS engine, so these specs cover the
// STATE MACHINE only: which inline properties are written, when children
// mount, how the presets map, how the asymmetric timing falls back. The
// claims that need a real engine — that a transition actually runs, and
// that a consumer's `transition-delay` survives it — live in
// `transition.browser.test.tsx`, because happy-dom does not model the
// `transition` shorthand's reset of the longhands it omits and would
// therefore pass against the exact bug that reset causes.

import { query } from '@pyreon/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { signal } from '@pyreon/reactivity'
import { Transition, TransitionGroup } from '../index'
import type { TransitionPreset } from '../index'

function render(vnode: ReturnType<typeof h>): {
  root: HTMLElement
  container: HTMLElement
  unmount: () => void
} {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const dispose = mount(vnode, container)
  return {
    root: container.firstElementChild as HTMLElement,
    container,
    unmount: () => {
      dispose()
      container.remove()
    },
  }
}

describe('<Transition> — initial render', () => {
  it('renders a wrapper div with the children inside', () => {
    const { root, unmount } = render(
      h(Transition, { show: true }, h('span', { id: 'body' }, 'hello')),
    )
    expect(root.tagName).toBe('DIV')
    expect(root.querySelector('#body')?.textContent).toBe('hello')
    unmount()
  })

  it('show=true paints at rest — no inline animation styles, nothing hidden', () => {
    const { root, unmount } = render(h(Transition, { show: true }, h('span', null, 'x')))
    expect(root.style.display).toBe('')
    expect(root.style.opacity).toBe('')
    expect(root.style.transitionProperty).toBe('')
    unmount()
  })

  // The hidden state must be in the RENDERED markup, not applied after
  // mount: SSR emits the wrapper as a string, so a server-rendered page
  // would otherwise flash its hidden content before hydration.
  it('show=false renders display:none plus the hidden end state', () => {
    const { root, unmount } = render(h(Transition, { show: false }, h('span', null, 'x')))
    expect(root.style.display).toBe('none')
    expect(root.style.opacity).toBe('0')
    unmount()
  })

  // An animation wrapper must never gate its children out of SSR — content
  // is structural, animation is visual (the @pyreon/kinetic SSR rule).
  it('keeps children in the DOM while hidden', () => {
    const { root, unmount } = render(
      h(Transition, { show: false }, h('span', { id: 'body' }, 'hello')),
    )
    expect(root.querySelector('#body')?.textContent).toBe('hello')
    unmount()
  })
})

describe('<Transition> — enter / leave', () => {
  it('entering clears display and arms the enter timing', () => {
    const on = signal(false)
    const { root, unmount } = render(
      h(Transition, { show: () => on(), duration: 400, easing: 'linear' }, h('span', null, 'x')),
    )
    expect(root.style.display).toBe('none')
    on.set(true)
    expect(root.style.display).toBe('')
    expect(root.style.transitionProperty).toBe('opacity, transform')
    expect(root.style.transitionDuration).toBe('400ms')
    expect(root.style.transitionTimingFunction).toBe('linear')
    expect(root.style.opacity).toBe('1')
    unmount()
  })

  // Leaving must NOT hide immediately — the content stays laid out for the
  // whole leave animation, which is the only reason the animation is visible.
  it('leaving stays displayed and animates toward the hidden state', () => {
    const on = signal(true)
    const { root, unmount } = render(
      h(Transition, { show: () => on(), duration: 250 }, h('span', null, 'x')),
    )
    on.set(false)
    expect(root.style.display).toBe('')
    expect(root.style.transitionDuration).toBe('250ms')
    expect(root.style.opacity).toBe('0')
    unmount()
  })

  it('the settle timer hides the wrapper once the leave completes', async () => {
    const on = signal(true)
    const { root, unmount } = render(
      h(Transition, { show: () => on(), duration: 10 }, h('span', null, 'x')),
    )
    on.set(false)
    expect(root.style.display).toBe('')
    await new Promise((r) => setTimeout(r, 120))
    expect(root.style.display).toBe('none')
    // Resting hidden state carries no armed transition.
    expect(root.style.transitionProperty).toBe('')
    unmount()
  })

  it('the settle timer clears the inline animation styles after an enter', async () => {
    const on = signal(false)
    const { root, unmount } = render(
      h(Transition, { show: () => on(), duration: 10 }, h('span', null, 'x')),
    )
    on.set(true)
    await new Promise((r) => setTimeout(r, 120))
    expect(root.style.opacity).toBe('')
    expect(root.style.transform).toBe('')
    expect(root.style.transitionProperty).toBe('')
    unmount()
  })

  // A flip back mid-flight must cancel the pending completion, or the old
  // run's settle lands on the new run and hides content that is entering.
  it('re-showing mid-leave cancels the pending hide', async () => {
    const on = signal(true)
    const { root, unmount } = render(
      h(Transition, { show: () => on(), duration: 10 }, h('span', null, 'x')),
    )
    on.set(false)
    on.set(true)
    await new Promise((r) => setTimeout(r, 120))
    expect(root.style.display).toBe('')
    unmount()
  })

  it('a transitionend on a CHILD does not settle the wrapper', () => {
    const on = signal(true)
    const { root, unmount } = render(
      h(Transition, { show: () => on(), duration: 5000 }, h('span', { id: 'body' }, 'x')),
    )
    on.set(false)
    const child = query<HTMLElement>(root, '#body')
    child.dispatchEvent(new Event('transitionend', { bubbles: true }))
    expect(root.style.display).toBe('')
    unmount()
  })

  it('a transitionend on the wrapper settles it immediately', () => {
    const on = signal(true)
    const { root, unmount } = render(
      h(Transition, { show: () => on(), duration: 5000 }, h('span', null, 'x')),
    )
    on.set(false)
    root.dispatchEvent(new Event('transitionend', { bubbles: true }))
    expect(root.style.display).toBe('none')
    unmount()
  })
})

// Leak class I: a `setTimeout` whose "whichever finishes first" partner
// (`transitionend`) may win must be cleared on EVERY exit — superseded,
// settled, and unmounted. An orphaned timer holds the settle closure, and
// through it the element, for the whole animation window.
// The wrapper's SETUP, the effect's FIRST RUN and the `ref` callback all
// read `show` at different moments of one synchronous mount, and the
// effect cannot repair a change it observes — `el` is still null then.
// So if an earlier sibling's setup flips the signal mid-mount, only the
// ref can reconcile, and without it the element paints the stale
// setup-time state and stays there until the NEXT change.
describe('<Transition> — mid-mount reconcile', () => {
  /** false at setup, true from the ref read onward. */
  const flipsToTrue = (): (() => boolean) => {
    let reads = 0
    return () => reads++ > 0
  }
  /** true at setup, false from the ref read onward. */
  const flipsToFalse = (): (() => boolean) => {
    let reads = 0
    return () => reads++ === 0
  }

  it('shows content whose signal turned true during the mount', () => {
    const { root, unmount } = render(
      h(Transition, { show: flipsToTrue() }, h('span', null, 'x')),
    )
    expect(root.style.display).toBe('')
    expect(root.style.opacity).toBe('')
    unmount()
  })

  it('hides content whose signal turned false during the mount', () => {
    const { root, unmount } = render(
      h(Transition, { show: flipsToFalse(), name: 'slide-up' }, h('span', null, 'x')),
    )
    expect(root.style.display).toBe('none')
    expect(root.style.transform).toBe('translateY(100%)')
    unmount()
  })

  // The reconcile SNAPS — it is the initial paint, not a state change, so
  // it must not arm a transition (which would animate on first render).
  it('snaps without arming a transition', () => {
    const { root, unmount } = render(
      h(Transition, { show: flipsToTrue(), duration: 400 }, h('span', null, 'x')),
    )
    expect(root.style.transitionProperty).toBe('')
    expect(root.style.transitionDuration).toBe('')
    unmount()
  })
})

describe('<Transition> — settle-timer hygiene', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('clears a superseded run’s timer instead of orphaning it', () => {
    const on = signal(true)
    const { unmount } = render(
      h(Transition, { show: () => on(), duration: 5000 }, h('span', null, 'x')),
    )
    const setSpy = vi.spyOn(globalThis, 'setTimeout')
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    on.set(false)
    const leaveTimer = setSpy.mock.results[0]?.value
    expect(leaveTimer).toBeDefined()
    on.set(true)
    expect(clearSpy.mock.calls.map((c) => c[0])).toContain(leaveTimer)
    unmount()
  })

  it('clears the pending timer when the component unmounts mid-animation', () => {
    const on = signal(true)
    const { unmount } = render(
      h(Transition, { show: () => on(), duration: 5000 }, h('span', null, 'x')),
    )
    const setSpy = vi.spyOn(globalThis, 'setTimeout')
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    on.set(false)
    const leaveTimer = setSpy.mock.results[0]?.value
    expect(leaveTimer).toBeDefined()
    unmount()
    expect(clearSpy.mock.calls.map((c) => c[0])).toContain(leaveTimer)
  })

  it('clears the timer once transitionend settles the run', () => {
    const on = signal(true)
    const { root, unmount } = render(
      h(Transition, { show: () => on(), duration: 5000 }, h('span', null, 'x')),
    )
    const setSpy = vi.spyOn(globalThis, 'setTimeout')
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    on.set(false)
    const leaveTimer = setSpy.mock.results[0]?.value
    root.dispatchEvent(new Event('transitionend', { bubbles: true }))
    expect(clearSpy.mock.calls.map((c) => c[0])).toContain(leaveTimer)
    unmount()
  })
})

describe('<Transition> — presets', () => {
  // Direction is the direction of TRAVEL, matching the native emitters:
  // a slide-up rises INTO place, so it starts BELOW.
  const CASES: ReadonlyArray<readonly [TransitionPreset, string]> = [
    ['fade', 'none'],
    ['scale', 'scale(0)'],
    ['scaleIn', 'scale(0)'],
    ['scale-in', 'scale(0)'],
    ['slideUp', 'translateY(100%)'],
    ['slide-up', 'translateY(100%)'],
    ['slideDown', 'translateY(-100%)'],
    ['slide-down', 'translateY(-100%)'],
    ['slideLeft', 'translateX(100%)'],
    ['slide-left', 'translateX(100%)'],
    ['slideRight', 'translateX(-100%)'],
    ['slide-right', 'translateX(-100%)'],
  ]

  for (const [name, transform] of CASES) {
    it(`${name} starts hidden at ${transform}`, () => {
      const { root, unmount } = render(
        h(Transition, { show: false, name }, h('span', null, 'x')),
      )
      expect(root.style.transform).toBe(transform)
      expect(root.style.opacity).toBe('0')
      unmount()
    })
  }

  it('no name defaults to a fade', () => {
    const { root, unmount } = render(h(Transition, { show: false }, h('span', null, 'x')))
    expect(root.style.transform).toBe('none')
    expect(root.style.opacity).toBe('0')
    unmount()
  })

  // Native normalizes by lower-casing and stripping `-`/`_`, so an
  // underscore spelling lowers there; the web must not disagree.
  it('accepts the underscore spelling the native normalizer allows', () => {
    const { root, unmount } = render(
      h(
        Transition,
        { show: false, name: 'slide_up' as unknown as TransitionPreset },
        h('span', null, 'x'),
      ),
    )
    expect(root.style.transform).toBe('translateY(100%)')
    unmount()
  })

  // Natively an unrecognized name warns and falls back to a fade. The web
  // must fall back the same way for any name that reaches it.
  it('an unrecognized name falls back to a fade', () => {
    const { root, unmount } = render(
      h(
        Transition,
        { show: false, name: 'wobble' as unknown as TransitionPreset },
        h('span', null, 'x'),
      ),
    )
    expect(root.style.transform).toBe('none')
    expect(root.style.opacity).toBe('0')
    unmount()
  })
})

describe('<Transition> — asymmetric timing', () => {
  it('uses the per-side duration and easing on each direction', () => {
    const on = signal(false)
    const { root, unmount } = render(
      h(
        Transition,
        {
          show: () => on(),
          enterDuration: 200,
          leaveDuration: 2500,
          enterEasing: 'ease-out',
          leaveEasing: 'linear',
        },
        h('span', null, 'x'),
      ),
    )
    on.set(true)
    expect(root.style.transitionDuration).toBe('200ms')
    expect(root.style.transitionTimingFunction).toBe('ease-out')
    on.set(false)
    expect(root.style.transitionDuration).toBe('2500ms')
    expect(root.style.transitionTimingFunction).toBe('linear')
    unmount()
  })

  it('each side falls back to the symmetric value', () => {
    const on = signal(false)
    const { root, unmount } = render(
      h(
        Transition,
        { show: () => on(), duration: 700, easing: 'ease-in', leaveDuration: 120 },
        h('span', null, 'x'),
      ),
    )
    on.set(true)
    expect(root.style.transitionDuration).toBe('700ms')
    expect(root.style.transitionTimingFunction).toBe('ease-in')
    on.set(false)
    expect(root.style.transitionDuration).toBe('120ms')
    // leaveEasing unset → the symmetric easing.
    expect(root.style.transitionTimingFunction).toBe('ease-in')
    unmount()
  })

  it('defaults to 300ms ease-in-out, matching the native default', () => {
    const on = signal(false)
    const { root, unmount } = render(
      h(Transition, { show: () => on() }, h('span', null, 'x')),
    )
    on.set(true)
    expect(root.style.transitionDuration).toBe('300ms')
    expect(root.style.transitionTimingFunction).toBe('ease-in-out')
    unmount()
  })
})

describe('<Transition> — passthrough', () => {
  it('forwards data-*/id/class and merges the consumer style', () => {
    const { root, unmount } = render(
      h(
        Transition,
        {
          show: false,
          id: 'panel',
          class: 'x',
          'data-testid': 'tr',
          style: { 'transition-delay': '120ms' },
        },
        h('span', null, 'x'),
      ),
    )
    expect(root.id).toBe('panel')
    expect(root.className).toBe('x')
    expect(root.getAttribute('data-testid')).toBe('tr')
    expect(root.style.display).toBe('none')
    expect(root.style.transitionDelay).toBe('120ms')
    unmount()
  })
})

describe('<TransitionGroup>', () => {
  it('renders an overflow-hidden container wrapping a content div', () => {
    const { root, unmount } = render(
      h(TransitionGroup, null, h('span', { id: 'row' }, 'a')),
    )
    expect(root.tagName).toBe('DIV')
    expect(root.style.overflow).toBe('hidden')
    const content = root.firstElementChild as HTMLElement
    expect(content.tagName).toBe('DIV')
    expect(content.querySelector('#row')?.textContent).toBe('a')
    unmount()
  })

  // Server-rendered / no-ResizeObserver output must lay out at the
  // content's own size — a height we cannot keep in sync is worse than none.
  it('sets no inline height before a measurement', () => {
    const { root, unmount } = render(h(TransitionGroup, null, h('span', null, 'a')))
    expect(root.style.height).toBe('')
    unmount()
  })

  it('forwards passthrough attrs and merges the consumer style', () => {
    const { root, unmount } = render(
      h(
        TransitionGroup,
        { 'data-testid': 'group', class: 'list', style: { 'max-height': '400px' } },
        h('span', null, 'a'),
      ),
    )
    expect(root.getAttribute('data-testid')).toBe('group')
    expect(root.className).toBe('list')
    expect(root.style.maxHeight).toBe('400px')
    expect(root.style.overflow).toBe('hidden')
    unmount()
  })
})

// happy-dom ships no `ResizeObserver`, so the measurement path is
// unreachable here without a stub. The stub covers the STATE MACHINE
// (adopt-then-animate, teardown, degenerate callbacks); that a real
// observer reports real geometry is asserted in `transition.browser.test.tsx`.
describe('<TransitionGroup> — measurement state machine', () => {
  interface StubEntry {
    contentRect: { height: number }
  }
  class StubResizeObserver {
    static last: StubResizeObserver | null = null
    observed: Element[] = []
    disconnected = false
    constructor(private readonly cb: (entries: StubEntry[]) => void) {
      StubResizeObserver.last = this
    }
    observe(el: Element): void {
      this.observed.push(el)
    }
    unobserve(): void {}
    disconnect(): void {
      this.disconnected = true
    }
    emit(...entries: StubEntry[]): void {
      this.cb(entries)
    }
  }

  const install = (): void => {
    StubResizeObserver.last = null
    vi.stubGlobal('ResizeObserver', StubResizeObserver)
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('observes the CONTENT element, never the sized outer one', () => {
    install()
    const { root, unmount } = render(h(TransitionGroup, null, h('span', null, 'a')))
    const content = root.firstElementChild as HTMLElement
    // Writing the height to the outer element while observing the inner
    // one is what keeps the write from feeding back into a measurement.
    expect(StubResizeObserver.last?.observed).toEqual([content])
    unmount()
  })

  it('adopts the first measurement WITHOUT arming a transition', () => {
    install()
    const { root, unmount } = render(h(TransitionGroup, null, h('span', null, 'a')))
    expect(root.style.transitionProperty).toBe('')
    StubResizeObserver.last?.emit({ contentRect: { height: 60 } })
    expect(root.style.height).toBe('60px')
    expect(root.style.transitionProperty).toBe('height')
    expect(root.style.transitionDuration).toBe('300ms')
    expect(root.style.transitionTimingFunction).toBe('ease-in-out')
    unmount()
  })

  it('later measurements update the height with the transition already armed', () => {
    install()
    const { root, unmount } = render(h(TransitionGroup, null, h('span', null, 'a')))
    const ro = StubResizeObserver.last
    ro?.emit({ contentRect: { height: 40 } })
    ro?.emit({ contentRect: { height: 80 } })
    expect(root.style.height).toBe('80px')
    expect(root.style.transitionProperty).toBe('height')
    unmount()
  })

  it('ignores an empty callback rather than writing NaN', () => {
    install()
    const { root, unmount } = render(h(TransitionGroup, null, h('span', null, 'a')))
    StubResizeObserver.last?.emit()
    expect(root.style.height).toBe('')
    unmount()
  })

  it('disconnects the observer on unmount', () => {
    install()
    const { unmount } = render(h(TransitionGroup, null, h('span', null, 'a')))
    const ro = StubResizeObserver.last
    expect(ro?.disconnected).toBe(false)
    unmount()
    expect(ro?.disconnected).toBe(true)
  })
})
