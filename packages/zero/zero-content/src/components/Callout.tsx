import type { VNodeChild } from '@pyreon/core'

// ─── <Callout> — markdown :::tip / :::warning / :::note / :::danger ───────
//
// Emitted by the `pyreon-remark-callout` plugin as the wrapper around
// directive-container content. Styling is kept minimal in the package
// itself; consumer apps can scope styles via the `callout` /
// `callout--<type>` class.

export type CalloutType = 'tip' | 'warning' | 'note' | 'danger' | 'info'

export interface CalloutProps {
  /** Visual style + semantic role of the callout. */
  type: CalloutType
  /** Optional title rendered above the body. */
  title?: string
  /** Body content — typically markdown-rendered paragraphs. */
  children?: VNodeChild
}

const DEFAULT_ICONS: Record<CalloutType, string> = {
  tip: '★',
  warning: '⚠',
  danger: '✖',
  info: 'ℹ',
  note: '✎',
}

const DEFAULT_TITLES: Record<CalloutType, string> = {
  tip: 'Tip',
  warning: 'Warning',
  danger: 'Danger',
  info: 'Info',
  note: 'Note',
}

export function Callout(props: CalloutProps): VNodeChild {
  const icon = DEFAULT_ICONS[props.type]
  const title = props.title ?? DEFAULT_TITLES[props.type]
  const cls = `callout callout--${props.type}`
  return (
    <aside class={cls} role="note" aria-label={title}>
      <header class="callout__header">
        <span class="callout__icon" aria-hidden="true">
          {icon}
        </span>
        <span class="callout__title">{title}</span>
      </header>
      <div class="callout__body">{props.children}</div>
    </aside>
  )
}
