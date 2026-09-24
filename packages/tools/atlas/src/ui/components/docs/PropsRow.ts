import { el } from '../../kit'

export const PropsRow = el
  .attrs({
    tag: 'div',
  })
  .theme((t) => ({
    display: 'grid',
    gridTemplateColumns: '1.4fr 1fr 1fr',
    columnGap: '16px',
    padding: '11px 16px',
    borderTop: t.hairline,
    fontSize: t.size.text,
    alignItems: 'center',
  }))
