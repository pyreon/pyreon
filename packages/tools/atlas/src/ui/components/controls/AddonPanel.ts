import { el, type T } from '../../kit'

export const AddonPanel = el
  .attrs({
    tag: 'section',
    css: 'display:flex;flex-direction:column;align-items:stretch;',
  })
  .theme((t: T) => ({
    width: '352px',
    flex: 'none',
    display: 'flex',
    flexDirection: 'column',
    minHeight: '0',
    borderLeft: t.hairline,
    background: t.surface,
  }))
