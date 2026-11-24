/**
 * SolidJS 2.0 arms: idiomatic Solid 2 JSX, compiled at BUILD time by Solid
 * 2.0's own compiler (`@solidjs/compiler`, the Oxc compiler `@solidjs/vite-plugin`
 * runs; `generate: 'dom'`, production) into `virtual:solid2/<key>` by
 * `solid2Plugin` in `vite.config.ts`. The emit is exactly what a Solid 2 app
 * ships, so none of these arms is hand-written at compiler-output level (the
 * Solid 1.9 arms are; see `scenario-tree.ts`).
 *
 * The sources mirror the Solid 1.9 arm of each scenario line for line. The
 * differences are Solid 2's API, not the shape:
 *
 *  - Writes are batched until `flush()`. Every op flushes ONCE before it
 *    returns, as an app committing a user action would, so the timed window
 *    contains all the work (Solid 1 applies writes synchronously and needs no
 *    flush). The scenario gates read the DOM and the effect sink after each op.
 *  - Context is the provider component itself (`<Ctx value={…}>`); there is no
 *    `Ctx.Provider`.
 *  - `createEffect(compute, effectFn)` is split into a tracked compute and an
 *    untracked side effect.
 *  - Selection uses `createProjection` (Solid 2's replacement for the removed
 *    `createSelector`).
 *  - There is no `batch()`; `flush()` after the writes is the batch.
 *
 * Solid 2 is installed under the `solid-js-2` alias next to the 1.9 the
 * `SolidJS` arms use. `solid2Plugin` resolves every `solid-js` import made by
 * these modules and by `@solidjs/web` to that one copy, so the renderer and the
 * arm share one reactive graph.
 */
export const SOLID2_SOURCES: Record<string, string> = {
  // Row board (impl/solid2.ts). Keyed selection: only the previous and the new
  // key change, so only those two rows' class effects re-run.
  rows: `
import { For, createProjection } from 'solid-js'
export function Rows(props) {
  const selected = createProjection((draft) => {
    const id = props.selectedId()
    if (draft.prev != null) draft[draft.prev] = false
    if (id != null) draft[id] = true
    draft.prev = id
  }, {})
  return (
    <table>
      <tbody>
        <For each={props.rows()}>
          {(row) => (
            <tr class={selected[row.id] ? 'selected' : ''}>
              <td>{row.id}</td>
              <td>{row.label()}</td>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  )
}`,

  // Deep tree (scenario-tree.ts) and the retained-heap arm of profile-tree.tsx:
  // 2,047 components, a context holding the value accessor, 1,024 leaf
  // consumers. Child props are written as JSX, so the compiler emits the getter
  // props the Solid 1.9 arm reproduces by hand.
  tree: `
import { createContext, createSignal, flush, useContext } from 'solid-js'
import { render } from '@solidjs/web'

const Ctx = createContext(() => '')

function TreeNode(props) {
  if (props.depth <= 1) {
    const get = useContext(Ctx)
    return <span class="leaf">{get()}</span>
  }
  return (
    <div class="branch">
      <TreeNode depth={props.depth - 1} />
      <TreeNode depth={props.depth - 1} />
    </div>
  )
}

export function createTree(depth) {
  const [value, setValue] = createSignal('')
  return {
    mount(host) {
      const dispose = render(
        () => (
          <Ctx value={value}>
            <div class="tree-root">
              <TreeNode depth={depth} />
            </div>
          </Ctx>
        ),
        host,
      )
      flush()
      return dispose
    },
    setValue(v) {
      setValue(v)
      flush()
    },
  }
}`,

  // Effect-heavy list (scenario-effects.ts): 500 row components, each with one
  // effect on its own signal and the signal rendered as text.
  effects: `
import { createEffect, createSignal, flush } from 'solid-js'
import { render } from '@solidjs/web'

export function createEffectList(rowCount, sink) {
  const sigs = Array.from({ length: rowCount }, () => createSignal(-1))

  function FxRow(props) {
    const [get] = sigs[props.index]
    createEffect(get, (v) => {
      sink.values[props.index] = v
      sink.runs++
    })
    return <span class="fx-row">{get()}</span>
  }

  function FxList() {
    const children = []
    for (let i = 0; i < rowCount; i++) children.push(<FxRow index={i} />)
    return <div class="fx-list">{children}</div>
  }

  return {
    mount(host) {
      const dispose = render(() => <FxList />, host)
      flush()
      return dispose
    },
    applyAll(next) {
      for (let i = 0; i < rowCount; i++) sigs[i][1](next[i])
      flush()
    },
    applyOne(index, value) {
      sigs[index][1](value)
      flush()
    },
  }
}`,

  // Memoization wall (scenario-memo.ts). createMemo short-circuits on an equal
  // value by default, as in Solid 1.
  memo: `
import { createMemo, createSignal, flush } from 'solid-js'
import { render } from '@solidjs/web'

function MemoConsumer(props) {
  return <span class="memo-consumer">{props.bucket}</span>
}

export function mountMemoWall(host, count, bucketOf) {
  const [source, setSource] = createSignal(0)
  const bucket = createMemo(() => bucketOf(source()))

  function MemoWall() {
    const consumers = []
    for (let i = 0; i < count; i++) consumers.push(<MemoConsumer bucket={bucket()} />)
    return (
      <div class="memo-root">
        <span class="memo-source">{source()}</span>
        <span class="memo-bucket">{bucket()}</span>
        <div class="memo-consumers">{consumers}</div>
      </div>
    )
  }

  const dispose = render(() => <MemoWall />, host)
  flush()
  return {
    setSource(n) {
      setSource(n)
      flush()
    },
    dispose,
  }
}`,

  // Keyed list + conditional slots (scenario-maplist.ts). Same as the Solid 1.9
  // source in rival-sources.ts: <For> (Solid's keyed list; it has no keyed
  // .map()) and a ternary per conditional slot, one signal per mutable field.
  maplist: `
import { For, createSignal, flush } from 'solid-js'
import { render } from '@solidjs/web'

function MapList(props) {
  return (
    <div class="ml">
      <table>
        <tbody>
          <For each={props.rows()}>
            {(row) => (
              <tr>
                <td class="id">{row.id}</td>
                <td class="label">{row.label()}</td>
                <td class="status">{row.done() ? <span class="done">done</span> : <em class="todo">todo</em>}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      {props.rows().length === 0 ? <p class="empty">No rows</p> : null}
    </div>
  )
}

export function makeRow(plain) {
  const [label, setLabel] = createSignal(plain.label)
  const [done, setDone] = createSignal(plain.done)
  return {
    id: plain.id,
    label,
    setLabel(v) {
      setLabel(v)
      flush()
    },
    done,
    setDone(v) {
      setDone(v)
      flush()
    },
  }
}

export function mountMapList(host) {
  const [rows, writeRows] = createSignal([])
  const dispose = render(() => <MapList rows={rows} />, host)
  flush()
  return {
    rows,
    setRows(next) {
      writeRows(next)
      flush()
    },
    dispose,
  }
}`,
}
