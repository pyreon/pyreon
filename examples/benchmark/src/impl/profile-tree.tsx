/**
 * Deep-tree MOUNT profiling target — the instrument behind "where does Pyreon's
 * per-COMPONENT mount cost go?".
 *
 * The krausest-style suite only ever measures per-ROW cost on one flat
 * `<table><tbody><tr>` list, so it cannot see component-instantiation cost at
 * all. `scenario-tree.ts` measures it as wall-clock across seven frameworks;
 * this file is the attribution companion, exposing NAMED driver functions so
 * `bench-treeprofile.ts` can walk the CPU-profile subtree under a stable
 * `functionName` and split the cost by function.
 *
 * Mirrors `scenario-tree.ts` EXACTLY for the three arms that matter:
 *   - Pyreon  — `createReactiveContext` + `useContext`, the API `createContext`'s
 *               own JSDoc prescribes for a value that changes.
 *   - Solid   — hand-written at the compiler's output level with GETTER child
 *               props, which is what `babel-preset-solid@1.9.12` actually emits
 *               (see the long note in `scenario-tree.ts`). Solid is the target
 *               to beat; the eager-prop form is deliberately NOT reproduced here
 *               because a diagnostic arm is not an attribution baseline.
 *   - Vanilla — the DOM floor. No component concept, so the Pyreon-minus-Vanilla
 *               delta is the whole framework budget and the Pyreon-minus-Solid
 *               delta is the removable part.
 *
 * Every arm MOUNTS and UNMOUNTS per driver call, because a mount profile that
 * leaves 2,047 components live would measure a growing document instead of a
 * repeated mount. The drivers return nothing and clean up after themselves; the
 * runner asserts leaf counts before profiling so an arm that silently renders
 * nothing cannot profile as blazingly fast.
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
import { insert, render as solidRender } from 'solid-js/web'

/** Same depth `scenario-tree.ts` uses: 2,047 components, 1,024 leaves. */
const TREE_DEPTH = 11

// ─── Pyreon arm — byte-for-byte the components `scenario-tree.ts` benches ────

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

// ─── Solid arm — the compiler's output shape, getter child props ─────────────

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
  for (let i = 0; i < 2; i++) {
    div.appendChild(
      createComponent(SolidNode, {
        get depth() {
          return props.depth - 1
        },
      }) as Node,
    )
  }
  return div
}

// ─── Vanilla arm — the DOM floor ─────────────────────────────────────────────

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

export function setupTreeProfile(
  pyreonHost: HTMLElement,
  solidHost: HTMLElement,
  vanillaHost: HTMLElement,
): void {
  const pValue = signal('')
  const [sValue] = createSignal('')

  let pDispose: (() => void) | null = null
  let sDispose: (() => void) | null = null

  // NAMED function statements so profile nodes carry stable functionNames the
  // driver can key subtree attribution on.
  function __pyreonTreeMount(): void {
    pDispose = pyreonMount(
      ph(PyreonDeepTree as never, { depth: TREE_DEPTH, value: () => pValue() }),
      pyreonHost,
    )
  }
  function __pyreonTreeUnmount(): void {
    pDispose?.()
    pDispose = null
    pyreonHost.textContent = ''
  }

  function __solidTreeMount(): void {
    sDispose = solidRender(
      () =>
        createComponent(SolidCtx.Provider, {
          value: sValue,
          get children() {
            const root = document.createElement('div')
            root.className = 'tree-root'
            root.appendChild(createComponent(SolidNode, { depth: TREE_DEPTH }) as Node)
            return root
          },
        }) as unknown as Node,
      solidHost,
    )
  }
  function __solidTreeUnmount(): void {
    sDispose?.()
    sDispose = null
    solidHost.textContent = ''
  }

  function __vanillaTreeMount(): void {
    const root = document.createElement('div')
    root.className = 'tree-root'
    root.appendChild(vanillaBuild(TREE_DEPTH))
    vanillaHost.appendChild(root)
  }
  function __vanillaTreeUnmount(): void {
    vanillaHost.textContent = ''
  }

  ;(globalThis as Record<string, unknown>).__treeBench = {
    pyreon: {
      mount: __pyreonTreeMount,
      unmount: __pyreonTreeUnmount,
      leafCount: () => pyreonHost.querySelectorAll('span.leaf').length,
    },
    solid: {
      mount: __solidTreeMount,
      unmount: __solidTreeUnmount,
      leafCount: () => solidHost.querySelectorAll('span.leaf').length,
    },
    vanilla: {
      mount: __vanillaTreeMount,
      unmount: __vanillaTreeUnmount,
      leafCount: () => vanillaHost.querySelectorAll('span.leaf').length,
    },
  }
}
