/**
 * Scenario: **the memoization wall**.
 *
 * WHAT IT MEASURES: a source counter feeds a derived value that COLLAPSES it
 * (`bucket = floor(source / 64)`), and 300 consumer components render the
 * bucket. Two ops:
 *
 *   - **blocked** — `source` changes but `bucket` does NOT. A framework whose
 *     derived value short-circuits does one binding update (the source
 *     readout) and nothing else. A framework that propagates unconditionally
 *     pays the full 300-consumer fan-out for a value that did not change.
 *   - **passthrough** — `source` crosses a bucket boundary, so `bucket` really
 *     changes and all 300 consumers MUST update. The control: it proves the
 *     wall is a wall and not simply a broken binding, and it prices what the
 *     blocked op is avoiding.
 *
 * WHY IT IS WORTH MEASURING: dbmon already showed that when EVERYTHING
 * changes, fine-grained reactivity has no structural advantage (whole field
 * within 1.22×). This is the complement — the shape where a reactive graph's
 * entire claim is that it does NOT do work. If a framework cannot skip here,
 * it cannot skip anywhere, and "fine-grained" is not buying what it says.
 *
 * ## Fairness
 *
 * **The derived value is a NUMBER in every arm.** All three auto-short-circuiting
 * frameworks (Vue, Solid, Svelte) compare by IDENTITY, so a derived returning a
 * fresh object would silently defeat the short-circuit in three arms at once and
 * manufacture a Pyreon win. Vue's own performance guide calls this out
 * explicitly. A primitive is the only shape that compares like-for-like.
 *
 * **React/Preact cannot short-circuit at the derived level at all** — `useMemo`
 * over a number is inert, because numbers are already `===`-stable. Their wall
 * is the COMPONENT BOUNDARY: `memo()` on the consumer, comparing props with
 * `Object.is`. That is what react.dev prescribes and it is what these arms use;
 * a React arm with `useMemo` and no `memo` would measure nothing and would be a
 * handicap. Their honest residual cost is that the parent still re-renders and
 * re-creates 300 elements which then bail out — that is React's model, not a
 * bench artifact, and it is stated in the PR rather than hidden.
 *
 * **Pyreon ships TWO arms, deliberately.** `computed(fn)` does NOT gate on value
 * (`computed.ts` routes to the lazy path; only `computed(fn, { equals })`
 * compares), while Solid's `createMemo`, Vue's `computed` (3.4+) and Svelte's
 * `$derived` all short-circuit by default. Pyreon's own docs prescribe the
 * `{ equals }` form for exactly this requirement — reactivity.md's "Custom
 * Equality" section — so that is the primary, docs-faithful arm. The bare arm is
 * measured alongside because it is what the overwhelming majority of real
 * Pyreon code writes (1,522 bare `computed(` call sites in this repo against a
 * handful passing `equals`), and because the GENERATED reference currently tells
 * users the bare form already dedupes on `Object.is` — which is false. Reporting
 * only the favourable arm would hide the cost users are actually paying.
 */
import { h as ph } from '@pyreon/core'
import { computed, signal } from '@pyreon/reactivity'
import { mount as pyreonMount } from '@pyreon/runtime-dom'
import { Fragment as PreactFragment, h as preactH, options as preactOptions, render as preactRender } from 'preact'
import { memo as preactMemo } from 'preact/compat'
import { useMemo as preactUseMemo, useState as preactUseState } from 'preact/hooks'
import * as React from 'react'
import { flushSync as reactFlushSync } from 'react-dom'
import * as ReactDOM from 'react-dom/client'
import { createMemo, createSignal } from 'solid-js'
import { insert, render as solidRender, template } from 'solid-js/web'
import { flushSync as svelteFlushSync, mount as svelteMount, unmount as svelteUnmount } from 'svelte'
import { computed as vueComputed, createApp, defineComponent, h as vueH, nextTick, ref } from 'vue'
import type { BenchSuite } from '../runner'
import { bench } from '../runner'
import MemoWall from './MemoWall.svelte'
import { setSource as svelteSetSource } from './memo-state.svelte'
import { PyreonMemoWall } from './scenario-memo-pyreon'
import {
  MEMO_BLOCKED_BASE,
  MEMO_BLOCKED_BUCKET,
  MEMO_BUCKET,
  MEMO_CONSUMERS,
  MEMO_CROSS_BASE,
  MEMO_CROSS_FROM,
  MEMO_CROSS_TO,
  MEMO_K,
  memoProbe,
  verifyMemoConsumers,
} from './scenario-graph-shared'

