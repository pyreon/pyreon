import type { VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import { font, radius, tag as tagSize } from '../theme'
import { focusRing, tapArea, tone, txt, type LinkAttrs } from './bases'

/**
 * `Tag` — the badge family's name chip (see `kit/badge.tsx` for where a
 * Badge ends and a Tag begins): an API export, a product, a section to jump
 * to. Mono, sentence case, neutral. Static, it is filled (`sheen`); with
 * `href` it is one plain anchor, outlined, with a hover border and the focus
 * ring. No outer margin.
 */
const TagBase = txt
  .config({ name: 'Tag' })
  .attrs<LinkAttrs>({ tag: 'span' })
  .theme((_t, m) => ({
    display: 'inline-block',
    fontFamily: font.mono,
    borderRadius: radius.pill,
    border: '1px solid',
    color: tone(m, 'mist'),
  }))
  .sizes(() => ({
    md: {
      fontSize: tagSize.md.size,
      paddingTop: tagSize.md.padY,
      paddingBottom: tagSize.md.padY,
      paddingLeft: tagSize.md.padX,
      paddingRight: tagSize.md.padX,
    },
    sm: {
      fontSize: tagSize.sm.size,
      paddingTop: tagSize.sm.padY,
      paddingBottom: tagSize.sm.padY,
      paddingLeft: tagSize.sm.padX,
      paddingRight: tagSize.sm.padX,
    },
  }))
  .variants((_t, m) => ({
    static: { lineHeight: tagSize.static.lineHeight, borderColor: tone(m, 'line'), backgroundColor: tone(m, 'sheen'), overflowWrap: 'anywhere' },
    link: {
      lineHeight: tagSize.link.lineHeight,
      borderColor: tone(m, 'line2'),
      textDecoration: 'none',
      extendCss: tapArea,
      hover: { color: tone(m, 'text'), borderColor: tone(m, 'lineHover') },
      focus: focusRing(m),
    },
  }))

export interface TagProps {
  /** md: an API name (default) · sm: the small tag under a card. */
  size?: 'md' | 'sm' | undefined
  /** A link tag: one plain anchor (a page load or an in-page jump), outlined. */
  href?: string | undefined
  /** `li` when the tag is an item of a list (`Cluster tag="ul"`). Ignored with `href` (the anchor goes inside the `li`). */
  tag?: 'span' | 'li' | undefined
  children?: VNodeChild
}

/** A mono tag: a static filled chip, or with `href` an outlined link. */
export function Tag(props: TagProps) {
  const size = props.size ?? 'md'
  if (props.href !== undefined) return h(TagBase, { tag: 'a', href: props.href, size, variant: 'link' }, props.children)
  return h(TagBase, { tag: props.tag ?? 'span', size, variant: 'static' }, props.children)
}
