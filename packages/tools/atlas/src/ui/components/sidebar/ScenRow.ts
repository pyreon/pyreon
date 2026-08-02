/** A scenario row that ALSO carries a play button — siblings, never nested buttons. */
import { el } from '../../kit'

export const ScenRow = el
  .attrs({
    tag: 'div',
  })
  .theme(() => ({
    flexDirection: 'row',
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
  }))
