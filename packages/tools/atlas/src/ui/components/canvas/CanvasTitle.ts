import { el } from '../../kit'

/** The canvas bar's title block — name over render context, room between them. */
export const CanvasTitle = el
  .attrs({ tag: 'div', contentDirection: 'rows' })
  .theme(() => ({
    minWidth: '0',
    lineHeight: '1.25',
  }))
