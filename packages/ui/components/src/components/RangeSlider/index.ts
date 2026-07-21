import { el } from '../../factory'
import { RangeSliderBase } from '@pyreon/ui-primitives'

/**
 * Dual-thumb range slider, delegated to `RangeSliderBase` (WAI-ARIA
 * multi-thumb pattern: two role="slider" thumbs, per-thumb keyboard,
 * no-cross clamping with minRange, click-nearest track, localizable
 * labels). NOTE: no `.attrs()` — the primitive-backed component rule; the
 * theme lands on the element the consumer spreads `rootProps()` onto.
 */
const RangeSlider = el.config({ name: 'RangeSlider', component: RangeSliderBase }).theme((t) => ({
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  minHeight: 24,
  position: 'relative',
  color: t.color.system.primary.base,
}))

export default RangeSlider
