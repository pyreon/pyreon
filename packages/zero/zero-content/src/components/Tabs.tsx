import { signal } from '@pyreon/reactivity'
import type { VNodeChild } from '@pyreon/core'

// ─── <Tabs> — generic tab strip (PR-K audit H2) ───────────────────────────
//
// Renders labeled panels with one active at a time. Distinct from
// <CodeGroup> in that the labels can be any string + the panel
// content is arbitrary children (not just code). Used in docs for
// "Install" / "Use" / "Configure" style flows.
//
// Two render shapes:
//
//   1. Children API — pass labels + children as parallel arrays. Simple
//      to author from MDX.
//
//   2. Props API — pass `items: Array<{ label, content }>`. Used for
//      programmatic tabs derived from a config / data source.

export interface TabsProps {
  /** Tab labels in display order. */
  labels?: string[]
  /** Child panels — one per label, in source order. Used with `labels`. */
  children?: VNodeChild[] | VNodeChild
  /** Programmatic items API; mutually exclusive with `labels`+`children`. */
  items?: Array<{ label: string; content: VNodeChild }>
  /** Index of the initially-active tab. Default `0`. */
  initial?: number
  /** Optional class name applied to the outer wrapper. */
  class?: string
}

export function Tabs(props: TabsProps): VNodeChild {
  const items: Array<{ label: string; content: VNodeChild }> =
    props.items
    ?? (props.labels ?? []).map((label, i) => {
      const childs = Array.isArray(props.children)
        ? props.children
        : props.children !== undefined ? [props.children] : []
      return { label, content: childs[i] ?? null }
    })

  const active = signal(Math.min(Math.max(props.initial ?? 0, 0), items.length - 1))

  return (
    <div class={`pyreon-tabs${props.class ? ' ' + props.class : ''}`}>
      <div role="tablist" class="pyreon-tabs__list">
        {items.map((item, i) => (
          <button
            type="button"
            role="tab"
            class={() =>
              active() === i
                ? 'pyreon-tabs__tab pyreon-tabs__tab--active'
                : 'pyreon-tabs__tab'
            }
            aria-selected={() => (active() === i ? 'true' : 'false') as never}
            tabIndex={() => (active() === i ? 0 : -1) as never}
            onClick={() => active.set(i)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {items.map((item, i) => (
        <div
          role="tabpanel"
          class={() =>
            active() === i
              ? 'pyreon-tabs__panel pyreon-tabs__panel--active'
              : 'pyreon-tabs__panel'
          }
          hidden={() => (active() === i ? undefined : true) as never}
        >
          {item.content}
        </div>
      ))}
    </div>
  )
}
