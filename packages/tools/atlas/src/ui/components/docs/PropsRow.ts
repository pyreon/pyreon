import { el, type T } from '../../kit'

export const PropsRow = el
  .attrs({
    tag: 'div',
    css: 'display:grid;grid-template-columns:1.4fr 1fr 1fr;column-gap:16px;align-items:center;',
  })
  .theme((t: T) => ({
    display: 'grid',
    gridTemplateColumns: '1.4fr 1fr 1fr',
    columnGap: '16px',
    padding: '11px 16px',
    borderTop: t.hairline,
    fontSize: t.size.text,
    alignItems: 'center',
  }))
