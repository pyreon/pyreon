import { txt } from '../../kit'

export const GroupCaret = txt
  .attrs({
    tag: 'span',
  })
  .theme((t) => ({
    fontSize: t.size.nano,
    width: '10px',
    flex: 'none',
    color: t.faint,
  }))
