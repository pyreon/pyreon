/**
 * Every kinetic prop read at SETUP froze — not just `show`.
 *
 * `show={sig}` rendering permanently invisible (fixed in #3387) was one member
 * of a class, not a one-off. The compiler emits ANY signal-bearing prop in
 * member position as an `_rp` thunk that `makeReactiveProps` installs as a
 * getter on `props`; every kinetic surface then destructured those getters, or
 * copied them into a `callbacks` / `transitionConfig` object, at component
 * setup — one read each, outside any tracking scope, keeping the first value
 * forever.
 *
 * Measured on the pre-fix tree, all four independently:
 *   - `<Transition onEnter={_rp(...)}>`  → the STALE handler fired (1), the
 *     current one never did (0).
 *   - `<Transition enter={_rp(...)}>`    → element got `cls-A` after the
 *     signal had moved to `cls-B`.
 *   - `<Stagger enter={_rp(...)}>`       → same, doubly so: `{...spread}` in
 *     this package's own JSX is a plain object spread that value-copies.
 *   - `kinetic('div')` + `onEnter`       → same as the first, via the
 *     `kineticProps` destructure.
 *
 * These specs feed the REAL compiled shape (`_rp(() => sig())`) through
 * `mount()` at every surface, with the plain-value and explicit-accessor forms
 * as controls so a fix that merely broke the static path cannot pass.
 *
 * The last block is the other half of the contract and the one that is easy to
 * get backwards: live must NOT mean tracked. These reads happen inside the
 * stage `watch`, and `watch` runs its callback in the effect's tracking scope,
 * so a tracked read would subscribe the state machine to its own configuration
 * — changing an easing string mid-flight would re-enter the callback and
 * RESTART the animation. `readLive` is untracked for exactly that reason.
 *
 * Bisect-verified — see the PR body for the per-spec failure text.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VNode } from '@pyreon/core'
import { _rp, h, makeReactiveProps } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { query, queryOptional } from '@pyreon/test-utils'
import Collapse from '../Collapse'
import Stagger from '../Stagger'
import Transition from '../Transition'
import TransitionGroup from '../TransitionGroup'
import { kinetic } from '../index'

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const c of cleanups.splice(0)) c()
  vi.restoreAllMocks()
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

/**
 * The shape the compiler actually emits for `x={sig}`. It is the only wrapper
 * these specs apply, because it is the only one most of these props ACCEPT:
 * `timeout` is the one whose declared type also admits an explicit accessor
 * (internal forwarding needs it), and it gets its own arm below. Everywhere
 * else the honest control is the plain static value — asserted per block — so
 * a "fix" that merely broke the static path cannot pass.
 */
const rp = <T,>(read: () => T) => _rp(read)

/** `timeout` alone: both the compiled getter and the documented accessor. */
const TIMEOUT_SHAPES = [
  ['_rp getter (the compiled `timeout={sig}` shape)', <T,>(read: () => T) => _rp(read)],
  ['explicit accessor (the widened type)', <T,>(read: () => T) => read],
] as const

const CLASSES = { enter: 'k-ing', enterFrom: 'k-from', enterTo: 'k-to', leaveTo: 'k-gone' }

// ─── callbacks ──────────────────────────────────────────────────────────────
// The sharpest member of the class: a callback is invoked on a stage change or
// a `transitionend` seconds later, so a frozen one calls into the closure the
// parent had at mount — and unlike a frozen class it leaves no visual trace.

