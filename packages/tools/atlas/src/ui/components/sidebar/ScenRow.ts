/** A scenario row that ALSO carries a play button — siblings, never nested buttons. */
import { el } from '../../kit'

export const ScenRow = el
  .attrs({
    tag: 'div',
    css: 'display:flex;flex-direction:row;align-items:center;',
  })
  .theme(() => ({
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
  }))
