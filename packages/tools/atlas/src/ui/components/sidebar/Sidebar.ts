import { el } from '../../kit'

/** The catalog column (`.at-side`): a nav landmark on the raised surface. */
export const Sidebar = el
  .attrs({
    tag: 'nav',
    contentDirection: 'rows',
    contentAlignX: 'block',
  })
  .theme((t) => ({
    flex: 'none',
    minHeight: '0',
    height: '100%',
    background: t.surface,
    borderRight: t.hairline,
  }))
