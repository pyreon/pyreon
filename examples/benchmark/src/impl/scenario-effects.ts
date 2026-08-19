/**
 * Scenario: **effect-heavy list**.
 *
 * WHAT IT MEASURES: 500 row components, each owning ONE independent
 * side-effecting subscription over its own value. Two timed ops and one gate:
 *
 *   - **update all** (timed) — every row's value changes, so all 500
 *     subscriptions must run. Breadth of dispatch.
 *   - **dispose** (timed) — unmount the list, tearing down all 500
 *     subscriptions. The suite's own record attributes its one lost row-list op
 *     (`clear rows`) to exactly this cost, and nothing has ever measured it
 *     directly.
 *   - **targeting** (gate, NOT timed) — a 1-row update must run exactly ONE
 *     subscription. Timing this is impossible against a forced layout; see the
 *     gate's own comment for the measurement that established that and why
 *     counting answers the question exactly.
 *
 * WHY IT IS WORTH MEASURING: the row-list suite times RENDER work. A
 * subscription that runs no DOM work at all is invisible to it, yet it is what
 * a signal graph's notify path and batch drain actually do — and the code on
 * that path has changed materially and recently (the write-time dirty cascade
 * and the tier-1 drain ordering).
 *
 * ## The gate, and why DOM verification is not enough here
 *
 * An effect can do work WITHOUT touching the DOM. So the usual "read the DOM
 * back" gate is structurally blind to a framework whose effects are still
 * queued when the timer stops — it would post a fast number for work it had not
 * done. Every op here therefore gates on the SINK, the subscriptions' own
 * output, and `update all` gates on the sink AND the DOM, because neither
 * implies the other.
 *
 * This is not hypothetical. **Preact schedules `useEffect` after the next
 * PAINT** (`options.requestAnimationFrame`, an rAF+setTimeout `afterPaint`
 * helper), so the microtask boundary every other Preact arm in this suite uses
 * provably cannot have run them. **React's `flushSync` is documented as
 * something that "may" run pending effects** — never "will". Both are resolved
 * the same way: give each framework its own documented escape hatch to collapse
 * scheduler latency, then let the sink gate PROVE the collapse actually
 * happened. A framework whose effects did not run fails the run instead of
 * winning it.
 *
 * ## Fairness
 *
 * - **Every row is a real component in every arm.** React cannot express an
 *   effect outside a component, so a loop of bare framework-level effects would
 *   compare 500 components against 500 raw subscriptions.
 * - **React and Preact subscribe per row via `useSyncExternalStore`** — React's
 *   own documented API for subscribing a component to an external store. The
 *   alternative (one array in parent state, immutably copied) would charge them
 *   an O(N) copy and an N-element re-render for a ONE-row update, which is a
 *   handicap this suite has already had to retract three times in other forms.
 * - **The effect bodies are byte-identical trivial work** in every arm (record
 *   the value, bump a counter). The measurement is dispatch, not the body.
 * - **Scheduler escape hatches are used uniformly** and are each the
 *   framework's own documented one: React `flushSync`, Svelte `flushSync`,
 *   Preact `options.requestAnimationFrame`, Vue default-`pre` + `nextTick`,
 *   Solid and Pyreon nothing (synchronous by construction). All of them are
 *   equally "not the production async path", which keeps the arms
 *   methodologically parallel and inside this suite's declared CPU-objective
 *   scope.
 */
import { h as ph } from '@pyreon/core'
import { batch as pyreonBatch, signal } from '@pyreon/reactivity'
import { mount as pyreonMount } from '@pyreon/runtime-dom'
import { h as preactH, options as preactOptions, render as preactRender } from 'preact'
import { memo as preactMemo, useSyncExternalStore as preactUseSyncExternalStore } from 'preact/compat'
import { useEffect as preactUseEffect } from 'preact/hooks'
import * as React from 'react'
import { flushSync as reactFlushSync } from 'react-dom'
import * as ReactDOM from 'react-dom/client'
import { batch as solidBatch, createComponent, createEffect, createSignal } from 'solid-js'
import { insert, render as solidRender, template } from 'solid-js/web'
import { flushSync as svelteFlushSync, mount as svelteMount, unmount as svelteUnmount } from 'svelte'
import { defineComponent, createApp, h as vueH, nextTick, ref, watchEffect } from 'vue'
import type { Ref } from 'vue'
import type { BenchSuite } from '../runner'
import { bench } from '../runner'
import FxList from './FxList.svelte'
import { setAll as svelteSetAll, setRow as svelteSetRow } from './effects-state.svelte'
import { PyreonFxList } from './scenario-effects-pyreon'
import {
  EFFECT_ROWS,
  EFFECT_SAMPLES,
  EFFECT_TARGET_ROW,
  EFFECT_TICKS,
  makeEffectSink,
  verifyEffectAll,
  verifyEffectDisposed,
  verifyEffectOne,
  type EffectSink,
} from './scenario-graph-shared'

