/* oxlint-disable jsx-a11y/prefer-tag-over-role -- the rows are ARIA options inside the combobox's listbox */
import { For, onMount } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import { computed, effect, signal } from '@pyreon/reactivity'
import { CommandItem } from './parts'
import type { Palette, ResultGroup, ResultItem } from './palette-types'

type Row = { kind: 'heading'; group: ResultGroup; at: number } | { kind: 'item'; item: ResultItem; at: number }

const OVERSCAN = 6

function flatten(groups: readonly ResultGroup[]): Row[] {
  const rows: Row[] = []
  for (const group of groups) {
    if (group.title !== undefined) rows.push({ kind: 'heading', group, at: rows.length })
    for (const item of group.items) rows.push({ kind: 'item', item, at: rows.length })
  }

  return rows
}

const rowKey = (row: Row): string => (row.kind === 'heading' ? `h|${row.at}|${row.group.title}` : `i|${row.at}|${row.item.id}|${row.item.title}|${row.item.ranges.join(',')}|${row.item.enabled}`)

export interface VirtualProps {
  palette: Palette
  rowHeight: number
}

/**
 * A windowed list of rows for long result lists: every row (group headings too) has one height, so the window is arithmetic,
 * and only the rows in view and a few around them are in the DOM. Options keep `aria-setsize` and `aria-posinset`, so
 * assistive technology still hears "7 of 5,000". Headings are `role="presentation"` here: a group element cannot wrap rows
 * that are not all in the DOM.
 */
export function Virtual(props: VirtualProps): VNodeChild {
  const rows = computed(() => flatten(props.palette.groups()))
  const range = signal({ start: 0, end: 20 })

  const height = (): number => rows().length * props.rowHeight

  let host: HTMLElement | null = null

  onMount(() => {
    // The listbox is the scrolling element: found from here, because a parent's `ref` is set after its children mount.
    const el = host?.closest<HTMLElement>('[role="listbox"]') ?? null
    if (el === null) return undefined
    const update = (): void => {
      const first = Math.floor(el.scrollTop / props.rowHeight) - OVERSCAN
      const last = Math.ceil((el.scrollTop + el.clientHeight) / props.rowHeight) + OVERSCAN
      const next = { start: Math.max(0, first), end: Math.min(rows().length, Math.max(last, first + 1)) }
      const now = range.peek()
      if (now.start !== next.start || now.end !== next.end) range.set(next)
    }
    let frame = 0
    const onScroll = (): void => {
      if (frame !== 0) return
      frame = requestAnimationFrame(() => {
        frame = 0
        update()
      })
    }
    // pyreon-lint-disable-next-line pyreon/no-raw-addeventlistener -- a passive scroll listener on an element this component does not render (the listbox); removed in the cleanup below
    el.addEventListener('scroll', onScroll, { passive: true })
    // The active row is always in the window: move the scroll to it, then redraw the window.
    // pyreon-lint-disable-next-line pyreon/no-effect-in-mount -- it writes the scroll position of the listbox, which exists only after mount
    const follow = effect(() => {
      const id = props.palette.activeId()
      const at = rows().findIndex((r) => r.kind === 'item' && r.item.id === id)
      if (at < 0) {
        update()

        return
      }
      const top = at * props.rowHeight
      if (top < el.scrollTop) el.scrollTop = top
      else if (top + props.rowHeight > el.scrollTop + el.clientHeight) el.scrollTop = top + props.rowHeight - el.clientHeight
      update()
    })

    return () => {
      el.removeEventListener('scroll', onScroll)
      if (frame !== 0) cancelAnimationFrame(frame)
      follow.dispose()
    }
  })

  const visible = computed(() => rows().slice(range().start, range().end))

  return (
    <div
      class="pcmd-window"
      style={() => `position:relative;height:${height()}px`}
      ref={(el: HTMLElement | null) => {
        host = el
      }}
    >
      <For each={() => visible()} by={rowKey}>
        {(row) => {
          const style = `position:absolute;inset-inline:0;top:${row.at * props.rowHeight}px;height:${props.rowHeight}px`

          return row.kind === 'heading' ? (
            <div class="pcmd-heading" role="presentation" style={style}>
              {row.group.title}
            </div>
          ) : (
            <CommandItem item={row.item} style={style} />
          )
        }}
      </For>
    </div>
  )
}
