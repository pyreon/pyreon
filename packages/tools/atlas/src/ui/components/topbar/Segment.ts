import { el } from '../../kit'

/**
 * A row of tabs (`.app-tabs`): the view switch in the top bar, and the
 * scenario strip. Scrolls sideways rather than wrapping.
 */
export const Segment = el
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    contentAlignY: 'center',
    gap: 2,
  })
  .theme(() => ({
    minWidth: '0',
    flex: '0 1 auto',
    extendCss: 'overflow-x:auto;scrollbar-width:none;&::-webkit-scrollbar{display:none;}',
  }))