export interface EffectsTarget {
  /** Mount the 500-row list into `host`; returns its teardown. */
  mount: (host: HTMLElement) => () => void
  /** Apply a full value set and return once subscriptions have run. */
  applyAll: (values: number[]) => void | Promise<void>
  /** Apply ONE row's value and return once its subscription has run. */
  applyOne: (index: number, value: number) => void | Promise<void>
}

// ─── Vanilla (baseline) ──────────────────────────────────────────────────────

function vanillaTarget(sink: EffectSink): EffectsTarget {
  const values = new Array<number>(EFFECT_ROWS).fill(-1)
  let texts: Text[] = []

  return {
    mount(host) {
      const list = document.createElement('div')
      list.className = 'fx-list'
      texts = []
      for (let i = 0; i < EFFECT_ROWS; i++) {
        const span = document.createElement('span')
        span.className = 'fx-row'
        const t = document.createTextNode(String(values[i]))
        span.appendChild(t)
        list.appendChild(span)
        texts.push(t)
      }
      host.appendChild(list)
      return () => list.remove()
    },
    applyAll(next) {
      for (let i = 0; i < EFFECT_ROWS; i++) {
        const v = next[i] as number
        values[i] = v
        ;(texts[i] as Text).data = String(v)
        // The hand-written stand-in for a subscription.
        sink.values[i] = v
        sink.runs++
      }
    },
    applyOne(index, value) {
      values[index] = value
      ;(texts[index] as Text).data = String(value)
      sink.values[index] = value
      sink.runs++
    },
  }
}

// ─── Pyreon ──────────────────────────────────────────────────────────────────

function pyreonTarget(sink: EffectSink): EffectsTarget {
  const sigs = Array.from({ length: EFFECT_ROWS }, () => signal(-1))
  const rows = sigs.map((s) => ({ value: () => s() }))

  return {
    mount(host) {
      return pyreonMount(ph(PyreonFxList as never, { rows, sink }), host)
    },
    applyAll(next) {
      // `batch()` is the documented way to group multiple signal writes —
      // CLAUDE.md lists "3+ signal updates without batch()" as an anti-pattern,
      // so this IS the idiomatic fast path, not a bench-only trick.
      pyreonBatch(() => {
        for (let i = 0; i < EFFECT_ROWS; i++) (sigs[i] as ReturnType<typeof signal<number>>).set(next[i] as number)
      })
    },
    applyOne(index, value) {
      // One write — no batch frame, for the same reason the memo arm omits it.
      ;(sigs[index] as ReturnType<typeof signal<number>>).set(value)
    },
  }
}

// ─── Solid ───────────────────────────────────────────────────────────────────
// Hand-written at the compiler's output level — no vite-plugin-solid here, the
// same constraint `impl/solid.ts` documents.

const _fxRowTmpl = template('<span class="fx-row"></span>')

