import { txt, type T } from '../../kit'

export const MenuLabel = txt
  .attrs({ tag: 'div' })
  .theme((t: T) => ({
    fontFamily: t.font.mono, fontSize: t.size.nano, letterSpacing: t.tracking.xl,
    color: t.faint, padding: '8px 8px 4px',
  }))
