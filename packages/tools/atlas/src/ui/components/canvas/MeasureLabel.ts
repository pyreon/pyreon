import { txt, type T } from '../../kit'

export const MeasureLabel = txt
  .attrs({
    tag: 'span',
  })
  .theme((t: T) => ({
    position: 'absolute',
    display: 'none',
    pointerEvents: 'none',
    zIndex: '31',
    fontFamily: t.font.mono,
    fontSize: t.size.label,
    padding: '2px 7px',
    borderRadius: t.radius.chip,
    color: '#fff',
    background: t.accent,
    whiteSpace: 'nowrap',
  }))
