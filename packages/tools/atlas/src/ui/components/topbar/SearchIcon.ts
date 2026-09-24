import { txt } from '../../kit'

export const SearchIcon = txt
  .attrs({
    tag: 'span',
  })
  .theme((t) => ({
    position: 'absolute',
    left: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: t.size.input,
    color: t.faint,
  }))
