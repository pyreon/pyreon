import { el } from '../../kit'

/** The coverage headline (`.at-cov`): the bar, the number, the caption below. */
export const CovHead = el.attrs({ tag: 'div', block: true }).theme((t) => ({
  display: 'grid',
  gap: '4px 12px',
  padding: '12px',
  borderBottom: t.hairline,
  extendCss: 'grid-template-columns:minmax(0,1fr) auto;align-items:center;',
}))
