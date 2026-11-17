import type { VNodeChild } from '@pyreon/core'

/**
 * Backtick spans in a docs title or label (`` `by`, not `key` ``) as plain
 * `<code>` elements, the rest as text. No kit components, so islands (the
 * table of contents, the sidebar) can use it without a styling runtime; a
 * component, so hydration adopts it. An unmatched backtick stays literal.
 */
export function CodeSpans(props: { text: string }): VNodeChild {
  const parts: VNodeChild[] = []
  const re = /`([^`]+)`/g
  let last = 0
  for (let m = re.exec(props.text); m; m = re.exec(props.text)) {
    if (m.index > last) parts.push(props.text.slice(last, m.index))
    parts.push(<code>{m[1]}</code>)
    last = m.index + m[0].length
  }
  if (last < props.text.length) parts.push(props.text.slice(last))
  return parts
}

/** The same text with its backticks removed (names, `aria-label`s, `<title>`). */
export const plainText = (text: string): string => text.replace(/`([^`]+)`/g, '$1')
