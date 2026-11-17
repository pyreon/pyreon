import type { VNodeChild } from '@pyreon/core'
import { badge, font, radius, verdict } from '../theme'
import { pair, txt } from './bases'

/** The badge tones: `win` is the ember fill with ink text, the rest are outlined. */
export type BadgeTone = 'win' | 'tie' | 'split' | 'loss' | 'info'

/**
 * `.bx-chip` — the one pill-shaped badge (benchmark verdicts, compare
 * verdicts). Every badge carries its text label; colour is never the only
 * signal. Tokens: `badge`, `verdict`, `radius.pill`.
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
  }))

/** A pill badge in one of the verdict tones. */
export function Badge(props: { tone: BadgeTone; children?: VNodeChild }) {
  return <BadgeBase state={props.tone}>{props.children}</BadgeBase>
}