function solidTarget(sink: EffectSink): EffectsTarget {
  const sigs = Array.from({ length: EFFECT_ROWS }, () => createSignal(-1))

  /**
   * A real Solid COMPONENT, invoked through `createComponent` — which is what
   * Solid's compiler emits for `<SolidFxRow …/>`.
   *
   * This is load-bearing for the `dispose` op, not cosmetic. Creating the 500
   * effects inline in one render loop would give Solid 500 subscriptions but
   * ZERO component boundaries, while every other arm creates 500 component
   * instances — so the teardown comparison would be measuring Pyreon's
   * per-component scope against Solid's bare effects and manufacturing a
   * Pyreon loss out of the bench's own asymmetry.
   */
  function SolidFxRow(props: { index: number }): HTMLElement {
    const [get] = sigs[props.index] as [() => number, (v: number) => void]
    const span = _fxRowTmpl() as HTMLElement
    insert(span, get)
    createEffect(() => {
      const v = get()
      sink.values[props.index] = v
      sink.runs++
    })
    return span
  }

  return {
    mount(host) {
      return solidRender(() => {
        const list = document.createElement('div')
        list.className = 'fx-list'
        for (let i = 0; i < EFFECT_ROWS; i++) {
          list.appendChild(createComponent(SolidFxRow, { index: i }) as HTMLElement)
        }
        return list
      }, host)
    },
    applyAll(next) {
      solidBatch(() => {
        for (let i = 0; i < EFFECT_ROWS; i++) {
          const [, set] = sigs[i] as [() => number, (v: number) => void]
          set(next[i] as number)
        }
      })
    },
    applyOne(index, value) {
      const [, set] = sigs[index] as [() => number, (v: number) => void]
      set(value)
    },
  }
}

// ─── External store shared by the React and Preact arms ──────────────────────
//
// `useSyncExternalStore` is React's documented API for subscribing a component
// to a value that lives outside React. Per-index subscriber sets give the
// same one-row-one-subscription granularity every other arm has; the
// `subscribe`/`getSnapshot` pairs are pre-built per index because both must be
// referentially stable across renders or the hook resubscribes every render.

interface RowStore {
  values: number[]
  subscribe: ((cb: () => void) => () => void)[]
  getSnapshot: (() => number)[]
  setOne: (i: number, v: number) => void
  setAll: (vs: number[]) => void
}

function makeRowStore(): RowStore {
  const values = new Array<number>(EFFECT_ROWS).fill(-1)
  const listeners: Set<() => void>[] = Array.from({ length: EFFECT_ROWS }, () => new Set())
  const subscribe = listeners.map((set) => (cb: () => void) => {
    set.add(cb)
    return () => {
      set.delete(cb)
    }
  })
  const getSnapshot = values.map((_, i) => () => values[i] as number)
  return {
    values,
    subscribe,
    getSnapshot,
    setOne(i, v) {
      values[i] = v
      for (const cb of listeners[i] as Set<() => void>) cb()
    },
    setAll(vs) {
      for (let i = 0; i < EFFECT_ROWS; i++) {
        values[i] = vs[i] as number
        for (const cb of listeners[i] as Set<() => void>) cb()
      }
    },
  }
}

// ─── React ───────────────────────────────────────────────────────────────────

function reactTarget(sink: EffectSink): EffectsTarget {
  const store = makeRowStore()

  const Row = React.memo(function Row({ index }: { index: number }) {
    const value = React.useSyncExternalStore(
      store.subscribe[index] as (cb: () => void) => () => void,
      store.getSnapshot[index] as () => number,
    )
    React.useEffect(() => {
      sink.values[index] = value
      sink.runs++
    }, [value, index])
    return React.createElement('span', { className: 'fx-row' }, value)
  })

  function List() {
    const children: React.ReactNode[] = []
    for (let i = 0; i < EFFECT_ROWS; i++) {
      children.push(React.createElement(Row, { key: i, index: i }))
    }
    return React.createElement('div', { className: 'fx-list' }, children)
  }

  let root: ReactDOM.Root | null = null

  return {
    mount(host) {
      root = ReactDOM.createRoot(host)
      const r = root
      reactFlushSync(() => r.render(React.createElement(List)))
      return () => r.unmount()
    },
    applyAll(next) {
      reactFlushSync(() => store.setAll(next))
    },
    applyOne(index, value) {
      reactFlushSync(() => store.setOne(index, value))
    },
  }
}

// ─── Preact ──────────────────────────────────────────────────────────────────

