/**
 * Pyreon's virtual list for the `virtual` scenario — its own `.tsx` so the
 * Pyreon compiler processes it (what a vite-plugin app ships).
 *
 * Idiomatic `@pyreon/virtual`: a keyed `<For>` over `virtualItems()`, each row
 * positioned by its own reactive `transform` (`v.item(index).start()`), the
 * shape the package documents and its happy-dom bench times.
 */
import { For } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import { useVirtualizer } from '@pyreon/virtual'
import { VIRTUAL_N, VIRTUAL_OVERSCAN, VIRTUAL_ROW } from './scenario-virtual-data'

export function PyreonVirtualList(props: { scroller: HTMLElement }): VNodeChild {
  const v = useVirtualizer<HTMLElement, HTMLElement>(() => ({
    count: VIRTUAL_N,
    getScrollElement: () => props.scroller,
    estimateSize: () => VIRTUAL_ROW,
    overscan: VIRTUAL_OVERSCAN,
  }))
  return (
    <div style={() => `height:${v.totalSize()}px;position:relative`}>
      <For each={() => v.virtualItems()} by={(it) => it.index}>
        {(it) => {
          const m = v.item(it.index)
          return (
            <div
              class="row"
              data-i={String(it.index)}
              style={() =>
                `position:absolute;top:0;left:0;right:0;transform:translateY(${m.start()}px);height:${m.size()}px`
              }
            >
              Row {it.index}
            </div>
          )
        }}
      </For>
    </div>
  )
}