describe('transition callbacks are read at the point of CALL', () => {
  {
    const [label, wrap] = ['_rp getter', rp] as const
    it(`<Transition>: ${label} — a swapped onEnter is the one that fires`, () => {
      const sig = signal(false)
      const stale = vi.fn()
      const fresh = vi.fn()
      const handler = signal(stale)
      mountIn(
        h(
          Transition,
          { show: () => sig(), onEnter: wrap(() => handler()), ...CLASSES },
          h('div', { 'data-id': 't' }, 'hi'),
        ),
      )
      handler.set(fresh)
      sig.set(true)
      expect(stale, 'the handler captured at mount must NOT fire').toHaveBeenCalledTimes(0)
      expect(fresh, 'the handler in force at the flip must fire').toHaveBeenCalledTimes(1)
    })

    it(`kinetic(tag): ${label} — a swapped onEnter is the one that fires`, () => {
      const K = kinetic('div')
      const sig = signal(false)
      const stale = vi.fn()
      const fresh = vi.fn()
      const handler = signal(stale)
      mountIn(
        h(
          K,
          { show: () => sig(), onEnter: wrap(() => handler()), 'data-id': 'k' },
          h('span', {}, 'hi'),
        ),
      )
      handler.set(fresh)
      sig.set(true)
      expect(stale).toHaveBeenCalledTimes(0)
      expect(fresh).toHaveBeenCalledTimes(1)
    })

    it(`kinetic(tag).collapse(): ${label} — a swapped onLeave is the one that fires`, () => {
      const K = kinetic('div').collapse()
      const sig = signal(true)
      const stale = vi.fn()
      const fresh = vi.fn()
      const handler = signal(stale)
      mountIn(
        h(K, { show: () => sig(), onLeave: wrap(() => handler()) }, h('span', {}, 'hi')),
      )
      handler.set(fresh)
      sig.set(false)
      expect(stale).toHaveBeenCalledTimes(0)
      expect(fresh).toHaveBeenCalledTimes(1)
    })

    // `<Collapse>` on the initially-HIDDEN path gates its content on
    // `<Show when={stage !== 'hidden'}>`, so `contentRef` is null when the
    // stage watcher runs and the callback branch bails — for the fixed and
    // the broken build alike (the same reason #3387's Collapse spec asserts
    // mounting rather than `onEnter`). Start SHOWN and assert the leave side,
    // which does have its refs.
    it(`<Collapse>: ${label} — a swapped onLeave is the one that fires`, () => {
      const sig = signal(true)
      const stale = vi.fn()
      const fresh = vi.fn()
      const handler = signal(stale)
      mountIn(h(Collapse, { show: () => sig(), onLeave: wrap(() => handler()) }, h('span', {}, 'hi')))
      handler.set(fresh)
      sig.set(false)
      expect(stale).toHaveBeenCalledTimes(0)
      expect(fresh).toHaveBeenCalledTimes(1)
    })
  }

  it('a PLAIN function callback still fires (static control)', () => {
    const sig = signal(false)
    const onEnter = vi.fn()
    mountIn(h(Transition, { show: () => sig(), onEnter, ...CLASSES }, h('div', {}, 'hi')))
    sig.set(true)
    expect(onEnter).toHaveBeenCalledTimes(1)
  })
})

// ─── class / style / transition config ──────────────────────────────────────
// Consumed by applyEnter / applyLeave on EVERY cycle, so the value that should
// win is the current one.

