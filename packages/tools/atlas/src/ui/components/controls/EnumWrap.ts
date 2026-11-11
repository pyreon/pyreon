import { el } from '../../kit'

/** A segmented group (`.seg2`): pressed-button options in a hairline frame. */
export const EnumWrap = el
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    gap: 2,
  })
  .theme((t) => ({
    flexWrap: 'wrap',
    padding: '2px',
    borderRadius: t.radius.panel,
    border: t.hairline,
    justifySelf: 'start',
    maxWidth: '100%',
  }))
