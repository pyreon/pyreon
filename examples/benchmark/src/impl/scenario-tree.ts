/**
 * Scenario: **deep component tree — instantiation + context propagation**.
 *
 * Two ops, both measuring things the existing suite structurally cannot see
 * (every one of its nine ops runs on a TWO-LEVEL `<table><tbody><tr>` list):
 *
 *  1. `mount deep tree` — build a balanced binary tree of 2,047 component
 *     instances (1,024 leaves). Isolates PER-COMPONENT cost; the main suite
 *     only ever measures per-ROW cost on one flat list.
 *  2. `context → 1,024 consumers` — with the tree already mounted, change one
 *     context value and wait until every leaf reflects it. Isolates
 *     PROPAGATION: does the framework walk the 1,023 non-consuming interior
 *     nodes to find subscribers, or deliver straight to the bindings?
 *
 * FAIRNESS — each framework uses its own first-class context API on the path
 * its docs prescribe. The interesting asymmetry is real and is the point of the
 * measurement, so it is spelled out rather than hidden:
 *   - **Pyreon** — `createReactiveContext`, which `createContext`'s own JSDoc
 *     names as the API to use "when the value is meant to change". Leaves read
 *     the accessor inside a text binding.
 *   - **React / Preact** — `createContext` + `useContext`. The tree element is
 *     built ONCE and passed as stable `children`, which is React's documented
 *     optimization for this exact shape: the Provider re-renders, `children` is
 *     reference-equal so the interior tree bails out, and only the 1,024
 *     consumers re-render. Interior nodes are additionally `memo`'d. Omitting
 *     this would re-render all 2,047 components and would be a handicap, not a
 *     measurement.
 *   - **Vue** — `provide`/`inject` of a `ref`; only leaves `inject`, so only
 *     leaf render effects are invalidated.
 *   - **Solid** — `createContext` holding an accessor (Solid's idiomatic
 *     "context carries a signal" form), leaves read it via `insert`.
 *   - **Svelte** — `setContext`/`getContext` of a `$state` holder, mutated in
 *     place; leaves read `ctx.value` in the template.
 *   - **Vanilla** — no context concept: the same DOM shape, with the 1,024 leaf
 *     text nodes cached and written directly. The floor, not a competitor.
 *
 * Per-iteration `verify` checks EVERY leaf, not a sample: partial propagation
 * is exactly the failure this scenario exists to catch, and a spot check on the
 * first and last leaf would miss it.
 */
import { h as ph } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount as pyreonMount } from '@pyreon/runtime-dom'
import {
  createContext as preactCreateContext,
  h as preactH,
  render as preactRender,
  type FunctionComponent as PreactFunctionComponent,
} from 'preact'
import { memo as preactMemo } from 'preact/compat'
import {
  useContext as preactUseContext,
  useMemo as preactUseMemo,
  useState as preactUseState,
} from 'preact/hooks'
import * as React from 'react'
import { flushSync as reactFlushSync } from 'react-dom'
import * as ReactDOM from 'react-dom/client'
import {
  createComponent,
  createContext as solidCreateContext,
  createSignal,
  useContext as solidUseContext,
} from 'solid-js'
import { insert, render as solidRender } from 'solid-js/web'
import { flushSync as svelteFlushSync, mount as svelteMount, unmount as svelteUnmount } from 'svelte'
import {
  createApp,
  defineComponent,
  h as vueH,
  inject,
  nextTick,
  provide as vueProvide,
  ref,
  type App,
} from 'vue'
import type { BenchSuite } from '../runner'
import { bench } from '../runner'
import DeepTree from './DeepTree.svelte'
import { PyreonDeepTree } from './scenario-tree-pyreon'
import {
  CONTEXT_VALUES,
  TREE_DEPTH,
  verifyContextPropagated,
  verifyTreeMounted,
} from './scenario-shared'
import { setDeepValue } from './tree-state.svelte'

export interface TreeTarget {
  /** Mount the full tree into `host`. Returns teardown. Commits synchronously. */
  mount: (host: HTMLElement) => () => void
  /** Set the context value and return once committed. */
  setValue: (v: string) => void | Promise<void>
}