describe('class and style config are read per animation cycle', () => {
  {
    const [label, wrap] = ['_rp getter', rp] as const
    it(`<Transition>: ${label} — the enter class in force at the flip is applied`, () => {
      const sig = signal(false)
      const cls = signal('cls-A')
      const root = mountIn(
        h(
          Transition,
          { show: () => sig(), enter: wrap(() => cls()), leaveTo: 'k-gone' },
          h('div', { 'data-id': 't' }, 'hi'),
        ),
      )
      cls.set('cls-B')
      sig.set(true)
      const el = root.querySelector('[data-id="t"]')!
      expect(el.classList.contains('cls-B'), 'current class').toBe(true)
      expect(el.classList.contains('cls-A'), 'class captured at mount').toBe(false)
    })

    it(`<Stagger>: ${label} — forwarded through the spread, still live`, () => {
      const sig = signal(false)
      const cls = signal('cls-A')
      const root = mountIn(
        h(
          Stagger,
          { show: () => sig(), enter: wrap(() => cls()), leaveTo: 'k-gone' },
          h('div', { 'data-id': 'a' }, 'a'),
          h('div', { 'data-id': 'b' }, 'b'),
        ),
      )
      cls.set('cls-B')
      sig.set(true)
      for (const id of ['a', 'b']) {
        const el = root.querySelector(`[data-id="${id}"]`)!
        expect(el.classList.contains('cls-B'), id).toBe(true)
        expect(el.classList.contains('cls-A'), id).toBe(false)
      }
    })

    it(`<Transition>: ${label} — the enterTransition shorthand in force is written`, () => {
      const sig = signal(false)
      const dur = signal('opacity 100ms linear')
      const root = mountIn(
        h(
          Transition,
          { show: () => sig(), enterTransition: wrap(() => dur()), leaveTo: 'k-gone' },
          h('div', { 'data-id': 't' }, 'hi'),
        ),
      )
      dur.set('opacity 700ms linear')
      sig.set(true)
      const el = query(root, '[data-id="t"]')
      expect(el.style.transition).toContain('700ms')
    })

    it(`kinetic(tag).collapse(): ${label} — the transition in force is written`, () => {
      const K = kinetic('div').collapse()
      const sig = signal(true)
      const t = signal('height 100ms ease')
      const root = mountIn(
        h(K, { show: () => sig(), transition: wrap(() => t()) }, h('span', {}, 'hi')),
      )
      t.set('height 900ms ease')
      sig.set(false)
      expect((root.firstElementChild as HTMLElement).style.transition).toContain('900ms')
    })

    // Leave side, for the ref reason noted in the callbacks block above.
    it(`<Collapse>: ${label} — the transition in force is written`, () => {
      const sig = signal(true)
      const t = signal('height 100ms ease')
      const root = mountIn(
        h(Collapse, { show: () => sig(), transition: wrap(() => t()) }, h('span', {}, 'hi')),
      )
      t.set('height 900ms ease')
      sig.set(false)
      expect((root.firstElementChild as HTMLElement).style.transition).toContain('900ms')
    })
  }

  // ── static controls: the plain-value path must be untouched ──
  it('a plain string enter class still applies (static control)', () => {
    const sig = signal(false)
    const root = mountIn(
      h(
        Transition,
        { show: () => sig(), enter: 'plain-cls', leaveTo: 'k-gone' },
        h('div', { 'data-id': 't' }, 'hi'),
      ),
    )
    sig.set(true)
    expect(root.querySelector('[data-id="t"]')!.classList.contains('plain-cls')).toBe(true)
  })

  it('a plain enterTransition string is still written (static control)', () => {
    const sig = signal(false)
    const root = mountIn(
      h(
        Transition,
        { show: () => sig(), enterTransition: 'opacity 55ms linear', leaveTo: 'k-gone' },
        h('div', { 'data-id': 't' }, 'hi'),
      ),
    )
    sig.set(true)
    expect(query(root, '[data-id="t"]').style.transition).toContain('55ms')
  })

  it('a plain Collapse transition string is still written (static control)', () => {
    const sig = signal(true)
    const root = mountIn(
      h(Collapse, { show: () => sig(), transition: 'height 42ms ease' }, h('span', {}, 'hi')),
    )
    sig.set(false)
    expect((root.firstElementChild as HTMLElement).style.transition).toContain('42ms')
  })
})

// PARTIALLY COVERED, stated rather than left as a silent hole: `<TransitionGroup>`
// forwards a live `timeout` (asserted at the bottom of this file) but its JSX
// spread got the same `mergeProps` treatment as `<Stagger>`'s WITHOUT a spec
// that discriminates the spread itself. Its children are built
// inside a reactive accessor, so an ENTERING child's props are re-copied
// during that same re-run and read fresh either way; and a LEAVING child is
// re-mounted into the initially-hidden render path (verified: it receives
// `leaveTo` but never `leave` / `leaveFrom`, i.e. it is not animated at all),
// which reads its class at the new instance's setup — also fresh either way.
// Both halves of that are TransitionGroup behaviour this PR does not touch.
// The change is kept for correctness and consistency with `<Stagger>`, whose
// identical spread IS covered above and IS load-bearing.

