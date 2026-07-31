import { el, type T } from '../../kit'

export const PropsTable = el
  .attrs({
    tag: 'div',
  })
  .theme((t: T) => ({
    border: t.hairline,
    borderRadius: t.radius.card,
    overflow: 'hidden',
    marginBottom: '26px',
  }))
