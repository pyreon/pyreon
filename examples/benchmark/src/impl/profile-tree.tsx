/**
 * Deep-tree MOUNT ablation ladder — the instrument behind "where does Pyreon's
 * per-COMPONENT mount cost go?".
 *
 * The krausest-style suite only ever measures per-ROW cost on one flat
 * `<table><tbody><tr>` list, so it cannot see component-instantiation cost at
 * all. `scenario-tree.ts` measures it as wall-clock across seven frameworks;
 * this file is the attribution companion: every arm mounts the SAME 2,047-node
 * tree behind a NAMED driver function (`__mountTreeA` …) so `bench-treeladder.ts`
 * can sum CPU-profile self-time under each frame and difference the arms.
 *
 * Arms (all mount + unmount per driver call — a mount profile that leaves
 * 2,047 components live measures a growing document, not a repeated mount):
 *
 *   A  idiomatic compiled Pyreon — the scenario board's exact components
 *      (getter child props via `_rp`, `createReactiveContext` leaf read)
 *   B  = A with EAGER child props (`let d = props.depth - 1`, which the
 *      reactive-props inliner does not track, so the prop is a plain value)
 *      → A − B prices the getter-prop pipeline (`_rp` + `makeReactiveProps`)
 *   C  = A with a STATIC leaf (baked text, no context read, no bind)
 *      → A − C prices `useContext` + the accessor text bind
 *   D  NO components — the same elements built with `h()` and mounted once
 *      → the h()-path element floor inside Pyreon
 *   E  = D with a component per node (`h(PyreonNodeH, …)`, eager props,
 *      static leaf) → E − D is the PURE component-instantiation cost
 *      (`mountComponent` / `runWithHooks` / scope / owner), template-free
 *   F  = A but the leaf reads a plain SIGNAL instead of the context accessor
 *      → A − F prices the context accessor's slow-path bind vs the direct tier
 *   H  = E with hand-written GETTER child props (Solid's emitted shape, no `_rp`)
 *      → H − E is the getter chain alone; A − H the `_rp`/conversion overhead
 *   G  SolidJS, compiler-faithful (template cloneNode + `insert`, getter props —
 *      what `babel-preset-solid@1.9.12` emits; see scenario-tree.ts)
 *   V  Vanilla DOM — the floor
 *
 * NOT part of the timed fair bench — measurement scaffolding only, loaded
 * exclusively behind `?profileTree=1`.
 */
import { createReactiveContext, h as ph, provide, useContext } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount as pyreonMount } from '@pyreon/runtime-dom'
import {
  createContext as solidCreateContext,
  createComponent,
  createSignal,
  useContext as solidUseContext,
} from 'solid-js'
import { insert, render as solidRender, template as solidTemplate } from 'solid-js/web'

/** Same depth `scenario-tree.ts` uses: 2,047 components, 1,024 leaves. */
const TREE_DEPTH = 11

// ─── A: byte-for-byte the components `scenario-tree.ts` benches ──────────────

const PyreonDeepCtx = createReactiveContext<string>('')

function PyreonNode(props: { depth: number }): VNodeChild {
  if (props.depth <= 1) {
    const get = useContext(PyreonDeepCtx)
    return <span class="leaf">{() => get()}</span>
  }
  return (
    <div class="branch">
      <PyreonNode depth={props.depth - 1} />
      <PyreonNode depth={props.depth - 1} />
    </div>
  )
}

function PyreonDeepTree(props: { depth: number; value: () => string }) {
  provide(PyreonDeepCtx, props.value)
  return (
    <div class="tree-root">
      <PyreonNode depth={props.depth} />
    </div>
  )
}

// ─── B: eager child props ────────────────────────────────────────────────────

