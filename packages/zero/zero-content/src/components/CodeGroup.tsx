import { signal } from '@pyreon/reactivity'
import type { VNodeChild } from '@pyreon/core'

// ─── <CodeGroup> — tabbed code blocks ──────────────────────────────────────
//
// Emitted by the `pyreon-remark-codegroup` plugin as the wrapper around
// :::code-group containers. Each child is one code block; `labels`
// names the tab for the matching index.
//
// Children are rendered eagerly (zero hydration cost — the tabs are
// purely CSS class swaps once the page mounts). The active panel
// signal lives client-side; SSR ships tab 0 visible.

export interface CodeGroupProps {
  /** Tab labels — one per child code block. */
  labels: string[]
  /** Index of the initially-active tab. Defaults to `0`. */
  initial?: number
  /** Code blocks in order. */
  children?: VNodeChild
}

export function CodeGroup(props: CodeGroupProps): VNodeChild {
  const active = signal(props.initial ?? 0)
  const labels = props.labels

  return (
    <section class="code-group" aria-label="Code examples">
      <div class="code-group__tabs" role="tablist">
        {() =>
          labels.map((label, i) => (
            <button
              type="button"
              role="tab"
              aria-selected={active() === i ? 'true' : 'false'}
              tabIndex={active() === i ? 0 : -1}
              class={
                active() === i
                  ? 'code-group__tab code-group__tab--active'
                  : 'code-group__tab'
              }
              onClick={() => active.set(i)}
            >
              {label}
            </button>
          ))
        }
      </div>
      <div class="code-group__panels">{props.children}</div>
    </section>
  )
}