function preactTarget(sink: EffectSink): EffectsTarget {
  const store = makeRowStore()

  const Row = preactMemo(function Row({ index }: { index: number }) {
    const value = preactUseSyncExternalStore(
      store.subscribe[index] as (cb: () => void) => () => void,
      store.getSnapshot[index] as () => number,
    )
    preactUseEffect(() => {
      sink.values[index] = value
      sink.runs++
    }, [value, index])
    return preactH('span', { class: 'fx-row' }, value)
  })

  function List() {
    const children: unknown[] = []
    for (let i = 0; i < EFFECT_ROWS; i++) {
      children.push(preactH(Row as never, { key: i, index: i }))
    }
    return preactH('div', { class: 'fx-list' }, children)
  }

  return {
    mount(host) {
      preactRender(preactH(List, null), host)
      return () => preactRender(null, host)
    },
    async applyAll(next) {
      store.setAll(next)
      await Promise.resolve()
    },
    async applyOne(index, value) {
      store.setOne(index, value)
      await Promise.resolve()
    },
  }
}

// ─── Vue ─────────────────────────────────────────────────────────────────────
// `watchEffect` with Vue's DEFAULT `pre` flush: its docs place a `pre` watcher
// before the owner component's DOM update, and `nextTick()` waits for DOM
// updates to complete — so awaiting `nextTick` provably covers it. (`flush:
// 'post'` / `watchPostEffect` is NOT used: the docs do not assert that
// `nextTick` waits for post-flush watchers.)

function vueTarget(sink: EffectSink): EffectsTarget {
  const refs: Ref<number>[] = Array.from({ length: EFFECT_ROWS }, () => ref(-1))

  const Row = defineComponent({
    props: { index: { type: Number, required: true } },
    setup(props) {
      const r = refs[props.index] as Ref<number>
      watchEffect(() => {
        sink.values[props.index] = r.value
        sink.runs++
      })
      return () => vueH('span', { class: 'fx-row' }, r.value)
    },
  })

  const List = defineComponent({
    setup() {
      return () => {
        const children = []
        for (let i = 0; i < EFFECT_ROWS; i++) children.push(vueH(Row, { key: i, index: i }))
        return vueH('div', { class: 'fx-list' }, children)
      }
    },
  })

  let app: ReturnType<typeof createApp> | null = null

  return {
    mount(host) {
      app = createApp(List)
      const a = app
      a.mount(host)
      return () => a.unmount()
    },
    async applyAll(next) {
      for (let i = 0; i < EFFECT_ROWS; i++) (refs[i] as Ref<number>).value = next[i] as number
      await nextTick()
    },
    async applyOne(index, value) {
      ;(refs[index] as Ref<number>).value = value
      await nextTick()
    },
  }
}

// ─── Svelte ──────────────────────────────────────────────────────────────────

function svelteTarget(sink: EffectSink): EffectsTarget {
  let app: ReturnType<typeof svelteMount> | null = null

  return {
    mount(host) {
      app = svelteMount(FxList, { target: host, props: { sink } })
      svelteFlushSync()
      const a = app
      return () => {
        svelteUnmount(a)
      }
    },
    applyAll(next) {
      svelteSetAll(next)
      svelteFlushSync()
    },
    applyOne(index, value) {
      svelteSetRow(index, value)
      svelteFlushSync()
    },
  }
}

// ─── Runner ──────────────────────────────────────────────────────────────────

export const EFFECTS_FRAMEWORKS = [
  'Vanilla JS',
  'Pyreon',
  'React 19',
  'Preact',
  'Vue 3',
  'SolidJS',
  'Svelte 5',
] as const

