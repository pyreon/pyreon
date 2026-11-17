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

/**
 * A directive title is plain text, but authors write inline code in it
 * (`:::tip{title="\`by\`, not \`key\`"}`). Backtick spans render as `<code>`;
 * an unmatched backtick stays literal.
 */
export function calloutTitleParts(title: string): readonly { code: boolean; text: string }[] {
  const parts: { code: boolean; text: string }[] = []
  const re = /`([^`]+)`/g
  let last = 0
  for (let m = re.exec(title); m; m = re.exec(title)) {
    if (m.index > last) parts.push({ code: false, text: title.slice(last, m.index) })
    parts.push({ code: true, text: m[1]! })
    last = m.index + m[0].length
  }
  if (last < title.length) parts.push({ code: false, text: title.slice(last) })

  return parts
}

export function Callout(props: CalloutProps): VNodeChild {
  const icon = DEFAULT_ICONS[props.type]
  const title = props.title ?? DEFAULT_TITLES[props.type]
  const parts = calloutTitleParts(title)
  const cls = `callout callout--${props.type}`

  return (
    <aside class={cls} role="note" aria-label={parts.map((p) => p.text).join('')}>
      <header class="callout__header">
        <span class="callout__icon" aria-hidden="true">
          {icon}
        </span>
        <span class="callout__title">{parts.map((p) => (p.code ? <code>{p.text}</code> : p.text))}</span>
      </header>
      <div class="callout__body">{props.children}</div>
    </aside>
  )
}
