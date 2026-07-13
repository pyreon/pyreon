/** @jsxImportSource @pyreon/core */
import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { queryOptional } from '@pyreon/test-utils'
import kinetic from '../kinetic'

// ── Stagger transition-delay survives applyEnter (real-Chromium ONLY) ────
//
// Bug class: `el.style.transition = enterTransition` assigns the CSS
// `transition` SHORTHAND, which resets the `transition-delay` longhand to
// `0s` in spec-compliant engines (Chromium / Firefox). Kinetic's stagger
// bakes the per-child delay onto `transition-delay` — so for the STYLE /
// preset stagger path (which sets `enterTransition`), the delay was
// clobbered the instant the enter animation started: EVERY child animated
// simultaneously, defeating the whole point of `.stagger()`.
//
// This was invisible to the unit suite because happy-dom does NOT model
// the shorthand→longhand reset (verified: `el.style.transition = 'opacity
// 300ms'` leaves `el.style.transitionDelay` untouched in happy-dom, reset
// to `''` in Chromium). The existing StaggerRenderer specs assert the
// delay on the render-time VNODE, never on the DOM element AFTER
// `applyEnter` mutated it — so only a real browser catches this.
//
// The fix: kinetic assigns the transition shorthand through a helper that
// preserves a stable `--kinetic-delay` custom property (survives the
// shorthand AND the `transition=''` reset at 'entered', so multi-cycle
// staggers keep their delay) plus a first-cycle inline `transition-delay`
// fallback.
//
// Bisect-verified: revert `setTransition` in utils.ts back to a bare
// `el.style.transition = value` → item[1]/item[2] read `transitionDelay:
// ''` (`expected '' to be '80ms'`); restore → they read '80ms'/'160ms'.

describe('@pyreon/kinetic stagger transition-delay (real DOM)', () => {
  const mountStagger = (interval: number) => {
    const Staggered = kinetic('ul')
      .enter({ opacity: 0 })
      .enterTo({ opacity: 1 })
      .enterTransition('opacity 300ms ease-out')
      .leave({ opacity: 1 })
      .leaveTo({ opacity: 0 })
      .leaveTransition('opacity 200ms ease-in')
      .stagger({ interval })
    const show = signal(false)
    const mounted = mountInBrowser(
      h(Staggered, { show, 'data-id': 'stagger-list' }, [
        h('li', { key: 'a' }, 'first'),
        h('li', { key: 'b' }, 'second'),
        h('li', { key: 'c' }, 'third'),
      ]),
    )
    return { ...mounted, show }
  }

  it('preserves each child transition-delay after the enter shorthand is applied (style/preset path)', async () => {
    const { container, unmount, show } = mountStagger(80)
    const list = queryOptional<HTMLElement>(container, '[data-id="stagger-list"]')
    expect(list).not.toBeNull()

    // Flip show → true: each per-item TransitionItem runs applyEnter, which
    // assigns `el.style.transition = 'opacity 300ms ease-out'`.
    show.set(true)
    await flush()

    const items = Array.from(list!.querySelectorAll('li'))
    expect(items.length).toBe(3)

    // After applyEnter, the per-child stagger delay MUST still be present.
    // Broken (bare shorthand): the shorthand reset transition-delay to '0s'
    // for EVERY item → no stagger. item[0]'s delay is 0 (serialized '0s' or
    // '0ms'); the load-bearing assertions are the non-zero items[1]/[2].
    expect(['0ms', '0s']).toContain(items[0]!.style.transitionDelay)
    expect(items[1]!.style.transitionDelay).toBe('80ms')
    expect(items[2]!.style.transitionDelay).toBe('160ms')

    unmount()
  })

  it('exposes a stable --kinetic-delay custom property per child', async () => {
    const { container, unmount, show } = mountStagger(100)
    const list = queryOptional<HTMLElement>(container, '[data-id="stagger-list"]')
    show.set(true)
    await flush()
    const items = Array.from(list!.querySelectorAll('li'))
    // The custom property survives BOTH the transition shorthand reset AND a
    // later `transition=''` — the stable source of the stagger delay across
    // multiple show cycles.
    expect(items[0]!.style.getPropertyValue('--kinetic-delay')).toBe('0ms')
    expect(items[1]!.style.getPropertyValue('--kinetic-delay')).toBe('100ms')
    expect(items[2]!.style.getPropertyValue('--kinetic-delay')).toBe('200ms')
    unmount()
  })
})
