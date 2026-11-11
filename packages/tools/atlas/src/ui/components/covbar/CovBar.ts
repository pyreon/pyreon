import { el } from '../../kit'

/** The bar's track (`.covbar`). A `role="meter"` carries the value for AT. */
export const CovBar = el.attrs({ tag: 'div', block: true }).theme((t) => ({
  height: '10px',
  borderRadius: '5px',
  background: t.surface2,
  overflow: 'hidden',
}))