// ─── timeout ────────────────────────────────────────────────────────────────
// The animation-end fallback deadline is re-armed on every active cycle, so it
// is a live value. Asserted on the ARMING (the delay handed to setTimeout)
// rather than by waiting it out — deterministic, and no fake timers.

describe('the animation-end deadline is armed with the CURRENT timeout', () => {
  const armedDelays = (): number[] => {
    const seen: number[] = []
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
      seen.push(ms as number)
      return 0 as unknown as ReturnType<typeof setTimeout>
    }) as typeof setTimeout)
    return seen
  }

  for (const [label, wrap] of TIMEOUT_SHAPES) {
    it(`<Transition>: ${label}`, () => {
      const sig = signal(false)
      const ms = signal(1000)
      const seen = armedDelays()
      mountIn(
        h(
          Transition,
          { show: () => sig(), timeout: wrap(() => ms()), ...CLASSES },
          h('div', {}, 'hi'),
        ),
      )
      ms.set(4321)
      sig.set(true)
      expect(seen, 'armed with the value in force, not the mount-time one').toContain(4321)
      expect(seen).not.toContain(1000)
    })

    it(`kinetic(tag): ${label}`, () => {
      const K = kinetic('div')
      const sig = signal(false)
      const ms = signal(1000)
      const seen = armedDelays()
      mountIn(h(K, { show: () => sig(), timeout: wrap(() => ms()) }, h('span', {}, 'hi')))
      ms.set(4321)
      sig.set(true)
      expect(seen).toContain(4321)
      expect(seen).not.toContain(1000)
    })

    it(`<Stagger>: ${label} — per-child deadline is base + delay, live`, () => {
      const sig = signal(false)
      const ms = signal(1000)
      const seen = armedDelays()
      mountIn(
        h(
          Stagger,
          { show: () => sig(), timeout: wrap(() => ms()), interval: 100, ...CLASSES },
          h('div', {}, 'a'),
          h('div', {}, 'b'),
        ),
      )
      ms.set(4000)
      sig.set(true)
      // child 0 → 4000 + 0, child 1 → 4000 + 100
      expect(seen).toContain(4000)
      expect(seen).toContain(4100)
      expect(seen).not.toContain(1000)
    })
  }
})

// ─── unmount ────────────────────────────────────────────────────────────────
// `<Show>` re-reads `props.fallback` on every flip, so the unmount policy is
// consulted on every hide. Asserted at the vnode level: the fallback is now an
// accessor, and what it returns must follow the signal.

describe('the unmount policy is consulted per hide, not captured at mount', () => {
  {
    const [label, wrap] = ['_rp getter', rp] as const
    it(`<Transition>: ${label}`, () => {
      const keep = signal(false) // unmount: false → keep with display:none
      // Through `makeReactiveProps`, because this spec calls the component
      // DIRECTLY (the fallback is only reachable off the returned `<Show>`
      // vnode). That step is what the mount pipeline does to turn an `_rp`
      // brand into the getter the freeze is about — without it the brand is
      // just a function sitting on props and the spec would prove nothing.
      const vnode = Transition(
        makeReactiveProps({
          show: () => true,
          unmount: wrap(() => keep()),
          children: h('div', {}, 'hi'),
        }) as never,
      )
      expect(vnode).not.toBeNull()
      const fallback = ((vnode as VNode).props as Record<string, unknown>).fallback as () => unknown
      expect(typeof fallback, 'fallback must be an accessor to stay live').toBe('function')
      expect(fallback(), 'unmount=false → the hidden clone').not.toBeNull()
      keep.set(true) // unmount: true → drop it
      expect(fallback(), 'unmount=true → nothing').toBeNull()
    })
  }

  // Not a liveness proof — a REGRESSION guard for the shape change. Turning
  // the fallback into an accessor has to leave the documented `unmount: false`
  // behaviour intact end to end: after the leave completes the child is still
  // in the DOM, hidden. (Note the read is untracked, so "live" here means
  // consulted afresh on each hide, not re-rendered when `unmount` alone moves.)
  it('the accessor fallback still MOUNTS the display:none clone after a leave', async () => {
    const sig = signal(true)
    const root = mountIn(
      h(
        Transition,
        { show: () => sig(), unmount: _rp(() => false), timeout: 5 },
        h('div', { 'data-id': 'fb' }, 'hi'),
      ),
    )
    expect(root.querySelector('[data-id="fb"]')).not.toBeNull()
    sig.set(false)
    await new Promise((r) => setTimeout(r, 60))
    const node = queryOptional(root, '[data-id="fb"]')
    expect(node, 'unmount:false keeps the child in the DOM').not.toBeNull()
    expect(node?.style.display).toBe('none')
  })

  // The other half of the decision: a prop that CANNOT change does not pay for
  // liveness. A static `unmount` keeps a plain-value fallback, so no nested
  // reactive boundary (effect + marker + closure, per hidden element) is
  // created for the default case.
  it('a STATIC unmount:false keeps the plain-value fallback (no boundary)', () => {
    const vnode = Transition({
      show: () => true,
      unmount: false,
      children: h('div', {}, 'hi'),
    } as never)
    expect(vnode).not.toBeNull()
    const fallback = ((vnode as VNode).props as Record<string, unknown>).fallback
    expect(typeof fallback, 'a static prop must not become an accessor').not.toBe('function')
    expect(fallback).not.toBeNull()
  })
})

