import type { VNodeChild } from '@pyreon/core'
import { font, text } from '../theme'
import { el, tone, txt } from './bases'

/* Static pages only (the products index, the home grid): kept out of
   cards.tsx, which the demo islands bundle. */

const FootBox = el
  .config({ name: 'GlowCardFoot' })
  // margin-top: auto in the card's column: the foot sits on the card's bottom
  // edge, so cards of one row end on the same line whatever their text.
  .attrs({ block: true, gap: 14, contentAlignX: 'block' })
  .theme(() => ({ marginTop: 'auto', paddingTop: 6 }))

/** The foot's last line: a quiet label (the package name) on the left, the arrow on the right. */
const FootRow = el
  .config({ name: 'GlowCardFootRow' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignX: 'spaceBetween', contentAlignY: 'center', gap: 12 })
  .theme((_t, m) => ({ paddingTop: 12, borderTop: '1px solid', borderColor: tone(m, 'line'), minWidth: 0 }))

const FootArrow = txt
  .config({ name: 'GlowCardArrow' })
  .attrs({ tag: 'span', 'aria-hidden': 'true' })
  .theme((_t, m) => ({ display: 'block', flexShrink: 0, fontFamily: font.sans, fontSize: text.step.size, lineHeight: 1, color: tone(m, 'accent') }))

/**
 * The bottom of a linked card: an optional proof block (a number and what it
 * measures) and the card's arrow, pinned to the card's bottom edge. In a row
 * of equal-height cards a card with a proof number and one without both end
 * on their foot, so neither looks half empty. The arrow is decorative (the
 * whole card is the link).
 */
export function CardFoot(props: { label?: VNodeChild; children?: VNodeChild }) {
  return (
    <FootBox>
      {props.children}
      <FootRow>
        {props.label ?? <span />}
        <FootArrow>→</FootArrow>
      </FootRow>
    </FootBox>
  )
}
