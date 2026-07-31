import { txt, type T } from '../../kit'

export const Kbd = txt
  .attrs({
    tag: 'span',
  })
  .theme((t: T) => ({
    position: 'absolute',
    right: '11px',
    top: '50%',
    transform: 'translateY(-50%)',
    fontFamily: t.font.mono,
    fontSize: t.size.label,
    padding: '1px 6px',
    borderRadius: t.radius.chip,
    color: t.faint,
    border: t.hairline,
  }))
