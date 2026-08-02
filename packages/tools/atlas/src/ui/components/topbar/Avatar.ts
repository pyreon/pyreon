import { el, type T } from '../../kit'

export const Avatar = el
  .attrs({
    tag: 'div',
    contentAlignX: 'center',
    contentAlignY: 'center',
  })
  .theme((t: T) => ({
    width: '32px',
    height: '32px',
    borderRadius: t.radius.round,
    color: '#fff',
    fontWeight: '700',
    fontSize: t.size.body,
    fontFamily: '\'Space Grotesk\',sans-serif',
    background: `linear-gradient(135deg,${t.accent},${t.accent2})`,
  }))