function PyreonNodeEager(props: { depth: number }): VNodeChild {
  if (props.depth <= 1) {
    const get = useContext(PyreonDeepCtx)
    return <span class="leaf">{() => get()}</span>
  }
  // `let`, deliberately: the compiler inlines a `const` derived from props at
  // the use site (a getter), but leaves a `let` as the plain value it holds.
  // oxlint-disable-next-line prefer-const
  let d = props.depth - 1
  return (
    <div class="branch">
      <PyreonNodeEager depth={d} />
      <PyreonNodeEager depth={d} />
    </div>
  )
}

function PyreonDeepTreeEager(props: { depth: number; value: () => string }) {
  provide(PyreonDeepCtx, props.value)
  return (
    <div class="tree-root">
      <PyreonNodeEager depth={props.depth} />
    </div>
  )
}

// ─── C: static leaf ──────────────────────────────────────────────────────────

function PyreonNodeStatic(props: { depth: number }): VNodeChild {
  if (props.depth <= 1) return <span class="leaf">x</span>
  return (
    <div class="branch">
      <PyreonNodeStatic depth={props.depth - 1} />
      <PyreonNodeStatic depth={props.depth - 1} />
    </div>
  )
}

function PyreonDeepTreeStatic(props: { depth: number }) {
  return (
    <div class="tree-root">
      <PyreonNodeStatic depth={props.depth} />
    </div>
  )
}

// ─── D / E: the h() path, without and with a component per node ─────────────

function hBuild(depth: number): VNodeChild {
  if (depth <= 1) return ph('span', { class: 'leaf' }, 'x')
  return ph('div', { class: 'branch' }, hBuild(depth - 1), hBuild(depth - 1))
}

function PyreonNodeH(props: { depth: number }): VNodeChild {
  if (props.depth <= 1) return ph('span', { class: 'leaf' }, 'x')
  return ph(
    'div',
    { class: 'branch' },
    ph(PyreonNodeH as never, { depth: props.depth - 1 }),
    ph(PyreonNodeH as never, { depth: props.depth - 1 }),
  )
}

// ─── H: E with hand-written GETTER props (what Solid's compiler emits) ───────
// No `_rp` thunk, no conversion: `makeReactiveProps` finds no brand, fires each
// getter once in its scan and returns the object as-is, so the child reads the
// same getter chain A pays but with no result-object allocation and no
// `defineProperty` per node. H − E is the getter CHAIN alone; A − H is the
// pipeline's own overhead on top of it.

function PyreonNodeGet(props: { depth: number }): VNodeChild {
  if (props.depth <= 1) return ph('span', { class: 'leaf' }, 'x')
  return ph(
    'div',
    { class: 'branch' },
    ph(PyreonNodeGet as never, {
      get depth() {
        return props.depth - 1
      },
    }),
    ph(PyreonNodeGet as never, {
      get depth() {
        return props.depth - 1
      },
    }),
  )
}

// ─── F: leaf reads a plain signal (direct tier) instead of the context ───────

const leafSig = signal('')

function PyreonNodeSig(props: { depth: number }): VNodeChild {
  if (props.depth <= 1) return <span class="leaf">{leafSig()}</span>
  return (
    <div class="branch">
      <PyreonNodeSig depth={props.depth - 1} />
      <PyreonNodeSig depth={props.depth - 1} />
    </div>
  )
}

function PyreonDeepTreeSig(props: { depth: number }) {
  return (
    <div class="tree-root">
      <PyreonNodeSig depth={props.depth} />
    </div>
  )
}

// ─── G: Solid, the compiler's output shape ───────────────────────────────────

const SolidCtx = solidCreateContext<() => string>(() => '')
const solidLeafTmpl = solidTemplate('<span class=leaf>')
const solidBranchTmpl = solidTemplate('<div class=branch>')
const solidRootTmpl = solidTemplate('<div class=tree-root>')

function SolidNode(props: { depth: number }): Node {
  if (props.depth <= 1) {
    const get = solidUseContext(SolidCtx)
    const span = solidLeafTmpl() as HTMLElement
    insert(span, get)
    return span
  }
  const div = solidBranchTmpl() as HTMLElement
  for (let i = 0; i < 2; i++) {
    insert(
      div,
      createComponent(SolidNode, {
        get depth() {
          return props.depth - 1
        },
      }),
      null,
    )
  }
  return div
}

