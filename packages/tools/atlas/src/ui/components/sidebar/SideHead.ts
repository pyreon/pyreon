import { el } from '../../kit'

/** The catalog's header (`.pane-h`): mono caps label, count, verified chip. */
export const SideHead = el
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    contentAlignY: 'center',
    gap: 8,
  })
  .theme((t) => ({
    flex: 'none',
    height: '36px',
    padding: '0 12px',
    borderBottom: t.hairline,
  }))
