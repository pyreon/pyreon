import { el } from '../../kit'

/** The label column: the prop name over its type. */
export const CtrlHead = el
  .attrs({
    tag: 'div',
    contentDirection: 'rows',
    gap: 2,
  })
  .theme(() => ({
    minWidth: '0',
    extendCss: 'grid-row:span 2;align-self:start;padding-top:5px;',
  }))
