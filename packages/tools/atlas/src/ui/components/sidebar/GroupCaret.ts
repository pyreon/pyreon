import { txt, type T } from '../../kit'

export const GroupCaret = txt
  .attrs({
    tag: 'span',
  })
  .theme((t: T) => ({
    fontSize: t.size.nano,
    width: '10px',
    flex: 'none',
    color: t.faint,
  }))
