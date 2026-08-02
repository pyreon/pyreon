/** A scenario row that ALSO carries a play button — siblings, never nested buttons. */
import { el } from '../../kit'

export const ScenRow = el
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    contentAlignY: 'center',
    gap: 2,
  })
  .theme(() => ({
  }))
