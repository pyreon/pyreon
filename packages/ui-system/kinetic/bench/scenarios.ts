/**
 * In-page benchmark scenarios (bundled + injected by `run.ts`, executed in
 * real Chromium). Measures the main-thread framework JS each library runs to
 * REVEAL N pre-existing elements with an equivalent enter animation, from the
 * reveal trigger until the END STATE is reached — NOT animation smoothness
 * (the browser compositor drives the actual tween identically for every
 * CSS-transition / WAAPI library, so it is not a framework axis).
 *
 * Fairness contract:
 *   - Element creation is done in an UN-timed setup phase (constant across
 *     libraries), followed by two un-timed settle frames so no setup-scheduled
 *     frame work leaks into the timed window.
 *   - Every library animates the SAME visual: opacity 0→1 + translateY 16→0
 *     over 300ms ease-out.
 *   - ONE end point for every arm: the timed window runs from the trigger
 *     through the SECOND animation frame after it. kinetic applies its
 *     enter-to state inside a batched double-rAF (`utils.ts:nextFrame`), and
 *     Motion One may defer work to its own frame loop — an earlier version
 *     closed the window after one microtask, which left kinetic's frame work
 *     (and any deferred Motion work) UN-timed. Idle time between frames and
 *     the browser's own style/layout/paint are excluded identically for every
 *     arm: only JS inside the window is summed —
 *       (trigger → microtasks drained) + frame-1 JS + frame-2 JS,
 *     where each frame's JS is bracketed by a sentinel rAF callback that runs
 *     FIRST in that frame and one that runs LAST (registration order = run
 *     order for rAF callbacks).
 *   - A correctness gate asserts the END state for every arm before a sample
 *     counts: every one of the N elements has a started animation
 *     (`getAnimations()` non-empty — a CSS transition for kinetic/baseline,
 *     WAAPI for Motion) AND carries its arm's target (enter-to) state.
 */
