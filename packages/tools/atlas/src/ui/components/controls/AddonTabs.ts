import { el, type T } from '../../kit'

export const AddonTabs = el
  .attrs({
    tag: 'div',
    css: 'display:flex;flex-direction:row;align-items:center;',
  })
  .theme((t: T) => ({
    display: 'flex',
    padding: '6px 8px',
    gap: '2px',
    overflowX: 'auto',
    borderBottom: t.hairline,
  }))
