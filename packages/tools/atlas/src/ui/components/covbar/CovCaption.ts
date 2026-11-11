import { txt } from '../../kit'

/** The line under the bar, spanning both columns. */
export const CovCaption = txt.attrs({ tag: 'span' }).theme((t) => ({
  fontSize: t.size.small,
  color: t.faint,
  extendCss: 'grid-column:1/-1;',
}))
