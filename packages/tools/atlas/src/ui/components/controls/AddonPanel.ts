import { el } from '../../kit'

/** The panels region (`.at-panel`): a 38px tab strip over the scrolling body. */
export const AddonPanel = el
  .attrs({
    tag: 'section',
    contentDirection: 'rows',
    contentAlignX: 'block',
  })
  .theme((t) => ({
    flex: '1',
    minHeight: '0',
    minWidth: '0',
    background: t.surface,
  }))