// ─── readCallbacks (the reduced-motion path) ────────────────────────────────
// `readCallbacks` reads all four in one untrack frame, and its ONLY call sites
// are the `if (reducedMotion())` branches — which every other spec in the
// package drives with plain `vi.fn()`s, so its reason for existing went
// unproven. Under reduced motion the whole cycle collapses into that branch.

describe('readCallbacks is live on the reduced-motion path', () => {
  const withReducedMotion = (fn: () => void) => {
    const original = window.matchMedia
    window.matchMedia = ((q: string) =>
      ({
        matches: q.includes('prefers-reduced-motion'),
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList) as typeof window.matchMedia
    try {
      fn()
    } finally {
      window.matchMedia = original
    }
  }

  it('the swapped handlers are the ones the collapsed cycle calls', () => {
    withReducedMotion(() => {
      const sig = signal(false)
      const staleEnter = vi.fn()
      const freshEnter = vi.fn()
      const staleAfter = vi.fn()
      const freshAfter = vi.fn()
      const enter = signal(staleEnter)
      const after = signal(staleAfter)
      mountIn(
        h(
          Transition,
          {
            show: () => sig(),
            onEnter: _rp(() => enter()),
            onAfterEnter: _rp(() => after()),
            ...CLASSES,
          },
          h('div', {}, 'hi'),
        ),
      )
      enter.set(freshEnter)
      after.set(freshAfter)
      sig.set(true)
      expect(staleEnter).toHaveBeenCalledTimes(0)
      expect(staleAfter).toHaveBeenCalledTimes(0)
      expect(freshEnter).toHaveBeenCalledTimes(1)
      expect(freshAfter).toHaveBeenCalledTimes(1)
    })
  })
})

// ─── construction-time props stay construction-time ─────────────────────────
// Locking the DECISION, not just the behaviour: `appear` asks "animate on the
// FIRST mount?", and the latch it arms is spent once the ref wires up. Reading
// it live would imply a later value has somewhere to go. It does not.

describe('appear is deliberately construction-time', () => {
  // DOCUMENTS the decision; it is NOT a lock, and pretending otherwise would be
  // the count-assertion trap. `useTransitionState` computes `needsAppear` from a
  // value at setup, so flipping `appear` afterwards cannot animate under ANY
  // implementation of the read — live or frozen. Kept because the decision is
  // the non-obvious part; labelled because a spec that cannot fail must say so.
  it('flipping it after mount does not retroactively animate (documentation)', () => {
    const appear = signal(false)
    const onEnter = vi.fn()
    mountIn(
      h(
        Transition,
        { show: () => true, appear: _rp(() => appear()), onEnter, ...CLASSES },
        h('div', {}, 'hi'),
      ),
    )
    expect(onEnter).toHaveBeenCalledTimes(0)
    appear.set(true)
    expect(onEnter, 'the first-mount question is already answered').toHaveBeenCalledTimes(0)
  })
})

// ─── applied once, removed later: read once and REMEMBER ────────────────────
// The near-miss this PR's own review caught. Making the transition config live
// while the initially-hidden render's bake stayed a setup read let the two
// disagree: `applyEnter`'s `removeClasses(el, leaveTo)` stripped the CURRENT
// class while the element still wore the one it was born with, so it entered
// still carrying its hidden state. With `opacity: 0` on that class — the
// scroll-reveal / preset shape the branch exists for — the element enters and
// stays invisible, which is exactly the freeze this PR set out to remove.

describe('the enter removes the hidden class the render actually applied', () => {
  it('a `leaveTo` that moved between mount and enter leaves nothing behind', () => {
    const sig = signal(false)
    const hidden = signal('hidden-old')
    const root = mountIn(
      h(
        Transition,
        { show: () => sig(), leaveTo: _rp(() => hidden()), enter: 'k-enter' },
        h('div', { 'data-id': 'x' }, 'hi'),
      ),
    )
    const el = query(root, '[data-id="x"]')
    expect(el.classList.contains('hidden-old'), 'baked at the initial render').toBe(true)
    hidden.set('hidden-new')
    sig.set(true)
    expect(el.classList.contains('hidden-old'), 'the class the element was BORN with').toBe(false)
    expect(el.classList.contains('hidden-new'), 'the current one was never applied').toBe(false)
    expect(el.classList.contains('k-enter')).toBe(true)
  })

  it('the same for the `enterFrom` fallback (no leaveTo configured)', () => {
    const sig = signal(false)
    const from = signal('from-old')
    const root = mountIn(
      h(
        Transition,
        { show: () => sig(), enterFrom: _rp(() => from()), enter: 'k-enter' },
        h('div', { 'data-id': 'y' }, 'hi'),
      ),
    )
    const el = query(root, '[data-id="y"]')
    expect(el.classList.contains('from-old')).toBe(true)
    from.set('from-new')
    sig.set(true)
    expect(el.classList.contains('from-old'), 'the baked pre-enter class').toBe(false)
  })
})

// ─── live must not mean tracked ─────────────────────────────────────────────

describe('a live config read must NOT subscribe the state machine to itself', () => {
  it('changing the enter class mid-flight does not restart the animation', () => {
    const sig = signal(false)
    const cls = signal('cls-A')
    const onEnter = vi.fn()
    mountIn(
      h(
        Transition,
        { show: () => sig(), ...CLASSES, enter: _rp(() => cls()), onEnter },
        h('div', {}, 'hi'),
      ),
    )
    sig.set(true)
    expect(onEnter).toHaveBeenCalledTimes(1)
    // A tracked read inside the stage `watch` would re-enter the callback here
    // and fire `onEnter` a second time — an animation restarting because its
    // own styling changed.
    cls.set('cls-B')
    cls.set('cls-C')
    expect(onEnter, 'config changes must not re-trigger the cycle').toHaveBeenCalledTimes(1)
  })

  it('changing a callback does not restart the animation either', () => {
    const sig = signal(false)
    const a = vi.fn()
    const b = vi.fn()
    const handler = signal(a)
    mountIn(
      h(
        Transition,
        { show: () => sig(), onEnter: _rp(() => handler()), ...CLASSES },
        h('div', {}, 'hi'),
      ),
    )
    sig.set(true)
    expect(a).toHaveBeenCalledTimes(1)
    handler.set(b)
    expect(b, 'swapping the handler must not itself fire it').toHaveBeenCalledTimes(0)
  })
})

// ─── the forwarding thunks are actually invoked ─────────────────────────────
// Making these props live turned several plain values into thunks. A thunk
// that is created but never CALLED would leave the liveness unproven at the
// far end of the forward, so each one is driven here through a real cycle.

describe('the live forwards are exercised end to end', () => {
  const settle = () => new Promise((r) => setTimeout(r, 60))

  it('<Stagger>: the last child\'s onAfterLeave thunk fires with the CURRENT handler', async () => {
    const sig = signal(true)
    const stale = vi.fn()
    const fresh = vi.fn()
    const handler = signal(stale)
    mountIn(
      h(
        Stagger,
        { show: () => sig(), onAfterLeave: _rp(() => handler()), timeout: 5, ...CLASSES },
        h('div', {}, 'a'),
        h('div', {}, 'b'),
      ),
    )
    handler.set(fresh)
    sig.set(false)
    await settle()
    expect(stale).toHaveBeenCalledTimes(0)
    expect(fresh).toHaveBeenCalledTimes(1)
  })

  it('kinetic(tag).stagger(): the same forward, through the internal renderer', async () => {
    const K = kinetic('ul').stagger({ interval: 1 })
    const sig = signal(true)
    const stale = vi.fn()
    const fresh = vi.fn()
    const handler = signal(stale)
    mountIn(
      h(
        K,
        { show: () => sig(), onAfterLeave: _rp(() => handler()), timeout: 5 },
        h('li', {}, 'a'),
        h('li', {}, 'b'),
      ),
    )
    handler.set(fresh)
    sig.set(false)
    await settle()
    expect(stale).toHaveBeenCalledTimes(0)
    expect(fresh).toHaveBeenCalledTimes(1)
  })

  it('<TransitionGroup>: an entering child arms its deadline from the live timeout', async () => {
    const items = signal([1])
    const ms = signal(9999)
    const seen: number[] = []
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, t?: number) => {
      seen.push(t as number)
      return 0 as unknown as ReturnType<typeof setTimeout>
    }) as typeof setTimeout)
    mountIn(
      h(TransitionGroup, {
        timeout: _rp(() => ms()),
        ...CLASSES,
        children: () => items().map((n) => h('div', { key: n, 'data-id': `t${n}` }, String(n))),
      }),
    )
    ms.set(2468)
    items.set([1, 2]) // key 2 enters → useAnimationEnd arms
    expect(seen).toContain(2468)
    expect(seen).not.toContain(9999)
  })

  it('kinetic(tag) unmount:false — the renderer fallback accessor mounts the hidden node', async () => {
    const K = kinetic('div')
    const sig = signal(true)
    const root = mountIn(
      h(K, { show: () => sig(), unmount: _rp(() => false), timeout: 5, 'data-id': 'ku' }, h('span', {}, 'hi')),
    )
    expect(root.querySelector('[data-id="ku"]')).not.toBeNull()
    sig.set(false)
    await settle()
    const node = queryOptional(root, '[data-id="ku"]')
    expect(node, 'unmount:false keeps it mounted').not.toBeNull()
    expect(node?.style.display).toBe('none')
  })

  it('<Transition>: duration/easing resolve to the shorthand per cycle', () => {
    const sig = signal(false)
    const ms = signal(120)
    const root = mountIn(
      h(
        Transition,
        { show: () => sig(), duration: _rp(() => ms()), easing: 'linear', leaveTo: 'k-gone' },
        h('div', { 'data-id': 'd' }, 'hi'),
      ),
    )
    ms.set(880)
    sig.set(true)
    expect((query(root, '[data-id="d"]') as HTMLElement).style.transition).toContain('880ms')
  })

  it('<Transition>: duration/easing default when only one side is given', () => {
    const sig = signal(false)
    const root = mountIn(
      h(
        Transition,
        { show: () => sig(), enterDuration: 250, leaveTo: 'k-gone' },
        h('div', { 'data-id': 'd2' }, 'hi'),
      ),
    )
    sig.set(true)
    const t = (query(root, '[data-id="d2"]') as HTMLElement).style.transition
    expect(t).toContain('250ms')
    expect(t).toContain('ease-in-out')
  })
})