export async function runEffects(
  frameworkName: string,
  container: HTMLElement,
): Promise<BenchSuite> {
  const suite: BenchSuite = { framework: frameworkName, container, results: [] }
  const sink = makeEffectSink()

  if (frameworkName === 'Preact') {
    // Preact schedules `useEffect` via `options.requestAnimationFrame` (an
    // rAF + setTimeout "afterPaint" helper), so a microtask boundary CANNOT
    // have run them — the arm would post a number for work it had not done.
    // This is Preact's own documented effect-scheduling hook, and collapsing it
    // is what `preact/test-utils`' `act()` does internally. It removes a full
    // frame of scheduler latency that is not CPU, exactly as `flushSync` does
    // for React and Svelte. The sink gate below proves the collapse worked.
    preactOptions.requestAnimationFrame = (cb: () => void) => {
      cb()
    }
  }

  let target: EffectsTarget
  switch (frameworkName) {
    case 'Vanilla JS':
      target = vanillaTarget(sink)
      break
    case 'Pyreon':
      target = pyreonTarget(sink)
      break
    case 'React 19':
      target = reactTarget(sink)
      break
    case 'Preact':
      target = preactTarget(sink)
      break
    case 'Vue 3':
      target = vueTarget(sink)
      break
    case 'SolidJS':
      target = solidTarget(sink)
      break
    case 'Svelte 5':
      target = svelteTarget(sink)
      break
    default:
      throw new Error(`[effects] unknown framework: ${frameworkName}`)
  }

  const host = document.createElement('div')
  container.appendChild(host)

  // ── Op 1: update all 500 rows ──────────────────────────────────────────────
  let teardown = target.mount(host)
  await target.applyAll(EFFECT_TICKS[0] as number[])
  verifyEffectAll(host, sink, EFFECT_TICKS[0] as number[])

  let cursor = 0
  let applied = EFFECT_TICKS[0] as number[]

  await bench(
    `effect list — update all ${EFFECT_ROWS} (${EFFECT_ROWS} subscriptions fire)`,
    suite,
    async () => {
      // Rotate the pre-built value sets so consecutive iterations always apply
      // DIFFERENT data — nothing can short-circuit on an unchanged value and no
      // input is loop-invariant.
      cursor = (cursor + 1) % EFFECT_SAMPLES
      applied = EFFECT_TICKS[cursor] as number[]
      await target.applyAll(applied)
    },
    { verify: (c) => verifyEffectAll(c, sink, applied) },
  )

  // ── Targeting GATE: one row changes ⇒ exactly one subscription runs ───────
  //
  // NOT TIMED, deliberately, and this is a measurement finding in its own right.
  //
  // A single targeted update is ~1µs of dispatch. Any instrument that can see
  // it must force a layout, and a forced layout of this 500-element list costs
  // ~750µs — the batch instrument forces TWO per cycle (precondition + post),
  // so the op measured ~1.5ms of Chromium layout in every arm. Measured:
  // Vanilla 1.50ms, React 1.51ms, Solid 1.54ms, Pyreon 1.55ms, Preact 1.47ms —
  // the hand-written floor and every framework inside 3% of each other. When
  // the floor equals the ceiling the instrument is measuring itself, and a
  // ratio between those numbers would be a ratio between two layouts.
  //
  // The QUESTION the op existed to answer — "does one row's change reach only
  // that row's subscription, or does the framework walk the list?" — has an
  // exact answer that needs no clock at all: count the subscription runs. So it
  // is asserted here as a hard gate. A framework that walks the list fails the
  // scenario instead of posting an unrankable number.
  const ONE_A = (EFFECT_TICKS[0] as number[])[EFFECT_TARGET_ROW] as number
  const ONE_B = (EFFECT_TICKS[1] as number[])[EFFECT_TARGET_ROW] as number

  await target.applyOne(EFFECT_TARGET_ROW, ONE_A)
  const runsBefore = sink.runs
  await target.applyOne(EFFECT_TARGET_ROW, ONE_B)
  const runsDelta = sink.runs - runsBefore

  verifyEffectOne(host, sink, ONE_B)

  if (runsDelta !== 1) {
    throw new Error(
      `[effects] targeting gate: a 1-row update ran ${runsDelta} subscriptions, expected ` +
        `exactly 1. The framework is not delivering the update straight to the one ` +
        `subscriber that depends on it.`,
    )
  }

  // ── Op 3: dispose the list (500 subscription teardowns) ────────────────────
  teardown()
  host.innerHTML = ''

  let live: (() => void) | null = null

  await bench(
    `effect list — dispose ${EFFECT_ROWS} rows (${EFFECT_ROWS} subscription teardowns)`,
    suite,
    () => {
      ;(live as () => void)()
      live = null
    },
    {
      reset: async () => {
        if (live) {
          live()
          live = null
        }
        // Guarantee a clean slate regardless of how completely each framework's
        // teardown empties the host.
        host.innerHTML = ''
        live = target.mount(host)
        await target.applyAll(EFFECT_TICKS[0] as number[])
      },
      verify: verifyEffectDisposed,
    },
  )

  if (live) (live as () => void)()
  host.remove()
  return suite
}