/**
 * Every arm's `setSource` COMMITS before returning.
 *
 * The batch instrument calls `reset()` and `fn()` in the same region and probes
 * the DOM between them, so a framework whose reset had not committed would fail
 * its own precondition check. Folding the commit into the setter — rather than
 * using `BenchOptions.commit`, which only fires after `fn()` — is what makes the
 * precondition gate meaningful for the async frameworks.
 */
export interface MemoTarget {
  setSource: (n: number) => void | Promise<void>
  teardown: () => void
}

const bucketOf = (n: number): number => Math.floor(n / MEMO_BUCKET)

// ─── Vanilla (baseline) ──────────────────────────────────────────────────────
// Implements the wall by hand — a hand-written app WOULD keep the last bucket
// and skip the fan-out. This is the floor the frameworks are measured against,
// not a competitor.

function vanillaTarget(container: HTMLElement): MemoTarget {
  const root = document.createElement('div')
  root.className = 'memo-root'

  const sourceEl = document.createElement('span')
  sourceEl.className = 'memo-source'
  const sourceText = document.createTextNode('')
  sourceEl.appendChild(sourceText)

  const bucketEl = document.createElement('span')
  bucketEl.className = 'memo-bucket'
  const bucketText = document.createTextNode('')
  bucketEl.appendChild(bucketText)

  const consumersEl = document.createElement('div')
  consumersEl.className = 'memo-consumers'
  const consumerTexts: Text[] = []
  for (let i = 0; i < MEMO_CONSUMERS; i++) {
    const span = document.createElement('span')
    span.className = 'memo-consumer'
    const t = document.createTextNode('')
    span.appendChild(t)
    consumersEl.appendChild(span)
    consumerTexts.push(t)
  }

  root.append(sourceEl, bucketEl, consumersEl)
  container.appendChild(root)

  let lastBucket = Number.NaN

  return {
    setSource(n) {
      sourceText.data = String(n)
      const b = bucketOf(n)
      if (b !== lastBucket) {
        lastBucket = b
        const s = String(b)
        bucketText.data = s
        for (let i = 0; i < MEMO_CONSUMERS; i++) (consumerTexts[i] as Text).data = s
      }
    },
    teardown: () => root.remove(),
  }
}

// ─── Pyreon ──────────────────────────────────────────────────────────────────

/**
 * @param gated `true` → `computed(fn, { equals })`, the form reactivity.md's
 * "Custom Equality" section prescribes for suppressing downstream work on an
 * unchanged derived value. `false` → the bare `computed(fn)` that real Pyreon
 * code overwhelmingly writes, which notifies on every dependency change
 * regardless of whether the value moved.
 */
function pyreonTarget(container: HTMLElement, gated: boolean): MemoTarget {
  const source = signal(0)
  const bucket = gated
    ? computed(() => bucketOf(source()), { equals: Object.is })
    : computed(() => bucketOf(source()))

  const unmount = pyreonMount(
    ph(PyreonMemoWall as never, {
      source: () => source(),
      bucket: () => bucket(),
      count: MEMO_CONSUMERS,
    }),
    container,
  )

  return {
    // One signal write — no `batch()`, because there is exactly one write. The
    // documented anti-pattern is 3+ unbatched writes; wrapping a single write
    // would only add a batch frame every other arm avoids.
    setSource: (n) => {
      source.set(n)
    },
    teardown: unmount,
  }
}

