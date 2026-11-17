import type { VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import { badge, font, leading, radius, verdict } from '../theme'
import { pair, txt } from './bases'

/**
 * The badge family: small labels in a pill (`Badge` here, `Tag` in
 * `kit/tag.tsx`: its own module, so an island that shows a verdict chip does
 * not carry the tag's link styles).
 *
 * - `Badge` is a STATUS: a verdict (win / tie / split / loss / info) or a
 *   marker on an item ("next release", "experimental"). Uppercase mono
 *   lettering in a tone; never interactive; colour is never the only signal
 *   (the label is the text).
 * - `Tag` NAMES a thing: an API export, a product, an in-page section. Mono,
 *   sentence case, neutral. With `href` it is one plain link (hover border,
 *   focus ring); without, a filled static chip.
 * - A filter or toggle chip (`aria-pressed`, `ToggleChips`) is a control, not
 *   a badge or a tag: it belongs with the segmented controls.
 *
 * Neither sets an outer margin, except a `Badge` with a `placement`: a
 * marker inside a run of text keeps a word-sized gap to it, the way a word
 * space would.
 */

/** The badge tones: `win` is the ember fill with ink text, the rest are outlined. */
export type BadgeTone = 'win' | 'tie' | 'split' | 'loss' | 'info' | 'experimental'

/**
 * `.bx-chip` — the pill-shaped badge. Tokens: `badge`, `verdict`, `radius.pill`.
 *
 * The win fill paints from the BORDER box: with the default padding-box
 * origin a gradient tiles under the transparent 1px border, so the far ends
 * of the pill showed the opposite stop (a yellow sliver left, pink right)
 * and a seam ran along the padding edge. The label keeps the regular weight
 * in every tone: at 10.5px a semibold monospace "I" (full serifs, a stem
 * the narrow cell does not thin) reads heavier than W and N beside it.
 */
const BadgeBase = txt
  .config({ name: 'Badge' })
  .attrs({ tag: 'span' })
  .theme(() => ({
    flexShrink: 0,
    display: 'inline-block',
    fontFamily: font.mono,
    fontSize: badge.size,
    letterSpacing: badge.tracking,
    textTransform: 'uppercase',
    lineHeight: badge.lineHeight,
    paddingTop: badge.padY,
    paddingBottom: badge.padY,
    paddingLeft: badge.padX,
    paddingRight: badge.padX,
    borderRadius: radius.pill,
    border: `${badge.border}px solid`,
    whiteSpace: 'nowrap',
  }))
  .states((_t, m) => ({
    win: {
      backgroundImage: verdict.winFill,
      backgroundOrigin: 'border-box',
      backgroundRepeat: 'no-repeat',
      color: verdict.winText,
      borderColor: 'transparent',
    },
    tie: { color: pair(m, verdict.tie), borderColor: pair(m, verdict.tie) },
    split: { color: pair(m, verdict.split), borderColor: pair(m, verdict.split) },
    loss: { color: pair(m, verdict.loss), borderColor: pair(m, verdict.loss) },
    info: { color: pair(m, verdict.info), borderColor: pair(m, verdict.info) },
    experimental: { color: pair(m, verdict.experimental), borderColor: pair(m, verdict.experimental) },
  }))
  .sizes(() => ({
    md: {},
    sm: {
      fontSize: badge.sm.size,
      letterSpacing: badge.sm.tracking,
      lineHeight: badge.sm.lineHeight,
      paddingTop: badge.sm.padY,
      paddingBottom: badge.sm.padY,
      paddingLeft: badge.sm.padX,
      paddingRight: badge.sm.padX,
    },
  }))
  .variants(() => ({
    block: {},
    after: { marginLeft: badge.inlineGap, verticalAlign: badge.raise },
    before: { marginRight: badge.inlineGap },
  }))
  .multiple(() => ({
    /** The lettering alone: no pill. */
    bare: { padding: 0, borderWidth: 0, lineHeight: leading.flat },
  }))

export interface BadgeProps {
  tone: BadgeTone
  /** md: the verdict chip (default) · sm: the marker beside a name. */
  size?: 'md' | 'sm' | undefined
  /**
   * Inside a run of text: `after` a name (a heading's "next release" marker) or
   * `before` a line (the "withdrawn" word that leads a struck claim), with a
   * word-sized gap. Default: it stands alone in a row or a stack (no margin).
   */
  placement?: 'after' | 'before' | undefined
  /** The lettering alone, without the pill (a status word that leads a line). */
  bare?: boolean | undefined
  children?: VNodeChild
}

/** A pill badge in one tone. */
export function Badge(props: BadgeProps) {
  return h(BadgeBase, { state: props.tone, size: props.size ?? 'md', variant: props.placement ?? 'block', multiple: props.bare ? ['bare'] : [] }, props.children)
}