// ─── V: the DOM floor ────────────────────────────────────────────────────────

function vanillaBuild(depth: number): Node {
  if (depth <= 1) {
    const span = document.createElement('span')
    span.className = 'leaf'
    span.appendChild(document.createTextNode(''))
    return span
  }
  const div = document.createElement('div')
  div.className = 'branch'
  div.appendChild(vanillaBuild(depth - 1))
  div.appendChild(vanillaBuild(depth - 1))
  return div
}

export const TREE_ARMS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'V'] as const
export type TreeArm = (typeof TREE_ARMS)[number]

export function setupTreeProfile(makeHost: () => HTMLElement): void {
  const hosts: Record<string, HTMLElement> = {}
  for (const a of TREE_ARMS) hosts[a] = makeHost()
  const pValue = signal('')
  const [sValue] = createSignal('')
  const disposers: Record<string, (() => void) | null> = {}

  const mountPyreon = (arm: string, vnode: unknown) => {
    disposers[arm] = pyreonMount(vnode as never, hosts[arm] as HTMLElement)
  }
  const unmountArm = (arm: string) => {
    disposers[arm]?.()
    disposers[arm] = null
    ;(hosts[arm] as HTMLElement).textContent = ''
  }

  // NAMED function statements so profile nodes carry stable functionNames the
  // driver can key subtree attribution on. One per arm, mount and unmount.
  function __mountTreeA(): void {
    mountPyreon('A', ph(PyreonDeepTree as never, { depth: TREE_DEPTH, value: () => pValue() }))
  }
  function __mountTreeB(): void {
    mountPyreon('B', ph(PyreonDeepTreeEager as never, { depth: TREE_DEPTH, value: () => pValue() }))
  }
  function __mountTreeC(): void {
    mountPyreon('C', ph(PyreonDeepTreeStatic as never, { depth: TREE_DEPTH }))
  }
  function __mountTreeD(): void {
    mountPyreon('D', ph('div', { class: 'tree-root' }, hBuild(TREE_DEPTH)))
  }
  function __mountTreeE(): void {
    mountPyreon('E', ph('div', { class: 'tree-root' }, ph(PyreonNodeH as never, { depth: TREE_DEPTH })))
  }
  function __mountTreeF(): void {
    mountPyreon('F', ph(PyreonDeepTreeSig as never, { depth: TREE_DEPTH }))
  }
  function __mountTreeH(): void {
    mountPyreon('H', ph('div', { class: 'tree-root' }, ph(PyreonNodeGet as never, { depth: TREE_DEPTH })))
  }
  function __mountTreeG(): void {
    disposers.G = solidRender(
      () =>
        createComponent(SolidCtx.Provider, {
          value: sValue,
          get children() {
            const root = solidRootTmpl() as HTMLElement
            insert(root, createComponent(SolidNode, { depth: TREE_DEPTH }), null)
            return root
          },
        }) as unknown as Node,
      hosts.G as HTMLElement,
    )
  }
  function __mountTreeV(): void {
    const root = document.createElement('div')
    root.className = 'tree-root'
    root.appendChild(vanillaBuild(TREE_DEPTH))
    ;(hosts.V as HTMLElement).appendChild(root)
  }

  const mounts: Record<string, () => void> = {
    A: __mountTreeA,
    B: __mountTreeB,
    C: __mountTreeC,
    D: __mountTreeD,
    E: __mountTreeE,
    F: __mountTreeF,
    G: __mountTreeG,
    H: __mountTreeH,
    V: __mountTreeV,
  }

  ;(globalThis as Record<string, unknown>).__treeBench = {
    arms: [...TREE_ARMS],
    mount: (arm: string) => (mounts[arm] as () => void)(),
    unmount: (arm: string) => unmountArm(arm),
    leafCount: (arm: string) => (hosts[arm] as HTMLElement).querySelectorAll('span.leaf').length,
  }
}
