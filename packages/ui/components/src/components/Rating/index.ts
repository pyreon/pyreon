import { el } from '../../factory'
import { RatingBase } from '@pyreon/ui-primitives'

/**
 * Star-rating input, delegated to `RatingBase` (WAI-ARIA radiogroup: per-star
 * `role="radio"` + accessor-live `aria-checked`, value-adjust arrow keys,
 * exactly one tab stop, hover preview, localizable labels).
 *
 * NOTE: no `.attrs()` — with `component: RatingBase`, Element layout props
 * would forward as junk DOM attrs (the Tree/Combobox rule); layout is CSS on
 * the element the consumer spreads `rootProps()` onto.
 */
const Rating = el.config({ name: 'Rating', component: RatingBase }).theme((t) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: t.spacing.xxxSmall,
  fontSize: t.fontSize.large,
  color: t.color.system.warning.base,
  cursor: 'pointer',
}))

export default Rating