// ─── Solid ───────────────────────────────────────────────────────────────────
// Hand-written at the compiler's output level (template/insert) — this app has
// no vite-plugin-solid, the same constraint `impl/solid.ts` documents.
//
// `createMemo`'s `equals` defaults to `===`, so the wall is automatic and
// nothing extra is passed; that IS Solid's documented behaviour.

const _memoRootTmpl = template(
  '<div class="memo-root"><span class="memo-source"></span><span class="memo-bucket"></span><div class="memo-consumers"></div></div>',
)
const _memoConsumerTmpl = template('<span class="memo-consumer"></span>')

function solidTarget(container: HTMLElement): MemoTarget {
  const [source, setSource] = createSignal(0)
  const bucket = createMemo(() => bucketOf(source()))

  const dispose = solidRender(() => {
    const root = _memoRootTmpl() as HTMLElement
    const sourceEl = root.firstChild as HTMLElement
    const bucketEl = sourceEl.nextSibling as HTMLElement
    const consumersEl = bucketEl.nextSibling as HTMLElement

    insert(sourceEl, source)
    insert(bucketEl, bucket)
    for (let i = 0; i < MEMO_CONSUMERS; i++) {
      const span = _memoConsumerTmpl() as HTMLElement
      insert(span, bucket)
      consumersEl.appendChild(span)
    }
    return root
  }, container)

  return {
    setSource: (n) => {
      setSource(n)
    },
    teardown: dispose,
  }
}

// ─── React ───────────────────────────────────────────────────────────────────

const ReactMemoConsumer = React.memo(function ReactMemoConsumer({ bucket }: { bucket: number }) {
  return React.createElement('span', { className: 'memo-consumer' }, bucket)
})

/**
 * The consumer list is its OWN memo'd component taking `bucket` as its only
 * prop.
 *
 * This is load-bearing, not tidiness. If the 300 consumer elements are created
 * inside the component that owns `source`, then a blocked update re-creates all
 * 300 element objects BEFORE the per-consumer `memo` gets a chance to bail —
 * so `memo` saves the child renders but not the element allocation, and the arm
 * pays an O(N) cost react.dev's own pattern is designed to avoid. Lifting the
 * list behind one `memo` boundary lets the ENTIRE subtree bail on an unchanged
 * `bucket`, which is what "skip re-rendering when props are the same" means.
 * Measured, this is the difference between ~107µs and the number below.
 */
const ReactMemoList = React.memo(function ReactMemoList({ bucket }: { bucket: number }) {
  const consumers: React.ReactNode[] = []
  for (let i = 0; i < MEMO_CONSUMERS; i++) {
    consumers.push(React.createElement(ReactMemoConsumer, { key: i, bucket }))
  }
  return React.createElement(React.Fragment, null, [
    React.createElement('span', { className: 'memo-bucket', key: 'b' }, bucket),
    React.createElement('div', { className: 'memo-consumers', key: 'c' }, consumers),
  ])
})

function reactTarget(container: HTMLElement): MemoTarget {
  let setSourceState: ((n: number) => void) | null = null

  function App() {
    const [source, setSource] = React.useState(0)
    setSourceState = setSource
    // Inert for a number by construction — numbers are already ===-stable. Kept
    // because it is the shape react.dev prescribes and omitting it would differ
    // from the documented pattern without cause. The wall is `React.memo`.
    const bucket = React.useMemo(() => bucketOf(source), [source])
    return React.createElement('div', { className: 'memo-root' }, [
      React.createElement('span', { className: 'memo-source', key: 's' }, source),
      React.createElement(ReactMemoList, { key: 'l', bucket }),
    ])
  }

  const root = ReactDOM.createRoot(container)
  reactFlushSync(() => root.render(React.createElement(App)))

  return {
    setSource(n) {
      reactFlushSync(() => setSourceState?.(n))
    },
    teardown: () => root.unmount(),
  }
}

