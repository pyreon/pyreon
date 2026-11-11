import { el } from '../../kit'

/** The main column: scenario strip, canvas, panels (or the Docs / Lab view). */
export const Main = el
  .attrs({
    tag: 'main',
    contentDirection: 'rows',
    contentAlignX: 'block',
  })
  .theme(() => ({
    flex: '1',
    minWidth: '0',
    minHeight: '0',
    position: 'relative',
  }))
