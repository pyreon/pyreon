import { el } from '../../kit'

export const PropsTable = el
  .attrs({
    tag: 'div',
  })
  .theme((t) => ({
    border: t.hairline,
    borderRadius: t.radius.card,
    overflow: 'hidden',
    marginBottom: '24px',
  }))