// ─── Preact ──────────────────────────────────────────────────────────────────

const PreactMemoConsumer = preactMemo(function PreactMemoConsumer({ bucket }: { bucket: number }) {
  return preactH('span', { class: 'memo-consumer' }, bucket)
})

/** Same memo'd-list boundary as the React arm, for the same reason. */
const PreactMemoList = preactMemo(function PreactMemoList({ bucket }: { bucket: number }) {
  const consumers: unknown[] = []
  for (let i = 0; i < MEMO_CONSUMERS; i++) {
    consumers.push(preactH(PreactMemoConsumer as never, { key: i, bucket }))
  }
  // Fragment, not a wrapper div: every arm in this scenario must render a
  // byte-identical DOM, or the forced layout the harness performs each cycle
  // would not cost the same in each.
  return preactH(PreactFragment, null, [
    preactH('span', { class: 'memo-bucket' }, bucket),
    preactH('div', { class: 'memo-consumers' }, consumers),
  ])
})

function preactTarget(container: HTMLElement): MemoTarget {
  let setSourceState: ((n: number) => void) | null = null

  function App() {
    const [source, setSource] = preactUseState(0)
    setSourceState = setSource
    const bucket = preactUseMemo(() => bucketOf(source), [source])
    return preactH('div', { class: 'memo-root' }, [
      preactH('span', { class: 'memo-source' }, source),
      preactH(PreactMemoList as never, { bucket }),
    ])
  }

  preactRender(preactH(App, null), container)

  return {
    async setSource(n) {
      setSourceState?.(n)
      // Preact batches renders on a microtask (`options.debounceRendering`);
      // this is its real flush boundary and matches `impl/preact.ts`.
      await Promise.resolve()
    },
    teardown: () => preactRender(null, container),
  }
}

// ─── Vue ─────────────────────────────────────────────────────────────────────
// `computed` short-circuits on an unchanged value in Vue 3.4+ — automatic, and
// Vue's own performance guide uses this exact scenario shape as its example.

const VueMemoConsumer = defineComponent({
  props: { bucket: { type: Number, required: true } },
  setup(props) {
    return () => vueH('span', { class: 'memo-consumer' }, props.bucket)
  },
})

/**
 * The consumer list is its own child component taking `bucket` as its only
 * prop, for the same reason as the React arm: Vue 3 bails a child component out
 * when its props are unchanged, but only if the child EXISTS as a boundary.
 * Building the 300 consumer vnodes inside the component that reads `source`
 * would re-create them on every blocked update before any bailout could apply.
 */
const VueMemoList = defineComponent({
  props: { bucket: { type: Number, required: true } },
  setup(props) {
    return () => {
      const consumers = []
      for (let i = 0; i < MEMO_CONSUMERS; i++) {
        consumers.push(vueH(VueMemoConsumer, { key: i, bucket: props.bucket }))
      }
      // Array return = Vue fragment, so the DOM matches every other arm
      // exactly (see the Preact note).
      return [
        vueH('span', { class: 'memo-bucket' }, props.bucket),
        vueH('div', { class: 'memo-consumers' }, consumers),
      ]
    }
  },
})

function vueTarget(container: HTMLElement): MemoTarget {
  const source = ref(0)
  const bucket = vueComputed(() => bucketOf(source.value))

  const App = defineComponent({
    setup() {
      return () =>
        vueH('div', { class: 'memo-root' }, [
          vueH('span', { class: 'memo-source' }, source.value),
          vueH(VueMemoList, { bucket: bucket.value }),
        ])
    },
  })

  const app = createApp(App)
  app.mount(container)

  return {
    async setSource(n) {
      source.value = n
      await nextTick()
    },
    teardown: () => app.unmount(),
  }
}