// ─── Vanilla (baseline) ──────────────────────────────────────────────────────

function vanillaTarget(): TreeTarget {
  let leafTexts: Text[] = []

  return {
    mount(host) {
      const texts: Text[] = []
      const build = (depth: number): HTMLElement => {
        if (depth <= 1) {
          const span = document.createElement('span')
          span.className = 'leaf'
          const t = document.createTextNode('')
          span.appendChild(t)
          texts.push(t)
          return span
        }
        const div = document.createElement('div')
        div.className = 'branch'
        div.appendChild(build(depth - 1))
        div.appendChild(build(depth - 1))
        return div
      }
      const root = document.createElement('div')
      root.className = 'tree-root'
      root.appendChild(build(TREE_DEPTH))
      host.appendChild(root)
      leafTexts = texts
      return () => {
        root.remove()
        leafTexts = []
      }
    },
    setValue(v) {
      for (let i = 0; i < leafTexts.length; i++) {
        ;(leafTexts[i] as Text).data = v
      }
    },
  }
}

// ─── Pyreon ──────────────────────────────────────────────────────────────────

function pyreonTarget(): TreeTarget {
  const value = signal('')
  return {
    mount(host) {
      return pyreonMount(
        ph(PyreonDeepTree as never, { depth: TREE_DEPTH, value: () => value() }),
        host,
      )
    },
    setValue(v) {
      // One signal write; every subscribed leaf binding updates synchronously.
      value.set(v)
    },
  }
}

// ─── React ───────────────────────────────────────────────────────────────────

const ReactCtx = React.createContext<string>('')

function ReactLeafInner() {
  const v = React.useContext(ReactCtx)
  return React.createElement('span', { className: 'leaf' }, v)
}
const ReactLeaf = ReactLeafInner

// Explicit annotations on both the binding and the inner function's return
// type — a self-referencing component is otherwise circular for inference
// (TS7022/TS7023).
const ReactBranch: React.NamedExoticComponent<{ depth: number }> = React.memo(
  function ReactBranchInner({ depth }: { depth: number }): React.ReactElement {
    if (depth <= 1) return React.createElement(ReactLeaf, null)
    return React.createElement(
      'div',
      { className: 'branch' },
      React.createElement(ReactBranch, { depth: depth - 1 }),
      React.createElement(ReactBranch, { depth: depth - 1 }),
    )
  },
)

function reactTarget(): TreeTarget {
  let setValueState: ((v: string) => void) | null = null

  function App({ onReady }: { onReady: (set: (v: string) => void) => void }) {
    const [value, setValue] = React.useState('')
    // Published DURING render, not from an effect: `useEffect` is passive and
    // runs AFTER commit, so a synchronous `mount()` would return before the
    // setter exists. `setValue`'s identity is stable across renders and this
    // writes only to a harness-local variable — it schedules no work and does
    // not touch the measured path (which is setValue → flushSync → DOM).
    onReady(setValue)
    // The tree element is built ONCE and kept reference-stable, so the Provider
    // re-render bails out of the interior tree and only the 1,024 consumers
    // re-render. This is React's documented optimization for this shape.
    const tree = React.useMemo(
      () =>
        React.createElement(
          'div',
          { className: 'tree-root' },
          React.createElement(ReactBranch, { depth: TREE_DEPTH }),
        ),
      [],
    )
    return React.createElement(ReactCtx.Provider, { value }, tree)
  }

  let root: ReactDOM.Root | null = null

  return {
    mount(host) {
      root = ReactDOM.createRoot(host)
      const r = root
      // flushSync so the initial mount is committed when this returns —
      // the timed region must contain the whole mount, not schedule it.
      reactFlushSync(() => {
        r.render(
          React.createElement(App, {
            onReady: (set: (v: string) => void) => {
              setValueState = set
            },
          }),
        )
      })
      return () => {
        r.unmount()
        root = null
        setValueState = null
      }
    },
    setValue(v) {
      const set = setValueState
      if (!set) throw new Error('[deep-tree:React] setter not published — mount did not commit')
      reactFlushSync(() => set(v))
    },
  }
}

// ─── Preact ──────────────────────────────────────────────────────────────────

const PreactCtx = preactCreateContext<string>('')