import { Fragment, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { animate, stagger as motionStagger } from 'motion'
import kinetic from '../src/kinetic'

const DURATION_S = 0.3
const ENTER_TRANSITION = 'opacity 300ms ease-out, transform 300ms ease-out'

// ─── Shared CSS for the bare-CSS baseline (the theoretical floor) ────────────
// The `transition` must be on the AFTER-change (shown) style — CSS starts a
// transition from the after-change style's `transition-*` properties. An
// earlier version declared it only on `.k-bench-hidden`, so removing that
// class dropped the transition and the "floor" never animated at all (caught
// by the end-state `getAnimations()` gate below).
const BASELINE_CSS = `
.k-bench-hidden { opacity: 0; transform: translateY(16px); transition: ${ENTER_TRANSITION}; }
.k-bench-shown  { opacity: 1; transform: translateY(0); transition: ${ENTER_TRANSITION}; }
`
function ensureBaselineStyle(): void {
  if (document.getElementById('k-bench-style')) return
  const style = document.createElement('style')
  style.id = 'k-bench-style'
  style.textContent = BASELINE_CSS
  document.head.appendChild(style)
}

// ─── End-state helpers (shared correctness criterion) ─────────────────────────

/** Every element has at least one started animation (CSS transition or WAAPI). */
function allAnimating(els: ArrayLike<Element>, n: number): boolean {
  if (els.length !== n) return false
  for (let i = 0; i < els.length; i++) {
    if (els[i]!.getAnimations().length === 0) return false
  }
  return true
}

/** Every element carries the inline enter-to styles (opacity 1, translateY 0). */
function allAtInlineEnterTo(els: ArrayLike<HTMLElement>): boolean {
  for (let i = 0; i < els.length; i++) {
    const st = els[i]!.style
    if (st.opacity !== '1') return false
    if (!/translateY\(0(px)?\)/.test(st.transform)) return false
  }
  return true
}

// ─── Impl contract ───────────────────────────────────────────────────────────
type Impl = {
  /** Create N elements in their hidden/initial state; return a reveal trigger. */
  setup: (container: HTMLElement, n: number) => () => void
  /** Assert N elements exist in a real reveal state (the correctness gate). */
  verify: (container: HTMLElement, n: number) => boolean
  /** Optional teardown (dispose mounted trees). */
  teardown?: (container: HTMLElement) => void
}

// ─── kinetic — idiomatic component API ───────────────────────────────────────

const KineticEnterDiv = kinetic('div')
  .enter({ opacity: 0, transform: 'translateY(16px)' })
  .enterTo({ opacity: 1, transform: 'translateY(0)' })
  .enterTransition(ENTER_TRANSITION)

const kineticEnter: Impl = {
  setup(container, n) {
    const show = signal(false)
    // ONE mount of N sibling components. `mount()` CLEARS its container
    // (`container.innerHTML = ''`), so an earlier version that called
    // `mount()` once PER row left exactly ONE element in the DOM (plus N-1
    // detached trees still subscribed to `show`) — the "N elements" kinetic
    // arm was never comparable to the N-element Motion/baseline arms. Caught
    // by the end-state gate counting N animated elements.
    const rows: unknown[] = []
    for (let i = 0; i < n; i++) rows.push(h(KineticEnterDiv, { show }, h('span', null, `row ${i}`)))
    const dispose = mount(h(Fragment, null, ...rows), container)
    ;(container as unknown as { __disp: Array<() => void> }).__disp = [dispose]
    return () => show.set(true)
  },
  verify(container, n) {
    const els = container.querySelectorAll<HTMLElement>(':scope > div')
    return allAtInlineEnterTo(els) && allAnimating(els, n)
  },
  teardown(container) {
    const d = (container as unknown as { __disp?: Array<() => void> }).__disp
    if (d) for (const fn of d) fn()
  },
}

const KineticStaggerUl = kinetic('ul')
  .enter({ opacity: 0, transform: 'translateY(16px)' })
  .enterTo({ opacity: 1, transform: 'translateY(0)' })
  .enterTransition(ENTER_TRANSITION)
  .stagger({ interval: 20 })

const kineticStagger: Impl = {
  setup(container, n) {
    const show = signal(false)
    const items: unknown[] = []
    for (let i = 0; i < n; i++) items.push(h('li', { key: i }, `row ${i}`))
    const dispose = mount(h(KineticStaggerUl, { show }, items), container)
    ;(container as unknown as { __disp: Array<() => void> }).__disp = [dispose]
    return () => show.set(true)
  },
  verify(container, n) {
    // <li> exist pre-reveal, so a count alone proves nothing — assert the
    // enter-to state was applied and the transition actually started.
    const els = container.querySelectorAll<HTMLElement>('li')
    return allAtInlineEnterTo(els) && allAnimating(els, n)
  },
  teardown(container) {
    const d = (container as unknown as { __disp?: Array<() => void> }).__disp
    if (d) for (const fn of d) fn()
  },
}

// ─── Motion One (vanilla `animate`) ──────────────────────────────────────────

function makeRawRows(container: HTMLElement, n: number): HTMLElement[] {
  const els: HTMLElement[] = []
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div')
    el.style.opacity = '0'
    el.style.transform = 'translateY(16px)'
    el.textContent = `row ${i}`
    container.appendChild(el)
    els.push(el)
  }
  return els
}

const motionEnter: Impl = {
  setup(container, n) {
    const els = makeRawRows(container, n)
    return () => {
      for (const el of els) {
        animate(
          el,
          { opacity: [0, 1], transform: ['translateY(16px)', 'translateY(0px)'] },
          { duration: DURATION_S, ease: 'easeOut' },
        )
      }
    }
  },
  verify(container, n) {
    // Rows exist pre-reveal; assert every one has a started WAAPI animation.
    return allAnimating(container.querySelectorAll<HTMLElement>(':scope > div'), n)
  },
}

const motionStaggerImpl: Impl = {
  setup(container, n) {
    const els = makeRawRows(container, n)
    return () => {
      animate(
        els,
        { opacity: [0, 1], transform: ['translateY(16px)', 'translateY(0px)'] },
        { duration: DURATION_S, ease: 'easeOut', delay: motionStagger(0.02) },
      )
    }
  },
  verify(container, n) {
    // Rows exist pre-reveal; assert every one has a started WAAPI animation.
    return allAnimating(container.querySelectorAll<HTMLElement>(':scope > div'), n)
  },
}

// ─── Bare-CSS baseline (the floor — hand-rolled CSS transitions) ─────────────

const baselineEnter: Impl = {
  setup(container, n) {
    ensureBaselineStyle()
    const els: HTMLElement[] = []
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div')
      el.className = 'k-bench-hidden'
      el.textContent = `row ${i}`
      container.appendChild(el)
      els.push(el)
    }
    return () => {
      for (const el of els) {
        el.classList.remove('k-bench-hidden')
        el.classList.add('k-bench-shown')
      }
    }
  },
  verify(container, n) {
    const els = container.querySelectorAll<HTMLElement>(':scope > div')
    return container.querySelectorAll('.k-bench-shown').length === n && allAnimating(els, n)
  },
}

