import { el, type T } from '../../kit'

export const AddonPanel = el
  .attrs({
    tag: 'section',
  })
  .theme((t: T) => ({
    alignItems: 'stretch',
    width: '352px',
    flex: 'none',
    display: 'flex',
    flexDirection: 'column',
    minHeight: '0',
    borderLeft: t.hairline,
    background: t.surface,
  }))