function PreactLeaf() {
  const v = preactUseContext(PreactCtx)
  return preactH('span', { className: 'leaf' }, v)
}

// Same explicit-annotation requirement as ReactBranch — self-reference is
// circular for inference otherwise.
const PreactBranch: PreactFunctionComponent<{ depth: number }> = preactMemo(
  function PreactBranchInner({ depth }: { depth: number }) {
    if (depth <= 1) return preactH(PreactLeaf, null)
    return preactH(
      'div',
      { className: 'branch' },
      preactH(PreactBranch, { depth: depth - 1 }),
      preactH(PreactBranch, { depth: depth - 1 }),
    )
  },
)

function preactTarget(): TreeTarget {
  let setValueState: ((v: string) => void) | null = null

  function App({ onReady }: { onReady: (set: (v: string) => void) => void }) {
    const [value, setValue] = preactUseState('')
    // Published during render — see the React target for why an effect is too
    // late for a synchronous mount.
    onReady(setValue)
    // Stable children, exactly as in the React target: the Provider re-renders
    // but the interior tree is reference-equal and bails out, so only the
    // consumers re-render. `useMemo` is Preact's own idiom for this.
    const tree = preactUseMemo(
      () =>
        preactH('div', { className: 'tree-root' }, preactH(PreactBranch, { depth: TREE_DEPTH })),
      [],
    )
    return preactH(PreactCtx.Provider, { value }, tree)
  }

  return {
    mount(host) {
      // Preact's initial render is synchronous.
      preactRender(
        preactH(App, {
          onReady: (set: (v: string) => void) => {
            setValueState = set
          },
        }),
        host,
      )
      return () => {
        preactRender(null, host)
        setValueState = null
      }
    },
    async setValue(v) {
      const set = setValueState
      if (!set) throw new Error('[deep-tree:Preact] setter not published')
      set(v)
      // Preact batches hook updates on a microtask — the tightest commit.
      await Promise.resolve()
    },
  }
}

// ─── Vue ─────────────────────────────────────────────────────────────────────

const VUE_CTX = Symbol('deep-ctx')

const VueNode: ReturnType<typeof defineComponent> = defineComponent({
  name: 'VueNode',
  props: { depth: { type: Number, required: true } },
  setup(props: { depth: number }) {
    // Only leaves inject — interior nodes must NOT subscribe, or the scenario
    // would measure 2,047 subscribers instead of 1,024.
    if (props.depth <= 1) {
      const v = inject<{ value: string }>(VUE_CTX)
      return () => vueH('span', { class: 'leaf' }, v?.value ?? '')
    }
    return () =>
      vueH('div', { class: 'branch' }, [
        vueH(VueNode, { depth: props.depth - 1 }),
        vueH(VueNode, { depth: props.depth - 1 }),
      ])
  },
})

function vueTarget(): TreeTarget {
  const value = ref('')
  let app: App | null = null

  const Root = defineComponent({
    setup() {
      vueProvide(VUE_CTX, value)
      return () => vueH('div', { class: 'tree-root' }, [vueH(VueNode, { depth: TREE_DEPTH })])
    },
  })

  return {
    mount(host) {
      const a = createApp(Root)
      a.mount(host) // Vue's initial mount is synchronous.
      app = a
      return () => {
        a.unmount()
        app = null
      }
    },
    async setValue(v) {
      if (!app) throw new Error('[deep-tree:Vue] not mounted')
      value.value = v
      await nextTick()
    },
  }
}

// ─── Solid ───────────────────────────────────────────────────────────────────
// Hand-written at the compiler's output level — this app has no
// vite-plugin-solid, the constraint `impl/solid.ts` already documents.
// `createComponent` is what Solid's compiler emits per component instance, so
// each node here is a real Solid component with its own owner.

const SolidCtx = solidCreateContext<() => string>(() => '')

function SolidNode(props: { depth: number }): Node {
  if (props.depth <= 1) {
    const get = solidUseContext(SolidCtx)
    const span = document.createElement('span')
    span.className = 'leaf'
    insert(span, () => get())
    return span
  }
  const div = document.createElement('div')
  div.className = 'branch'
  div.appendChild(createComponent(SolidNode, { depth: props.depth - 1 }) as Node)
  div.appendChild(createComponent(SolidNode, { depth: props.depth - 1 }) as Node)
  return div
}