const baselineStagger: Impl = {
  setup(container, n) {
    ensureBaselineStyle()
    const els: HTMLElement[] = []
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div')
      el.className = 'k-bench-hidden'
      el.style.transitionDelay = `${i * 20}ms`
      el.textContent = `row ${i}`
      container.appendChild(el)
      els.push(el)
    }
    return () => {
      for (const el of els) {
        el.classList.remove('k-bench-hidden')
        el.classList.add('k-bench-shown')
      }
    }
  },
  verify(container, n) {
    const els = container.querySelectorAll<HTMLElement>(':scope > div')
    return container.querySelectorAll('.k-bench-shown').length === n && allAnimating(els, n)
  },
}

const IMPLS: Record<string, Record<string, Impl>> = {
  kinetic: { enter: kineticEnter, stagger: kineticStagger },
  motion: { enter: motionEnter, stagger: motionStaggerImpl },
  baseline: { enter: baselineEnter, stagger: baselineStagger },
}

// ─── Measurement ─────────────────────────────────────────────────────────────

function freshContainer(): HTMLElement {
  const c = document.createElement('div')
  document.body.appendChild(c)
  return c
}

let lastFailure = ''

/** Observed state of the first revealed element, for the gate's error message. */
function describeEndState(container: HTMLElement): string {
  const els = container.querySelectorAll<HTMLElement>(':scope > div, li')
  const el = els[0]
  if (!el) return 'no elements'
  return (
    `elements=${els.length} first: opacity=${JSON.stringify(el.style.opacity)} ` +
    `transform=${JSON.stringify(el.style.transform)} class=${JSON.stringify(el.className)} ` +
    `animations=${el.getAnimations().length}`
  )
}

const nextAnimationFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()))

/** Resolves in a fresh TASK — i.e. after the microtask queue fully drains. */
const afterMicrotasksDrain = (): Promise<void> =>
  new Promise((resolve) => {
    const ch = new MessageChannel()
    ch.port1.onmessage = () => {
      ch.port1.close()
      resolve()
    }
    ch.port2.postMessage(0)
  })

async function measureOne(impl: Impl, n: number): Promise<number | null | 'retry'> {
  const container = freshContainer()
  try {
    const trigger = impl.setup(container, n)
    // Commit the hidden initial state (layout flush) and let any frame work
    // scheduled by setup run BEFORE timing the reveal.
    void container.offsetHeight
    await nextAnimationFrame()
    await nextAnimationFrame()

    // Frame-START sentinels: registered before the trigger, so they run FIRST
    // in frame 1; frame-1's sentinel registers frame-2's before any library
    // callback in frame 1 can register its own frame-2 work.
    let a1 = 0
    let a2 = 0
    requestAnimationFrame(() => {
      a1 = performance.now()
      requestAnimationFrame(() => {
        a2 = performance.now()
      })
    })

    const t0 = performance.now()
    trigger()
    await afterMicrotasksDrain()
    const t1 = performance.now()
    // A rendering opportunity slipped in before the drain task: the pre-frame
    // segment would include browser render time. Discard and retry.
    if (a1 !== 0) return 'retry'

    // Frame-END sentinels: registered after every library's frame-1 work was
    // registered, so they run LAST in frames 1 and 2.
    let b1 = 0
    let b2 = 0
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        b1 = performance.now()
        requestAnimationFrame(() => {
          b2 = performance.now()
          resolve()
        })
      })
    })
    if (!impl.verify(container, n)) {
      lastFailure = describeEndState(container)
      return null
    }
    return t1 - t0 + (b1 - a1) + (b2 - a2)
  } finally {
    impl.teardown?.(container)
    container.remove()
  }
}

async function measureWithRetry(impl: Impl, n: number): Promise<number | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await measureOne(impl, n)
    if (r !== 'retry') return r
  }
  throw new Error('could not obtain a sample without an intervening frame (5 attempts)')
}

export async function runScenario(
  lib: string,
  op: string,
  n: number,
  warmup: number,
  samples: number,
): Promise<number[]> {
  const impl = IMPLS[lib]?.[op]
  if (!impl) throw new Error(`unknown scenario ${lib}/${op}`)
  for (let i = 0; i < warmup; i++) await measureWithRetry(impl, n)
  const times: number[] = []
  for (let i = 0; i < samples; i++) {
    const ms = await measureWithRetry(impl, n)
    if (ms == null) throw new Error(`correctness gate failed for ${lib}/${op} — observed: ${lastFailure}`)
    times.push(ms)
  }
  return times
}

;(globalThis as unknown as { __kbench: unknown }).__kbench = { runScenario }
