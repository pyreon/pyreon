import { el } from '../../kit'

/** The active panel's body — scrolls; panels lay out their own rows. */
export const AddonBody = el
  .attrs({
    tag: 'div',
    contentDirection: 'rows',
    contentAlignX: 'block',
  })
  .theme((t) => ({
    flex: '1',
    minHeight: '0',
    overflowY: 'auto',
    fontSize: t.size.body,
  }))