// ─── Svelte ──────────────────────────────────────────────────────────────────

function svelteTarget(container: HTMLElement): MemoTarget {
  svelteSetSource(0)
  const app = svelteMount(MemoWall, { target: container })
  svelteFlushSync()

  return {
    setSource(n) {
      svelteSetSource(n)
      svelteFlushSync()
    },
    teardown: () => {
      svelteSetSource(0)
      svelteUnmount(app)
    },
  }
}

// ─── Runner ──────────────────────────────────────────────────────────────────

export const MEMO_FRAMEWORKS = [
  'Vanilla JS',
  'Pyreon',
  'Pyreon (bare computed)',
  'React 19',
  'Preact',
  'Vue 3',
  'SolidJS',
  'Svelte 5',
] as const

export async function runMemo(frameworkName: string, container: HTMLElement): Promise<BenchSuite> {
  const suite: BenchSuite = { framework: frameworkName, container, results: [] }

  // Preact schedules `useEffect` after the next PAINT, but this scenario has no
  // effects — rendering alone is microtask-batched, so no scheduler override is
  // needed here (unlike the `effects` scenario, which does need one).
  void preactOptions

  let target: MemoTarget
  switch (frameworkName) {
    case 'Vanilla JS':
      target = vanillaTarget(container)
      break
    case 'Pyreon':
      target = pyreonTarget(container, true)
      break
    case 'Pyreon (bare computed)':
      target = pyreonTarget(container, false)
      break
    case 'React 19':
      target = reactTarget(container)
      break
    case 'Preact':
      target = preactTarget(container)
      break
    case 'Vue 3':
      target = vueTarget(container)
      break
    case 'SolidJS':
      target = solidTarget(container)
      break
    case 'Svelte 5':
      target = svelteTarget(container)
      break
    default:
      throw new Error(`[memo] unknown framework: ${frameworkName}`)
  }

  // ── Op 1: blocked update — source moves, derived value does not ────────────
  await target.setSource(MEMO_BLOCKED_BASE)
  verifyMemoConsumers(container, MEMO_BLOCKED_BUCKET)

  await bench(
    `memo wall — blocked update (${MEMO_CONSUMERS} consumers, derived unchanged)`,
    suite,
    () => target.setSource(MEMO_BLOCKED_BASE + 1),
    {
      reset: () => target.setSource(MEMO_BLOCKED_BASE),
      batchK: MEMO_K,
      batchProbe: memoProbe,
      // The composite probe asserts BOTH halves every cycle: the source really
      // advanced (so the write happened at all) and the bucket really did not
      // (so the wall held). Either half alone is a hole — see `memoProbe`.
      batchPreExpect: MEMO_BLOCKED_BASE * 1_000_000 + MEMO_BLOCKED_BUCKET,
      batchExpect: (MEMO_BLOCKED_BASE + 1) * 1_000_000 + MEMO_BLOCKED_BUCKET,
    },
  )

  verifyMemoConsumers(container, MEMO_BLOCKED_BUCKET)

  // ── Op 2: passthrough — source crosses a bucket boundary ───────────────────
  await target.setSource(MEMO_CROSS_BASE)
  verifyMemoConsumers(container, MEMO_CROSS_FROM)

  await bench(
    `memo wall — passthrough update (${MEMO_CONSUMERS} consumers, derived changed)`,
    suite,
    () => target.setSource(MEMO_CROSS_BASE + 1),
    {
      reset: () => target.setSource(MEMO_CROSS_BASE),
      batchK: MEMO_K,
      batchProbe: memoProbe,
      batchPreExpect: MEMO_CROSS_BASE * 1_000_000 + MEMO_CROSS_FROM,
      batchExpect: (MEMO_CROSS_BASE + 1) * 1_000_000 + MEMO_CROSS_TO,
    },
  )

  verifyMemoConsumers(container, MEMO_CROSS_TO)

  target.teardown()
  return suite
}