function solidTarget(): TreeTarget {
  const [value, setValue] = createSignal('')

  return {
    mount(host) {
      return solidRender(
        () =>
          createComponent(SolidCtx.Provider, {
            value: value,
            get children() {
              const root = document.createElement('div')
              root.className = 'tree-root'
              root.appendChild(createComponent(SolidNode, { depth: TREE_DEPTH }) as Node)
              return root
            },
          }) as unknown as Node,
        host,
      )
    },
    setValue(v) {
      setValue(() => v)
    },
  }
}

// ─── Svelte ──────────────────────────────────────────────────────────────────

function svelteTarget(): TreeTarget {
  let app: ReturnType<typeof svelteMount> | null = null
  return {
    mount(host) {
      setDeepValue('')
      const a = svelteMount(DeepTree, { target: host, props: { depth: TREE_DEPTH } })
      svelteFlushSync()
      app = a
      return () => {
        svelteUnmount(a)
        app = null
      }
    },
    setValue(v) {
      if (!app) throw new Error('[deep-tree:Svelte] not mounted')
      setDeepValue(v)
      svelteFlushSync()
    },
  }
}

// ─── Runner ──────────────────────────────────────────────────────────────────

export const TREE_FRAMEWORKS = [
  'Vanilla JS',
  'Pyreon',
  'React 19',
  'Preact',
  'Vue 3',
  'SolidJS',
  'Svelte 5',
] as const

export async function runTree(frameworkName: string, container: HTMLElement): Promise<BenchSuite> {
  const suite: BenchSuite = { framework: frameworkName, container, results: [] }

  let target: TreeTarget
  switch (frameworkName) {
    case 'Vanilla JS':
      target = vanillaTarget()
      break
    case 'Pyreon':
      target = pyreonTarget()
      break
    case 'React 19':
      target = reactTarget()
      break
    case 'Preact':
      target = preactTarget()
      break
    case 'Vue 3':
      target = vueTarget()
      break
    case 'SolidJS':
      target = solidTarget()
      break
    case 'Svelte 5':
      target = svelteTarget()
      break
    default:
      throw new Error(`[deep-tree] unknown framework: ${frameworkName}`)
  }

  const host = document.createElement('div')
  container.appendChild(host)

  // ── Op 1: mount the tree ───────────────────────────────────────────────────
  let mountTeardown: (() => void) | null = null

  await bench(
    `mount deep tree (${2 ** TREE_DEPTH - 1} components)`,
    suite,
    () => {
      mountTeardown = target.mount(host)
    },
    {
      reset: () => {
        if (mountTeardown) {
          mountTeardown()
          mountTeardown = null
        }
        // Guarantee a clean slate regardless of how completely each
        // framework's teardown empties the host.
        host.innerHTML = ''
      },
      verify: verifyTreeMounted,
    },
  )

  if (mountTeardown) {
    ;(mountTeardown as () => void)()
    mountTeardown = null
  }
  host.innerHTML = ''

  // ── Op 2: context propagation over the already-mounted tree ────────────────
  const teardown = target.mount(host)
  await target.setValue(CONTEXT_VALUES[0] as string)
  verifyTreeMounted(host)

  let cursor = 0
  let applied = CONTEXT_VALUES[1] as string

  await bench(
    `context → ${2 ** (TREE_DEPTH - 1)} consumers`,
    suite,
    async () => {
      // Rotate through the non-baseline values so every timed run is a REAL
      // change and no framework can short-circuit on an equal value.
      cursor = (cursor + 1) % (CONTEXT_VALUES.length - 1)
      applied = CONTEXT_VALUES[1 + cursor] as string
      await target.setValue(applied)
    },
    {
      // Untimed: return to the baseline value so the timed write is always a
      // genuine transition, never a no-op re-set.
      reset: async () => {
        await target.setValue(CONTEXT_VALUES[0] as string)
      },
      verify: (c) => verifyContextPropagated(c, applied),
    },
  )

  teardown()
  host.remove()
  return suite
}
