/**
 * In-page benchmark scenarios (bundled + injected by `run.ts`, executed in
 * real Chromium). Measures the SYNCHRONOUS framework JS overhead each library
 * pays to REVEAL N pre-existing elements with an equivalent enter animation —
 * NOT animation smoothness (the browser compositor drives the actual tween
 * identically for every CSS-transition / WAAPI library, so it is not a
 * framework axis).
 *
 * Fairness contract:
 *   - Element creation is done in an UN-timed setup phase (constant across
 *     libraries); only the reveal trigger is timed.
 *   - Every library animates the SAME visual: opacity 0→1 + translateY 16→0
 *     over 300ms ease-out.
 *   - The timed block flushes exactly one microtask — kinetic's commit
 *     boundary (its enter effect) — which the synchronous WAAPI/baseline
 *     paths also pay, so no library gets a free async deferral.
 *   - A correctness gate asserts each library actually produced N elements in
 *     a real reveal state before a sample counts.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { animate, stagger as motionStagger } from 'motion'
import kinetic from '../src/kinetic'

const DURATION_S = 0.3
const ENTER_TRANSITION = 'opacity 300ms ease-out, transform 300ms ease-out'

// ─── Shared CSS for the bare-CSS baseline (the theoretical floor) ────────────
const BASELINE_CSS = `
.k-bench-hidden { opacity: 0; transform: translateY(16px); transition: ${ENTER_TRANSITION}; }
.k-bench-shown  { opacity: 1; transform: translateY(0); }
`
function ensureBaselineStyle(): void {
  if (document.getElementById('k-bench-style')) return
  const style = document.createElement('style')
  style.id = 'k-bench-style'
  style.textContent = BASELINE_CSS
  document.head.appendChild(style)
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
    const disposers: Array<() => void> = []
    for (let i = 0; i < n; i++) {
      const dispose = mount(
        h(KineticEnterDiv, { show }, h('span', null, `row ${i}`)),
        container,
      )
      disposers.push(dispose)
    }
    ;(container as unknown as { __disp: Array<() => void> }).__disp = disposers
    return () => show.set(true)
  },
  verify(container) {
    const els = container.querySelectorAll<HTMLElement>(':scope > div')
    if (els.length === 0) return false
    // After reveal the enter transition is set on each element.
    for (const el of els) if (!el.style.transition) return false
    return true
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
    return container.querySelectorAll('li').length === n
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
    return container.querySelectorAll<HTMLElement>(':scope > div').length === n
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
    return container.querySelectorAll<HTMLElement>(':scope > div').length === n
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
    return container.querySelectorAll('.k-bench-shown').length === n
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
    return container.querySelectorAll('.k-bench-shown').length === n
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

async function measureOne(impl: Impl, n: number): Promise<number | null> {
  const container = freshContainer()
  try {
    const trigger = impl.setup(container, n)
    // Commit the hidden initial state (layout flush) BEFORE timing the reveal.
    void container.offsetHeight
    const t0 = performance.now()
    trigger()
    // Flush one microtask — kinetic's enter effect commit boundary. The
    // synchronous WAAPI/baseline paths pay the same turn, so it's neutral.
    await Promise.resolve()
    const t1 = performance.now()
    if (!impl.verify(container, n)) return null
    return t1 - t0
  } finally {
    impl.teardown?.(container)
    container.remove()
  }
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
  for (let i = 0; i < warmup; i++) await measureOne(impl, n)
  const times: number[] = []
  for (let i = 0; i < samples; i++) {
    const ms = await measureOne(impl, n)
    if (ms == null) throw new Error(`correctness gate failed for ${lib}/${op}`)
    times.push(ms)
  }
  return times
}

;(globalThis as unknown as { __kbench: unknown }).__kbench = { runScenario }
