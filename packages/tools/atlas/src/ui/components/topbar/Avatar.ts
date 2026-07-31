import { el, type T } from '../../kit'

export const Avatar = el
  .attrs({
    tag: 'div',
    css: 'display:flex;align-items:center;justify-content:center;',
  })
  .theme((t: T) => ({
    width: '34px',
    height: '34px',
    borderRadius: t.radius.round,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontWeight: '700',
    fontSize: t.size.body,
    fontFamily: '\'Space Grotesk\',sans-serif',
    background: `linear-gradient(135deg,${t.accent},${t.accent2})`,
  }))
