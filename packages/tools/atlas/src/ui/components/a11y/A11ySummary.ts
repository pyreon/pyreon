import { el } from '../../kit'

/**
 * A row of headline numbers (`.at-score`): equal cells divided by hairlines,
 * two per row on a narrow panel.
 */
export const A11ySummary = el
  .attrs({
    tag: 'div',
    block: true,
  })
  .theme((t) => ({
    display: 'grid',
    borderBottom: t.hairline,
    extendCss:
      'grid-template-columns:repeat(auto-fit,minmax(min(140px,50%),1fr));& > *{border-right:1px solid ' +
      t.border +
      ';border-bottom:1px solid ' +
      t.border +
      ';margin-bottom:-1px;}& > *:last-child{border-right:0;}',
  }))
