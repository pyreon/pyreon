import { el } from '../../kit'
import { EMBER_STOPS } from '../../theme'

/**
 * The bar's fill — the Pyreon ember gradient. Its WIDTH is written
 * imperatively by the panel (a measurement, like the Measure overlay), so a
 * percentage never mints a class per value.
 */
export const CovFill = el.attrs({ tag: 'span', block: true }).theme(() => ({
  height: '100%',
  width: '0',
  transition: 'width .3s ease',
  extendCss: `display:block;background-image:linear-gradient(90deg,${EMBER_STOPS[0]},${EMBER_STOPS[1]} 60%,${EMBER_STOPS[2]});`,
}))
